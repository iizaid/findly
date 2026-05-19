import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let createApp;
let prisma;

const unique = Date.now().toString(36);
const rootEmail = `ratelimit.root.${unique}@findly.local`;
const password = 'Secure12345@#$';

const registerAndLogin = async (agent, email, role) => {
  await agent.post('/api/auth/register').send({ name: role, email, password }).expect(201);
  await prisma.user.update({ where: { email }, data: { emailVerified: true, role } });
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
};

const csrf = async (agent) => {
  const res = await agent.get('/api/csrf-token').expect(200);
  return res.body.data.csrfToken;
};

/**
 * Rate Limit UX Hardening tests.
 *
 * 1. Login brute-force lockout (DB-level) returns a proper 429 with RATE_LIMITED code.
 * 2. Safe authenticated GET reads are skipped from the general rate limiter.
 * 3. The express-rate-limit middleware on sensitive routes correctly surfaces limitName/retryAfterSeconds.
 */
describe('Rate Limit UX Hardening', () => {
  let app;
  let rootAgent;

  beforeAll(async () => {
    ({ createApp } = await import('../../src/app.js'));
    ({ prisma } = await import('../../src/db/prisma.js'));

    app = createApp();
    rootAgent = request.agent(app);

    await prisma.user.deleteMany({ where: { email: rootEmail } }).catch(() => {});
    await registerAndLogin(rootAgent, rootEmail, 'ROOT');
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: rootEmail } }).catch(() => null);
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  });

  it('Login brute-force lockout (DB-level) returns 429 with RATE_LIMITED code', async () => {
    const lockoutEmail = `ratelimit.lockout.${unique}@findly.local`;

    // Spam login with wrong creds to trigger DB-level checkFailedLoginLimit (threshold = 5)
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: lockoutEmail, password: 'WrongPassword123!' });
    }

    // The next attempt should be blocked by the DB-level lockout
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: lockoutEmail, password: 'WrongPassword123!' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toContain('Too many failed login attempts');
  });

  it('Authenticated dashboard and admin reads are not blocked by general limiter', async () => {
    // rootAgent already has a valid session from registerAndLogin.
    // These safe GET endpoints should be skipped by generalRateLimiter.
    for (let i = 0; i < 5; i++) {
      const res = await rootAgent.get('/api/dashboard');
      expect(res.status).toBe(200);
    }

    const adminRes = await rootAgent.get('/api/admin/summary');
    expect(adminRes.status).toBe(200);
  });

  it('Rate limit middleware response shape includes limitName and retryAfterSeconds', async () => {
    // The aiProviderTestRateLimiter has limit=5 per 10min, keyed by user ID.
    // ROOT can access this endpoint, so we spam it to trigger the 429.
    const csrfToken = await csrf(rootAgent);

    let rateLimitedRes;
    for (let i = 0; i < 8; i++) {
      const res = await rootAgent
        .post('/api/admin/ai/providers/openai/test')
        .set('X-CSRF-Token', csrfToken)
        .send({ confirmProvider: 'openai' });

      if (res.status === 429) {
        rateLimitedRes = res;
        break;
      }
    }

    expect(rateLimitedRes).toBeDefined();
    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.success).toBe(false);
    expect(rateLimitedRes.body.error.code).toBe('RATE_LIMITED');
    expect(rateLimitedRes.body.error.limitName).toBe('ai-provider-test');
    expect(typeof rateLimitedRes.body.error.retryAfterSeconds).toBe('number');
    expect(rateLimitedRes.body.error.retryAfterSeconds).toBeGreaterThan(0);
  });
});
