import { GooglePlacesAdapter } from './adapters/GooglePlacesAdapter.js';
import { RedditAdapter } from './adapters/RedditAdapter.js';
import { YelpAdapter } from './adapters/YelpAdapter.js';
import { SerpAdapter } from './adapters/SerpAdapter.js';
import { WebsiteAdapter } from './adapters/WebsiteAdapter.js';
import { CsvAdapter } from './adapters/CsvAdapter.js';
import { LocalDatasetAdapter } from './adapters/LocalDatasetAdapter.js';

const comingLaterSources = [
  {
    key: 'INSTAGRAM',
    label: 'Instagram',
    description: 'Future official/compliant social source.',
    group: 'social',
    estimatedUseCase: 'Find businesses with strong social presence when official compliant access is available.',
    reason: 'Requires official compliant integration. No login automation or unsafe scraping is enabled.',
  },
  {
    key: 'FACEBOOK',
    label: 'Facebook',
    description: 'Future official/compliant social source.',
    group: 'social',
    estimatedUseCase: 'Find public business pages when official compliant access is available.',
    reason: 'Requires official compliant integration. No login automation or unsafe scraping is enabled.',
  },
  {
    key: 'LINKEDIN',
    label: 'LinkedIn',
    description: 'Future official/compliant professional source.',
    group: 'social',
    estimatedUseCase: 'Discover professional service businesses through compliant provider access.',
    reason: 'Requires official compliant integration. No login automation or unsafe scraping is enabled.',
  },
  {
    key: 'TIKTOK',
    label: 'TikTok',
    description: 'Future official/compliant social source.',
    group: 'social',
    estimatedUseCase: 'Discover businesses with short-form social presence when official access is available.',
    reason: 'Requires official compliant integration. No login automation or unsafe scraping is enabled.',
  },
  {
    key: 'TRIPADVISOR',
    label: 'TripAdvisor',
    description: 'Future compliant travel/hospitality source.',
    group: 'directory',
    estimatedUseCase: 'Discover hospitality businesses if a compliant source becomes available.',
    reason: 'Requires compliant provider access before use.',
  },
  {
    key: 'YOUTUBE',
    label: 'YouTube',
    description: 'Future official/compliant video source.',
    group: 'social',
    estimatedUseCase: 'Discover businesses with public video presence when official access is available.',
    reason: 'Requires official compliant integration before use.',
  },
  {
    key: 'X',
    label: 'X',
    description: 'Future official/compliant social source.',
    group: 'social',
    estimatedUseCase: 'Discover businesses with public social presence when official access is available.',
    reason: 'Requires official compliant integration before use.',
  },
];

const adapterEntries = [
  { group: 'search', Adapter: GooglePlacesAdapter },
  { group: 'signals', Adapter: RedditAdapter },
  { group: 'directory', Adapter: YelpAdapter },
  { group: 'search', Adapter: SerpAdapter },
  { group: 'enrichment', Adapter: WebsiteAdapter },
  { group: 'import', Adapter: LocalDatasetAdapter },
  { group: 'import', Adapter: CsvAdapter },
];

export const adapterRegistry = Object.fromEntries(adapterEntries.map(({ Adapter }) => [Adapter.key, Adapter]));

export const getSourceStatuses = () => [
  ...adapterEntries.map(({ group, Adapter }) => ({
    ...Adapter.getStatus(),
    group,
  })),
  ...comingLaterSources.map((source) => ({
    ...source,
    status: 'coming_later',
    configured: false,
    available: false,
    comingSoon: true,
    requiresApiKey: false,
  })),
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
      ? { ...status, reason: `${status.label} is adapter-ready but not enabled as a campaign run source yet.` }
      : status,
    runnable,
  };
};

export const estimateSourceCost = (key, input = {}) => {
  const Adapter = adapterRegistry[key];
  if (!Adapter) return null;
  return Adapter.estimateCost(input);
};
