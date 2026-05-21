import { gunzipSync } from 'node:zlib';
import { env } from '../../../config/env.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';
import { normalizeWebsiteUrl } from '../websiteMetadata.service.js';

const INDEX_CACHE_TTL_MS = 15 * 60 * 1000;

let latestIndexCache = {
  value: null,
  expiresAt: 0,
};

const withTimeout = async (url, options = {}, timeoutMs = env.COMMON_CRAWL_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': env.OPEN_WEB_EVIDENCE_USER_AGENT,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence request timed out.', 504);
    }
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence request failed safely.', 502);
  } finally {
    clearTimeout(timer);
  }
};

const parseNdjsonRecords = async (response) => {
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const isHtmlRecord = (record) => {
  const status = String(record.status || '');
  const mime = String(record.mime || record['mime-detected'] || '').toLowerCase();
  return status === '200' && mime.includes('html');
};

const sameHostname = (urlString, hostname) => {
  try {
    const parsed = new URL(urlString);
    const clean = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return clean === hostname || clean.endsWith(`.${hostname}`);
  } catch {
    return false;
  }
};

const normalizedPatternsForUrl = (websiteUrl) => {
  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);
  const parsed = new URL(normalizedUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const exact = normalizedUrl;
  const withoutTrailingSlash = exact.endsWith('/') ? exact.slice(0, -1) : exact;
  return {
    normalizedUrl,
    hostname,
    patterns: [...new Set([exact, withoutTrailingSlash, `${hostname}/*`])],
  };
};

const sortRecords = (records, normalizedUrl) => records
  .sort((a, b) => {
    const aExact = a.url === normalizedUrl || a.url === normalizedUrl.replace(/\/$/, '');
    const bExact = b.url === normalizedUrl || b.url === normalizedUrl.replace(/\/$/, '');
    if (aExact !== bExact) return aExact ? -1 : 1;
    const aTime = String(a.timestamp || '');
    const bTime = String(b.timestamp || '');
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    return Number(a.length || 0) - Number(b.length || 0);
  });

const parseCaptureTimestamp = (timestamp) => {
  const value = String(timestamp || '');
  if (!/^\d{14}$/.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildRangeUrl = (filename) => `${env.COMMON_CRAWL_DATA_BASE_URL.replace(/\/$/, '')}/${String(filename || '').replace(/^\/+/, '')}`;

const extractHttpBodyFromWarcMember = (buffer) => {
  const text = gunzipSync(buffer).toString('utf8');
  const firstBreak = text.indexOf('\r\n\r\n') >= 0 ? text.indexOf('\r\n\r\n') : text.indexOf('\n\n');
  if (firstBreak < 0) return null;
  const httpChunk = text.slice(firstBreak + (text.includes('\r\n\r\n') ? 4 : 2));
  const secondBreak = httpChunk.indexOf('\r\n\r\n') >= 0 ? httpChunk.indexOf('\r\n\r\n') : httpChunk.indexOf('\n\n');
  if (secondBreak < 0) return null;
  const httpHeaders = httpChunk.slice(0, secondBreak);
  if (!/^HTTP\/\d/i.test(httpHeaders)) return null;
  return httpChunk.slice(secondBreak + (httpChunk.includes('\r\n\r\n') ? 4 : 2));
};

export const clearCommonCrawlIndexCache = () => {
  latestIndexCache = { value: null, expiresAt: 0 };
};

export const resolveLatestCommonCrawlIndexId = async () => {
  if (env.COMMON_CRAWL_INDEX_ID !== 'latest') return env.COMMON_CRAWL_INDEX_ID;
  if (latestIndexCache.value && latestIndexCache.expiresAt > Date.now()) return latestIndexCache.value;

  const response = await withTimeout(`${env.COMMON_CRAWL_INDEX_BASE_URL.replace(/\/$/, '')}/collinfo.json`, {}, env.COMMON_CRAWL_TIMEOUT_MS);
  if (!response.ok) {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence index is unavailable.', 503);
  }
  const collections = await response.json();
  if (!Array.isArray(collections) || collections.length === 0) {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence index returned no collections.', 503);
  }

  const latest = collections
    .map((item) => item?.id)
    .filter((item) => typeof item === 'string' && item.startsWith('CC-MAIN-'))
    .sort((a, b) => b.localeCompare(a))[0];

  if (!latest) {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence index did not expose a latest crawl.', 503);
  }

  latestIndexCache = {
    value: latest,
    expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
  };
  return latest;
};

export const queryCommonCrawlIndex = async ({ websiteUrl }) => {
  const { normalizedUrl, hostname, patterns } = normalizedPatternsForUrl(websiteUrl);
  const indexId = await resolveLatestCommonCrawlIndexId();
  const baseUrl = env.COMMON_CRAWL_INDEX_BASE_URL.replace(/\/$/, '');
  const dedupe = new Map();

  for (const pattern of patterns) {
    const requestUrl = `${baseUrl}/${indexId}-index?url=${encodeURIComponent(pattern)}&output=json&limit=${env.COMMON_CRAWL_MAX_INDEX_RESULTS}`;
    const response = await withTimeout(requestUrl, {}, env.COMMON_CRAWL_TIMEOUT_MS);
    if (!response.ok) {
      if (response.status === 503) {
        throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence index is temporarily rate-limited.', 503);
      }
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence index query failed safely.', 502);
    }
    const records = await parseNdjsonRecords(response);
    for (const record of records) {
      const key = `${record.filename || 'file'}:${record.offset || '0'}:${record.length || '0'}`;
      if (dedupe.has(key)) continue;
      if (!isHtmlRecord(record)) continue;
      if (!sameHostname(record.url, hostname)) continue;
      dedupe.set(key, record);
      if (dedupe.size >= env.OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN) break;
    }
    if (dedupe.size >= env.OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN) break;
  }

  const records = sortRecords([...dedupe.values()], normalizedUrl).slice(0, env.OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN);
  return {
    indexId,
    normalizedUrl,
    normalizedDomain: hostname,
    records: records.map((record) => ({
      ...record,
      captureTimestamp: parseCaptureTimestamp(record.timestamp),
    })),
  };
};

export const fetchArchivedHtmlFromRecord = async ({ record }) => {
  if (!env.COMMON_CRAWL_FETCH_WARC_ENABLED) return null;
  const offset = Number(record?.offset);
  const length = Number(record?.length);
  if (!record?.filename || !Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) return null;
  if (length > env.COMMON_CRAWL_MAX_WARC_BYTES) return null;

  const response = await withTimeout(buildRangeUrl(record.filename), {
    headers: {
      Range: `bytes=${offset}-${offset + length - 1}`,
      Accept: 'application/octet-stream',
    },
  }, env.COMMON_CRAWL_TIMEOUT_MS);

  if (!response.ok && response.status !== 206) {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Open web evidence archive fetch failed safely.', 502);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > env.COMMON_CRAWL_MAX_WARC_BYTES) return null;
  return extractHttpBodyFromWarcMember(buffer);
};
