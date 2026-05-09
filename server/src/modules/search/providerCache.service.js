import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const cache = new Map();

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

export const buildProviderCacheKey = ({ source, query, location, filters }) => {
  const normalized = {
    source: String(source || '').toUpperCase(),
    query: String(query || '').trim().toLowerCase(),
    location: String(location || '').trim().toLowerCase(),
    filters: filters || {},
  };

  return crypto
    .createHash('sha256')
    .update(stableStringify(normalized))
    .digest('hex');
};

export const getProviderCache = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
};

export const setProviderCache = (key, value, ttlSeconds = env.CACHE_TTL_SECONDS) => {
  if (!ttlSeconds || ttlSeconds <= 0) return;

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

export const clearProviderCache = () => cache.clear();
