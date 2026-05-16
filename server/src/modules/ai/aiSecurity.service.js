import net from 'node:net';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwordhash/i,
  /token/i,
  /tokenhash/i,
  /session/i,
  /cookie/i,
  /authorization/i,
  /csrf/i,
  /api[_-]?key/i,
  /secret/i,
  /smtp/i,
  /database[_-]?url/i,
  /db[_-]?url/i,
  /headers/i,
  /rawrequest/i,
  /rawresponse/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /^bearer$/i,
  /^x-api-key$/i,
];

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const isPrivateIp = (hostname) => {
  if (net.isIP(hostname) === 4) {
    const [a, b] = hostname.split('.').map(Number);
    return a === 10
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || a === 0;
  }
  if (net.isIP(hostname) === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe80');
  }
  return false;
};

export const isSensitiveKey = (key) => SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(String(key)));

export const redactSensitive = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    isSensitiveKey(key) ? '[REDACTED]' : redactSensitive(item, seen),
  ]));
};

export const truncateText = (value, maxLength = 1200) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...[truncated]`;
};

export const truncatePayload = (value, { maxStringLength = 1200, maxArrayLength = 12 } = {}, seen = new WeakSet()) => {
  if (typeof value === 'string') return truncateText(value, maxStringLength);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLength).map((item) => truncatePayload(item, { maxStringLength, maxArrayLength }, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, truncatePayload(item, { maxStringLength, maxArrayLength }, seen)]),
  );
};

export const validateProviderBaseUrl = (baseUrl, {
  provider,
  isProduction = process.env.NODE_ENV === 'production',
  allowPrivate = false,
  requireHttpsInProduction = true,
} = {}) => {
  if (!baseUrl) {
    return { ok: false, reason: `${provider || 'provider'} base URL is missing.` };
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { ok: false, reason: `${provider || 'provider'} base URL is invalid.` };
  }

  if (isProduction && requireHttpsInProduction && parsed.protocol !== 'https:') {
    return { ok: false, reason: `${provider || 'provider'} base URL must use HTTPS in production.` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isProduction && !allowPrivate && (PRIVATE_HOSTS.has(hostname) || isPrivateIp(hostname))) {
    return { ok: false, reason: `${provider || 'provider'} base URL cannot target local or private hosts in production.` };
  }

  return { ok: true, url: parsed.toString().replace(/\/+$/, '') };
};

