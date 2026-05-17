import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { fetchJsonWithTimeout } from '../../utils/httpClient.js';

export const DISCOVERY_PROVIDERS = Object.freeze({
  SERPER: 'serper',
  SERPAPI: 'serpapi',
  GOOGLE_PLACES: 'google_places',
  DATAFORSEO: 'dataforseo',
  BRAVE: 'brave',
  SEARCHAPI: 'searchapi',
});

const PROVIDER_DEFAULTS = Object.freeze({
  [DISCOVERY_PROVIDERS.SERPER]: {
    role: 'SEARCH_METADATA',
    baseUrl: 'https://google.serper.dev/search',
    allowBaseUrls: ['https://google.serper.dev/search'],
    primary: true,
    fallback: false,
    priority: 10,
  },
  [DISCOVERY_PROVIDERS.SERPAPI]: {
    role: 'SEARCH_METADATA',
    baseUrl: 'https://serpapi.com/search.json',
    allowBaseUrls: ['https://serpapi.com/search.json'],
    primary: false,
    fallback: true,
    priority: 20,
  },
  [DISCOVERY_PROVIDERS.GOOGLE_PLACES]: {
    role: 'LOCAL_BUSINESS',
    baseUrl: 'https://places.googleapis.com/v1/places:searchText',
    allowBaseUrls: ['https://places.googleapis.com/v1/places:searchText'],
    primary: false,
    fallback: false,
    priority: 30,
  },
  [DISCOVERY_PROVIDERS.DATAFORSEO]: {
    role: 'SEARCH_METADATA',
    baseUrl: null,
    allowBaseUrls: [],
    primary: false,
    fallback: false,
    priority: 100,
  },
  [DISCOVERY_PROVIDERS.BRAVE]: {
    role: 'SEARCH_METADATA',
    baseUrl: null,
    allowBaseUrls: [],
    primary: false,
    fallback: false,
    priority: 100,
  },
  [DISCOVERY_PROVIDERS.SEARCHAPI]: {
    role: 'SEARCH_METADATA',
    baseUrl: null,
    allowBaseUrls: [],
    primary: false,
    fallback: false,
    priority: 100,
  },
});

const MASTER_KEY_BYTES = 32;
const ENCRYPTION_VERSION = 'v1';

export const normalizeDiscoveryProviderName = (provider) => String(provider || '').trim().toLowerCase();

export const assertKnownDiscoveryProvider = (provider) => {
  const normalized = normalizeDiscoveryProviderName(provider);
  if (!Object.values(DISCOVERY_PROVIDERS).includes(normalized)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Unknown discovery provider.', 400);
  }
  return normalized;
};

const decodeMasterKey = (value) => {
  if (!value) return null;
  for (const encoding of ['base64', 'hex']) {
    try {
      const decoded = Buffer.from(value, encoding);
      if (decoded.length === MASTER_KEY_BYTES) return decoded;
    } catch {
      // Try next encoding.
    }
  }
  return null;
};

const getMasterKey = () => decodeMasterKey(env.DISCOVERY_SECRETS_MASTER_KEY || env.AI_SECRETS_MASTER_KEY);

export const isDiscoverySecretManagementConfigured = () =>
  Boolean(env.DISCOVERY_DASHBOARD_SECRET_MANAGEMENT_ENABLED && getMasterKey());

export const assertDiscoverySecretManagementConfigured = () => {
  if (!isDiscoverySecretManagementConfigured()) {
    throw new AppError(
      errorCodes.CONFIGURATION_ERROR,
      'Discovery provider secret management is not configured on this server.',
      503,
    );
  }
};

export const encryptDiscoverySecret = (plaintext) => {
  assertDiscoverySecretManagementConfigured();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
};

export const decryptDiscoverySecret = (encrypted) => {
  assertDiscoverySecretManagementConfigured();
  const [version, iv, tag, ciphertext] = String(encrypted || '').split(':');
  if (version !== ENCRYPTION_VERSION || !iv || !tag || !ciphertext) {
    throw new AppError(errorCodes.CONFIGURATION_ERROR, 'Encrypted discovery secret format is invalid.', 500);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

export const createDiscoveryKeyFingerprint = (apiKey) => crypto
  .createHash('sha256')
  .update(String(apiKey))
  .digest('hex')
  .slice(0, 12);

const normalizeBaseUrl = (baseUrl, provider) => {
  const defaults = PROVIDER_DEFAULTS[provider];
  if (!baseUrl) return null;
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Base URL must be valid.', 400);
  }
  if (parsed.protocol !== 'https:') {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Discovery provider base URL must use HTTPS.', 400);
  }
  const normalized = parsed.href.replace(/\/$/, '');
  const allowed = defaults.allowBaseUrls.map((value) => value.replace(/\/$/, ''));
  if (!allowed.includes(normalized)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Discovery provider base URL is not allowlisted.', 400);
  }
  return parsed.href;
};

const validateSecretInput = ({ provider, apiKey, baseUrl, role, priority, isPrimaryCandidate, isFallbackCandidate }) => {
  const normalizedProvider = assertKnownDiscoveryProvider(provider);
  const defaults = PROVIDER_DEFAULTS[normalizedProvider];
  const normalizedKey = String(apiKey || '').trim();
  if (normalizedKey.length < 8) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'API key is required.', 400);
  }
  return {
    provider: normalizedProvider,
    apiKey: normalizedKey,
    baseUrl: normalizeBaseUrl(baseUrl, normalizedProvider),
    role: role || defaults.role,
    priority: Number.isInteger(Number(priority)) ? Number(priority) : defaults.priority,
    isPrimaryCandidate: typeof isPrimaryCandidate === 'boolean' ? isPrimaryCandidate : defaults.primary,
    isFallbackCandidate: typeof isFallbackCandidate === 'boolean' ? isFallbackCandidate : defaults.fallback,
  };
};

const safeSecretStatus = (secret) => ({
  provider: secret.provider,
  configured: secret.status === 'ACTIVE',
  source: 'dashboard',
  fingerprint: secret.keyFingerprint,
  baseUrlConfigured: Boolean(secret.baseUrl),
  role: secret.role,
  priority: secret.priority,
  isPrimaryCandidate: secret.isPrimaryCandidate,
  isFallbackCandidate: secret.isFallbackCandidate,
  status: secret.status,
  lastTestedAt: secret.lastTestedAt,
  lastStatus: secret.lastStatus,
  lastErrorType: secret.lastErrorType,
  updatedAt: secret.updatedAt,
});

export const listDiscoveryProviderSecretStatuses = async () => {
  if (!isDiscoverySecretManagementConfigured()) return [];
  const secrets = await prisma.discoveryProviderSecret.findMany({ orderBy: [{ priority: 'asc' }, { provider: 'asc' }] });
  return secrets.map(safeSecretStatus);
};

export const getDiscoveryProviderSecret = async (provider) => {
  if (!isDiscoverySecretManagementConfigured()) return null;
  const normalized = assertKnownDiscoveryProvider(provider);
  const secret = await prisma.discoveryProviderSecret.findUnique({ where: { provider: normalized } });
  if (!secret || secret.status !== 'ACTIVE') return null;

  return {
    provider: normalized,
    apiKey: decryptDiscoverySecret(secret.encryptedKey),
    baseUrl: secret.baseUrl,
    fingerprint: secret.keyFingerprint,
    role: secret.role,
    priority: secret.priority,
    isPrimaryCandidate: secret.isPrimaryCandidate,
    isFallbackCandidate: secret.isFallbackCandidate,
    source: 'dashboard',
  };
};

export const getDashboardDiscoveryProviderConfigOverrides = async () => {
  if (!isDiscoverySecretManagementConfigured()) return {};
  const secrets = await prisma.discoveryProviderSecret.findMany({ where: { status: 'ACTIVE' } });
  const overrides = {};
  for (const secret of secrets) {
    const key = secret.provider.toUpperCase();
    overrides[`${key}_API_KEY`] = decryptDiscoverySecret(secret.encryptedKey);
    if (secret.baseUrl) overrides[`${key}_BASE_URL`] = secret.baseUrl;
  }
  return overrides;
};

export const upsertDiscoveryProviderSecret = async ({
  provider,
  apiKey,
  baseUrl = null,
  role,
  priority,
  isPrimaryCandidate,
  isFallbackCandidate,
  actorId,
}) => {
  assertDiscoverySecretManagementConfigured();
  const validated = validateSecretInput({ provider, apiKey, baseUrl, role, priority, isPrimaryCandidate, isFallbackCandidate });
  const secret = await prisma.discoveryProviderSecret.upsert({
    where: { provider: validated.provider },
    update: {
      encryptedKey: encryptDiscoverySecret(validated.apiKey),
      keyFingerprint: createDiscoveryKeyFingerprint(validated.apiKey),
      baseUrl: validated.baseUrl,
      role: validated.role,
      priority: validated.priority,
      isPrimaryCandidate: validated.isPrimaryCandidate,
      isFallbackCandidate: validated.isFallbackCandidate,
      status: 'ACTIVE',
      updatedById: actorId || null,
      lastStatus: null,
      lastErrorType: null,
    },
    create: {
      provider: validated.provider,
      encryptedKey: encryptDiscoverySecret(validated.apiKey),
      keyFingerprint: createDiscoveryKeyFingerprint(validated.apiKey),
      baseUrl: validated.baseUrl,
      role: validated.role,
      priority: validated.priority,
      isPrimaryCandidate: validated.isPrimaryCandidate,
      isFallbackCandidate: validated.isFallbackCandidate,
      status: 'ACTIVE',
      createdById: actorId || null,
      updatedById: actorId || null,
    },
  });
  return safeSecretStatus(secret);
};

export const deleteDiscoveryProviderSecret = async ({ provider, actorId }) => {
  assertDiscoverySecretManagementConfigured();
  const normalized = assertKnownDiscoveryProvider(provider);
  const existing = await prisma.discoveryProviderSecret.findUnique({ where: { provider: normalized } });
  if (!existing) return null;
  const updated = await prisma.discoveryProviderSecret.update({
    where: { provider: normalized },
    data: {
      status: 'DELETED',
      updatedById: actorId || null,
    },
  });
  return safeSecretStatus(updated);
};

export const updateDiscoveryProviderTestStatus = async ({ provider, ok, errorType = null, actorId }) => {
  if (!isDiscoverySecretManagementConfigured()) return;
  await prisma.discoveryProviderSecret.update({
    where: { provider },
    data: {
      lastTestedAt: new Date(),
      lastStatus: ok ? 'ok' : 'failed',
      lastErrorType: errorType,
      updatedById: actorId || null,
    },
  }).catch(() => {});
};

export const testDiscoveryProviderSecret = async ({ provider, actorId }) => {
  assertDiscoverySecretManagementConfigured();
  const normalized = assertKnownDiscoveryProvider(provider);
  const secret = await getDiscoveryProviderSecret(normalized);
  if (!secret) {
    throw new AppError(errorCodes.NOT_FOUND, 'Dashboard-managed discovery provider secret was not found.', 404);
  }

  const startedAt = Date.now();
  let ok = false;
  let errorType = null;

  try {
    if (normalized === DISCOVERY_PROVIDERS.SERPER) {
      await fetchJsonWithTimeout(secret.baseUrl || PROVIDER_DEFAULTS[normalized].baseUrl, {
        method: 'POST',
        timeoutMs: env.SERPER_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': secret.apiKey,
        },
        body: JSON.stringify({ q: 'Findly provider smoke test', num: 1 }),
      });
    } else if (normalized === DISCOVERY_PROVIDERS.SERPAPI) {
      const url = new URL(secret.baseUrl || PROVIDER_DEFAULTS[normalized].baseUrl);
      url.searchParams.set('engine', 'google');
      url.searchParams.set('q', 'Findly provider smoke test');
      url.searchParams.set('num', '1');
      url.searchParams.set('api_key', secret.apiKey);
      await fetchJsonWithTimeout(url.toString(), {
        method: 'GET',
        timeoutMs: env.SERPAPI_TIMEOUT_MS,
        headers: { Accept: 'application/json' },
      });
    } else if (normalized === DISCOVERY_PROVIDERS.GOOGLE_PLACES) {
      await fetchJsonWithTimeout(PROVIDER_DEFAULTS[normalized].baseUrl, {
        method: 'POST',
        timeoutMs: env.SOURCE_REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': secret.apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName',
        },
        body: JSON.stringify({ textQuery: 'coffee shop in Amman', maxResultCount: 1 }),
      });
    } else {
      throw new AppError(errorCodes.PROVIDER_NOT_CONFIGURED, 'Provider test is not implemented for this provider yet.', 400);
    }
    ok = true;
  } catch (error) {
    errorType = error.code || errorCodes.PROVIDER_UNAVAILABLE;
  }

  await updateDiscoveryProviderTestStatus({ provider: normalized, ok, errorType, actorId });

  return {
    ok,
    provider: normalized,
    latencyMs: Date.now() - startedAt,
    validation: ok ? 'reachable' : 'not_validated',
    errorType,
    safeMessage: ok ? null : 'Discovery provider test failed safely.',
  };
};

export const getDiscoveryProviderDefaults = () => PROVIDER_DEFAULTS;
