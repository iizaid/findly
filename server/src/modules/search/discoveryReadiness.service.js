import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { getSourceStatusByKey } from './source.registry.js';
import { getSearchMetadataProviderStatus } from './metadataProviders/searchMetadataProviderRegistry.js';

const datasetSources = ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN'];

const platformSignals = ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'REDDIT', 'YELP', 'TRIPADVISOR', 'LINKEDIN', 'YOUTUBE', 'X'];

const normalizeKey = (value) => value.toLowerCase().replace(/_([a-z])/gi, (_, char) => char.toUpperCase());

const safeStatusFor = (key) => {
  const status = getSourceStatusByKey(key);
  return {
    configured: Boolean(status?.configured),
    available: Boolean(status?.available),
    status: status?.status || 'unknown',
  };
};

const platformSignalSummary = () => Object.fromEntries(platformSignals.map((source) => [
  normalizeKey(source),
  {
    targetSource: source,
    liveMethodNow: 'LOCAL_DATASET',
    futureMethod: 'SERPAPI_DISCOVERY',
    directApiRequiredNow: false,
    externalCallToday: false,
    status: 'local_cache_first',
  },
]));

export const getDiscoveryReadinessSummary = async () => {
  const [catalogLeadCount, discoveryQueryCount, leadEvidenceCount] = await Promise.all([
    prisma.leadCatalog.count({ where: { source: { in: datasetSources } } }).catch(() => 0),
    prisma.discoveryQuery.count().catch(() => 0),
    prisma.leadEvidence.count().catch(() => 0),
  ]);

  const googlePlaces = safeStatusFor('GOOGLE_MAPS');
  const serpApi = safeStatusFor('SERPAPI');
  const searchMetadata = getSearchMetadataProviderStatus();

  return {
    localDataset: {
      available: catalogLeadCount > 0,
      catalogLeadCount,
      status: catalogLeadCount > 0 ? 'available' : 'empty',
      message: catalogLeadCount > 0
        ? 'LeadCatalog has searchable local business records.'
        : 'No local catalog leads are loaded yet. Import CSV/XLSX data before relying on platform signals.',
    },
    evidence: {
      available: true,
      discoveryQueryCount,
      leadEvidenceCount,
      status: 'available',
    },
    sources: {
      googlePlaces: {
        configured: googlePlaces.configured,
        runnable: googlePlaces.available,
        requiresApiKey: true,
        status: googlePlaces.available ? 'ready' : 'not_configured',
      },
      serpApi: {
        configured: Boolean(env.SERPAPI_API_KEY || serpApi.configured),
        runnable: searchMetadata.legacySerpEnabled && Boolean(env.SERPAPI_API_KEY),
        liveEnabled: Boolean(env.LIVE_SERP_DISCOVERY_ENABLED),
        requiresApiKey: true,
        plannedForPhase: 'Phase 4',
        status: env.LIVE_SERP_DISCOVERY_ENABLED && env.SERPAPI_API_KEY ? 'ready_cache_first' : 'prepared_disabled',
      },
      serper: {
        configured: Boolean(env.SERPER_API_KEY),
        runnable: Boolean(searchMetadata.liveEnabled && env.SERPER_API_KEY),
        requiresApiKey: true,
        status: searchMetadata.liveEnabled && env.SERPER_API_KEY ? 'ready_cache_first' : 'missing_or_disabled',
      },
      searchMetadata: {
        liveEnabled: searchMetadata.liveEnabled,
        primaryProvider: searchMetadata.primaryProvider,
        primaryConfigured: searchMetadata.primaryConfigured,
        fallbackProvider: searchMetadata.fallbackProvider,
        fallbackConfigured: searchMetadata.fallbackConfigured,
        availableProviders: searchMetadata.availableProviders,
        runnable: searchMetadata.runnable,
        status: searchMetadata.status,
      },
      platformSignals: platformSignalSummary(),
      website: {
        enrichmentOnly: true,
        runnableAsStandaloneSearch: false,
        status: 'enrichment_only',
      },
      localDataset: {
        configured: true,
        runnable: true,
        requiresApiKey: false,
        status: catalogLeadCount > 0 ? 'ready' : 'empty',
      },
    },
  };
};
