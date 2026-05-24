import { getAiRuntimeConfig } from './ai.config.js';
import { AI_ERROR_TYPES, AI_PROVIDER_NAMES, AI_PROVIDERS, AI_TASKS } from './ai.types.js';
import { validateAiTaskJson } from './aiResponseValidator.js';
import { OpenAiProvider } from './providers/openaiProvider.js';
import { AnthropicProvider } from './providers/anthropicProvider.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { DeepseekProvider } from './providers/deepseekProvider.js';
import { KimiProvider } from './providers/kimiProvider.js';
import { QwenProvider } from './providers/qwenProvider.js';
import { getDashboardProviderConfigOverrides, isAiSecretManagementConfigured } from './aiSecretsVault.service.js';

const providerClasses = {
  [AI_PROVIDERS.OPENAI]: OpenAiProvider,
  [AI_PROVIDERS.ANTHROPIC]: AnthropicProvider,
  [AI_PROVIDERS.GEMINI]: GeminiProvider,
  [AI_PROVIDERS.DEEPSEEK]: DeepseekProvider,
  [AI_PROVIDERS.KIMI]: KimiProvider,
  [AI_PROVIDERS.QWEN]: QwenProvider,
};

let testProviderOverrides = null;
const circuitState = new Map();
const taskLimiters = new Map();

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_COOLDOWN_MS = 60_000;

export const setAiProviderOverridesForTests = (providers = null) => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('AI provider overrides are only allowed in test.');
  }
  testProviderOverrides = providers;
};

const normalizeProviders = (providers, config) => {
  const effectiveProviders = providers ?? testProviderOverrides;
  if (effectiveProviders) providers = effectiveProviders;
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

const getCircuit = (providerName) => circuitState.get(providerName) || {
  failures: 0,
  windowStartedAt: 0,
  degradedUntil: 0,
  lastErrorType: null,
};

const isCircuitOpen = (providerName) => {
  const state = getCircuit(providerName);
  return state.degradedUntil && state.degradedUntil > Date.now();
};

const recordProviderResult = (providerName, result) => {
  const now = Date.now();
  if (result.ok) {
    circuitState.delete(providerName);
    return;
  }

  if (!result.retryable) return;

  const current = getCircuit(providerName);
  const withinWindow = current.windowStartedAt && now - current.windowStartedAt <= CIRCUIT_WINDOW_MS;
  const failures = withinWindow ? current.failures + 1 : 1;
  const next = {
    failures,
    windowStartedAt: withinWindow ? current.windowStartedAt : now,
    degradedUntil: failures >= CIRCUIT_FAILURE_THRESHOLD ? now + CIRCUIT_COOLDOWN_MS : 0,
    lastErrorType: result.errorType || current.lastErrorType,
  };
  circuitState.set(providerName, next);
};

const createLimiter = (limit) => {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= limit || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

const withTaskLimit = (task, concurrency, fn) => {
  const key = `${task}:${concurrency}`;
  if (!taskLimiters.has(key)) taskLimiters.set(key, createLimiter(Math.max(1, Number(concurrency) || 1)));
  return taskLimiters.get(key)(fn);
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
  const testSafeOverrides = process.env.NODE_ENV === 'test' && !testProviderOverrides && !providers
    ? {
      AI_ENABLED: false,
      AI_ANALYSIS_ENABLED: false,
    }
    : {};
  const dashboardOverrides = isAiSecretManagementConfigured()
    ? await getDashboardProviderConfigOverrides()
    : {};
  const config = getAiRuntimeConfig({ ...testSafeOverrides, ...configOverrides, ...dashboardOverrides });
  const route = config.taskRoutes[task];
  const attempts = [];

  if (!config.enabled || !route?.enabled) {
    return fallbackResult({ task, attempts, reason: 'AI is disabled; use rule-based analysis.' });
  }

  const chain = (providerChain?.length ? providerChain : route.providerChain).map((item) => item.toLowerCase());
  const providerMap = normalizeProviders(providers, config);
  const maxRetries = Number.isInteger(retries) ? retries : route.retries;
  const requestTimeoutMs = timeoutMs || route.timeoutMs;

  const runProviderChain = async () => {
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

      const status = provider.getStatus?.() || {};
      if (status.status === 'not_implemented' || status.status === 'misconfigured') {
        attempts.push({
          provider: providerName,
          model: status.model,
          ok: false,
          errorType: status.status === 'misconfigured' ? AI_ERROR_TYPES.MISCONFIGURED : AI_ERROR_TYPES.PROVIDER_ERROR,
          safeMessage: status.safeMessage || `${providerName} provider is ${status.status}.`,
          retryable: false,
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

      if (isCircuitOpen(providerName)) {
        const state = getCircuit(providerName);
        attempts.push({
          provider: providerName,
          model: status.model,
          ok: false,
          errorType: state.lastErrorType || AI_ERROR_TYPES.PROVIDER_ERROR,
          safeMessage: `${providerName} is temporarily degraded.`,
          retryable: true,
          degraded: true,
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
        recordProviderResult(providerName, result);

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

  return withTaskLimit(task, route.concurrency, runProviderChain);
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
    security: config.security,
    providers: AI_PROVIDER_NAMES.map((name) => {
      const status = providerMap.get(name)?.getStatus() || {
        provider: name,
        configured: false,
        status: 'missing_key',
        model: null,
      };
      const circuit = getCircuit(name);
      if (circuit.degradedUntil && circuit.degradedUntil > Date.now()) {
        return {
          ...status,
          status: 'degraded',
          degradedUntil: new Date(circuit.degradedUntil).toISOString(),
          lastErrorType: circuit.lastErrorType,
        };
      }
      return status;
    }),
  };
};
