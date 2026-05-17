import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { getSourceStatusByKey } from './source.registry.js';
import { getSearchMetadataProviderStatus } from './metadataProviders/searchMetadataProviderRegistry.js';
import { getResolvedDiscoveryProviderConfig } from './metadataProviders/searchMetadataProviderConfig.service.js';
import {
  DISCOVERY_PROVIDERS,
  isDiscoverySecretManagementConfigured,
  listDiscoveryProviderSecretStatuses,
} from './discoveryProviderSecretsVault.service.js';

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
  const [serperConfig, serpApiConfig, googlePlacesConfig, dashboardStatuses] = await Promise.all([
    getResolvedDiscoveryProviderConfig(DISCOVERY_PROVIDERS.SERPER),
    getResolvedDiscoveryProviderConfig(DISCOVERY_PROVIDERS.SERPAPI),
    getResolvedDiscoveryProviderConfig(DISCOVERY_PROVIDERS.GOOGLE_PLACES),
    listDiscoveryProviderSecretStatuses(),
  ]);
  const dashboardByProvider = new Map(dashboardStatuses.map((status) => [status.provider, status]));
  const safeProvider = (provider, config) => {
    const dashboard = dashboardByProvider.get(provider);
    return {
      configured: Boolean(config.apiKey),
      source: config.source,
      fingerprint: dashboard?.fingerprint || null,
      status: config.apiKey ? 'configured' : 'missing',
    };
  };

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
        configured: Boolean(googlePlacesConfig.apiKey || googlePlaces.configured),
        source: googlePlacesConfig.source,
        fingerprint: dashboardByProvider.get(DISCOVERY_PROVIDERS.GOOGLE_PLACES)?.fingerprint || null,
        runnable: Boolean(googlePlacesConfig.apiKey && googlePlaces.available),
        requiresApiKey: true,
        status: googlePlacesConfig.apiKey ? 'ready' : 'not_configured',
      },
      serpApi: {
        configured: Boolean(serpApiConfig.apiKey || serpApi.configured),
        source: serpApiConfig.source,
        fingerprint: dashboardByProvider.get(DISCOVERY_PROVIDERS.SERPAPI)?.fingerprint || null,
        runnable: searchMetadata.legacySerpEnabled && Boolean(serpApiConfig.apiKey),
        liveEnabled: Boolean(env.LIVE_SERP_DISCOVERY_ENABLED),
        requiresApiKey: true,
        plannedForPhase: 'Phase 4',
        status: env.LIVE_SERP_DISCOVERY_ENABLED && env.SERPAPI_API_KEY ? 'ready_cache_first' : 'prepared_disabled',
      },
      serper: {
        configured: Boolean(serperConfig.apiKey),
        source: serperConfig.source,
        fingerprint: dashboardByProvider.get(DISCOVERY_PROVIDERS.SERPER)?.fingerprint || null,
        runnable: Boolean(searchMetadata.liveEnabled && serperConfig.apiKey),
        requiresApiKey: true,
        status: searchMetadata.liveEnabled && env.SERPER_API_KEY ? 'ready_cache_first' : 'missing_or_disabled',
      },
      searchMetadata: {
        liveEnabled: searchMetadata.liveEnabled,
        secretManagementConfigured: isDiscoverySecretManagementConfigured(),
        primaryProvider: searchMetadata.primaryProvider,
        primaryConfigured: searchMetadata.primaryConfigured,
        primarySource: searchMetadata.primaryProvider === 'serper' ? serperConfig.source : serpApiConfig.source,
        fallbackProvider: searchMetadata.fallbackProvider,
        fallbackConfigured: searchMetadata.fallbackConfigured,
        fallbackSource: searchMetadata.fallbackProvider === 'serpapi' ? serpApiConfig.source : serperConfig.source,
        availableProviders: searchMetadata.availableProviders,
        runnable: searchMetadata.runnable,
        status: searchMetadata.status,
        providers: {
          serper: safeProvider(DISCOVERY_PROVIDERS.SERPER, serperConfig),
          serpapi: safeProvider(DISCOVERY_PROVIDERS.SERPAPI, serpApiConfig),
          googlePlaces: safeProvider(DISCOVERY_PROVIDERS.GOOGLE_PLACES, googlePlacesConfig),
        },
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
