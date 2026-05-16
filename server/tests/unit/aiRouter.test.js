import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/findly?schema=public';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.AI_ENABLED ??= 'false';
process.env.AI_ANALYSIS_ENABLED ??= 'false';

let runAiTask;
let getAiProviderStatuses;
let buildLeadAnalysisPrompt;
let runLeadAnalysisAiReview;
let MockAiProvider;
let AI_TASKS;

const baseConfig = {
  AI_ENABLED: true,
  AI_ANALYSIS_ENABLED: true,
  AI_ANALYSIS_PROVIDER_CHAIN: 'mock,rule_based',
  AI_ANALYSIS_MAX_RETRIES: 0,
};

beforeAll(async () => {
  ({ runAiTask, getAiProviderStatuses } = await import('../../src/modules/ai/aiRouter.service.js'));
  ({ buildLeadAnalysisPrompt } = await import('../../src/modules/ai/aiRequestBuilder.js'));
  ({ runLeadAnalysisAiReview } = await import('../../src/modules/ai/leadAnalysisAi.service.js'));
  ({ MockAiProvider } = await import('../../src/modules/ai/providers/mockProvider.js'));
  ({ AI_TASKS } = await import('../../src/modules/ai/ai.types.js'));
});

describe('AI router foundation', () => {
  it('uses rule-based fallback when AI is disabled', async () => {
    const mock = new MockAiProvider();
    const result = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providers: { mock },
      configOverrides: { ...baseConfig, AI_ENABLED: false },
    });

    expect(result.ok).toBe(false);
    expect(result.fallback).toBe('rule_based');
    expect(mock.callCount).toBe(0);
  });

  it('skips missing provider keys and uses fallback without crashing', async () => {
    const mock = new MockAiProvider({ configured: false });
    const result = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providers: { mock },
      configOverrides: baseConfig,
    });

    expect(result.ok).toBe(false);
    expect(result.fallback).toBe('rule_based');
    expect(result.attempts[0].errorType).toBe('NOT_CONFIGURED');
  });

  it('returns AI-assisted structured JSON when provider response is valid', async () => {
    const mock = new MockAiProvider();
    const result = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providers: { mock },
      configOverrides: baseConfig,
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('mock');
    expect(result.json.aiFitScore).toBeGreaterThan(0);
    expect(result.json.scoreLevel).toBe('HIGH');
  });

  it('tries the next provider when the first provider returns invalid JSON', async () => {
    const invalid = new MockAiProvider({ name: 'invalid_mock', mode: 'invalid' });
    const valid = new MockAiProvider({ name: 'valid_mock' });
    const result = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providerChain: ['invalid_mock', 'valid_mock', 'rule_based'],
      providers: { invalid_mock: invalid, valid_mock: valid },
      configOverrides: baseConfig,
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('valid_mock');
    expect(invalid.callCount).toBe(1);
    expect(valid.callCount).toBe(1);
  });

  it('falls back safely on timeout or rate limit responses', async () => {
    const timeout = new MockAiProvider({ mode: 'timeout' });
    const timeoutResult = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providers: { mock: timeout },
      configOverrides: baseConfig,
    });
    expect(timeoutResult.ok).toBe(false);
    expect(timeoutResult.fallback).toBe('rule_based');
    expect(timeoutResult.attempts[0].errorType).toBe('TIMEOUT');

    const rateLimited = new MockAiProvider({ mode: 'rate_limit' });
    const rateLimitResult = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providers: { mock: rateLimited },
      configOverrides: baseConfig,
    });
    expect(rateLimitResult.ok).toBe(false);
    expect(rateLimitResult.fallback).toBe('rule_based');
    expect(rateLimitResult.attempts[0].errorType).toBe('RATE_LIMIT');
  });

  it('respects configured provider order', async () => {
    const first = new MockAiProvider({ name: 'first' });
    const second = new MockAiProvider({ name: 'second' });

    const result = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providerChain: ['second', 'first', 'rule_based'],
      providers: { first, second },
      configOverrides: baseConfig,
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('second');
    expect(first.callCount).toBe(0);
    expect(second.callCount).toBe(1);
  });

  it('builds lead analysis prompts without forbidden sensitive fields', () => {
    const prompt = buildLeadAnalysisPrompt({
      lead: {
        businessName: 'Cafe Test',
        category: 'Cafe',
        rawData: { token: 'secret-token', sourceFile: 'private.xlsx' },
        source: 'LOCAL_DATASET',
        passwordHash: 'hash',
        websiteUrl: 'https://example.test',
      },
      profile: {
        serviceType: 'Website Development',
        email: 'owner@example.test',
        password: 'secret',
      },
      ruleBasedAnalysis: {
        fitScore: 70,
        opportunityScore: 80,
        scoreLevel: 'HIGH',
        detectedSignals: ['NO_WEBSITE'],
        reasons: ['No website listed.'],
      },
    });

    const text = JSON.stringify(prompt);
    expect(text).toContain('Cafe Test');
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('sourceFile');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('LOCAL_DATASET');
  });

  it('returns safe provider status without API keys', () => {
    const statuses = getAiProviderStatuses({
      configOverrides: {
        ...baseConfig,
        OPENAI_API_KEY: 'sk-test-secret',
        GEMINI_API_KEY: 'gemini-secret',
      },
    });

    const text = JSON.stringify(statuses);
    expect(statuses.providers.find((provider) => provider.provider === 'openai').configured).toBe(true);
    expect(text).not.toContain('sk-test-secret');
    expect(text).not.toContain('gemini-secret');
  });

  it('can merge valid AI review into a hybrid lead analysis payload', async () => {
    const mock = new MockAiProvider();
    const result = await runLeadAnalysisAiReview({
      lead: { businessName: 'Cafe Test', category: 'Cafe', source: 'LOCAL_DATASET' },
      profile: { serviceType: 'Website Development' },
      ruleBasedAnalysis: {
        fitScore: 50,
        opportunityScore: 50,
        scoreLevel: 'MEDIUM',
        detectedSignals: ['NO_WEBSITE'],
        reasons: ['No website listed.'],
        suggestedService: 'Website Development',
        outreachAngle: 'Offer a website.',
        messageDraft: 'Hi',
        confidence: 'medium',
        nextBestAction: 'Review lead details',
      },
      routerOptions: {
        providers: { mock },
        configOverrides: baseConfig,
      },
    });

    expect(result.aiResult.ok).toBe(true);
    expect(result.analysis.analysisSource).toBe('AI_ASSISTED');
    expect(result.analysis.opportunityScore).toBeGreaterThan(50);
  });
});
