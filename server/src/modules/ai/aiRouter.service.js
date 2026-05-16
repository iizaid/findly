import { getAiRuntimeConfig } from './ai.config.js';
import { AI_ERROR_TYPES, AI_PROVIDER_NAMES, AI_PROVIDERS, AI_TASKS } from './ai.types.js';
import { validateAiTaskJson } from './aiResponseValidator.js';
import { OpenAiProvider } from './providers/openaiProvider.js';
import { AnthropicProvider } from './providers/anthropicProvider.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { DeepseekProvider } from './providers/deepseekProvider.js';
import { KimiProvider } from './providers/kimiProvider.js';
import { QwenProvider } from './providers/qwenProvider.js';

const providerClasses = {
  [AI_PROVIDERS.OPENAI]: OpenAiProvider,
  [AI_PROVIDERS.ANTHROPIC]: AnthropicProvider,
  [AI_PROVIDERS.GEMINI]: GeminiProvider,
  [AI_PROVIDERS.DEEPSEEK]: DeepseekProvider,
  [AI_PROVIDERS.KIMI]: KimiProvider,
  [AI_PROVIDERS.QWEN]: QwenProvider,
};

const normalizeProviders = (providers, config) => {
  if (providers instanceof Map) return providers;
  if (Array.isArray(providers)) {
    return new Map(providers.map((provider) => [provider.name, provider]));
  }
  if (providers && typeof providers === 'object') {
    return new Map(Object.entries(providers));
  }

  return new Map(Object.entries(providerClasses).map(([name, Provider]) => [
    name,
    new Provider(config.providers[name]),
  ]));
};

const fallbackResult = ({ task, attempts, reason = 'AI unavailable; use rule-based analysis.' }) => ({
  ok: false,
  task,
  fallback: AI_PROVIDERS.RULE_BASED,
  errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
  safeMessage: reason,
  attempts,
});

const attemptProvider = async ({
  provider,
  task,
  schema,
  systemPrompt,
  userPrompt,
  input,
  timeoutMs,
  requireJson,
}) => {
  const result = requireJson
    ? await provider.generateJson({ task, schema, systemPrompt, userPrompt, input, timeoutMs })
    : await provider.generateText({ task, systemPrompt, userPrompt, input, timeoutMs });

  if (!result.ok) return result;
  if (!requireJson) return result;

  const validation = validateAiTaskJson({ task, json: result.json, rawText: result.rawText });
  if (!validation.ok) {
    return {
      ok: false,
      provider: result.provider,
      model: result.model,
      errorType: validation.errorType,
      safeMessage: validation.safeMessage,
      retryable: false,
      latencyMs: result.latencyMs,
    };
  }

  return { ...result, json: validation.json };
};

export const runAiTask = async ({
  task = AI_TASKS.LEAD_ANALYSIS,
  providerChain = null,
  schema = null,
  systemPrompt = '',
  userPrompt = '',
  input = null,
  timeoutMs = null,
  retries = null,
  requireJson = true,
  providers = null,
  configOverrides = {},
} = {}) => {
  const config = getAiRuntimeConfig(configOverrides);
  const route = config.taskRoutes[task];
  const attempts = [];

  if (!config.enabled || !route?.enabled) {
    return fallbackResult({ task, attempts, reason: 'AI is disabled; use rule-based analysis.' });
  }

  const chain = (providerChain?.length ? providerChain : route.providerChain).map((item) => item.toLowerCase());
  const providerMap = normalizeProviders(providers, config);
  const maxRetries = Number.isInteger(retries) ? retries : route.retries;
  const requestTimeoutMs = timeoutMs || route.timeoutMs;

  for (const providerName of chain) {
    if (providerName === AI_PROVIDERS.RULE_BASED) break;

    const provider = providerMap.get(providerName);
    if (!provider) {
      attempts.push({
        provider: providerName,
        ok: false,
        errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
        safeMessage: `${providerName} provider is not registered.`,
      });
      continue;
    }

    if (!provider.isConfigured()) {
      attempts.push({
        provider: providerName,
        ok: false,
        errorType: AI_ERROR_TYPES.NOT_CONFIGURED,
        safeMessage: `${providerName} is not configured.`,
      });
      continue;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const result = await attemptProvider({
        provider,
        task,
        schema,
        systemPrompt,
        userPrompt,
        input,
        timeoutMs: requestTimeoutMs,
        requireJson,
      });

      attempts.push({
        provider: providerName,
        model: result.model,
        ok: result.ok,
        errorType: result.errorType,
        retryable: result.retryable,
        latencyMs: result.latencyMs,
      });

      if (result.ok) {
        return {
          ...result,
          task,
          attempts,
        };
      }

      if (!result.retryable || attempt === maxRetries) break;
    }
  }

  return fallbackResult({ task, attempts });
};

export const getAiProviderStatuses = ({ configOverrides = {}, providers = null } = {}) => {
  const config = getAiRuntimeConfig(configOverrides);
  const providerMap = normalizeProviders(providers, config);

  return {
    enabled: config.enabled,
    defaultProvider: config.defaultProvider,
    defaultModel: config.defaultModel,
    leadAnalysis: {
      enabled: config.taskRoutes[AI_TASKS.LEAD_ANALYSIS]?.enabled || false,
      providerChain: config.taskRoutes[AI_TASKS.LEAD_ANALYSIS]?.providerChain || [],
      timeoutMs: config.taskRoutes[AI_TASKS.LEAD_ANALYSIS]?.timeoutMs || null,
      maxRetries: config.taskRoutes[AI_TASKS.LEAD_ANALYSIS]?.retries || 0,
      concurrency: config.taskRoutes[AI_TASKS.LEAD_ANALYSIS]?.concurrency || 1,
    },
    providers: AI_PROVIDER_NAMES.map((name) => providerMap.get(name)?.getStatus() || {
      provider: name,
      configured: false,
      status: 'missing_key',
      model: null,
    }),
  };
};
