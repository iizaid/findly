import dotenv from 'dotenv';
import { AI_TASKS } from '../src/modules/ai/ai.types.js';
import { validateAiTaskJson } from '../src/modules/ai/aiResponseValidator.js';
import { GeminiProvider } from '../src/modules/ai/providers/geminiProvider.js';
import { OpenAiProvider } from '../src/modules/ai/providers/openaiProvider.js';
import { AnthropicProvider } from '../src/modules/ai/providers/anthropicProvider.js';
import { DeepseekProvider } from '../src/modules/ai/providers/deepseekProvider.js';
import { KimiProvider } from '../src/modules/ai/providers/kimiProvider.js';
import { QwenProvider } from '../src/modules/ai/providers/qwenProvider.js';

dotenv.config({ quiet: true });

const isEnabled = process.env.RUN_REAL_AI_SMOKE === 'true';

if (!isEnabled) {
  console.error('Real AI smoke test skipped. Set RUN_REAL_AI_SMOKE=true to run it manually.');
  process.exit(1);
}

const providerName = (process.env.AI_SMOKE_PROVIDER || 'gemini').toLowerCase();
const providers = {
  gemini: () => new GeminiProvider({
    apiKey: process.env.GEMINI_API_KEY,
    defaultModel: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash',
  }),
  openai: () => new OpenAiProvider({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4.1-mini',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  }),
  anthropic: () => new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-5-sonnet-latest',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
  }),
  deepseek: () => new DeepseekProvider({
    apiKey: process.env.DEEPSEEK_API_KEY,
    defaultModel: process.env.DEEPSEEK_DEFAULT_MODEL,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
  }),
  kimi: () => new KimiProvider({
    apiKey: process.env.KIMI_API_KEY,
    defaultModel: process.env.KIMI_DEFAULT_MODEL,
    baseUrl: process.env.KIMI_BASE_URL,
  }),
  qwen: () => new QwenProvider({
    apiKey: process.env.QWEN_API_KEY,
    defaultModel: process.env.QWEN_DEFAULT_MODEL,
    baseUrl: process.env.QWEN_BASE_URL,
  }),
};

const providerFactory = providers[providerName];
if (!providerFactory) {
  console.error(JSON.stringify({ ok: false, provider: providerName, message: 'Unknown AI_SMOKE_PROVIDER.' }));
  process.exit(1);
}

const provider = providerFactory();

const status = provider.getStatus();
if (!provider.isConfigured()) {
  console.error(JSON.stringify({
    ok: false,
    provider: status.provider,
    model: status.model,
    status: status.status,
    message: 'Provider is not configured or is misconfigured.',
  }));
  process.exit(1);
}

const systemPrompt = [
  'Return JSON only.',
  'Do not include markdown.',
  'Use the exact schema requested by Findly lead analysis.',
].join(' ');

const userPrompt = JSON.stringify({
  task: 'Return a minimal valid lead_analysis JSON object for this smoke test.',
  lead: {
    businessName: 'Smoke Test Cafe',
    category: 'Coffee Shop',
    city: 'Amman',
    country: 'Jordan',
  },
  requiredShape: {
    aiFitScore: 'integer 0-100',
    aiOpportunityScore: 'integer 0-100',
    scoreLevel: 'LOW | MEDIUM | HIGH | GOLD',
    shouldContact: 'boolean',
    contactPriority: 'LOW | MEDIUM | HIGH | URGENT',
    confidence: 'low | medium | high',
    bestServiceToOffer: 'string',
    whyThisLeadFits: 'string[]',
    whyThisLeadMayNotFit: 'string[]',
    detectedDigitalGaps: 'string[]',
    recommendedFirstOffer: 'string',
    personalizedOutreachAngle: 'string',
    messageDraft: 'string',
    nextBestAction: 'string',
    riskNotes: 'string[]',
    dataQualityNotes: 'string[]',
  },
});

const result = await provider.generateJson({
  task: AI_TASKS.LEAD_ANALYSIS,
  systemPrompt,
  userPrompt,
  timeoutMs: Number(process.env.AI_ANALYSIS_TIMEOUT_MS || 20000),
});

if (!result.ok) {
  console.error(JSON.stringify({
    ok: false,
    provider: result.provider,
    model: result.model,
    errorType: result.errorType,
    safeMessage: result.safeMessage,
    latencyMs: result.latencyMs,
  }));
  process.exit(1);
}

const validation = validateAiTaskJson({
  task: AI_TASKS.LEAD_ANALYSIS,
  json: result.json,
  rawText: result.rawText,
});

console.log(JSON.stringify({
  ok: validation.ok,
  provider: result.provider,
  model: result.model,
  latencyMs: result.latencyMs,
  usage: result.usage,
  validation: validation.ok ? 'valid' : 'invalid',
}));

process.exit(validation.ok ? 0 : 1);
