import { AI_ERROR_TYPES } from './ai.types.js';

export class AiProviderError extends Error {
  constructor(errorType, safeMessage, { provider = null, retryable = false, cause = null } = {}) {
    super(safeMessage);
    this.name = 'AiProviderError';
    this.errorType = errorType;
    this.safeMessage = safeMessage;
    this.provider = provider;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export const normalizeAiError = (error, provider, latencyMs = 0) => {
  if (error instanceof AiProviderError) {
    return {
      ok: false,
      provider: error.provider || provider,
      model: null,
      errorType: error.errorType,
      safeMessage: error.safeMessage,
      retryable: error.retryable,
      latencyMs,
    };
  }

  if (error?.name === 'AbortError') {
    return {
      ok: false,
      provider,
      model: null,
      errorType: AI_ERROR_TYPES.TIMEOUT,
      safeMessage: 'AI provider request timed out.',
      retryable: true,
      latencyMs,
    };
  }

  return {
    ok: false,
    provider,
    model: null,
    errorType: AI_ERROR_TYPES.PROVIDER_ERROR,
    safeMessage: 'AI provider request failed.',
    retryable: false,
    latencyMs,
  };
};
