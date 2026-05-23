const normalizeSource = (source) => (source || '').toString().trim().toUpperCase();

export const SOURCE_TARGETS = Object.freeze({
  GOOGLE_MAPS: 'GOOGLE_MAPS',
  INSTAGRAM: 'INSTAGRAM',
  TIKTOK: 'TIKTOK',
  FACEBOOK: 'FACEBOOK',
  REDDIT: 'REDDIT',
  LINKEDIN: 'LINKEDIN',
  YOUTUBE: 'YOUTUBE',
  X: 'X',
  TRIPADVISOR: 'TRIPADVISOR',
  YELP: 'YELP',
  WEBSITE: 'WEBSITE',
  LOCAL_DATASET: 'LOCAL_DATASET',
  CSV: 'CSV',
});

export const DISCOVERY_SOURCE_KEYS = new Set([
  'GOOGLE_MAPS',
  'WEBSITE',
  'SERPAPI',
  'LOCAL_DATASET',
  'CSV',
  'DATASET_IMPORT',
  'INSTAGRAM_DATASET',
  'GOOGLE_MAPS_DATASET',
  'MANUAL_ADMIN',
]);

export const PRESENCE_TARGET_KEYS = new Set([
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'REDDIT',
  'LINKEDIN',
  'YOUTUBE',
  'X',
  'TRIPADVISOR',
  'YELP',
]);

export const DISCOVERY_METHODS = Object.freeze({
  LOCAL_DATASET: 'LOCAL_DATASET',
  CSV_IMPORT: 'CSV_IMPORT',
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  SERPAPI_DISCOVERY: 'SERPAPI_DISCOVERY',
  WEBSITE_METADATA: 'WEBSITE_METADATA',
});

const SEARCH_METADATA_TARGETS = new Set([
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'LINKEDIN',
  'YOUTUBE',
  'X',
  'TRIPADVISOR',
  'YELP',
  'REDDIT',
]);

const signalReasonFor = (source) => {
  const optionalApi = source === 'REDDIT' || source === 'YELP' || source === 'TRIPADVISOR'
    ? ' or an optional approved API'
    : ' or an optional official API';
  return `${source} is treated as a public presence target. Direct scraping and login automation are disabled; discovery uses compliant search-result metadata${optionalApi}.`;
};

const DATASET_SOURCES = new Set(['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN']);

const buildMapping = (source) => {
  if (DATASET_SOURCES.has(source)) {
    return {
      selectedSource: source,
      targetSource: source === 'LOCAL_DATASET' ? 'LOCAL_DATASET' : source,
      discoveryMethod: DISCOVERY_METHODS.LOCAL_DATASET,
      adapter: 'LOCAL_DATASET',
      runnable: true,
      targetOnly: false,
      directPlatformApi: false,
      enrichmentOnly: false,
      importOnly: false,
      costTier: 'local',
      notes: 'Searches the internal LeadCatalog cache first.',
    };
  }

  if (source === 'CSV') {
    return {
      selectedSource: source,
      targetSource: SOURCE_TARGETS.CSV,
      discoveryMethod: DISCOVERY_METHODS.CSV_IMPORT,
      adapter: 'CSV',
      runnable: false,
      targetOnly: false,
      directPlatformApi: false,
      enrichmentOnly: false,
      importOnly: true,
      notes: 'CSV files are imported into LeadCatalog before they become searchable.',
    };
  }

  if (source === 'GOOGLE_MAPS') {
    return {
      selectedSource: source,
      targetSource: SOURCE_TARGETS.GOOGLE_MAPS,
      discoveryMethod: DISCOVERY_METHODS.GOOGLE_PLACES,
      adapter: 'GOOGLE_MAPS',
      runnable: true,
      targetOnly: false,
      directPlatformApi: true,
      enrichmentOnly: false,
      importOnly: false,
      costTier: 'external',
      notes: 'Uses Google Places only when the adapter is configured.',
    };
  }

  if (SEARCH_METADATA_TARGETS.has(source)) {
    return {
      selectedSource: source,
      targetSource: source,
      discoveryMethod: DISCOVERY_METHODS.SERPAPI_DISCOVERY,
      adapter: 'SERPAPI',
      runnable: false,
      targetOnly: true,
      directPlatformApi: false,
      enrichmentOnly: false,
      importOnly: false,
      reason: signalReasonFor(source),
      notes: 'Local cache is used now; compliant search-result metadata can produce LeadEvidence for this public presence target.',
    };
  }

  if (source === 'WEBSITE') {
    return {
      selectedSource: source,
      targetSource: SOURCE_TARGETS.WEBSITE,
      discoveryMethod: DISCOVERY_METHODS.WEBSITE_METADATA,
      adapter: 'WEBSITE',
      runnable: false,
      targetOnly: false,
      directPlatformApi: false,
      enrichmentOnly: false,
      importOnly: false,
      notes: 'Website discovery uses Findly’s business index first and website metadata enrichment when available.',
    };
  }

  return {
    selectedSource: source,
    targetSource: source,
    discoveryMethod: 'UNSUPPORTED',
    adapter: null,
    runnable: false,
    targetOnly: false,
    directPlatformApi: false,
    unsupported: true,
    reason: `${source} is not a supported discovery target.`,
  };
};

export const normalizeSelectedSources = (sources = []) => {
  const input = Array.isArray(sources) ? sources : [sources];
  return [...new Set(input.map(normalizeSource).filter(Boolean))];
};

export const normalizePresenceTargets = (targets = []) => normalizeSelectedSources(targets)
  .filter((target) => PRESENCE_TARGET_KEYS.has(target));

export const normalizeCampaignTargeting = (campaign = {}) => {
  const normalizedCampaign = campaign && typeof campaign === 'object' ? campaign : {};
  const rawSources = normalizeSelectedSources(normalizedCampaign.sources || []);
  const filterTargets = normalizedCampaign?.filters?.presenceTargets;
  const rawPresenceTargets = normalizePresenceTargets([
    ...(Array.isArray(normalizedCampaign.presenceTargets) ? normalizedCampaign.presenceTargets : []),
    ...(Array.isArray(filterTargets) ? filterTargets : []),
  ]);
  const legacyPresenceTargets = rawSources.filter((source) => PRESENCE_TARGET_KEYS.has(source));
  const discoverySources = rawSources.filter((source) => DISCOVERY_SOURCE_KEYS.has(source));
  const presenceTargets = [...new Set([...rawPresenceTargets, ...legacyPresenceTargets])];

  return {
    rawSources,
    discoverySources,
    presenceTargets,
    legacyPresenceTargets,
  };
};

export const mapTargetSourcesToDiscoveryMethods = (sources = []) => normalizeSelectedSources(sources).map(buildMapping);

export const buildDiscoveryPlan = ({ campaign }) => {
  const { discoverySources, presenceTargets } = normalizeCampaignTargeting(campaign);
  const mappings = mapTargetSourcesToDiscoveryMethods([...discoverySources, ...presenceTargets]);
  const targetSources = [...new Set(mappings.map((item) => item.targetSource).filter(Boolean))];
  const geography = [campaign?.city, campaign?.country].filter(Boolean).join(', ') || null;
  const businessTypes = Array.isArray(campaign?.businessTypes) ? campaign.businessTypes : [];
  const expandedQuery = [
    campaign?.query,
    businessTypes.join(', '),
    geography,
    presenceTargets.length ? `focus on ${presenceTargets.join(', ')}` : null,
  ].filter(Boolean).join(' | ') || 'Findly discovery query';

  return {
    campaignId: campaign?.id || null,
    discoverySources,
    presenceTargets,
    targetSources,
    mappings,
    runnableMappings: mappings.filter((item) => item.runnable),
    disabledMappings: mappings.filter((item) => !item.runnable),
    unsupportedMappings: mappings.filter((item) => item.unsupported),
    expandedQuery,
    geography,
  };
};
