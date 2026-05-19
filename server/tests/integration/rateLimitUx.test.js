import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Set a LOW general rate limit so we can prove the skip logic works.
 * Route-specific limiters (login, signup, etc.) stay high so setup succeeds.
 * These must be set BEFORE the dynamic import of app.js so the env module parses them.
 */
process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '25';         // Low enough to exhaust, high enough for setup+tests
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SIGNUP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SEARCH_RATE_LIMIT_MAX = '1000';
process.env.ANALYSIS_RATE_LIMIT_MAX = '1000';

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
  // GET /api/csrf-token is skipped by generalRateLimiter so this doesn't consume a slot
  const res = await agent.get('/api/csrf-token').expect(200);
  return res.body.data.csrfToken;
};

/**
 * Rate Limit UX Hardening.
 *
 * The general rate limiter is mounted BEFORE cookieParser and auth middleware in app.js,
 * so its skip function CANNOT depend on req.user. It uses purely path/method matching.
 *
 * IMPORTANT: All tests share the same express-rate-limit memory store (same app instance,
 * same IP 127.0.0.1). Non-skipped requests are cumulative across tests.
 * Test order matters:
 *   1. Login lockout (7 non-skipped POSTs)
 *   2. Provider limitName test (≤6 non-skipped POSTs)
 *   3. General limiter exhaustion — must be LAST (exhausts all remaining slots)
 */
describe('Rate Limit UX Hardening', () => {
  let app;
  let rootAgent;

  beforeAll(async () => {
    // 2 non-skipped requests: register (POST) + login (POST)
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

  // --- Test 1: 7 non-skipped POSTs (cumulative general count: 2 + 7 = 9) ---
  it('Login brute-force lockout (DB-level) returns 429 with RATE_LIMITED code', async () => {
    const lockoutEmail = `ratelimit.lockout.${unique}@findly.local`;

    // 6 failed logins → triggers DB-level lockout at threshold of 5
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: lockoutEmail, password: 'WrongPassword123!' });
    }

    // 7th attempt is blocked by DB-level checkFailedLoginLimit
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: lockoutEmail, password: 'WrongPassword123!' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toContain('Too many failed login attempts');
  });

  // --- Test 2: ≤6 non-skipped POSTs (cumulative general count: 9 + 6 = 15) ---
  it('Express-rate-limit 429 response includes limitName and retryAfterSeconds', async () => {
    // aiProviderTestRateLimiter: limit=5 per 10min, keyed by user ID.
    // CSRF GET is skipped so it doesn't consume a general slot.
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

  // --- Test 3: MUST be last — exhausts all remaining general slots ---
  it('Safe dashboard/admin GETs bypass the general limiter even when the limit is exhausted', async () => {
    // Exhaust the remaining general limiter slots by hitting a non-skipped GET route.
    // After test 1 + test 2 ≈ 15 slots consumed. With RATE_LIMIT_MAX=25, ~10 remain.
    // Send enough to guarantee exhaustion.
    for (let i = 0; i < 15; i++) {
      await request(app).get('/api/sources/status');
    }

    // Verify the general limiter IS exhausted on a non-skipped route.
    const blockedRes = await request(app).get('/api/sources/status');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error.limitName).toBe('general');

    // --- Skipped routes must STILL return 200, not 429 ---

    // GET /api/dashboard — skipped by generalRateLimiter, auth via rootAgent cookie
    const dashRes = await rootAgent.get('/api/dashboard');
    expect(dashRes.status).toBe(200);

    // GET /api/admin/summary — skipped, requires admin auth
    const adminRes = await rootAgent.get('/api/admin/summary');
    expect(adminRes.status).toBe(200);

    // GET /api/auth/me — skipped, requires auth
    const meRes = await rootAgent.get('/api/auth/me');
    expect(meRes.status).toBe(200);

    // GET /api/csrf-token — skipped, no auth needed
    const csrfRes = await request(app).get('/api/csrf-token');
    expect(csrfRes.status).toBe(200);
  });
});
