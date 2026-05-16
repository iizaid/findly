import { AI_ERROR_TYPES } from '../ai.types.js';
import { normalizeAiError } from '../ai.errors.js';

export class BaseAiProvider {
  constructor({ name, apiKey = null, defaultModel = null } = {}) {
    this.name = name;
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  getStatus() {
    const configured = this.isConfigured();
    return {
      provider: this.name,
      configured,
      status: configured ? 'not_implemented' : 'missing_key',
      model: this.defaultModel || null,
    };
  }

  async generateJson(args = {}) {
    return this.generateText(args);
  }

  async generateText() {
    const startedAt = Date.now();
    if (!this.isConfigured()) {
      return {
        ok: false,
        provider: this.name,
        model: this.defaultModel || null,
        errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
        safeMessage: `${this.name} is not configured.`,
        retryable: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    return {
      ok: false,
      provider: this.name,
      model: this.defaultModel || null,
      errorType: AI_ERROR_TYPES.PROVIDER_ERROR,
      safeMessage: `${this.name} provider adapter is not implemented yet.`,
      retryable: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  normalizeError(error, startedAt) {
    return normalizeAiError(error, this.name, Date.now() - startedAt);
  }
}
