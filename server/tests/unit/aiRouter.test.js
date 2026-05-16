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
let GeminiProvider;
let OpenAiProvider;
let AnthropicProvider;
let DeepseekProvider;
let OpenAiCompatibleProvider;
let redactSensitive;
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
  ({ GeminiProvider } = await import('../../src/modules/ai/providers/geminiProvider.js'));
  ({ OpenAiProvider } = await import('../../src/modules/ai/providers/openaiProvider.js'));
  ({ AnthropicProvider } = await import('../../src/modules/ai/providers/anthropicProvider.js'));
  ({ DeepseekProvider } = await import('../../src/modules/ai/providers/deepseekProvider.js'));
  ({ OpenAiCompatibleProvider } = await import('../../src/modules/ai/providers/openAiCompatibleProvider.js'));
  ({ redactSensitive } = await import('../../src/modules/ai/aiSecurity.service.js'));
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

  it('Gemini provider returns NOT_CONFIGURED when API key is missing', async () => {
    const provider = new GeminiProvider({ apiKey: '', defaultModel: 'gemini-2.5-flash' });
    const result = await provider.generateJson({ userPrompt: 'Return JSON.', timeoutMs: 10 });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe('gemini');
    expect(result.errorType).toBe('NOT_CONFIGURED');
  });

  it('Gemini provider normalizes timeout, rate limit, provider, and safety errors', async () => {
    const timeoutProvider = new GeminiProvider({
      apiKey: 'test-key',
      defaultModel: 'gemini-test',
      clientFactory: async () => ({
        models: {
          generateContent: () => new Promise(() => {}),
        },
      }),
    });
    const timeoutResult = await timeoutProvider.generateJson({ userPrompt: 'Return JSON.', timeoutMs: 1 });
    expect(timeoutResult.ok).toBe(false);
    expect(timeoutResult.errorType).toBe('TIMEOUT');

    const rateLimitedProvider = new GeminiProvider({
      apiKey: 'test-key',
      clientFactory: async () => ({
        models: {
          generateContent: async () => {
            const error = new Error('rate limited');
            error.status = 429;
            throw error;
          },
        },
      }),
    });
    const rateLimitResult = await rateLimitedProvider.generateJson({ userPrompt: 'Return JSON.', timeoutMs: 50 });
    expect(rateLimitResult.errorType).toBe('RATE_LIMIT');

    const providerError = new GeminiProvider({
      apiKey: 'test-key',
      clientFactory: async () => ({
        models: {
          generateContent: async () => {
            const error = new Error('server error');
            error.status = 500;
            throw error;
          },
        },
      }),
    });
    const providerErrorResult = await providerError.generateJson({ userPrompt: 'Return JSON.', timeoutMs: 50 });
    expect(providerErrorResult.errorType).toBe('PROVIDER_ERROR');
    expect(providerErrorResult.retryable).toBe(true);

    const safetyProvider = new GeminiProvider({
      apiKey: 'test-key',
      clientFactory: async () => ({
        models: {
          generateContent: async () => ({
            promptFeedback: { blockReason: 'SAFETY' },
            text: '{"aiFitScore":50}',
          }),
        },
      }),
    });
    const safetyResult = await safetyProvider.generateJson({ userPrompt: 'Return JSON.', timeoutMs: 50 });
    expect(safetyResult.errorType).toBe('SAFETY_BLOCKED');
  });

  it('Gemini provider normalizes valid JSON without exposing the API key', async () => {
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      defaultModel: 'gemini-test',
      clientFactory: async () => ({
        models: {
          generateContent: async () => ({
            text: JSON.stringify({
              aiFitScore: 71,
              aiOpportunityScore: 72,
              scoreLevel: 'HIGH',
              shouldContact: true,
              contactPriority: 'HIGH',
              confidence: 'medium',
              bestServiceToOffer: 'Website Development',
              whyThisLeadFits: ['Good match.'],
              whyThisLeadMayNotFit: [],
              detectedDigitalGaps: ['Website needs review.'],
              recommendedFirstOffer: 'Website audit.',
              personalizedOutreachAngle: 'Lead with the website gap.',
              messageDraft: 'Hello from Findly.',
              nextBestAction: 'Send outreach.',
              riskNotes: [],
              dataQualityNotes: [],
            }),
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          }),
        },
      }),
    });

    const result = await provider.generateJson({ userPrompt: 'Return JSON.', timeoutMs: 50 });
    const text = JSON.stringify(result);
    expect(result.ok).toBe(true);
    expect(result.model).toBe('gemini-test');
    expect(result.usage.totalTokens).toBe(30);
    expect(text).not.toContain('test-key');
  });

  it('real provider adapters return NOT_CONFIGURED when API keys are missing', async () => {
    const openai = await new OpenAiProvider({ apiKey: '' }).generateJson({ userPrompt: 'Return JSON.' });
    const anthropic = await new AnthropicProvider({ apiKey: '' }).generateJson({ userPrompt: 'Return JSON.' });

    expect(openai.ok).toBe(false);
    expect(openai.errorType).toBe('NOT_CONFIGURED');
    expect(anthropic.ok).toBe(false);
    expect(anthropic.errorType).toBe('NOT_CONFIGURED');
  });

  it('OpenAI-compatible providers report misconfiguration when required base URL or model is missing', async () => {
    const missingBase = new DeepseekProvider({ apiKey: 'test-key', defaultModel: 'deepseek-test' });
    expect(missingBase.getStatus().status).toBe('misconfigured');

    const missingModel = new DeepseekProvider({ apiKey: 'test-key', baseUrl: 'https://api.example.test/v1' });
    expect(missingModel.getStatus().status).toBe('misconfigured');
  });

  it('OpenAI-compatible provider blocks unsafe production base URLs', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const provider = new OpenAiCompatibleProvider({
        name: 'unsafe',
        apiKey: 'test-key',
        defaultModel: 'test-model',
        baseUrl: 'http://localhost:11434/v1',
      });
      expect(provider.getStatus().status).toBe('misconfigured');
      expect(provider.getStatus().safeMessage).toContain('HTTPS');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('OpenAI provider normalizes valid JSON, rate limits, and invalid JSON without exposing keys', async () => {
    const validProvider = new OpenAiProvider({
      apiKey: 'openai-secret',
      defaultModel: 'gpt-test',
      fetchImpl: async (_url, options) => {
        expect(options.headers.Authorization).toBe('Bearer openai-secret');
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
            }) } }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          }),
        };
      },
    });
    const valid = await validProvider.generateJson({ userPrompt: 'Return JSON.' });
    expect(valid.ok).toBe(true);
    expect(valid.usage.totalTokens).toBe(3);
    expect(JSON.stringify(valid)).not.toContain('openai-secret');

    const rateLimited = new OpenAiProvider({
      apiKey: 'openai-secret',
      fetchImpl: async () => ({ ok: false, status: 429 }),
    });
    const rateLimitResult = await rateLimited.generateJson({ userPrompt: 'Return JSON.' });
    expect(rateLimitResult.errorType).toBe('RATE_LIMIT');

    const invalidProvider = new OpenAiProvider({
      apiKey: 'openai-secret',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
      }),
    });
    const invalid = await invalidProvider.generateJson({ userPrompt: 'Return JSON.' });
    expect(invalid.errorType).toBe('INVALID_RESPONSE');
  });

  it('Anthropic provider normalizes valid JSON and safe errors without exposing keys', async () => {
    const provider = new AnthropicProvider({
      apiKey: 'anthropic-secret',
      defaultModel: 'claude-test',
      fetchImpl: async (_url, options) => {
        expect(options.headers['x-api-key']).toBe('anthropic-secret');
        return {
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text: JSON.stringify({
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
            }) }],
            usage: { input_tokens: 4, output_tokens: 5 },
          }),
        };
      },
    });

    const result = await provider.generateJson({ userPrompt: 'Return JSON.' });
    expect(result.ok).toBe(true);
    expect(result.usage.totalTokens).toBe(9);
    expect(JSON.stringify(result)).not.toContain('anthropic-secret');
  });

  it('circuit breaker temporarily degrades repeatedly failing providers', async () => {
    const provider = new MockAiProvider({ name: 'cb_mock', mode: 'rate_limit' });
    for (let index = 0; index < 3; index += 1) {
      await runAiTask({
        task: AI_TASKS.LEAD_ANALYSIS,
        providerChain: ['cb_mock', 'rule_based'],
        providers: { cb_mock: provider },
        configOverrides: baseConfig,
      });
    }

    const before = provider.callCount;
    const degraded = await runAiTask({
      task: AI_TASKS.LEAD_ANALYSIS,
      providerChain: ['cb_mock', 'rule_based'],
      providers: { cb_mock: provider },
      configOverrides: baseConfig,
    });

    expect(degraded.ok).toBe(false);
    expect(degraded.attempts[0].degraded).toBe(true);
    expect(provider.callCount).toBe(before);
  });

  it('recursively redacts AI and auth secrets', () => {
    const redacted = redactSensitive({
      nested: {
        OPENAI_API_KEY: 'sk-real-secret',
        authorization: 'Bearer token',
        headers: { cookie: 'session=value' },
      },
      safe: 'visible',
    });

    const text = JSON.stringify(redacted);
    expect(text).not.toContain('sk-real-secret');
    expect(text).not.toContain('Bearer token');
    expect(text).not.toContain('session=value');
    expect(text).toContain('visible');
  });
});
