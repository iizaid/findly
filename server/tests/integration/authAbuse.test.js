import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4140';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_auth_abuse_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_auth_abuse_csrf';
process.env.APP_URL ??= 'http://localhost:4000';
process.env.CLIENT_URL ??= 'http://localhost:5173';
process.env.EMAIL_FROM ??= 'Findly <test@findly.local>';
process.env.LOG_LEVEL ??= 'silent';
process.env.RATE_LIMIT_MAX = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.PASSWORD_RESET_RATE_LIMIT_MAX = '100';
process.env.OAUTH_ENABLED = 'true';
process.env.OAUTH_STATE_TTL_MINUTES = '10';
process.env.OAUTH_ALLOWED_RETURN_PATHS = '/dashboard,/settings,/billing';
process.env.OAUTH_DEFAULT_SUCCESS_PATH = '/dashboard';
process.env.OAUTH_FAILURE_PATH = '/auth';
process.env.GOOGLE_OAUTH_ENABLED = 'true';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:4000/api/auth/oauth/google/callback';

let createApp;
let prisma;
let env;
let app;
let getTestOutbox;
let clearTestOutbox;

const unique = Date.now().toString(36);
const password = 'Secure12345@#$';
const createdEmails = new Set();

const defaults = {};

const rememberEnvDefaults = () => {
  for (const key of [
    'AUTH_ABUSE_PROTECTION_ENABLED',
    'SIGNUP_IP_MAX',
    'SIGNUP_IP_WINDOW_MS',
    'SIGNUP_IP_DAILY_MAX',
    'SIGNUP_EMAIL_HASH_MAX',
    'SIGNUP_EMAIL_HASH_WINDOW_MS',
    'SIGNUP_EMAIL_DOMAIN_MAX',
    'SIGNUP_EMAIL_DOMAIN_WINDOW_MS',
    'LOGIN_EMAIL_MAX_FAILED',
    'LOGIN_EMAIL_WINDOW_MS',
    'LOGIN_IP_MAX_FAILED',
    'LOGIN_IP_WINDOW_MS',
    'LOGIN_IP_EMAIL_MAX_FAILED',
    'LOGIN_IP_EMAIL_WINDOW_MS',
    'LOGIN_IP_DISTINCT_EMAIL_MAX',
    'LOGIN_IP_DISTINCT_EMAIL_WINDOW_MS',
    'LOGIN_EMAIL_DISTINCT_IP_MAX',
    'LOGIN_EMAIL_DISTINCT_IP_WINDOW_MS',
    'PASSWORD_RESET_EMAIL_MAX',
    'PASSWORD_RESET_EMAIL_WINDOW_MS',
    'PASSWORD_RESET_IP_MAX',
    'PASSWORD_RESET_IP_WINDOW_MS',
    'PASSWORD_RESET_IP_EMAIL_MAX',
    'PASSWORD_RESET_IP_EMAIL_WINDOW_MS',
    'VERIFICATION_RESEND_USER_MAX',
    'VERIFICATION_RESEND_USER_WINDOW_MS',
    'VERIFICATION_RESEND_IP_MAX',
    'VERIFICATION_RESEND_IP_WINDOW_MS',
    'VERIFICATION_RESEND_COOLDOWN_SECONDS',
    'DISPOSABLE_EMAIL_BLOCKLIST_ENABLED',
    'DISPOSABLE_EMAIL_DOMAINS_LIST',
    'BOT_CHALLENGE_ENABLED',
    'BOT_CHALLENGE_SIGNUP_MODE',
    'BOT_CHALLENGE_PASSWORD_RESET_MODE',
    'TURNSTILE_SECRET_KEY',
    'TURNSTILE_SITE_KEY',
    'OAUTH_SIGNUP_IP_MAX',
    'OAUTH_SIGNUP_IP_WINDOW_MS',
  ]) {
    defaults[key] = env[key];
  }
};

const resetEnv = () => {
  for (const [key, value] of Object.entries(defaults)) {
    env[key] = value;
  }
};

const setEnv = (overrides) => {
  Object.assign(env, overrides);
};

const makeEmail = (suffix) => {
  const email = `${suffix}.${unique}@findly.local`;
  createdEmails.add(email);
  return email;
};

const getCsrfToken = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const register = (email, body = {}) => request(app)
  .post('/api/auth/register')
  .send({
    name: 'Abuse Test User',
    email,
    password,
    formDurationMs: 5000,
    companyWebsite: '',
    ...body,
  });

const verifyLatestEmailFor = async (email, agent = request.agent(app)) => {
  const item = [...getTestOutbox()].reverse().find((entry) => entry.to === email && entry.verificationUrl);
  expect(item).toBeTruthy();
  const token = new URL(item.verificationUrl).searchParams.get('token');
  await agent.post('/api/auth/verify-email').send({ token }).expect(200);
};

const login = (email, pass = password) => request(app)
  .post('/api/auth/login')
  .send({ email, password: pass });

const mockGoogleOAuthFetch = ({ email, id }) => {
  global.fetch = vi.fn(async (url) => {
    const text = String(url);
    if (text.includes('siteverify')) {
      return Response.json({ success: true });
    }
    if (text.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'oauth-access-token', token_type: 'Bearer' });
    }
    return Response.json({
      sub: id,
      email,
      email_verified: true,
      name: 'OAuth Abuse User',
      picture: 'https://example.com/avatar.png',
    });
  });
};

const startGoogleOAuth = async (agent = request.agent(app)) => {
  const response = await agent.get('/api/auth/oauth/google/start?returnTo=/dashboard').expect(302);
  const location = new URL(response.headers.location);
  return { agent, state: location.searchParams.get('state') };
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ getTestOutbox, clearTestOutbox } = await import('../../src/modules/mail/mail.service.js'));
  app = createApp();
  rememberEnvDefaults();
});

beforeEach(async () => {
  clearTestOutbox();
  resetEnv();
  vi.restoreAllMocks();
  await prisma.authAbuseCounter.deleteMany({});
  await prisma.authAbuseEvent.deleteMany({});
  await prisma.failedLoginAttempt.deleteMany({});
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.user.deleteMany({
    where: { email: { in: [...createdEmails] } },
  }).catch(() => {});
  await prisma.authAbuseCounter.deleteMany({}).catch(() => {});
  await prisma.authAbuseEvent.deleteMany({}).catch(() => {});
  await prisma.$disconnect();
  vi.restoreAllMocks();
});

describe('Auth abuse hardening', () => {
  it('allows normal signup with abuse protection enabled', async () => {
    const email = makeEmail('signup.normal');
    const response = await register(email).expect(201);

    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.workspace.name).toContain('workspace');
  });

  it('blocks too many signups from the same IP without creating blocked users', async () => {
    setEnv({ SIGNUP_IP_MAX: 2, SIGNUP_IP_WINDOW_MS: 10 * 60 * 1000 });

    await register(makeEmail('signup.ip.1')).expect(201);
    await register(makeEmail('signup.ip.2')).expect(201);
    const blockedEmail = makeEmail('signup.ip.3');

    const blocked = await register(blockedEmail).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    const missing = await prisma.user.findUnique({ where: { email: blockedEmail } });
    expect(missing).toBeNull();
  });

  it('blocks repeated signup attempts for the same email hash before duplicate account side effects', async () => {
    setEnv({ SIGNUP_EMAIL_HASH_MAX: 1, SIGNUP_IP_MAX: 20 });
    const email = makeEmail('signup.same-email');

    await register(email).expect(201);
    const blocked = await register(email).expect(429);

    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('blocks configurable disposable email domains', async () => {
    setEnv({
      DISPOSABLE_EMAIL_BLOCKLIST_ENABLED: true,
      DISPOSABLE_EMAIL_DOMAINS_LIST: ['mailinator.com'],
    });

    const blocked = await register(`blocked.${unique}@mailinator.com`).expect(400);
    expect(blocked.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps login errors generic and temporarily blocks repeated failures for the same email', async () => {
    setEnv({ LOGIN_EMAIL_MAX_FAILED: 3, LOGIN_IP_MAX_FAILED: 20, LOGIN_IP_EMAIL_MAX_FAILED: 3 });
    const email = makeEmail('login.lockout');

    await register(email).expect(201);
    await verifyLatestEmailFor(email);

    for (let i = 0; i < 3; i += 1) {
      const failed = await login(email, 'WrongPassword123!').expect(401);
      expect(failed.body.error.message).toBe('Invalid email or password.');
    }

    const blocked = await login(email, 'WrongPassword123!').expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('clears relevant login failure counters after a successful login', async () => {
    setEnv({ LOGIN_EMAIL_MAX_FAILED: 3, LOGIN_IP_MAX_FAILED: 20, LOGIN_IP_EMAIL_MAX_FAILED: 3 });
    const email = makeEmail('login.clear');

    await register(email).expect(201);
    await verifyLatestEmailFor(email);

    await login(email, 'WrongPassword123!').expect(401);
    await login(email, 'WrongPassword123!').expect(401);
    await login(email, password).expect(200);

    const nextFailure = await login(email, 'WrongPassword123!').expect(401);
    expect(nextFailure.body.error.code).toBe('UNAUTHORIZED');
  });

  it('blocks password spraying from the same IP across distinct emails', async () => {
    setEnv({ LOGIN_IP_DISTINCT_EMAIL_MAX: 2, LOGIN_IP_MAX_FAILED: 20, LOGIN_EMAIL_MAX_FAILED: 20, LOGIN_IP_EMAIL_MAX_FAILED: 20 });

    const emails = [
      makeEmail('spray.user.1'),
      makeEmail('spray.user.2'),
      makeEmail('spray.user.3'),
    ];

    for (const email of emails) {
      await register(email).expect(201);
      await verifyLatestEmailFor(email);
      clearTestOutbox();
    }

    await login(emails[0], 'WrongPassword123!').expect(401);
    await login(emails[1], 'WrongPassword123!').expect(401);
    const blocked = await login(emails[2], 'WrongPassword123!').expect(429);

    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('keeps forgot-password responses generic and suppresses reset email bombing', async () => {
    setEnv({ PASSWORD_RESET_EMAIL_MAX: 2, PASSWORD_RESET_IP_MAX: 20, PASSWORD_RESET_IP_EMAIL_MAX: 20 });
    const email = makeEmail('reset.generic');

    await register(email).expect(201);
    await verifyLatestEmailFor(email);
    clearTestOutbox();

    for (let i = 0; i < 3; i += 1) {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email })
        .expect(200);
      expect(response.body.message).toBe('If an account exists, a reset email has been sent.');
    }

    expect(getTestOutbox().filter((entry) => entry.to === email && entry.resetUrl)).toHaveLength(2);
  });

  it('rate limits verification resend per authenticated user without spamming email sends', async () => {
    setEnv({
      VERIFICATION_RESEND_COOLDOWN_SECONDS: 15,
      VERIFICATION_RESEND_USER_MAX: 2,
      VERIFICATION_RESEND_IP_MAX: 20,
    });
    const email = makeEmail('verify.resend');
    const agent = request.agent(app);

    await agent.post('/api/auth/register').send({
      name: 'Verify User',
      email,
      password,
      formDurationMs: 5000,
      companyWebsite: '',
    }).expect(201);

    const csrfToken = await getCsrfToken(agent);
    for (let i = 0; i < 2; i += 1) {
      await prisma.user.update({
        where: { email },
        data: { lastVerificationEmailSentAt: new Date(Date.now() - 60 * 1000) },
      });
      await agent.post('/api/auth/resend-verification')
        .set('X-CSRF-Token', csrfToken)
        .send({})
        .expect(200);
    }

    await prisma.user.update({
      where: { email },
      data: { lastVerificationEmailSentAt: new Date(Date.now() - 60 * 1000) },
    });
    const blocked = await agent.post('/api/auth/resend-verification')
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(429);

    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('signup works without a challenge when bot challenge is disabled', async () => {
    setEnv({ BOT_CHALLENGE_ENABLED: false, BOT_CHALLENGE_SIGNUP_MODE: 'required' });
    const email = makeEmail('challenge.disabled');
    await register(email).expect(201);
  });

  it('requires a bot challenge token when signup challenge mode is required', async () => {
    setEnv({
      BOT_CHALLENGE_ENABLED: true,
      BOT_CHALLENGE_SIGNUP_MODE: 'required',
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_SITE_KEY: 'test-site-key',
    });

    const blocked = await register(makeEmail('challenge.missing-token')).expect(403);
    expect(blocked.body.error.code).toBe('BOT_CHALLENGE_REQUIRED');
  });

  it('rejects invalid bot challenge tokens safely', async () => {
    setEnv({
      BOT_CHALLENGE_ENABLED: true,
      BOT_CHALLENGE_SIGNUP_MODE: 'required',
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_SITE_KEY: 'test-site-key',
    });
    global.fetch = vi.fn(async () => Response.json({ success: false }));

    const blocked = await register(makeEmail('challenge.invalid-token'), {
      botChallengeToken: 'bad-token',
    }).expect(403);

    expect(blocked.body.error.code).toBe('BOT_CHALLENGE_FAILED');
  });

  it('accepts valid bot challenge tokens and completes signup', async () => {
    setEnv({
      BOT_CHALLENGE_ENABLED: true,
      BOT_CHALLENGE_SIGNUP_MODE: 'required',
      TURNSTILE_SECRET_KEY: 'test-secret',
      TURNSTILE_SITE_KEY: 'test-site-key',
    });
    global.fetch = vi.fn(async () => Response.json({ success: true }));

    const email = makeEmail('challenge.valid-token');
    await register(email, {
      botChallengeToken: 'good-token',
    }).expect(201);
  });

  it('OAuth new-account creation respects signup abuse limits but linking an existing user is still allowed', async () => {
    setEnv({
      OAUTH_SIGNUP_IP_MAX: 1,
      OAUTH_SIGNUP_IP_WINDOW_MS: 60 * 60 * 1000,
    });

    const firstEmail = makeEmail('oauth.new.1');
    mockGoogleOAuthFetch({ email: firstEmail, id: `google-first-${unique}` });
    const firstFlow = await startGoogleOAuth();
    await firstFlow.agent
      .get(`/api/auth/oauth/google/callback?code=oauth-code&state=${encodeURIComponent(firstFlow.state)}`)
      .expect(302);

    const secondEmail = makeEmail('oauth.new.2');
    mockGoogleOAuthFetch({ email: secondEmail, id: `google-second-${unique}` });
    const secondFlow = await startGoogleOAuth();
    const blocked = await secondFlow.agent
      .get(`/api/auth/oauth/google/callback?code=oauth-code&state=${encodeURIComponent(secondFlow.state)}`)
      .expect(302);
    expect(blocked.headers.location).toContain('authError=oauth_login_failed');
    expect(await prisma.user.findUnique({ where: { email: secondEmail } })).toBeNull();

    const existingEmail = makeEmail('oauth.link.allowed');
    await register(existingEmail).expect(201);
    await verifyLatestEmailFor(existingEmail);

    mockGoogleOAuthFetch({ email: existingEmail, id: `google-link-${unique}` });
    const linkFlow = await startGoogleOAuth();
    const linked = await linkFlow.agent
      .get(`/api/auth/oauth/google/callback?code=oauth-code&state=${encodeURIComponent(linkFlow.state)}`)
      .expect(302);
    expect(linked.headers.location).toBe('http://localhost:5173/dashboard');
  });
});
