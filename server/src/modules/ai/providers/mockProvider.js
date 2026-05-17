import { AI_ERROR_TYPES, AI_PROVIDERS } from '../ai.types.js';

const defaultLeadAnalysisJson = {
  aiFitScore: 82,
  aiOpportunityScore: 78,
  scoreLevel: 'HIGH',
  shouldContact: true,
  contactPriority: 'HIGH',
  confidence: 'high',
  bestServiceToOffer: 'Website Development',
  whyThisLeadFits: ['The business appears active and has visible digital presence gaps.'],
  whyThisLeadMayNotFit: [],
  detectedDigitalGaps: ['Website presence needs review.'],
  recommendedFirstOffer: 'Offer a focused website improvement package.',
  personalizedOutreachAngle: 'Lead with a practical digital presence improvement angle.',
  messageDraft: 'Hi, I noticed an opportunity to improve your online presence and help more local customers contact you.',
  nextBestAction: 'Review lead and send a personalized message.',
  riskNotes: [],
  dataQualityNotes: ['Analysis is based only on provided lead data.'],
  dimensionScores: {
    serviceFit: 80,
    digitalGap: 90,
    businessQuality: 70,
    contactability: 85,
    urgency: 60,
    dataQuality: 50,
  },
  scoreExplanation: 'Mock score explanation for tests.',
  missingDataThatWouldImproveDecision: [],
};

export class MockAiProvider {
  constructor({ name = AI_PROVIDERS.MOCK, mode = 'valid', json = defaultLeadAnalysisJson, configured = true } = {}) {
    this.name = name;
    this.mode = mode;
    this.json = json;
    this.configured = configured;
    this.callCount = 0;
  }

  isConfigured() {
    return this.configured;
  }

  getStatus() {
    return {
      provider: this.name,
      configured: this.configured,
      status: this.configured ? 'configured' : 'missing_key',
      model: 'mock-model',
    };
  }

  async generateJson() {
    this.callCount += 1;
    const startedAt = Date.now();

    if (!this.configured) {
      return {
        ok: false,
        provider: this.name,
        model: 'mock-model',
        errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
        safeMessage: 'Mock provider is not configured.',
        retryable: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    if (this.mode === 'timeout') {
      return {
        ok: false,
        provider: this.name,
        model: 'mock-model',
        errorType: AI_ERROR_TYPES.TIMEOUT,
        safeMessage: 'AI provider request timed out.',
        retryable: true,
        latencyMs: Date.now() - startedAt,
      };
    }

    if (this.mode === 'rate_limit') {
      return {
        ok: false,
        provider: this.name,
        model: 'mock-model',
        errorType: AI_ERROR_TYPES.RATE_LIMIT,
        safeMessage: 'AI provider is temporarily rate limited.',
        retryable: true,
        latencyMs: Date.now() - startedAt,
      };
    }

    if (this.mode === 'invalid') {
      return {
        ok: true,
        provider: this.name,
        model: 'mock-model',
        latencyMs: Date.now() - startedAt,
        rawText: '{"not":"valid"}',
        json: { not: 'valid' },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    return {
      ok: true,
      provider: this.name,
      model: 'mock-model',
      latencyMs: Date.now() - startedAt,
      rawText: JSON.stringify(this.json),
      json: this.json,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  async generateText(args = {}) {
    const result = await this.generateJson(args);
    return result.ok ? { ...result, rawText: result.rawText || JSON.stringify(result.json) } : result;
  }
}
