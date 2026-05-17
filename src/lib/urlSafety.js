const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export const isSafeHttpUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

export const safeExternalUrl = (value) => {
  if (!isSafeHttpUrl(value)) return null;
  return value.trim();
};

export const safeAssetPath = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/uploads/')) return null;
  if (trimmed.includes('\\') || trimmed.includes('..')) return null;
  return trimmed;
};

export const safeAssetUrl = (value, apiBaseUrl = '') => {
  const assetPath = safeAssetPath(value);
  if (!assetPath) return null;

  if (!apiBaseUrl) return assetPath;

  try {
    const base = new URL(apiBaseUrl);
    return new URL(assetPath, base).toString();
  } catch {
    return assetPath;
  }
};
