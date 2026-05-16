import { env } from '../../config/env.js';
import { AI_PROVIDERS, AI_TASKS } from './ai.types.js';

const splitChain = (value, fallback) => {
  const source = Array.isArray(value) ? value : (value || '').toString().split(',');
  const chain = source.map((item) => item.toString().trim().toLowerCase()).filter(Boolean);
  return chain.length ? chain : fallback;
};

const numberOr = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const AI_TASK_ROUTES = {
  [AI_TASKS.LEAD_ANALYSIS]: {
    enabledEnv: 'AI_ANALYSIS_ENABLED',
    providerChainEnv: 'AI_ANALYSIS_PROVIDER_CHAIN',
    defaultChain: [
      AI_PROVIDERS.GEMINI,
      AI_PROVIDERS.OPENAI,
      AI_PROVIDERS.ANTHROPIC,
      AI_PROVIDERS.DEEPSEEK,
      AI_PROVIDERS.KIMI,
      AI_PROVIDERS.QWEN,
      AI_PROVIDERS.RULE_BASED,
    ],
    timeoutMsEnv: 'AI_ANALYSIS_TIMEOUT_MS',
    retriesEnv: 'AI_ANALYSIS_MAX_RETRIES',
    concurrencyEnv: 'AI_ANALYSIS_CONCURRENCY',
  },
  [AI_TASKS.OUTREACH_MESSAGE]: {
    defaultChain: [AI_PROVIDERS.OPENAI, AI_PROVIDERS.ANTHROPIC, AI_PROVIDERS.GEMINI, AI_PROVIDERS.RULE_BASED],
  },
  [AI_TASKS.LEAD_LIST_SUMMARY]: {
    defaultChain: [AI_PROVIDERS.GEMINI, AI_PROVIDERS.OPENAI, AI_PROVIDERS.ANTHROPIC, AI_PROVIDERS.RULE_BASED],
  },
  [AI_TASKS.ADMIN_DIAGNOSTICS]: {
    defaultChain: [AI_PROVIDERS.OPENAI, AI_PROVIDERS.ANTHROPIC, AI_PROVIDERS.RULE_BASED],
  },
};

export const getAiProviderConfigs = (overrides = {}) => ({
  [AI_PROVIDERS.OPENAI]: {
    apiKey: overrides.OPENAI_API_KEY ?? env.OPENAI_API_KEY,
    defaultModel: overrides.OPENAI_DEFAULT_MODEL ?? env.OPENAI_DEFAULT_MODEL ?? 'gpt-4.1-mini',
    baseUrl: overrides.OPENAI_BASE_URL ?? env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  },
  [AI_PROVIDERS.ANTHROPIC]: {
    apiKey: overrides.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY,
    defaultModel: overrides.ANTHROPIC_DEFAULT_MODEL ?? env.ANTHROPIC_DEFAULT_MODEL ?? 'claude-3-5-sonnet-latest',
    baseUrl: overrides.ANTHROPIC_BASE_URL ?? env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
  },
  [AI_PROVIDERS.GEMINI]: {
    apiKey: overrides.GEMINI_API_KEY ?? env.GEMINI_API_KEY,
    defaultModel: overrides.GEMINI_DEFAULT_MODEL ?? env.GEMINI_DEFAULT_MODEL ?? 'gemini-2.5-flash',
  },
  [AI_PROVIDERS.DEEPSEEK]: {
    apiKey: overrides.DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY,
    defaultModel: overrides.DEEPSEEK_DEFAULT_MODEL ?? env.DEEPSEEK_DEFAULT_MODEL,
    baseUrl: overrides.DEEPSEEK_BASE_URL ?? env.DEEPSEEK_BASE_URL,
    requiresBaseUrl: true,
  },
  [AI_PROVIDERS.KIMI]: {
    apiKey: overrides.KIMI_API_KEY ?? env.KIMI_API_KEY,
    defaultModel: overrides.KIMI_DEFAULT_MODEL ?? env.KIMI_DEFAULT_MODEL,
    baseUrl: overrides.KIMI_BASE_URL ?? env.KIMI_BASE_URL,
    requiresBaseUrl: true,
  },
  [AI_PROVIDERS.QWEN]: {
    apiKey: overrides.QWEN_API_KEY ?? env.QWEN_API_KEY,
    defaultModel: overrides.QWEN_DEFAULT_MODEL ?? env.QWEN_DEFAULT_MODEL,
    baseUrl: overrides.QWEN_BASE_URL ?? env.QWEN_BASE_URL,
    requiresBaseUrl: true,
  },
});

export const getAiRuntimeConfig = (overrides = {}) => {
  const enabled = overrides.AI_ENABLED ?? env.AI_ENABLED;
  const taskRoutes = {};

  for (const [task, route] of Object.entries(AI_TASK_ROUTES)) {
    const enabledValue = route.enabledEnv
      ? (overrides[route.enabledEnv] ?? env[route.enabledEnv])
      : enabled;
    taskRoutes[task] = {
      enabled: Boolean(enabled && enabledValue),
      providerChain: splitChain(
        route.providerChainEnv ? (overrides[route.providerChainEnv] ?? env[route.providerChainEnv]) : null,
        route.defaultChain,
      ),
      timeoutMs: numberOr(route.timeoutMsEnv ? (overrides[route.timeoutMsEnv] ?? env[route.timeoutMsEnv]) : null, 20000),
      retries: numberOr(route.retriesEnv ? (overrides[route.retriesEnv] ?? env[route.retriesEnv]) : null, 1),
      concurrency: numberOr(route.concurrencyEnv ? (overrides[route.concurrencyEnv] ?? env[route.concurrencyEnv]) : null, 2),
    };
  }

  return {
    enabled: Boolean(enabled),
    security: {
      strict: Boolean(overrides.AI_STRICT_SECURITY_MODE ?? env.AI_STRICT_SECURITY_MODE),
      storeRawPayloads: Boolean(overrides.AI_STORE_RAW_PAYLOADS ?? env.AI_STORE_RAW_PAYLOADS),
      logPrompts: Boolean(overrides.AI_LOG_PROMPTS ?? env.AI_LOG_PROMPTS),
      logResponses: Boolean(overrides.AI_LOG_RESPONSES ?? env.AI_LOG_RESPONSES),
    },
    defaultProvider: overrides.AI_DEFAULT_PROVIDER
      ?? env.AI_DEFAULT_PROVIDER
      ?? overrides.AI_DEFAULT_TASK_PROVIDER
      ?? env.AI_DEFAULT_TASK_PROVIDER
      ?? AI_PROVIDERS.GEMINI,
    defaultModel: overrides.AI_DEFAULT_MODEL
      ?? env.AI_DEFAULT_MODEL
      ?? overrides.AI_DEFAULT_TASK_MODEL
      ?? env.AI_DEFAULT_TASK_MODEL
      ?? 'gemini-2.5-flash',
    taskRoutes,
    providers: getAiProviderConfigs(overrides),
  };
};
