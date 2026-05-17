import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';
import { fetchJsonWithTimeout } from '../../../utils/httpClient.js';
import { buildProviderCacheKey, getProviderCache, setProviderCache } from '../providerCache.service.js';
import { buildSerpQueriesForCampaign } from '../serpQueryBuilder.service.js';
import { normalizeSerpResult } from '../serpResultNormalizer.service.js';

const isTestRuntime = () =>
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined ||
  process.env.VITEST_POOL_ID !== undefined;

export class SerpAdapter extends BaseAdapter {
  static key = 'SERPAPI';
  static label = 'Unified Search Metadata';
  static description = 'Unified discovery method for compliant search-result metadata.';
  static requiresApiKey = true;
  static comingSoon = false;
  static estimatedUseCase = 'Target Instagram, TikTok, Facebook, Reddit, Yelp, TripAdvisor, and other platform signals through search metadata. It produces LeadEvidence first and must not scrape platforms directly.';

  static isConfigured() {
    if (isTestRuntime() && process.env.LIVE_SERP_DISCOVERY_ENABLED !== 'true') return false;
    return Boolean(env.LIVE_SERP_DISCOVERY_ENABLED && env.SERPAPI_API_KEY);
  }

  static getStatus() {
    const configured = Boolean(env.SERPAPI_API_KEY);
    const liveEnabled = Boolean(env.LIVE_SERP_DISCOVERY_ENABLED);
    return {
      key: this.key,
      label: this.label,
      description: this.description,
      status: liveEnabled && configured ? 'available' : (configured ? 'disabled' : 'not_configured'),
      configured,
      available: liveEnabled && configured,
      comingSoon: false,
      requiresApiKey: true,
      reason: liveEnabled && configured
        ? null
        : 'Unified search metadata is cache-first and only runs when LIVE_SERP_DISCOVERY_ENABLED=true and SERPAPI_API_KEY is configured.',
      estimatedUseCase: this.estimatedUseCase,
    };
  }

  static estimateCost({ maxResults = env.SOURCE_MAX_RESULTS_DEFAULT } = {}) {
    const capped = Math.min(maxResults, env.SOURCE_MAX_RESULTS_HARD_LIMIT);
    return {
      baseCost: 5,
      perResultCost: 1,
      maxResults: capped,
      estimatedCredits: 5 + capped,
      warnings: this.isConfigured()
        ? []
        : ['Unified search metadata runs only when enabled and configured; local cache is used first.'],
    };
  }

  constructor(campaign, context = {}) {
    super(campaign, context);
    this.apiKey = env.SERPAPI_API_KEY;
  }

  async run() {
    if (!env.LIVE_SERP_DISCOVERY_ENABLED) {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Unified search metadata discovery is disabled. Local cache is used first.', 400);
    }
    if (!this.apiKey) {
      throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'Unified search metadata discovery is not configured.', 400);
    }

    const targetSources = this.context.targetSources || this.campaign.sources || [];
    const missingResultCount = this.context.missingResultCount || this.campaign.requestedLimit || 20;
    const queries = buildSerpQueriesForCampaign({
      campaign: this.campaign,
      targetSources,
      missingResultCount,
    });

    const candidates = [];
    for (const query of queries) {
      const results = await this.searchQuery(query);
      for (const result of results) {
        const targetSource = this.context.targetSourceByQuery?.[query] || targetSources[0] || null;
        const normalized = normalizeSerpResult({ result, targetSource, campaign: this.campaign });
        if (normalized) candidates.push({ ...normalized, query });
      }
    }

    return candidates.slice(0, missingResultCount);
  }

  async searchQuery(query) {
    const location = [this.campaign.city, this.campaign.country].filter(Boolean).join(', ');
    const cacheKey = buildProviderCacheKey({
      source: this.constructor.key,
      query,
      location,
      filters: { engine: 'google' },
    });
    const cached = getProviderCache(cacheKey);
    if (cached) return cached;

    const url = new URL(env.SERPAPI_BASE_URL);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('num', '10');

    const data = await fetchJsonWithTimeout(url.toString(), {
      method: 'GET',
      timeoutMs: env.SERPAPI_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });

    const results = Array.isArray(data.organic_results) ? data.organic_results : [];
    setProviderCache(cacheKey, results);
    return results;
  }
}
