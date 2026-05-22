import { GooglePlacesAdapter } from './adapters/GooglePlacesAdapter.js';
import { RedditAdapter } from './adapters/RedditAdapter.js';
import { YelpAdapter } from './adapters/YelpAdapter.js';
import { SerpAdapter } from './adapters/SerpAdapter.js';
import { WebsiteAdapter } from './adapters/WebsiteAdapter.js';
import { CsvAdapter } from './adapters/CsvAdapter.js';
import { LocalDatasetAdapter } from './adapters/LocalDatasetAdapter.js';
import { DISCOVERY_SOURCE_KEYS, PRESENCE_TARGET_KEYS } from './sourceTargetMapping.service.js';

const presenceTargetDefinitions = [
  {
    key: 'INSTAGRAM',
    label: 'Instagram',
    description: 'Use public business information and search metadata to identify Instagram presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'FACEBOOK',
    label: 'Facebook',
    description: 'Use public business information and search metadata to identify Facebook presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'LINKEDIN',
    label: 'LinkedIn',
    description: 'Use public business information and search metadata to identify LinkedIn presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'TIKTOK',
    label: 'TikTok',
    description: 'Use public business information and search metadata to identify TikTok presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'TRIPADVISOR',
    label: 'TripAdvisor',
    description: 'Use public business information and search metadata to identify TripAdvisor presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'YOUTUBE',
    label: 'YouTube',
    description: 'Use public business information and search metadata to identify YouTube presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'X',
    label: 'X',
    description: 'Use public business information and search metadata to identify X presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'YELP',
    label: 'Yelp',
    description: 'Use public business information and search metadata to identify Yelp presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
  {
    key: 'REDDIT',
    label: 'Reddit',
    description: 'Use public business information and search metadata to identify Reddit presence.',
    estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
  },
];

const adapterEntries = [
  { group: 'search', Adapter: GooglePlacesAdapter },
  { group: 'directory', Adapter: RedditAdapter },
  { group: 'directory', Adapter: YelpAdapter },
  { group: 'search', Adapter: SerpAdapter },
  { group: 'enrichment', Adapter: WebsiteAdapter },
  { group: 'import', Adapter: LocalDatasetAdapter },
  { group: 'import', Adapter: CsvAdapter },
];

const targetOnlyAdapterKeys = new Set(['YELP', 'REDDIT']);

export const adapterRegistry = Object.fromEntries(adapterEntries.map(({ Adapter }) => [Adapter.key, Adapter]));

const internalDiscoveryStatuses = adapterEntries.map(({ group, Adapter }) => {
  const status = Adapter.getStatus();
  const discoveryOnly = DISCOVERY_SOURCE_KEYS.has(Adapter.key);
  const targetOnly = targetOnlyAdapterKeys.has(Adapter.key);
  const directExecutionDisabled = targetOnly || Adapter.key === 'SERPAPI';

  return {
    ...status,
    runtimeAvailable: status.available,
    available: directExecutionDisabled ? false : status.available,
    group,
    kind: discoveryOnly ? 'discovery_source' : (PRESENCE_TARGET_KEYS.has(Adapter.key) || targetOnly ? 'presence_target' : 'internal'),
    executable: !targetOnly && Adapter.key !== 'WEBSITE' && Adapter.key !== 'LOCAL_DATASET' && Adapter.key !== 'CSV',
    selectable: discoveryOnly || PRESENCE_TARGET_KEYS.has(Adapter.key) || targetOnly,
    directScraping: Adapter.key === 'GOOGLE_MAPS',
  };
});

export const getPresenceTargetDefinitions = () => presenceTargetDefinitions.map((target) => ({
  ...target,
  kind: 'presence_target',
  selectable: true,
  executable: false,
  directScraping: false,
  status: 'ready',
  configured: false,
  available: true,
  searchable: false,
  comingSoon: false,
  reason: 'This option is treated as a target signal and uses local cache plus compliant search metadata.',
  group: 'platform_signal',
}));

export const getSourceStatuses = () => [
  ...internalDiscoveryStatuses.map((source) => {
    if (!targetOnlyAdapterKeys.has(source.key)) {
      return source;
    }

    return {
      ...source,
      available: false,
      comingSoon: false,
      executable: false,
      selectable: false,
      group: 'platform_signal',
      reason: `${source.label} is handled as a target signal through metadata and local cache. Direct platform scraping is disabled.`,
      estimatedUseCase: 'Acts as a target signal and guides local cache ranking plus compliant search metadata.',
    };
  }),
  ...getPresenceTargetDefinitions(),
];

export const getSourceStatusByKey = (key) => getSourceStatuses().find((source) => source.key === key);

export const getRunnableAdapter = (key) => {
  const status = getSourceStatusByKey(key);
  const Adapter = adapterRegistry[key];
  const executionDisabled = key === 'WEBSITE' || key === 'LOCAL_DATASET' || key === 'CSV' || key === 'SERPAPI' || key === 'YELP' || key === 'REDDIT';
  const runnable = Boolean(Adapter && status?.available && !executionDisabled);

  return {
    Adapter,
    status: executionDisabled && status
      ? { ...status, reason: `${status.label} is used for discovery guidance or enrichment. Live campaign execution uses compliant sources and local cache only.` }
      : status,
    runnable,
  };
};

export const estimateSourceCost = (key, input = {}) => {
  const Adapter = adapterRegistry[key];
  if (!Adapter) return null;
  return Adapter.estimateCost(input);
};
