import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4148';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.SERPAPI_API_KEY = 'test-secret-serpapi-key';
process.env.SERPER_API_KEY = 'test-secret-serper-key';
process.env.GEMINI_API_KEY = 'test-secret-gemini-key';
process.env.SMTP_PASS = 'test-secret-smtp-password';

let createApp;
let prisma;
let app;

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health and production readiness report', () => {
  it('keeps the basic health endpoint small and safe', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      ok: true,
      service: 'findly-api',
      environment: 'test',
    });
    expect(response.body.data.timestamp).toEqual(expect.any(String));
    expect(response.body.data.uptimeSeconds).toEqual(expect.any(Number));
    expect(JSON.stringify(response.body)).not.toContain('test-secret');
  });

  it('returns a safe production readiness report without exposing secrets', async () => {
    const response = await request(app).get('/api/ready').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      ok: true,
      service: 'findly-api',
      environment: 'test',
      database: {
        ok: true,
        status: 'ok',
        responseTimeMs: expect.any(Number),
      },
    });
    expect(response.body.data.status).toEqual(expect.stringMatching(/ready|degraded/));
    expect(response.body.data.configuration.categories).toMatchObject({
      runtime: {
        nodeEnv: 'test',
        nodeVersion: expect.any(String),
        uptimeSeconds: expect.any(Number),
      },
      security: {
        authAbuseProtectionEnabled: expect.any(Boolean),
      },
      email: {
        configured: expect.any(Boolean),
        status: expect.any(String),
      },
      openWebEvidence: {
        enabled: expect.any(Boolean),
        failOpen: expect.any(Boolean),
        timeoutMs: expect.any(Number),
      },
      websiteJobs: {
        maxItems: expect.any(Number),
        concurrency: expect.any(Number),
      },
      uploads: {
        adminUploadDirConfigured: expect.any(Boolean),
        status: expect.any(String),
      },
    });
    expect(Array.isArray(response.body.data.configuration.warnings)).toBe(true);
    expect(response.body.data.configuration.warningCount).toBe(response.body.data.configuration.warnings.length);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('test-secret');
    expect(body).not.toContain('SERPAPI_API_KEY');
    expect(body).not.toContain('SERPER_API_KEY');
    expect(body).not.toContain('GEMINI_API_KEY');
    expect(body).not.toContain('SMTP_PASS');
  });

  it('also exposes the same readiness report through /api/health/ready', async () => {
    const response = await request(app).get('/api/health/ready').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.database.status).toBe('ok');
    expect(response.body.data.configuration.categories.liveDiscovery.providers).toEqual(expect.any(Array));
  });
});
