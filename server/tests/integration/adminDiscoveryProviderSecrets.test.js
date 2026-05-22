import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4102';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED = 'true';
process.env.DISCOVERY_SECRETS_MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.SERPER_API_KEY = 'env-serper-key-for-status-only';

let createApp;
let prisma;
let env;
let getResolvedSearchMetadataProviderConfig;
let rootAgent;
let adminAgent;
let userAgent;
let guestAgent;

const unique = Date.now().toString(36);
const rootEmail = `root.discovery.${unique}@findly.local`;
const adminEmail = `admin.discovery.${unique}@findly.local`;
const userEmail = `user.discovery.${unique}@findly.local`;
const password = 'Secure12345@#$';
const plaintextKey = `discovery-dashboard-${unique}-secret`;
const providerScope = ['serper', 'serpapi'];
let originalDiscoveryProviderSecrets = [];

const registerAndLogin = async (agent, email, role) => {
  await agent.post('/api/auth/register').send({ name: role, email, password }).expect(201);
  await prisma.user.update({ where: { email }, data: { emailVerified: true, role } });
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
};

const csrf = async (agent) => {
  const res = await agent.get('/api/csrf-token').expect(200);
  return res.body.data.csrfToken;
};

const restoreDiscoveryProviderSecrets = async () => {
  await prisma.discoveryProviderSecret.deleteMany({ where: { provider: { in: providerScope } } }).catch(() => {});

  for (const secret of originalDiscoveryProviderSecrets) {
    await prisma.discoveryProviderSecret.upsert({
      where: { provider: secret.provider },
      update: {
        encryptedKey: secret.encryptedKey,
        keyFingerprint: secret.keyFingerprint,
        baseUrl: secret.baseUrl,
        status: secret.status,
        role: secret.role,
        priority: secret.priority,
        isPrimaryCandidate: secret.isPrimaryCandidate,
        isFallbackCandidate: secret.isFallbackCandidate,
        lastTestedAt: secret.lastTestedAt,
        lastStatus: secret.lastStatus,
        lastErrorType: secret.lastErrorType,
        createdById: secret.createdById,
        updatedById: secret.updatedById,
      },
      create: {
        provider: secret.provider,
        encryptedKey: secret.encryptedKey,
        keyFingerprint: secret.keyFingerprint,
        baseUrl: secret.baseUrl,
        status: secret.status,
        role: secret.role,
        priority: secret.priority,
        isPrimaryCandidate: secret.isPrimaryCandidate,
        isFallbackCandidate: secret.isFallbackCandidate,
        lastTestedAt: secret.lastTestedAt,
        lastStatus: secret.lastStatus,
        lastErrorType: secret.lastErrorType,
        createdById: secret.createdById,
        updatedById: secret.updatedById,
      },
    });
  }
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ getResolvedSearchMetadataProviderConfig } = await import('../../src/modules/search/metadataProviders/searchMetadataProviderConfig.service.js'));

  env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED = true;
  env.DISCOVERY_SECRETS_MASTER_KEY = process.env.DISCOVERY_SECRETS_MASTER_KEY;
  env.SERPER_API_KEY = 'env-serper-key-for-status-only';
  env.SERPER_BASE_URL = 'https://google.serper.dev/search';

  const app = createApp();
  rootAgent = request.agent(app);
  adminAgent = request.agent(app);
  userAgent = request.agent(app);
  guestAgent = request.agent(app);

  await prisma.user.deleteMany({ where: { email: { in: [rootEmail, adminEmail, userEmail] } } }).catch(() => {});
  originalDiscoveryProviderSecrets = await prisma.discoveryProviderSecret.findMany({
    where: { provider: { in: providerScope } },
  });
  await prisma.discoveryProviderSecret.deleteMany({ where: { provider: { in: providerScope } } }).catch(() => {});

  await registerAndLogin(rootAgent, rootEmail, 'ROOT');
  await registerAndLogin(adminAgent, adminEmail, 'ADMIN');
  await registerAndLogin(userAgent, userEmail, 'USER');
});

afterAll(async () => {
  await restoreDiscoveryProviderSecrets();
  await prisma.user.deleteMany({ where: { email: { in: [rootEmail, adminEmail, userEmail] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Admin discovery provider secret management', () => {
  it('Prisma Client exposes discoveryProviderSecret model', () => {
    expect(prisma.discoveryProviderSecret).toBeDefined();
    expect(typeof prisma.discoveryProviderSecret.findMany).toBe('function');
  });

  it('allows admins to list safe status but only ROOT can write', async () => {
    await guestAgent.get('/api/admin/discovery/providers').expect(401);
    await userAgent.get('/api/admin/discovery/providers').expect(403);
    const adminList = await adminAgent.get('/api/admin/discovery/providers').expect(200);
    expect(JSON.stringify(adminList.body)).not.toContain(env.SERPER_API_KEY);

    const token = await csrf(adminAgent);
    await adminAgent
      .put('/api/admin/discovery/providers/serper/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: plaintextKey,
        confirmProvider: 'serper',
        reason: 'admin should not save',
      })
      .expect(403);
  });

  it('ROOT can save encrypted discovery provider secret without exposing plaintext', async () => {
    const token = await csrf(rootAgent);
    const res = await rootAgent
      .put('/api/admin/discovery/providers/serper/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: plaintextKey,
        baseUrl: 'https://google.serper.dev/search',
        role: 'SEARCH_METADATA',
        priority: 10,
        isPrimaryCandidate: true,
        isFallbackCandidate: false,
        confirmProvider: 'serper',
        reason: 'initial discovery setup',
      })
      .expect(200);

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(plaintextKey);
    expect(res.body.data.provider.source).toBe('dashboard');
    expect(res.body.data.provider.fingerprint).toHaveLength(12);

    const stored = await prisma.discoveryProviderSecret.findUnique({ where: { provider: 'serper' } });
    expect(stored.encryptedKey).not.toContain(plaintextKey);
    expect(stored.keyFingerprint).toBe(res.body.data.provider.fingerprint);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DISCOVERY_PROVIDER_SECRET_UPDATED', entityId: 'serper' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit)).not.toContain(plaintextKey);
  });

  it('dashboard key overrides env key and reports source safely', async () => {
    const config = await getResolvedSearchMetadataProviderConfig('serper');
    expect(config.source).toBe('dashboard');
    expect(config.apiKey).toBe(plaintextKey);
    expect(config.fingerprint).toHaveLength(12);

    const list = await rootAgent.get('/api/admin/discovery/providers').expect(200);
    const serper = list.body.data.providers.find((provider) => provider.provider === 'serper');
    expect(serper.source).toBe('dashboard');
    expect(JSON.stringify(list.body)).not.toContain(plaintextKey);
    expect(JSON.stringify(list.body)).not.toContain(env.SERPER_API_KEY);
  });

  it('wrong confirmProvider, weak key, and unsafe baseUrl fail safely', async () => {
    const token = await csrf(rootAgent);
    await rootAgent
      .put('/api/admin/discovery/providers/serper/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: plaintextKey,
        confirmProvider: 'serpapi',
        reason: 'wrong provider',
      })
      .expect(400);

    await rootAgent
      .put('/api/admin/discovery/providers/serper/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: 'short',
        confirmProvider: 'serper',
        reason: 'weak key test',
      })
      .expect(400);

    await rootAgent
      .put('/api/admin/discovery/providers/serper/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: plaintextKey,
        baseUrl: 'http://localhost:3000/search',
        confirmProvider: 'serper',
        reason: 'unsafe url test',
      })
      .expect(400);
  });

  it('test endpoint returns safe metadata and updates last status', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ organic: [{ title: 'Synthetic', link: 'https://example.com', snippet: 'ok' }] }),
    });
    const token = await csrf(rootAgent);
    try {
      const res = await rootAgent
        .post('/api/admin/discovery/providers/serper/test')
        .set('x-csrf-token', token)
        .send({ confirmProvider: 'serper' })
        .expect(200);
      const text = JSON.stringify(res.body);
      expect(res.body.data.result.ok).toBe(true);
      expect(text).not.toContain(plaintextKey);
      const stored = await prisma.discoveryProviderSecret.findUnique({ where: { provider: 'serper' } });
      expect(stored.lastStatus).toBe('ok');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('management disabled returns safe write error and env fallback still works', async () => {
    const original = env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED;
    env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED = false;
    try {
      const config = await getResolvedSearchMetadataProviderConfig('serper');
      expect(config.source).toBe('env');
      expect(config.apiKey).toBe(env.SERPER_API_KEY);

      const token = await csrf(rootAgent);
      const res = await rootAgent
        .put('/api/admin/discovery/providers/serpapi/secret')
        .set('x-csrf-token', token)
        .send({
          apiKey: 'serpapi-dashboard-secret',
          confirmProvider: 'serpapi',
          reason: 'disabled setup',
        })
        .expect(503);
      expect(res.body.error.message).toContain('not configured');
    } finally {
      env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED = original;
    }
  });

  it('ROOT can delete dashboard-managed discovery secret', async () => {
    const token = await csrf(rootAgent);
    const res = await rootAgent
      .delete('/api/admin/discovery/providers/serper/secret')
      .set('x-csrf-token', token)
      .send({ confirmProvider: 'serper', reason: 'remove test key' })
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain(plaintextKey);
    const stored = await prisma.discoveryProviderSecret.findUnique({ where: { provider: 'serper' } });
    expect(stored.status).toBe('DELETED');
  });
});
