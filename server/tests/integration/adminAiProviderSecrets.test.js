import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED = 'true';
process.env.AI_SECRETS_MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.OPENAI_API_KEY = 'env-openai-key-for-status-only';
process.env.OPENAI_DEFAULT_MODEL = 'env-openai-model';

let createApp;
let prisma;
let env;
let getDashboardProviderConfigOverrides;
let runAiTask;
let AI_TASKS;
let rootAgent;
let adminAgent;
let userAgent;
let guestAgent;

const unique = Date.now().toString(36);
const rootEmail = `root.ai.${unique}@findly.local`;
const adminEmail = `admin.ai.${unique}@findly.local`;
const userEmail = `user.ai.${unique}@findly.local`;
const password = 'Secure12345@#$';
const plaintextKey = `sk-dashboard-${unique}-secret-value`;

const registerAndLogin = async (agent, email, role) => {
  await agent.post('/api/auth/register').send({ name: role, email, password }).expect(201);
  await prisma.user.update({ where: { email }, data: { emailVerified: true, role } });
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
};

const csrf = async (agent) => {
  const res = await agent.get('/api/csrf-token').expect(200);
  return res.body.data.csrfToken;
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ getDashboardProviderConfigOverrides } = await import('../../src/modules/ai/aiSecretsVault.service.js'));
  ({ runAiTask } = await import('../../src/modules/ai/aiRouter.service.js'));
  ({ AI_TASKS } = await import('../../src/modules/ai/ai.types.js'));

  const app = createApp();
  rootAgent = request.agent(app);
  adminAgent = request.agent(app);
  userAgent = request.agent(app);
  guestAgent = request.agent(app);

  await prisma.user.deleteMany({ where: { email: { in: [rootEmail, adminEmail, userEmail] } } }).catch(() => {});
  await prisma.aiProviderSecret.deleteMany({ where: { provider: { in: ['openai', 'gemini'] } } }).catch(() => {});

  await registerAndLogin(rootAgent, rootEmail, 'ROOT');
  await registerAndLogin(adminAgent, adminEmail, 'ADMIN');
  await registerAndLogin(userAgent, userEmail, 'USER');
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.aiProviderSecret.deleteMany({ where: { provider: { in: ['openai', 'gemini'] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: [rootEmail, adminEmail, userEmail] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Admin AI provider secret management', () => {
  it('Prisma Client exposes aiProviderSecret model', () => {
    expect(prisma.aiProviderSecret).toBeDefined();
    expect(typeof prisma.aiProviderSecret.findMany).toBe('function');
  });

  it('rejects unauthenticated, USER, and ADMIN access to ROOT-only AI provider secrets', async () => {
    await guestAgent.get('/api/admin/ai/providers').expect(401);
    await userAgent.get('/api/admin/ai/providers').expect(403);
    await adminAgent.get('/api/admin/ai/providers').expect(403);

    const adminCsrf = await csrf(adminAgent);
    await adminAgent
      .put('/api/admin/ai/providers/openai/secret')
      .set('x-csrf-token', adminCsrf)
      .send({
        apiKey: plaintextKey,
        model: 'gpt-test',
        baseUrl: 'https://api.example.test/v1',
        confirmProvider: 'openai',
        reason: 'admin should not save',
      })
      .expect(403);
  });

  it('ROOT can list safe provider statuses without secrets', async () => {
    const res = await rootAgent.get('/api/admin/ai/providers').expect(200);
    const text = JSON.stringify(res.body);
    expect(res.body.data.providers.find((provider) => provider.provider === 'openai')).toBeDefined();
    expect(text).not.toContain(process.env.OPENAI_API_KEY);
    expect(text).not.toContain(plaintextKey);
  });

  it('ROOT can save encrypted provider secret and responses/audit logs do not expose plaintext', async () => {
    const token = await csrf(rootAgent);
    const res = await rootAgent
      .put('/api/admin/ai/providers/openai/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: plaintextKey,
        model: 'gpt-test',
        baseUrl: 'https://api.example.test/v1',
        confirmProvider: 'openai',
        reason: 'initial secure setup',
      })
      .expect(200);

    const text = JSON.stringify(res.body);
    expect(text).not.toContain(plaintextKey);
    expect(res.body.data.provider.source).toBe('dashboard');
    expect(res.body.data.provider.fingerprint).toHaveLength(12);

    const stored = await prisma.aiProviderSecret.findUnique({ where: { provider: 'openai' } });
    expect(stored.encryptedKey).not.toContain(plaintextKey);
    expect(stored.keyFingerprint).toBe(res.body.data.provider.fingerprint);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'AI_PROVIDER_SECRET_UPDATED', entityId: 'openai' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit)).not.toContain(plaintextKey);
  });

  it('wrong confirmProvider and missing reason fail', async () => {
    const token = await csrf(rootAgent);
    await rootAgent
      .put('/api/admin/ai/providers/openai/secret')
      .set('x-csrf-token', token)
      .send({
        apiKey: plaintextKey,
        model: 'gpt-test',
        baseUrl: 'https://api.example.test/v1',
        confirmProvider: 'gemini',
        reason: 'wrong provider',
      })
      .expect(400);

    await rootAgent
      .delete('/api/admin/ai/providers/openai/secret')
      .set('x-csrf-token', token)
      .send({ confirmProvider: 'openai', reason: 'short' })
      .expect(400);
  });

  it('dashboard secret management disabled returns a safe error and env keys still report as env source', async () => {
    const originalEnabled = env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED;
    const originalOpenAiKey = env.OPENAI_API_KEY;
    env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED = false;
    env.OPENAI_API_KEY = 'env-openai-key-for-status-only';
    try {
      const list = await rootAgent.get('/api/admin/ai/providers').expect(200);
      const openai = list.body.data.providers.find((provider) => provider.provider === 'openai');
      expect(openai.source).toBe('env');
      expect(JSON.stringify(list.body)).not.toContain(env.OPENAI_API_KEY);

      const token = await csrf(rootAgent);
      const res = await rootAgent
        .put('/api/admin/ai/providers/gemini/secret')
        .set('x-csrf-token', token)
        .send({
          apiKey: 'gemini-dashboard-secret',
          model: 'gemini-2.5-flash',
          confirmProvider: 'gemini',
          reason: 'disabled setup',
        })
        .expect(503);
      expect(res.body.error.message).toContain('not configured');
    } finally {
      env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED = originalEnabled;
      env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it('dashboard key overrides env key only when enabled', async () => {
    env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED = true;
    const overrides = await getDashboardProviderConfigOverrides();
    expect(overrides.OPENAI_API_KEY).toBe(plaintextKey);
    expect(overrides.OPENAI_DEFAULT_MODEL).toBe('gpt-test');

    const originalFetch = global.fetch;
    global.fetch = async (_url, options) => {
      expect(options.headers.Authorization).toBe(`Bearer ${plaintextKey}`);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            aiFitScore: 70,
            aiOpportunityScore: 75,
            scoreLevel: 'HIGH',
            shouldContact: true,
            contactPriority: 'HIGH',
            confidence: 'medium',
            bestServiceToOffer: 'Website Development',
            whyThisLeadFits: ['Good fit'],
            whyThisLeadMayNotFit: [],
            detectedDigitalGaps: [],
            recommendedFirstOffer: 'Audit',
            personalizedOutreachAngle: 'Lead with gaps',
            messageDraft: 'Hello',
            nextBestAction: 'Send message',
            riskNotes: [],
            dataQualityNotes: [],
            dimensionScores: { serviceFit: 80, digitalGap: 90, businessQuality: 70, contactability: 85, urgency: 60, dataQuality: 50 },
            scoreExplanation: 'Test score explanation.',
            missingDataThatWouldImproveDecision: [],
          }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
      };
    };
    try {
      const result = await runAiTask({
        task: AI_TASKS.LEAD_ANALYSIS,
        providerChain: ['openai', 'rule_based'],
        systemPrompt: 'Return JSON only.',
        userPrompt: 'Return valid JSON.',
        configOverrides: {
          AI_ENABLED: true,
          AI_ANALYSIS_ENABLED: true,
          OPENAI_API_KEY: 'env-key-that-must-not-be-used',
          OPENAI_DEFAULT_MODEL: 'env-model-that-must-not-be-used',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
        },
      });
      expect(result.ok).toBe(true);
      expect(result.model).toBe('gpt-test');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('unsafe production base URL is rejected', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const token = await csrf(rootAgent);
    try {
      await rootAgent
        .put('/api/admin/ai/providers/deepseek/secret')
        .set('x-csrf-token', token)
        .send({
          apiKey: 'deepseek-dashboard-secret',
          model: 'deepseek-test',
          baseUrl: 'http://localhost:11434/v1',
          confirmProvider: 'deepseek',
          reason: 'unsafe url test',
        })
        .expect(400);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('test endpoint returns safe metadata only and updates test status', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          aiFitScore: 70,
          aiOpportunityScore: 75,
          scoreLevel: 'HIGH',
          shouldContact: true,
          contactPriority: 'HIGH',
          confidence: 'medium',
          bestServiceToOffer: 'Website Development',
          whyThisLeadFits: ['Good fit'],
          whyThisLeadMayNotFit: [],
          detectedDigitalGaps: [],
          recommendedFirstOffer: 'Audit',
          personalizedOutreachAngle: 'Lead with gaps',
          messageDraft: 'Hello',
          nextBestAction: 'Send message',
          riskNotes: [],
          dataQualityNotes: [],
          dimensionScores: { serviceFit: 80, digitalGap: 90, businessQuality: 70, contactability: 85, urgency: 60, dataQuality: 50 },
          scoreExplanation: 'Test score explanation.',
          missingDataThatWouldImproveDecision: [],
        }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    });

    const token = await csrf(rootAgent);
    try {
      const res = await rootAgent
        .post('/api/admin/ai/providers/openai/test')
        .set('x-csrf-token', token)
        .send({ confirmProvider: 'openai' })
        .expect(200);

      const text = JSON.stringify(res.body);
      expect(res.body.data.result.ok).toBe(true);
      expect(res.body.data.result.validation).toBe('valid');
      expect(text).not.toContain(plaintextKey);
      expect(text).not.toContain('Synthetic Provider Test');

      const stored = await prisma.aiProviderSecret.findUnique({ where: { provider: 'openai' } });
      expect(stored.lastStatus).toBe('ok');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('ROOT can delete dashboard-managed secret without exposing plaintext', async () => {
    const token = await csrf(rootAgent);
    const res = await rootAgent
      .delete('/api/admin/ai/providers/openai/secret')
      .set('x-csrf-token', token)
      .send({ confirmProvider: 'openai', reason: 'remove test key' })
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain(plaintextKey);
    const stored = await prisma.aiProviderSecret.findUnique({ where: { provider: 'openai' } });
    expect(stored.status).toBe('DELETED');
  });
});
