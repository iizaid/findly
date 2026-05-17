import { env } from '../../../config/env.js';
import { fetchJsonWithTimeout } from '../../../utils/httpClient.js';
import { buildProviderCacheKey, getProviderCache, setProviderCache } from '../providerCache.service.js';
import { normalizeProviderResult } from './searchMetadataProvider.interface.js';

const PROVIDER = 'SERPAPI';

export const SerpApiProvider = {
  key: 'serpapi',
  label: 'SerpAPI',

  isConfigured() {
    return Boolean(env.SERPAPI_API_KEY);
  },

  getStatus() {
    const configured = this.isConfigured();
    return {
      provider: this.key,
      label: this.label,
      configured,
      status: configured ? 'configured' : 'missing_key',
      requiresApiKey: true,
    };
  },

  async search({ query, campaign, limit = 10, timeoutMs = env.SERPAPI_TIMEOUT_MS }) {
    const location = [campaign?.city, campaign?.country].filter(Boolean).join(', ');
    const cacheKey = buildProviderCacheKey({
      source: PROVIDER,
      query,
      location,
      filters: { engine: 'google', num: limit },
    });
    const cached = getProviderCache(cacheKey);
    if (cached) return cached;

    const url = new URL(env.SERPAPI_BASE_URL);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', env.SERPAPI_API_KEY);
    url.searchParams.set('num', String(limit));

    const data = await fetchJsonWithTimeout(url.toString(), {
      method: 'GET',
      timeoutMs,
      headers: { Accept: 'application/json' },
    });

    const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
    const results = organic
      .map((item, index) => normalizeProviderResult({
        title: item.title,
        link: item.link,
        displayedLink: item.displayed_link || item.displayedLink,
        snippet: item.snippet,
        position: item.position ?? index + 1,
        provider: PROVIDER,
        rawMetadata: {
          position: item.position ?? index + 1,
          displayedLink: item.displayed_link || item.displayedLink || null,
          source: item.source || null,
        },
      }))
      .filter(Boolean);

    setProviderCache(cacheKey, results);
    return results;
  },
};
