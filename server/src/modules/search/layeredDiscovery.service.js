import { env } from '../../config/env.js';
import { getSourceStatusByKey } from './source.registry.js';
import { normalizeCampaignTargeting } from './sourceTargetMapping.service.js';

export const DISCOVERY_LAYER_KEYS = Object.freeze({
  CACHE_EVIDENCE: 'CACHE_EVIDENCE',
  LOCAL_DATASET: 'LOCAL_DATASET',
  WEBSITE_OPEN_WEB: 'WEBSITE_OPEN_WEB',
  SEARCH_METADATA: 'SEARCH_METADATA',
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  FUTURE_PROVIDER: 'FUTURE_PROVIDER',
});

const LAYERED_DISCOVERY_SOURCE_KEYS = new Set([
  'GOOGLE_MAPS',
  'WEBSITE',
  'SERPAPI',
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'TRIPADVISOR',
  'YELP',
  'X',
  'REDDIT',
  'LOCAL_DATASET',
  'DATASET_IMPORT',
  'INSTAGRAM_DATASET',
  'GOOGLE_MAPS_DATASET',
  'MANUAL_ADMIN',
]);

const SEARCH_METADATA_TARGETS = new Set([
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'X',
  'TRIPADVISOR',
  'YELP',
  'REDDIT',
  'SERPAPI',
]);

const unique = (values) => [...new Set(values.filter(Boolean))];

export const createLayerResult = ({
  layerKey,
  status,
  reason = null,
  providerConfigured = false,
  attempted = false,
  leadsFound = 0,
  leadsAccepted = 0,
  durationMs = 0,
  costUnits = 0,
  warnings = [],
  candidates = [],
} = {}) => ({
  layerKey,
  status,
  reason,
  providerConfigured,
  attempted,
  leadsFound,
  leadsAccepted,
  durationMs,
  costUnits,
  warnings,
  candidates,
});

export const shouldUseLayeredDiscovery = (campaign = {}) => {
  const { rawSources, presenceTargets } = normalizeCampaignTargeting(campaign);
  if (presenceTargets.length > 0) return true;
  return rawSources.length > 0 && rawSources.every((source) => LAYERED_DISCOVERY_SOURCE_KEYS.has(source));
};

export const getLayeredDiscoveryContext = (campaign = {}) => {
  const targeting = normalizeCampaignTargeting(campaign);
  const searchMetadataSelected = targeting.rawSources.includes('SERPAPI')
    || targeting.presenceTargets.some((source) => SEARCH_METADATA_TARGETS.has(source));
  const googlePlacesSelected = targeting.rawSources.includes('GOOGLE_MAPS');
  const websiteSelected = targeting.rawSources.includes('WEBSITE');
  const googleMapsStatus = getSourceStatusByKey('GOOGLE_MAPS');
  const searchMetadataStatus = getSourceStatusByKey('SERPAPI');

  return {
    campaignId: campaign.id || null,
    requestedLimit: campaign.requestedLimit || 20,
    rawSources: targeting.rawSources,
    discoverySources: targeting.discoverySources,
    presenceTargets: targeting.presenceTargets,
    providerReadiness: {
      googlePlaces: {
        selected: googlePlacesSelected,
        configured: Boolean(googleMapsStatus?.runtimeAvailable),
        available: Boolean(googleMapsStatus?.runtimeAvailable),
        reason: googleMapsStatus?.reason || 'Google Places API key is not configured.',
      },
      searchMetadata: {
        selected: searchMetadataSelected,
        configured: Boolean(searchMetadataStatus?.runtimeAvailable),
        available: Boolean(searchMetadataStatus?.runtimeAvailable),
        reason: searchMetadataStatus?.reason || 'Search Metadata is not configured.',
      },
      websiteOpenWeb: {
        selected: websiteSelected,
        configured: Boolean(env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED),
        available: Boolean(env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED),
        reason: env.OPEN_WEB_EVIDENCE_ENABLED && env.COMMON_CRAWL_ENABLED
          ? null
          : 'Open web evidence is not configured.',
      },
    },
  };
};

const summarizeSearchMetadataLayer = ({ context, discoveryDecision, externalDiscovery, acceptedCount }) => {
  const selected = context.providerReadiness.searchMetadata.selected;
  const configured = context.providerReadiness.searchMetadata.configured;
  const used = Boolean(externalDiscovery.metadata.searchMetadataProviderUsed);
  const skippedReason = externalDiscovery.metadata.externalDiscoverySkippedReason
    || discoveryDecision.searchMetadataPlan.reason
    || null;

  if (!selected) {
    return createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
      status: 'SKIPPED',
      reason: 'Search Metadata was not selected for this search.',
      providerConfigured: configured,
      attempted: false,
    });
  }

  if (used) {
    return createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
      status: acceptedCount > 0 ? 'COMPLETED' : 'NO_RESULTS',
      reason: acceptedCount > 0 ? null : 'Search Metadata did not return accepted leads.',
      providerConfigured: configured,
      attempted: true,
      leadsFound: externalDiscovery.candidates.length,
      leadsAccepted: acceptedCount,
      costUnits: externalDiscovery.metadata.externalCostEstimate || 0,
      warnings: externalDiscovery.metadata.searchMetadataFallbackUsed ? ['SECONDARY_PROVIDER_USED'] : [],
    });
  }

  if (!configured) {
    return createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
      status: 'SKIPPED',
      reason: 'Search Metadata is not configured yet.',
      providerConfigured: false,
      attempted: false,
    });
  }

  return createLayerResult({
    layerKey: DISCOVERY_LAYER_KEYS.SEARCH_METADATA,
    status: skippedReason === 'SEARCH_METADATA_UNAVAILABLE' ? 'FAILED' : 'SKIPPED',
    reason: skippedReason || 'Search Metadata was skipped.',
    providerConfigured: true,
    attempted: discoveryDecision.runPaidSearchMetadata,
    leadsFound: 0,
    leadsAccepted: 0,
  });
};

const summarizeGooglePlacesLayer = ({ context, discoveryDecision, externalDiscovery, acceptedCount }) => {
  const selected = context.providerReadiness.googlePlaces.selected;
  const configured = context.providerReadiness.googlePlaces.configured;
  const shouldRun = Boolean(discoveryDecision.googlePlacesPlan?.shouldRun);
  const used = externalDiscovery.metadata.externalProvider === 'GOOGLE_PLACES';
  const skippedReason = discoveryDecision.googlePlacesPlan?.reason || externalDiscovery.metadata.googlePlacesStatus || null;

  if (!selected) {
    return createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
      status: 'SKIPPED',
      reason: 'Google Maps was not selected for this search.',
      providerConfigured: configured,
      attempted: false,
    });
  }

  if (!configured) {
    return createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
      status: 'SKIPPED',
      reason: 'Google Places API key is not configured.',
      providerConfigured: false,
      attempted: false,
    });
  }

  if (used) {
    return createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
      status: acceptedCount > 0 ? 'COMPLETED' : 'NO_RESULTS',
      reason: acceptedCount > 0 ? null : 'Google Places did not return accepted leads.',
      providerConfigured: true,
      attempted: true,
      leadsFound: acceptedCount,
      leadsAccepted: acceptedCount,
      costUnits: externalDiscovery.metadata.externalProvider === 'GOOGLE_PLACES'
        ? externalDiscovery.metadata.externalCostEstimate || 0
        : 0,
    });
  }

  return createLayerResult({
    layerKey: DISCOVERY_LAYER_KEYS.GOOGLE_PLACES,
    status: shouldRun && skippedReason === 'GOOGLE_PLACES_NOT_CONFIGURED' ? 'SKIPPED' : (shouldRun ? 'FAILED' : 'SKIPPED'),
    reason: skippedReason || 'Google Places was skipped.',
    providerConfigured: true,
    attempted: shouldRun,
  });
};

export const buildLayeredDiscoveryReport = ({
  campaign,
  matchedLeads = [],
  evidenceCandidates = [],
  openWebEvidence = null,
  discoveryDecision,
  externalDiscovery,
  promotedExternalCount = 0,
  promotedOpenWebCount = 0,
} = {}) => {
  const context = getLayeredDiscoveryContext(campaign);
  const cacheAcceptedCount = evidenceCandidates.filter((item) => item.catalogLeadId).length;
  const openWebAcceptedCount = (openWebEvidence?.linkedCandidates?.length || 0) + promotedOpenWebCount;
  const searchMetadataAcceptedCount = externalDiscovery?.metadata?.searchMetadataProviderUsed ? promotedExternalCount : 0;
  const googlePlacesAcceptedCount = externalDiscovery?.metadata?.externalProvider === 'GOOGLE_PLACES' ? promotedExternalCount : 0;

  const layerSummary = [
    createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.CACHE_EVIDENCE,
      status: evidenceCandidates.length > 0 ? 'COMPLETED' : 'NO_RESULTS',
      reason: evidenceCandidates.length > 0 ? null : 'No reusable cached evidence matched this search.',
      providerConfigured: true,
      attempted: true,
      leadsFound: evidenceCandidates.length,
      leadsAccepted: cacheAcceptedCount,
    }),
    createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.LOCAL_DATASET,
      status: matchedLeads.length > 0 ? 'COMPLETED' : 'NO_RESULTS',
      reason: matchedLeads.length > 0 ? null : 'No local business index matches were found.',
      providerConfigured: true,
      attempted: true,
      leadsFound: matchedLeads.length,
      leadsAccepted: matchedLeads.length,
    }),
    createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.WEBSITE_OPEN_WEB,
      status: openWebEvidence?.openWebUsed
        ? (openWebAcceptedCount > 0 ? 'COMPLETED' : 'NO_RESULTS')
        : (openWebEvidence?.skippedReason ? 'SKIPPED' : 'NO_RESULTS'),
      reason: openWebEvidence?.skippedReason === 'DIRECT_COVERAGE_SUFFICIENT'
        ? 'Website/open web lookup was skipped because local and cached coverage was already sufficient.'
        : openWebEvidence?.skippedReason === 'NO_ELIGIBLE_SEEDS'
          ? 'No eligible website seeds were available for open web lookup.'
          : (openWebAcceptedCount > 0 ? null : 'Website/open web lookup did not add accepted leads.'),
      providerConfigured: context.providerReadiness.websiteOpenWeb.configured,
      attempted: Boolean(openWebEvidence?.openWebUsed),
      leadsFound: openWebEvidence?.results?.length || 0,
      leadsAccepted: openWebAcceptedCount,
      warnings: openWebEvidence?.cacheHits ? ['CACHE_HIT'] : [],
    }),
    summarizeSearchMetadataLayer({
      context,
      discoveryDecision,
      externalDiscovery,
      acceptedCount: searchMetadataAcceptedCount,
    }),
    summarizeGooglePlacesLayer({
      context,
      discoveryDecision,
      externalDiscovery,
      acceptedCount: googlePlacesAcceptedCount,
    }),
    createLayerResult({
      layerKey: DISCOVERY_LAYER_KEYS.FUTURE_PROVIDER,
      status: 'SKIPPED',
      reason: 'No future external dataset provider is configured for this search.',
      providerConfigured: false,
      attempted: false,
    }),
  ];

  return {
    context,
    layerSummary,
  };
};

export const buildLayeredSearchMessage = ({ resultCount = 0, layerSummary = [] } = {}) => {
  if (resultCount > 0) {
    const completedLayers = unique(layerSummary.filter((layer) => layer.status === 'COMPLETED').map((layer) => layer.layerKey));
    return completedLayers.length > 0
      ? `Search completed using ${completedLayers.join(', ').replaceAll('_', ' ').toLowerCase()}.`
      : 'Search completed across the available discovery layers.';
  }

  return 'No leads were found after checking local data, cached evidence, and configured discovery providers.';
};
