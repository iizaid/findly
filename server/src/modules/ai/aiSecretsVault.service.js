import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { AI_PROVIDERS, AI_TASKS } from './ai.types.js';
import { validateProviderBaseUrl } from './aiSecurity.service.js';
import { validateAiTaskJson } from './aiResponseValidator.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenAiProvider } from './providers/openaiProvider.js';
import { AnthropicProvider } from './providers/anthropicProvider.js';
import { DeepseekProvider } from './providers/deepseekProvider.js';
import { KimiProvider } from './providers/kimiProvider.js';
import { QwenProvider } from './providers/qwenProvider.js';

const ALLOWED_PROVIDERS = new Set([
  AI_PROVIDERS.GEMINI,
  AI_PROVIDERS.OPENAI,
  AI_PROVIDERS.ANTHROPIC,
  AI_PROVIDERS.DEEPSEEK,
  AI_PROVIDERS.KIMI,
  AI_PROVIDERS.QWEN,
]);

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  AI_PROVIDERS.OPENAI,
  AI_PROVIDERS.DEEPSEEK,
  AI_PROVIDERS.KIMI,
  AI_PROVIDERS.QWEN,
]);

const PROVIDER_CLASSES = {
  [AI_PROVIDERS.GEMINI]: GeminiProvider,
  [AI_PROVIDERS.OPENAI]: OpenAiProvider,
  [AI_PROVIDERS.ANTHROPIC]: AnthropicProvider,
  [AI_PROVIDERS.DEEPSEEK]: DeepseekProvider,
  [AI_PROVIDERS.KIMI]: KimiProvider,
  [AI_PROVIDERS.QWEN]: QwenProvider,
};

const MASTER_KEY_BYTES = 32;
const ENCRYPTION_VERSION = 'v1';

export const normalizeAiProviderName = (provider) => String(provider || '').trim().toLowerCase();

export const assertKnownProvider = (provider) => {
  const normalized = normalizeAiProviderName(provider);
  if (!ALLOWED_PROVIDERS.has(normalized)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Unknown AI provider.', 400);
  }
  return normalized;
};

export const isOpenAiCompatibleProvider = (provider) => OPENAI_COMPATIBLE_PROVIDERS.has(normalizeAiProviderName(provider));

const getMasterKey = () => {
  if (!env.AI_SECRETS_MASTER_KEY) return null;

  try {
    const decoded = Buffer.from(env.AI_SECRETS_MASTER_KEY, 'base64');
    if (decoded.length === MASTER_KEY_BYTES) return decoded;
  } catch {
    // Fall through to hex check.
  }

  try {
    const decoded = Buffer.from(env.AI_SECRETS_MASTER_KEY, 'hex');
    if (decoded.length === MASTER_KEY_BYTES) return decoded;
  } catch {
    return null;
  }

  return null;
};

export const isAiSecretManagementConfigured = () => Boolean(env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED && getMasterKey());

export const assertAiSecretManagementConfigured = () => {
  if (!env.AI_DASHBOARD_SECRET_MANAGEMENT_ENABLED || !getMasterKey()) {
    throw new AppError(
      errorCodes.CONFIGURATION_ERROR,
      'AI secret management is not configured on this server.',
      503,
    );
  }
};

export const encryptSecret = (plaintext) => {
  assertAiSecretManagementConfigured();
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

export const decryptSecret = (encrypted) => {
  assertAiSecretManagementConfigured();
  const [version, iv, tag, ciphertext] = String(encrypted || '').split(':');
  if (version !== ENCRYPTION_VERSION || !iv || !tag || !ciphertext) {
    throw new AppError(errorCodes.CONFIGURATION_ERROR, 'Encrypted AI secret format is invalid.', 500);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

export const createKeyFingerprint = (apiKey) => crypto
  .createHash('sha256')
  .update(String(apiKey))
  .digest('hex')
  .slice(0, 12);

const validateProviderSettings = ({ provider, apiKey, model, baseUrl }) => {
  const normalized = assertKnownProvider(provider);
  if (!apiKey || String(apiKey).trim().length < 8) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'API key is required.', 400);
  }

  if (baseUrl) {
    const validation = validateProviderBaseUrl(baseUrl, { provider: normalized });
    if (!validation.ok) {
      throw new AppError(errorCodes.VALIDATION_ERROR, validation.reason, 400);
    }
  }

  if (isOpenAiCompatibleProvider(normalized) && normalized !== AI_PROVIDERS.OPENAI && !baseUrl) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Base URL is required for this provider.', 400);
  }

  return {
    provider: normalized,
    apiKey: String(apiKey).trim(),
    model: model ? String(model).trim() : null,
    baseUrl: baseUrl ? String(baseUrl).trim() : null,
  };
};

const safeSecretStatus = (secret) => ({
  provider: secret.provider,
  configured: secret.status === 'ACTIVE',
  source: 'dashboard',
  fingerprint: secret.keyFingerprint,
  model: secret.model,
  baseUrlConfigured: Boolean(secret.baseUrl),
  status: secret.status,
  lastTestedAt: secret.lastTestedAt,
  lastStatus: secret.lastStatus,
  lastErrorType: secret.lastErrorType,
  updatedAt: secret.updatedAt,
});

export const getProviderSecret = async (provider) => {
  assertAiSecretManagementConfigured();
  const normalized = assertKnownProvider(provider);
  const secret = await prisma.aiProviderSecret.findUnique({ where: { provider: normalized } });
  if (!secret || secret.status !== 'ACTIVE') return null;

  return {
    provider: normalized,
    apiKey: decryptSecret(secret.encryptedKey),
    model: secret.model,
    baseUrl: secret.baseUrl,
    fingerprint: secret.keyFingerprint,
    source: 'dashboard',
  };
};

export const upsertProviderSecret = async ({ provider, apiKey, model = null, baseUrl = null, actorId }) => {
  assertAiSecretManagementConfigured();
  const validated = validateProviderSettings({ provider, apiKey, model, baseUrl });
  const encryptedKey = encryptSecret(validated.apiKey);
  const keyFingerprint = createKeyFingerprint(validated.apiKey);

  const secret = await prisma.aiProviderSecret.upsert({
    where: { provider: validated.provider },
    update: {
      encryptedKey,
      keyFingerprint,
      model: validated.model,
      baseUrl: validated.baseUrl,
      status: 'ACTIVE',
      updatedById: actorId || null,
      lastStatus: null,
      lastErrorType: null,
    },
    create: {
      provider: validated.provider,
      encryptedKey,
      keyFingerprint,
      model: validated.model,
      baseUrl: validated.baseUrl,
      status: 'ACTIVE',
      createdById: actorId || null,
      updatedById: actorId || null,
    },
  });

  return safeSecretStatus(secret);
};

export const deleteProviderSecret = async ({ provider, actorId }) => {
  assertAiSecretManagementConfigured();
  const normalized = assertKnownProvider(provider);
  const existing = await prisma.aiProviderSecret.findUnique({ where: { provider: normalized } });
  if (!existing) return null;

  const updated = await prisma.aiProviderSecret.update({
    where: { provider: normalized },
    data: {
      status: 'DELETED',
      updatedById: actorId || null,
    },
  });
  return safeSecretStatus(updated);
};

export const listProviderSecretStatuses = async () => {
  if (!isAiSecretManagementConfigured()) return [];
  const secrets = await prisma.aiProviderSecret.findMany({
    orderBy: { provider: 'asc' },
  });
  return secrets.map(safeSecretStatus);
};

export const getDashboardProviderConfigOverrides = async () => {
  if (!isAiSecretManagementConfigured()) return {};
  const secrets = await prisma.aiProviderSecret.findMany({ where: { status: 'ACTIVE' } });
  const overrides = {};

  for (const secret of secrets) {
    const keyPrefix = secret.provider.toUpperCase();
    overrides[`${keyPrefix}_API_KEY`] = decryptSecret(secret.encryptedKey);
    if (secret.model) overrides[`${keyPrefix}_DEFAULT_MODEL`] = secret.model;
    if (secret.baseUrl) overrides[`${keyPrefix}_BASE_URL`] = secret.baseUrl;
  }

  return overrides;
};

export const testProviderSecret = async ({ provider, actorId }) => {
  assertAiSecretManagementConfigured();
  const normalized = assertKnownProvider(provider);
  const secret = await getProviderSecret(normalized);
  if (!secret) {
    throw new AppError(errorCodes.NOT_FOUND, 'Dashboard-managed provider secret was not found.', 404);
  }

  const Provider = PROVIDER_CLASSES[normalized];
  const providerInstance = new Provider({
    apiKey: secret.apiKey,
    defaultModel: secret.model || undefined,
    baseUrl: secret.baseUrl || undefined,
  });

  const result = await providerInstance.generateJson({
    task: AI_TASKS.LEAD_ANALYSIS,
    systemPrompt: 'Return JSON only. This is a provider smoke test using synthetic data.',
    userPrompt: JSON.stringify({
      businessName: 'Synthetic Provider Test',
      category: 'Business',
      city: 'Test City',
      instruction: 'Return a valid lead analysis JSON object only.',
    }),
    timeoutMs: env.AI_ANALYSIS_TIMEOUT_MS,
  });
  const validation = result.ok
    ? validateAiTaskJson({ task: AI_TASKS.LEAD_ANALYSIS, json: result.json, rawText: result.rawText })
    : null;

  const safeResult = {
    ok: Boolean(result.ok && validation?.ok),
    provider: normalized,
    model: result.model || secret.model || null,
    latencyMs: result.latencyMs || null,
    validation: result.ok && validation?.ok ? 'valid' : 'not_validated',
    errorType: result.ok && !validation?.ok ? validation?.errorType : result.errorType || null,
    safeMessage: result.ok && validation?.ok
      ? null
      : validation?.safeMessage || result.safeMessage || 'Provider test failed safely.',
  };

  await prisma.aiProviderSecret.update({
    where: { provider: normalized },
    data: {
      lastTestedAt: new Date(),
      lastStatus: safeResult.ok ? 'ok' : 'failed',
      lastErrorType: safeResult.errorType || null,
      updatedById: actorId || null,
    },
  });

  return safeResult;
};
