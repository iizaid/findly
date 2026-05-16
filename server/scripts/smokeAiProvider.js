import dotenv from 'dotenv';
import { AI_TASKS } from '../src/modules/ai/ai.types.js';
import { validateAiTaskJson } from '../src/modules/ai/aiResponseValidator.js';
import { GeminiProvider } from '../src/modules/ai/providers/geminiProvider.js';

dotenv.config({ quiet: true });

const isEnabled = process.env.RUN_REAL_AI_SMOKE === 'true';

if (!isEnabled) {
  console.error('Real AI smoke test skipped. Set RUN_REAL_AI_SMOKE=true to run it manually.');
  process.exit(1);
}

const provider = new GeminiProvider({
  apiKey: process.env.GEMINI_API_KEY,
  defaultModel: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash',
});

const status = provider.getStatus();
if (!provider.isConfigured()) {
  console.error(JSON.stringify({
    ok: false,
    provider: status.provider,
    model: status.model,
    status: status.status,
    message: 'GEMINI_API_KEY is not configured.',
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
