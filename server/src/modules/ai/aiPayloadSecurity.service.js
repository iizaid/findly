import { redactSensitive, truncatePayload } from './aiSecurity.service.js';

export const secureAiInputPayload = (payload, options = {}) => {
  const redacted = redactSensitive(payload);
  return truncatePayload(redacted, {
    maxStringLength: options.maxStringLength ?? 1200,
    maxArrayLength: options.maxArrayLength ?? 12,
  });
};

export const stripRawProviderResult = (result = {}) => {
  if (!result || typeof result !== 'object') return result;
  const { rawText: _rawText, rawResponse: _rawResponse, rawRequest: _rawRequest, ...safe } = result;
  return redactSensitive(safe);
};

