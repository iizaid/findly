import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let createApp;
let prisma;

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
});

afterAll(async () => {
  await prisma.$disconnect();
});

const expectNoSecretLikeValues = (payload) => {
  const text = JSON.stringify(payload).toLowerCase();
  expect(text).not.toContain('database_url');
  expect(text).not.toContain('session_secret');
  expect(text).not.toContain('api_key');
  expect(text).not.toContain('smtp_pass');
  expect(text).not.toContain('cookie');
  expect(text).not.toContain('token');
  expect(text).not.toContain('postgresql://');
};

describe('Health endpoints', () => {
  it('returns lightweight liveness status without exposing secrets', async () => {
    const res = await request(createApp()).get('/api/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.service).toBe('findly-api');
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
    expect(res.body.data.environment).toBe('test');
    expectNoSecretLikeValues(res.body);
  });

  it('returns readiness status at /api/health/ready and legacy /api/ready', async () => {
    const ready = await request(createApp()).get('/api/health/ready').expect(200);
    const legacyReady = await request(createApp()).get('/api/ready').expect(200);

    expect(ready.body.success).toBe(true);
    expect(ready.body.data.ok).toBe(true);
    expect(ready.body.data.database).toBe('ok');
    expect(legacyReady.body.data.database).toBe('ok');
    expectNoSecretLikeValues(ready.body);
    expectNoSecretLikeValues(legacyReady.body);
  });
});
