import { env } from '../../../config/env.js';
import { BaseAdapter } from './BaseAdapter.js';
import { AppError, errorCodes } from '../../../utils/AppError.js';
import { buildSerpQueriesForCampaign } from '../serpQueryBuilder.service.js';
import { normalizeSerpResult } from '../serpResultNormalizer.service.js';
import {
  getSearchMetadataProviderStatus,
  searchWithMetadataProviders,
} from '../metadataProviders/searchMetadataProviderRegistry.js';

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
    if (isTestRuntime()
      && process.env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED !== 'true'
      && process.env.LIVE_SERP_DISCOVERY_ENABLED !== 'true') return false;
    return getSearchMetadataProviderStatus().runnable;
  }

  static getStatus() {
    const status = getSearchMetadataProviderStatus();
    return {
      key: this.key,
      label: this.label,
      description: this.description,
      status: status.status,
      configured: status.availableProviders.length > 0,
      available: status.runnable,
      comingSoon: false,
      requiresApiKey: true,
      reason: status.runnable
        ? null
        : 'Unified search metadata is cache-first and only runs when enabled and at least one provider key is configured.',
      estimatedUseCase: this.estimatedUseCase,
      primaryProvider: status.primaryProvider,
      fallbackProvider: status.fallbackProvider,
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
    this.metadata = null;
  }

  async run() {
    if (!env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED && !env.LIVE_SERP_DISCOVERY_ENABLED) {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Unified search metadata discovery is disabled. Local cache is used first.', 400);
    }
    if (!this.constructor.isConfigured()) {
      throw new AppError(errorCodes.SOURCE_NOT_CONFIGURED, 'Unified search metadata discovery is not configured.', 400);
    }

    const targetSources = this.context.targetSources || this.campaign.sources || [];
    const missingResultCount = this.context.missingResultCount || this.campaign.requestedLimit || 20;
    const queries = buildSerpQueriesForCampaign({
      campaign: this.campaign,
      targetSources,
      missingResultCount,
    });

    const result = await searchWithMetadataProviders({
      queries,
      campaign: this.campaign,
      limit: Math.min(10, missingResultCount),
      requestedMissingCount: missingResultCount,
      normalizeResult: ({ result: providerResult, query }) => {
        const targetSource = this.context.targetSourceByQuery?.[query] || targetSources[0] || null;
        const normalized = normalizeSerpResult({
          result: {
            ...providerResult,
            link: providerResult.link,
            displayedLink: providerResult.displayedLink,
            snippet: providerResult.snippet,
            provider: providerResult.provider,
            source: providerResult.rawMetadata?.source || providerResult.provider,
          },
          targetSource,
          campaign: this.campaign,
        });
        return normalized ? { ...normalized, query } : null;
      },
    });

    this.metadata = {
      providerUsed: result.providerUsed,
      fallbackUsed: result.fallbackUsed,
      queriesUsed: result.queriesUsed,
      providerStats: result.providerStats,
      quality: result.quality,
      skippedReason: result.skippedReason,
    };
    return result.candidates.slice(0, missingResultCount);
  }
}
