import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4149';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_two_factor_mutation_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_two_factor_mutation_csrf';
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
process.env.TWO_FACTOR_AUTH_ENABLED = 'true';
process.env.TWO_FACTOR_SECRET_ENCRYPTION_KEY ??= 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.TWO_FACTOR_SETUP_START_MAX = '50';
process.env.TWO_FACTOR_SETUP_CONFIRM_MAX = '50';
process.env.TWO_FACTOR_DISABLE_MAX = '50';

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

const registerAndVerify = async ({ email = makeEmail('two-factor-mutation') } = {}) => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({
    name: 'Two Factor Mutation User',
    email,
    password,
    formDurationMs: 5000,
    companyWebsite: '',
  }).expect(201);

  const outboxEntry = [...getTestOutbox()].reverse().find((entry) => entry.to === email && entry.verificationUrl);
  const token = new URL(outboxEntry.verificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
  clearTestOutbox();

  return { agent, email };
};

const startSetup = async (agent) => {
  const csrfToken = await getCsrfToken(agent);
  const response = await agent
    .post('/api/auth/2fa/setup/start')
    .set('X-CSRF-Token', csrfToken)
    .send({})
    .expect(200);
  return response.body.data;
};

const confirmSetup = async (agent, secret) => {
  const csrfToken = await getCsrfToken(agent);
  const code = authenticator.generate(secret);
  return agent
    .post('/api/auth/2fa/setup/confirm')
    .set('X-CSRF-Token', csrfToken)
    .send({ code })
    .expect(200);
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ getTestOutbox, clearTestOutbox } = await import('../../src/modules/mail/mail.service.js'));
  app = createApp();
});

beforeEach(async () => {
  clearTestOutbox();
  await prisma.twoFactorChallenge.deleteMany({});
  await prisma.userTwoFactorSetting.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { in: [...createdEmails] } } });
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.twoFactorChallenge.deleteMany({}).catch(() => {});
  await prisma.userTwoFactorSetting.deleteMany({}).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: [...createdEmails] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('two-factor mutation repair middleware', () => {
  it('repairs a stale enabled user flag before confirming a valid pending setup', async () => {
    const { agent, email } = await registerAndVerify({ email: makeEmail('confirm-stale-flag') });
    const setup = await startSetup(agent);
    const user = await prisma.user.findUnique({ where: { email } });

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    await confirmSetup(agent, setup.manualSetupKey);

    const status = await agent.get('/api/auth/2fa/status').expect(200);
    expect(status.body.data.enabled).toBe(true);
    expect(status.body.data.backupCodeCountRemaining).toBe(10);
  });

  it('repairs a stale disabled user flag before disabling an active setting', async () => {
    const { agent, email } = await registerAndVerify({ email: makeEmail('disable-stale-flag') });
    const setup = await startSetup(agent);
    await confirmSetup(agent, setup.manualSetupKey);

    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false },
    });

    const csrfToken = await getCsrfToken(agent);
    const code = authenticator.generate(setup.manualSetupKey);
    await agent
      .post('/api/auth/2fa/disable')
      .set('X-CSRF-Token', csrfToken)
      .send({ password, code })
      .expect(200);

    const repairedUser = await prisma.user.findUnique({ where: { email } });
    expect(repairedUser.twoFactorEnabled).toBe(false);

    const status = await agent.get('/api/auth/2fa/status').expect(200);
    expect(status.body.data.enabled).toBe(false);
  });
});
