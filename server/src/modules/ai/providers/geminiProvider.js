import { BaseAiProvider } from './baseProvider.js';
import { parseJsonMaybe } from '../aiResponseValidator.js';
import { AI_ERROR_TYPES, AI_PROVIDERS } from '../ai.types.js';

export class GeminiProvider extends BaseAiProvider {
  constructor(config = {}) {
    super({ name: AI_PROVIDERS.GEMINI, ...config });
    this.clientFactory = config.clientFactory || null;
    this.client = null;
  }

  getStatus() {
    const configured = this.isConfigured();
    return {
      provider: this.name,
      configured,
      status: configured ? 'configured' : 'missing_key',
      model: this.defaultModel || null,
    };
  }

  async getClient() {
    if (this.client) return this.client;
    if (this.clientFactory) {
      this.client = await this.clientFactory({ apiKey: this.apiKey });
      return this.client;
    }

    const { GoogleGenAI } = await import('@google/genai');
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  normalizeProviderError(error, startedAt) {
    const latencyMs = Date.now() - startedAt;
    if (error?.name === 'AbortError' || error?.code === 'AI_TIMEOUT') {
      return {
        ok: false,
        provider: this.name,
        model: this.defaultModel || null,
        errorType: AI_ERROR_TYPES.TIMEOUT,
        safeMessage: 'AI provider request timed out.',
        retryable: true,
        latencyMs,
      };
    }

    const status = Number(error?.status || error?.response?.status || error?.code);
    if (status === 429) {
      return {
        ok: false,
        provider: this.name,
        model: this.defaultModel || null,
        errorType: AI_ERROR_TYPES.RATE_LIMIT,
        safeMessage: 'AI provider is temporarily rate limited.',
        retryable: true,
        latencyMs,
      };
    }

    const message = `${error?.message || ''}`.toLowerCase();
    if (message.includes('safety') || message.includes('blocked')) {
      return {
        ok: false,
        provider: this.name,
        model: this.defaultModel || null,
        errorType: AI_ERROR_TYPES.SAFETY_BLOCKED,
        safeMessage: 'AI provider blocked the request for safety reasons.',
        retryable: false,
        latencyMs,
      };
    }

    return {
      ok: false,
      provider: this.name,
      model: this.defaultModel || null,
      errorType: AI_ERROR_TYPES.PROVIDER_ERROR,
      safeMessage: 'AI provider request failed.',
      retryable: status >= 500,
      latencyMs,
    };
  }

  async withTimeout(promise, timeoutMs) {
    if (!timeoutMs) return promise;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error('AI provider request timed out.');
        error.name = 'AbortError';
        error.code = 'AI_TIMEOUT';
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  extractText(response) {
    if (!response) return '';
    if (typeof response.text === 'function') return response.text();
    if (typeof response.text === 'string') return response.text;

    const parts = response.candidates?.[0]?.content?.parts || [];
    return parts.map((part) => part.text || '').join('').trim();
  }

  extractUsage(response) {
    const usage = response?.usageMetadata || {};
    return {
      inputTokens: usage.promptTokenCount ?? null,
      outputTokens: usage.candidatesTokenCount ?? null,
      totalTokens: usage.totalTokenCount ?? null,
    };
  }

  isSafetyBlocked(response) {
    if (response?.promptFeedback?.blockReason) return true;
    return (response?.candidates || []).some((candidate) => {
      const reason = `${candidate.finishReason || ''}`.toUpperCase();
      return reason.includes('SAFETY') || reason.includes('BLOCK');
    });
  }

  async generateJson({ systemPrompt = '', userPrompt = '', timeoutMs = 20000 } = {}) {
    const startedAt = Date.now();
    const model = this.defaultModel || 'gemini-2.5-flash';

    if (!this.isConfigured()) {
      return {
        ok: false,
        provider: this.name,
        model,
        errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
        safeMessage: 'Gemini is not configured.',
        retryable: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    try {
      const client = await this.getClient();
      const response = await this.withTimeout(
        client.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
        timeoutMs,
      );

      if (this.isSafetyBlocked(response)) {
        return {
          ok: false,
          provider: this.name,
          model,
          errorType: AI_ERROR_TYPES.SAFETY_BLOCKED,
          safeMessage: 'AI provider blocked the request for safety reasons.',
          retryable: false,
          latencyMs: Date.now() - startedAt,
        };
      }

      const rawText = this.extractText(response);
      const json = parseJsonMaybe(rawText);
      if (!json) {
        return {
          ok: false,
          provider: this.name,
          model,
          errorType: AI_ERROR_TYPES.INVALID_RESPONSE,
          safeMessage: 'AI provider returned an invalid JSON response.',
          retryable: false,
          latencyMs: Date.now() - startedAt,
        };
      }

      return {
        ok: true,
        provider: this.name,
        model,
        latencyMs: Date.now() - startedAt,
        rawText,
        json,
        usage: this.extractUsage(response),
      };
    } catch (error) {
      return this.normalizeProviderError(error, startedAt);
    }
  }
}
