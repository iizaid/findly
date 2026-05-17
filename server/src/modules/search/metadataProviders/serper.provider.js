import { env } from '../../../config/env.js';
import { fetchJsonWithTimeout } from '../../../utils/httpClient.js';
import { buildProviderCacheKey, getProviderCache, setProviderCache } from '../providerCache.service.js';
import { normalizeProviderResult } from './searchMetadataProvider.interface.js';
import { isDiscoverySecretManagementConfigured } from '../discoveryProviderSecretsVault.service.js';
import { getResolvedSearchMetadataProviderConfig } from './searchMetadataProviderConfig.service.js';

const PROVIDER = 'SERPER';

export const SerperProvider = {
  key: 'serper',
  label: 'Serper.dev',

  isConfigured() {
    return Boolean(env.SERPER_API_KEY || isDiscoverySecretManagementConfigured());
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

  async search({ query, campaign, limit = 10, timeoutMs = env.SERPER_TIMEOUT_MS }) {
    const config = await getResolvedSearchMetadataProviderConfig('serper');
    if (!config.apiKey) return [];
    const location = [campaign?.city, campaign?.country].filter(Boolean).join(', ');
    const cacheKey = buildProviderCacheKey({
      source: PROVIDER,
      query,
      location,
      filters: { num: limit },
    });
    const cached = getProviderCache(cacheKey);
    if (cached) return cached;

    const data = await fetchJsonWithTimeout(config.baseUrl || env.SERPER_BASE_URL, {
      method: 'POST',
      timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: limit,
      }),
    });

    const organic = Array.isArray(data.organic) ? data.organic : [];
    const results = organic
      .map((item, index) => normalizeProviderResult({
        title: item.title,
        link: item.link,
        displayedLink: item.displayedLink || item.displayed_link,
        snippet: item.snippet,
        position: item.position ?? index + 1,
        provider: PROVIDER,
        rawMetadata: {
          position: item.position ?? index + 1,
          displayedLink: item.displayedLink || item.displayed_link || null,
        },
      }))
      .filter(Boolean);

    setProviderCache(cacheKey, results);
    return results;
  },
};
