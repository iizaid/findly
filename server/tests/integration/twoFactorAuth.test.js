import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticator } from 'otplib';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4142';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_two_factor_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_two_factor_csrf';
process.env.APP_URL ??= 'http://localhost:4000';
process.env.CLIENT_URL ??= 'http://localhost:5173';
process.env.EMAIL_FROM ??= 'Findly <test@findly.local>';
process.env.EMAIL_SECURITY_FROM ??= 'Findly Security <security@findly.local>';
process.env.EMAIL_PROVIDER ??= 'smtp';
process.env.LOG_LEVEL ??= 'silent';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.PASSWORD_RESET_RATE_LIMIT_MAX = '100';
process.env.TWO_FACTOR_AUTH_ENABLED = 'true';
process.env.TWO_FACTOR_SECRET_ENCRYPTION_KEY ??= 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.OAUTH_ENABLED = 'true';
process.env.GOOGLE_OAUTH_ENABLED = 'true';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/auth/oauth/google/callback';

let createApp;
let prisma;
let app;
let getTestOutbox;
let clearTestOutbox;

const unique = Date.now().toString(36);
const password = 'Secure12345@#$';
const createdEmails = new Set();

const makeEmail = (suffix) => {
  const email = `${suffix}.${unique}@findly.local`;
  createdEmails.add(email);
  return email;
};

const getCsrfToken = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const registerAndVerify = async ({
  email = makeEmail('two-factor'),
  name = 'Two Factor User',
  agent = request.agent(app),
} = {}) => {
  await agent.post('/api/auth/register').send({
    name,
    email,
    password,
    formDurationMs: 5000,
    companyWebsite: '',
  }).expect(201);

  const outboxEntry = [...getTestOutbox()].reverse().find((entry) => entry.to === email && entry.verificationUrl);
  const token = new URL(outboxEntry.verificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
  clearTestOutbox();

  return { agent, email, name };
};

const startTwoFactorSetup = async (agent) => {
  const csrfToken = await getCsrfToken(agent);
  const response = await agent
    .post('/api/auth/2fa/setup/start')
    .set('X-CSRF-Token', csrfToken)
    .send({})
    .expect(200);

  return response.body.data;
};

const confirmTwoFactorSetup = async (agent, secret) => {
  const csrfToken = await getCsrfToken(agent);
  const code = authenticator.generate(secret);

  return agent
    .post('/api/auth/2fa/setup/confirm')
    .set('X-CSRF-Token', csrfToken)
    .send({ code })
    .expect(200);
};

const generateCode = (secret) => authenticator.generate(secret);

const loginAndRequireTwoFactor = async (email) => {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .send({ email, password, remember: false })
    .expect(200);

  expect(response.body.data.requiresTwoFactor).toBe(true);
  expect(response.headers['set-cookie'] || []).not.toContainEqual(expect.stringContaining(process.env.COOKIE_NAME));
  await agent.get('/api/auth/me').expect(401);

  return {
    agent,
    challengeToken: response.body.data.challengeToken,
  };
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ getTestOutbox, clearTestOutbox } = await import('../../src/modules/mail/mail.service.js'));
  app = createApp();
});

beforeEach(async () => {
  clearTestOutbox();
  vi.restoreAllMocks();
  await prisma.twoFactorChallenge.deleteMany({});
  await prisma.userTwoFactorSetting.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [...createdEmails] } },
  });
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.twoFactorChallenge.deleteMany({}).catch(() => {});
  await prisma.userTwoFactorSetting.deleteMany({}).catch(() => {});
  await prisma.user.deleteMany({
    where: { email: { in: [...createdEmails] } },
  }).catch(() => {});
  await prisma.$disconnect();
  vi.restoreAllMocks();
});

describe('Two-factor authentication', () => {
  it('keeps existing login working for users without 2FA enabled', async () => {
    const email = makeEmail('login-no-2fa');
    await registerAndVerify({ email });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.requiresTwoFactor).toBeUndefined();
  });

  it('requires an authenticated user to start setup', async () => {
    const csrfToken = await getCsrfToken(request.agent(app));

    await request(app)
      .post('/api/auth/2fa/setup/start')
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(403);
  });

  it('returns setup artifacts and stores only encrypted pending secret data', async () => {
    const { agent, email } = await registerAndVerify();

    const response = await startTwoFactorSetup(agent);
    expect(response.otpauthUrl).toContain('otpauth://totp/');
    expect(response.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(response.manualSetupKey).toBeTruthy();

    const setting = await prisma.userTwoFactorSetting.findFirst({
      where: { user: { email } },
    });
    expect(setting.pendingSecretEncrypted).toBeTruthy();
    expect(setting.pendingSecretEncrypted).not.toContain(response.manualSetupKey);
    expect(setting.secretEncrypted).toBeNull();
  });

  it('rejects invalid setup confirmation codes', async () => {
    const { agent } = await registerAndVerify();
    await startTwoFactorSetup(agent);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post('/api/auth/2fa/setup/confirm')
      .set('X-CSRF-Token', csrfToken)
      .send({ code: '000000' })
      .expect(401);

    expect(response.body.error.code).toBe('TWO_FACTOR_CODE_INVALID');
  });

  it('enables 2FA with a valid TOTP code and stores hashed backup codes', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    const response = await confirmTwoFactorSetup(agent, setup.manualSetupKey);

    expect(response.body.data.backupCodes).toHaveLength(10);

    const statusResponse = await agent.get('/api/auth/2fa/status').expect(200);
    expect(statusResponse.body.data.enabled).toBe(true);
    expect(statusResponse.body.data.backupCodeCountRemaining).toBe(10);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user.twoFactorEnabled).toBe(true);

    const setting = await prisma.userTwoFactorSetting.findUnique({
      where: { userId: user.id },
    });
    const hashes = Array.isArray(setting.backupCodesHash) ? setting.backupCodesHash : [];
    expect(hashes).toHaveLength(10);
    for (const code of response.body.data.backupCodes) {
      expect(JSON.stringify(setting.backupCodesHash)).not.toContain(code);
    }

    const enabledEmail = getTestOutbox().find((entry) => entry.to === email && entry.category === 'two-factor-enabled');
    expect(enabledEmail).toBeTruthy();
  });

  it('does not create a full session before two-factor login verification', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    await confirmTwoFactorSetup(agent, setup.manualSetupKey);

    const loginAttempt = await loginAndRequireTwoFactor(email);
    expect(loginAttempt.challengeToken).toBeTruthy();
  });

  it('completes login with a valid TOTP code', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    await confirmTwoFactorSetup(agent, setup.manualSetupKey);

    const { agent: loginAgent, challengeToken } = await loginAndRequireTwoFactor(email);
    const code = generateCode(setup.manualSetupKey);

    const response = await loginAgent
      .post('/api/auth/2fa/login/verify')
      .send({ challengeToken, code })
      .expect(200);

    expect(response.body.data.user.email).toBe(email);
    await loginAgent.get('/api/auth/me').expect(200);
  });

  it('accepts a valid backup code once and consumes it', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    const confirmation = await confirmTwoFactorSetup(agent, setup.manualSetupKey);
    const backupCode = confirmation.body.data.backupCodes[0];

    const firstLogin = await loginAndRequireTwoFactor(email);
    await firstLogin.agent
      .post('/api/auth/2fa/login/verify')
      .send({ challengeToken: firstLogin.challengeToken, code: backupCode })
      .expect(200);

    const statusAfterUse = await agent.get('/api/auth/2fa/status').expect(200);
    expect(statusAfterUse.body.data.backupCodeCountRemaining).toBe(9);

    const secondLogin = await loginAndRequireTwoFactor(email);
    const reused = await secondLogin.agent
      .post('/api/auth/2fa/login/verify')
      .send({ challengeToken: secondLogin.challengeToken, code: backupCode })
      .expect(401);
    expect(reused.body.error.code).toBe('TWO_FACTOR_CODE_INVALID');

    const usedEmail = getTestOutbox().find((entry) => entry.to === email && entry.category === 'two-factor-backup-code-used');
    expect(usedEmail).toBeTruthy();
  });

  it('invalidates a challenge after too many failed verification attempts', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    await confirmTwoFactorSetup(agent, setup.manualSetupKey);

    const { agent: loginAgent, challengeToken } = await loginAndRequireTwoFactor(email);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await loginAgent
        .post('/api/auth/2fa/login/verify')
        .send({ challengeToken, code: '000000' })
        .expect(401);
    }

    const finalAttempt = await loginAgent
      .post('/api/auth/2fa/login/verify')
      .send({ challengeToken, code: '000000' })
      .expect(429);

    expect(finalAttempt.body.error.code).toBe('RATE_LIMITED');

    const expired = await loginAgent
      .post('/api/auth/2fa/login/verify')
      .send({ challengeToken, code: '000000' })
      .expect(401);

    expect(expired.body.error.code).toBe('TWO_FACTOR_CHALLENGE_INVALID');
  });

  it('requires current password and valid code to disable 2FA', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    await confirmTwoFactorSetup(agent, setup.manualSetupKey);
    const csrfToken = await getCsrfToken(agent);
    const code = generateCode(setup.manualSetupKey);

    await agent
      .post('/api/auth/2fa/disable')
      .set('X-CSRF-Token', csrfToken)
      .send({ password, code })
      .expect(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user.twoFactorEnabled).toBe(false);

    const status = await agent.get('/api/auth/2fa/status').expect(200);
    expect(status.body.data.enabled).toBe(false);

    const disabledEmail = getTestOutbox().find((entry) => entry.to === email && entry.category === 'two-factor-disabled');
    expect(disabledEmail).toBeTruthy();
  });

  it('regenerates backup codes with a valid TOTP code', async () => {
    const { agent, email } = await registerAndVerify();
    const setup = await startTwoFactorSetup(agent);
    const confirmation = await confirmTwoFactorSetup(agent, setup.manualSetupKey);
    const originalBackupCode = confirmation.body.data.backupCodes[0];
    const csrfToken = await getCsrfToken(agent);
    const code = generateCode(setup.manualSetupKey);

    const response = await agent
      .post('/api/auth/2fa/backup-codes/regenerate')
      .set('X-CSRF-Token', csrfToken)
      .send({ code })
      .expect(200);

    expect(response.body.data.backupCodes).toHaveLength(10);
    expect(response.body.data.backupCodes).not.toContain(originalBackupCode);

    const regenEmail = getTestOutbox().find((entry) => entry.to === email && entry.category === 'two-factor-backup-codes-regenerated');
    expect(regenEmail).toBeTruthy();
  });

  it('requires two-factor verification after OAuth login for a 2FA-enabled account', async () => {
    const email = makeEmail('oauth-two-factor');
    const { agent } = await registerAndVerify({ email });
    const setup = await startTwoFactorSetup(agent);
    await confirmTwoFactorSetup(agent, setup.manualSetupKey);

    global.fetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'oauth-access-token', token_type: 'Bearer' });
      }

      return Response.json({
        sub: `google-${unique}`,
        email,
        email_verified: true,
        name: 'OAuth Two Factor',
        picture: 'https://example.com/avatar.png',
      });
    });

    const oauthAgent = request.agent(app);
    const startResponse = await oauthAgent
      .get('/api/auth/oauth/google/start?returnTo=/dashboard')
      .expect(302);
    const state = new URL(startResponse.headers.location).searchParams.get('state');

    const callbackResponse = await oauthAgent
      .get(`/api/auth/oauth/google/callback?code=test-code&state=${encodeURIComponent(state)}`)
      .expect(302);

    const redirectUrl = new URL(callbackResponse.headers.location);
    expect(redirectUrl.searchParams.get('twoFactorRequired')).toBe('1');
    const challengeToken = redirectUrl.searchParams.get('challengeToken');
    expect(challengeToken).toBeTruthy();

    const code = generateCode(setup.manualSetupKey);

    await oauthAgent
      .post('/api/auth/2fa/login/verify')
      .send({ challengeToken, code })
      .expect(200);

    await oauthAgent.get('/api/auth/me').expect(200);
  });
});
