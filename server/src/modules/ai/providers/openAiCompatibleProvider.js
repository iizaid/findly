import { BaseAiProvider } from './baseProvider.js';
import { parseJsonMaybe } from '../aiResponseValidator.js';
import { AI_ERROR_TYPES } from '../ai.types.js';
import { validateProviderBaseUrl } from '../aiSecurity.service.js';

const defaultFetch = (...args) => fetch(...args);

const createTimeoutSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
};

export class OpenAiCompatibleProvider extends BaseAiProvider {
  constructor(config = {}) {
    super(config);
    this.fetchImpl = config.fetchImpl || defaultFetch;
    this.requiresBaseUrl = Boolean(config.requiresBaseUrl);
    this.extraHeaders = config.extraHeaders || {};
  }

  getBaseUrlValidation() {
    const baseUrl = this.baseUrl || (!this.requiresBaseUrl ? 'https://api.openai.com/v1' : null);
    return validateProviderBaseUrl(baseUrl, { provider: this.name });
  }

  getStatus() {
    if (!this.apiKey) {
      return {
        provider: this.name,
        configured: false,
        status: 'missing_key',
        model: this.defaultModel || null,
        baseUrlConfigured: Boolean(this.baseUrl),
      };
    }

    if (!this.defaultModel) {
      return {
        provider: this.name,
        configured: false,
        status: 'misconfigured',
        model: null,
        baseUrlConfigured: Boolean(this.baseUrl),
        safeMessage: `${this.name} model is missing.`,
      };
    }

    const baseUrlValidation = this.getBaseUrlValidation();
    if (!baseUrlValidation.ok) {
      return {
        provider: this.name,
        configured: false,
        status: 'misconfigured',
        model: this.defaultModel,
        baseUrlConfigured: Boolean(this.baseUrl),
        safeMessage: baseUrlValidation.reason,
      };
    }

    return {
      provider: this.name,
      configured: true,
      status: 'configured',
      model: this.defaultModel,
      baseUrlConfigured: true,
    };
  }

  isConfigured() {
    return this.getStatus().status === 'configured';
  }

  normalizeError(error, startedAt, model = this.defaultModel) {
    const latencyMs = Date.now() - startedAt;
    if (error?.name === 'AbortError') {
      return {
        ok: false,
        provider: this.name,
        model,
        errorType: AI_ERROR_TYPES.TIMEOUT,
        safeMessage: 'AI provider request timed out.',
        retryable: true,
        latencyMs,
      };
    }

    const status = Number(error?.status || error?.code);
    if (status === 429) {
      return {
        ok: false,
        provider: this.name,
        model,
        errorType: AI_ERROR_TYPES.RATE_LIMIT,
        safeMessage: 'AI provider is temporarily rate limited.',
        retryable: true,
        latencyMs,
      };
    }

    const message = `${error?.message || ''}`.toLowerCase();
    if (message.includes('safety') || message.includes('policy') || message.includes('blocked')) {
      return {
        ok: false,
        provider: this.name,
        model,
        errorType: AI_ERROR_TYPES.SAFETY_BLOCKED,
        safeMessage: 'AI provider blocked the request for safety reasons.',
        retryable: false,
        latencyMs,
      };
    }

    return {
      ok: false,
      provider: this.name,
      model,
      errorType: AI_ERROR_TYPES.PROVIDER_ERROR,
      safeMessage: 'AI provider request failed.',
      retryable: status >= 500,
      latencyMs,
    };
  }

  async postChatCompletions({ systemPrompt = '', userPrompt = '', timeoutMs = 20000, requireJson = true } = {}) {
    const status = this.getStatus();
    const startedAt = Date.now();
    const model = this.defaultModel;

    if (status.status === 'missing_key') {
      return {
        ok: false,
        provider: this.name,
        model,
        errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
        safeMessage: `${this.name} is not configured.`,
        retryable: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    if (status.status !== 'configured') {
      return {
        ok: false,
        provider: this.name,
        model,
        errorType: AI_ERROR_TYPES.MISCONFIGURED,
        safeMessage: status.safeMessage || `${this.name} provider is misconfigured.`,
        retryable: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    const baseUrl = this.getBaseUrlValidation().url;
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const timeout = createTimeoutSignal(timeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: timeout.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...this.extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          ...(requireJson ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const error = new Error('AI provider request failed.');
        error.status = response.status;
        throw error;
      }

      const body = await response.json();
      const message = body?.choices?.[0]?.message || {};
      if (message.refusal) {
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

      const rawText = message.content || '';
      const json = requireJson ? parseJsonMaybe(rawText) : null;
      if (requireJson && !json) {
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
        usage: {
          inputTokens: body?.usage?.prompt_tokens ?? null,
          outputTokens: body?.usage?.completion_tokens ?? null,
          totalTokens: body?.usage?.total_tokens ?? null,
        },
      };
    } catch (error) {
      return this.normalizeError(error, startedAt, model);
    } finally {
      timeout.clear();
    }
  }

  async generateJson(args = {}) {
    return this.postChatCompletions({ ...args, requireJson: true });
  }

  async generateText(args = {}) {
    return this.postChatCompletions({ ...args, requireJson: false });
  }
}

