import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_test_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_test_csrf';
process.env.BCRYPT_ROUNDS ??= '10';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.PASSWORD_RESET_RATE_LIMIT_MAX = '100';
process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = '900000';
process.env.PASSWORD_RESET_TTL_MINUTES = '45';
process.env.EMAIL_VERIFICATION_TTL_MINUTES ??= '60';
process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS ??= '60';
process.env.APP_URL ??= 'http://localhost:4000';
process.env.CLIENT_URL ??= 'http://localhost:5173';
process.env.EMAIL_FROM ??= 'Findly <test@findly.local>';
process.env.LOG_LEVEL ??= 'silent';

let createApp;
let prisma;
let getTestOutbox;
let clearTestOutbox;

const unique = Date.now().toString(36);
const password = 'Secure12345@#$';

const resetMessage = 'If an account exists, a reset email has been sent.';

const tokenFromUrl = (url) => new URL(url).searchParams.get('token');

const registerAndVerify = async (email) => {
  const agent = request.agent(createApp());
  await agent.post('/api/auth/register').send({
    name: 'Reset Test User',
    email,
    password,
  }).expect(201);

  const verification = [...getTestOutbox()].reverse().find((item) => item.to === email && item.verificationUrl);
  expect(verification).toBeTruthy();
  await agent.post('/api/auth/verify-email').send({
    token: tokenFromUrl(verification.verificationUrl),
  }).expect(200);

  clearTestOutbox();
  return agent;
};

const requestReset = (email) => request(createApp())
  .post('/api/auth/forgot-password')
  .send({ email });

const getLatestResetToken = (email) => {
  const reset = [...getTestOutbox()].reverse().find((item) => item.to === email && item.resetUrl);
  expect(reset).toBeTruthy();
  return tokenFromUrl(reset.resetUrl);
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ getTestOutbox, clearTestOutbox } = await import('../../src/modules/mail/mail.service.js'));
});

beforeEach(() => {
  clearTestOutbox();
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.user.deleteMany({
    where: { email: { contains: `.reset.${unique}@findly.local` } },
  }).catch(() => {});
  await prisma.$disconnect();
});

describe('Password reset flow', () => {
  it('returns the same generic response for existing and non-existing emails', async () => {
    const email = `existing.reset.${unique}@findly.local`;
    await registerAndVerify(email);

    const existing = await requestReset(email).expect(200);
    const missing = await requestReset(`missing.reset.${unique}@findly.local`).expect(200);

    expect(existing.body.message).toBe(resetMessage);
    expect(missing.body.message).toBe(resetMessage);
    expect(existing.body.data).toEqual({});
    expect(missing.body.data).toEqual({});
  });

  it('stores only a hashed token and never returns the raw reset token', async () => {
    const email = `hashed.reset.${unique}@findly.local`;
    await registerAndVerify(email);

    const response = await requestReset(email).expect(200);
    const rawToken = getLatestResetToken(email);
    const stored = await prisma.passwordResetToken.findFirst({
      where: { user: { email } },
      orderBy: { createdAt: 'desc' },
    });

    expect(stored).toBeTruthy();
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(response.body)).not.toContain(rawToken);

    const logs = await prisma.auditLog.findMany({
      where: { user: { email }, action: { startsWith: 'PASSWORD_RESET' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(JSON.stringify(logs)).not.toContain(rawToken);
  });

  it('resets the password once, revokes old sessions, and does not auto-login', async () => {
    const email = `session.reset.${unique}@findly.local`;
    const oldAgent = await registerAndVerify(email);
    await oldAgent.post('/api/auth/login').send({ email, password }).expect(200);
    await oldAgent.get('/api/auth/me').expect(200);

    await requestReset(email).expect(200);
    const rawToken = getLatestResetToken(email);
    const newPassword = 'NewSecure12345!@#';

    await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword })
      .expect(200);

    await oldAgent.get('/api/auth/me').expect(401);
    await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'AnotherSecure12345!@#' })
      .expect(400);

    const newAgent = request.agent(createApp());
    await newAgent.post('/api/auth/login').send({ email, password }).expect(401);
    await newAgent.post('/api/auth/login').send({ email, password: newPassword }).expect(200);
  });

  it('rejects expired and invalid reset tokens safely', async () => {
    const email = `expired.reset.${unique}@findly.local`;
    await registerAndVerify(email);
    await requestReset(email).expect(200);
    const rawToken = getLatestResetToken(email);

    await prisma.passwordResetToken.updateMany({
      where: { user: { email }, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'ExpiredSecure12345!@#' })
      .expect(400);
    expect(expired.body.error.message).toMatch(/invalid or expired/i);
    expect(JSON.stringify(expired.body)).not.toContain(rawToken);

    const invalid = await request(createApp())
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-valid-reset-token-but-long-enough-123456', newPassword: 'InvalidSecure12345!@#' })
      .expect(400);
    expect(invalid.body.error.message).toMatch(/invalid or expired/i);
  });

  it('does not send reset email to unverified accounts', async () => {
    const email = `unverified.reset.${unique}@findly.local`;
    await request(createApp()).post('/api/auth/register').send({
      name: 'Unverified User',
      email,
      password,
    }).expect(201);

    clearTestOutbox();
    await requestReset(email).expect(200);
    expect(getTestOutbox().filter((item) => item.resetUrl)).toHaveLength(0);
  });

  it('rate limits password reset requests', async () => {
    let limited = false;
    for (let attempt = 0; attempt < 110; attempt += 1) {
      const res = await requestReset(`rate.${attempt}.reset.${unique}@findly.local`);
      if (res.status === 429) {
        limited = true;
        expect(res.body.error.code).toBe('RATE_LIMITED');
        break;
      }
    }

    expect(limited).toBe(true);
  });
});
