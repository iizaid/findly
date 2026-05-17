import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import { normalizeProviderName, SEARCH_METADATA_PROVIDERS } from './searchMetadataProvider.interface.js';
import { SerperProvider } from './serper.provider.js';
import { SerpApiProvider } from './serpapi.provider.js';

const PROVIDERS = Object.freeze({
  [SEARCH_METADATA_PROVIDERS.SERPER]: SerperProvider,
  [SEARCH_METADATA_PROVIDERS.SERPAPI]: SerpApiProvider,
});

export const isSearchMetadataDiscoveryEnabled = () =>
  Boolean(env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED || env.LIVE_SERP_DISCOVERY_ENABLED);

export const getSearchMetadataProvider = (name) => PROVIDERS[normalizeProviderName(name)] || null;

export const getSearchMetadataProviderStatus = () => {
  const primaryProvider = normalizeProviderName(env.SEARCH_METADATA_PROVIDER_PRIMARY || 'serper');
  const fallbackProvider = normalizeProviderName(env.SEARCH_METADATA_PROVIDER_FALLBACK || 'serpapi');
  const liveEnabled = isSearchMetadataDiscoveryEnabled();
  const availableProviders = Object.values(PROVIDERS)
    .filter((provider) => provider.isConfigured())
    .map((provider) => provider.key);

  const primary = getSearchMetadataProvider(primaryProvider);
  const fallback = getSearchMetadataProvider(fallbackProvider);
  const legacySerpEnabled = Boolean(!env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED && env.LIVE_SERP_DISCOVERY_ENABLED);

  return {
    liveEnabled,
    legacySerpEnabled,
    primaryProvider,
    primaryConfigured: Boolean(primary?.isConfigured()),
    fallbackProvider,
    fallbackConfigured: Boolean(fallback?.isConfigured()),
    availableProviders,
    runnable: liveEnabled && availableProviders.length > 0,
    status: !liveEnabled
      ? 'disabled'
      : (availableProviders.length > 0 ? 'ready_cache_first' : 'not_configured'),
    providers: Object.fromEntries(
      Object.values(PROVIDERS).map((provider) => [provider.key, provider.getStatus()]),
    ),
  };
};

const uniqueLinkCount = (candidates = []) => new Set(
  candidates.map((candidate) => candidate.sourceUrl || candidate.link).filter(Boolean),
).size;

const averageConfidence = (candidates = []) => {
  if (!candidates.length) return 0;
  const total = candidates.reduce((sum, candidate) => sum + (Number(candidate.confidenceScore) || 0), 0);
  return Math.round(total / candidates.length);
};

const targetMatchRatio = (candidates = []) => {
  if (!candidates.length) return 0;
  const matches = candidates.filter((candidate) => {
    const reasons = candidate.confidenceReasons || [];
    return reasons.includes('TARGET_PLATFORM_MATCH');
  }).length;
  return matches / candidates.length;
};

export const evaluateProviderResultQuality = ({ candidates = [], requestedMissingCount = 20 } = {}) => {
  const resultCount = candidates.length;
  const uniqueLinks = uniqueLinkCount(candidates);
  const avgConfidence = averageConfidence(candidates);
  const minResults = Math.min(
    Number(env.SEARCH_METADATA_MIN_PROVIDER_RESULTS) || 3,
    Math.max(1, requestedMissingCount),
  );
  const minConfidence = Number(env.SEARCH_METADATA_MIN_AVERAGE_CONFIDENCE) || 55;
  const minUniqueLinks = Math.min(2, minResults);
  const passed = resultCount >= minResults
    && uniqueLinks >= minUniqueLinks
    && avgConfidence >= minConfidence;

  return {
    passed,
    resultCount,
    requestedMissingCount,
    averageConfidence: avgConfidence,
    uniqueLinks,
    targetMatchRatio: targetMatchRatio(candidates),
    minResults,
    minUniqueLinks,
    minAverageConfidence: minConfidence,
    reason: passed ? 'QUALITY_GATE_PASSED' : 'QUALITY_GATE_FAILED',
  };
};

const providerSequence = () => {
  const primaryName = normalizeProviderName(env.SEARCH_METADATA_PROVIDER_PRIMARY || 'serper');
  const fallbackName = normalizeProviderName(env.SEARCH_METADATA_PROVIDER_FALLBACK || 'serpapi');

  if (!env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED && env.LIVE_SERP_DISCOVERY_ENABLED) {
    return [SEARCH_METADATA_PROVIDERS.SERPAPI];
  }

  return [...new Set([primaryName, fallbackName].filter(Boolean))];
};

export const searchWithMetadataProviders = async ({
  queries = [],
  campaign,
  limit = 10,
  normalizeResult,
  requestedMissingCount = 20,
}) => {
  if (!isSearchMetadataDiscoveryEnabled()) {
    return {
      candidates: [],
      providerUsed: null,
      fallbackUsed: false,
      queriesUsed: 0,
      providerStats: [],
      skippedReason: 'SEARCH_METADATA_DISABLED',
    };
  }

  const sequence = providerSequence();
  const providerStats = [];

  for (const providerName of sequence) {
    const provider = getSearchMetadataProvider(providerName);
    if (!provider) {
      providerStats.push({ provider: providerName, ok: false, errorType: 'UNKNOWN_PROVIDER' });
      continue;
    }
    if (!provider.isConfigured()) {
      providerStats.push({ provider: provider.key, ok: false, errorType: 'NOT_CONFIGURED' });
      continue;
    }

    try {
      const candidates = [];
      let queriesUsed = 0;
      for (const query of queries) {
        const results = await provider.search({ query, campaign, limit });
        queriesUsed += 1;
        for (const result of results) {
          const normalized = normalizeResult({ result, query, provider: provider.key });
          if (normalized) candidates.push(normalized);
        }
        if (candidates.length >= requestedMissingCount) break;
      }

      const quality = evaluateProviderResultQuality({ candidates, requestedMissingCount });
      providerStats.push({
        provider: provider.key,
        ok: true,
        resultCount: candidates.length,
        queriesUsed,
        quality,
      });

      if (quality.passed || provider.key === sequence[sequence.length - 1]) {
        return {
          candidates: candidates.slice(0, requestedMissingCount),
          providerUsed: provider.key.toUpperCase(),
          fallbackUsed: provider.key !== sequence[0],
          queriesUsed,
          providerStats,
          quality,
          skippedReason: candidates.length > 0 ? null : 'SEARCH_METADATA_NO_RESULTS',
        };
      }
    } catch (error) {
      providerStats.push({
        provider: provider.key,
        ok: false,
        errorType: error.code || 'PROVIDER_ERROR',
      });
      logger.warn('search_metadata.provider.failed', {
        provider: provider.key,
        errorType: error.code || 'PROVIDER_ERROR',
      });
    }
  }

  return {
    candidates: [],
    providerUsed: null,
    fallbackUsed: false,
    queriesUsed: 0,
    providerStats,
    skippedReason: providerStats.some((item) => item.errorType === 'NOT_CONFIGURED')
      ? 'SEARCH_METADATA_NOT_CONFIGURED'
      : 'SEARCH_METADATA_UNAVAILABLE',
  };
};
