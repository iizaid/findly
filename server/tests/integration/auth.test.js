import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173,http://127.0.0.1:5173';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_test_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_test_csrf';
process.env.SESSION_TTL_DAYS ??= '30';
process.env.BCRYPT_ROUNDS ??= '10';
process.env.RATE_LIMIT_WINDOW_MS ??= '900000';
process.env.RATE_LIMIT_MAX ??= '1000';
process.env.AUTH_RATE_LIMIT_MAX ??= '1000';
process.env.SIGNUP_RATE_LIMIT_MAX ??= '1000';
process.env.LOGIN_RATE_LIMIT_MAX ??= '1000';
process.env.JSON_BODY_LIMIT ??= '100kb';
process.env.URLENCODED_BODY_LIMIT ??= '50kb';
process.env.TRUST_PROXY ??= '0';
process.env.MAX_ACTIVE_SESSIONS ??= '10';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for integration tests.');
}

const unique = Date.now().toString(36);
const email = `test.${unique}@findly.local`;
const password = 'Secure12345';

let app;
let prisma;

const getCsrfToken = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

beforeAll(async () => {
  ({ createApp: app } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: `test.${unique}`,
      },
    },
  });
  await prisma.$disconnect();
});

describe('Findly auth and foundation API', () => {
  it('rejects unauthenticated protected routes safely', async () => {
    const response = await request(app()).get('/api/auth/me').expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
  });

  it('rejects malformed JSON safely', async () => {
    const response = await request(app())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{not-json')
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects invalid registration input', async () => {
    const response = await request(app())
      .post('/api/auth/register')
      .send({
        name: 'A',
        email: 'not-an-email',
        password: 'password',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registers a user, creates default workspace, grants credits, and never returns passwordHash', async () => {
    const agent = request.agent(app());
    const response = await agent
      .post('/api/auth/register')
      .send({
        name: 'Backend Test',
        email,
        password,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user.creditsBalance).toBe(50);
    expect(response.body.data.workspace.name).toBe("Backend Test's workspace");

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        creditLedger: true,
        workspaceMembers: true,
        sessions: true,
      },
    });

    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash.startsWith('$2')).toBe(true);
    expect(user.creditsBalance).toBe(50);
    expect(user.creditLedger).toHaveLength(1);
    expect(user.workspaceMembers).toHaveLength(1);
    expect(user.sessions[0].tokenHash).toHaveLength(64);
  });

  it('blocks duplicate email safely', async () => {
    const response = await request(app())
      .post('/api/auth/register')
      .send({
        name: 'Backend Test',
        email,
        password,
      })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns a generic error for wrong password', async () => {
    const response = await request(app())
      .post('/api/auth/login')
      .send({
        email,
        password: 'Wrong12345',
      })
      .expect(401);

    expect(response.body.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Invalid email or password.',
    });
  });

  it('logs in, returns current user, validates params, and logs out with CSRF protection', async () => {
    const agent = request.agent(app());

    await agent
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const meResponse = await agent.get('/api/auth/me').expect(200);
    expect(meResponse.body.data.user.passwordHash).toBeUndefined();
    expect(meResponse.body.data.workspace.id).toBeTruthy();

    const creditsResponse = await agent.get('/api/credits').expect(200);
    expect(creditsResponse.body.data.credits.balance).toBe(50);

    const historyResponse = await agent.get('/api/credits/history?page=1&limit=10').expect(200);
    expect(historyResponse.body.data.ledger.items.length).toBeGreaterThanOrEqual(1);

    await agent.delete('/api/sessions/not-a-cuid').expect(403);

    const csrfToken = await getCsrfToken(agent);

    const invalidParamResponse = await agent
      .delete('/api/sessions/not-a-cuid')
      .set('X-CSRF-Token', csrfToken)
      .expect(400);

    expect(invalidParamResponse.body.error.code).toBe('VALIDATION_ERROR');

    await agent.post('/api/auth/logout').expect(403);

    await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    await agent.get('/api/auth/me').expect(401);
  });
});
