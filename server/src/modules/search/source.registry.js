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
    label: 'Instagram Signals',
    description: 'Target businesses with Instagram presence using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have Instagram presence without direct platform scraping.',
    reason: 'Instagram is a target signal, not a direct scraping source. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional official API.',
  },
  {
    key: 'FACEBOOK',
    label: 'Facebook Signals',
    description: 'Target businesses with Facebook presence using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have Facebook presence without direct platform scraping.',
    reason: 'Facebook is a target signal, not a direct scraping source. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional official API.',
  },
  {
    key: 'LINKEDIN',
    label: 'LinkedIn Signals',
    description: 'Target businesses with LinkedIn presence using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have LinkedIn presence without direct platform scraping.',
    reason: 'LinkedIn is a target signal, not a direct scraping source. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional official API.',
  },
  {
    key: 'TIKTOK',
    label: 'TikTok Signals',
    description: 'Target businesses with TikTok presence using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have TikTok presence without direct platform scraping.',
    reason: 'TikTok is a target signal, not a direct scraping source. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional official API.',
  },
  {
    key: 'TRIPADVISOR',
    label: 'TripAdvisor Signals',
    description: 'Target hospitality businesses with TripAdvisor visibility using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have TripAdvisor visibility without direct platform scraping.',
    reason: 'TripAdvisor is a target signal. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional approved API.',
  },
  {
    key: 'YOUTUBE',
    label: 'YouTube Signals',
    description: 'Target businesses with YouTube presence using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have YouTube presence without direct platform scraping.',
    reason: 'YouTube is a target signal, not a direct scraping source. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional official API.',
  },
  {
    key: 'X',
    label: 'X Signals',
    description: 'Target businesses with X presence using local data now and compliant search-result metadata later.',
    group: 'platform_signal',
    estimatedUseCase: 'Find businesses that appear to have X presence without direct platform scraping.',
    reason: 'X is a target signal, not a direct scraping source. Current live discovery uses local cache; future discovery may use compliant search metadata or an optional official API.',
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
      ? { ...status, reason: `${status.label} is treated as a target signal or enrichment adapter. Live campaign execution uses local cache now; direct scraping and login automation are disabled.` }
      : status,
    runnable,
  };
};

export const estimateSourceCost = (key, input = {}) => {
  const Adapter = adapterRegistry[key];
  if (!Adapter) return null;
  return Adapter.estimateCost(input);
};
