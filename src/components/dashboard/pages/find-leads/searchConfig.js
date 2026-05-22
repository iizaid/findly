export const STORAGE_KEY = 'findly_find_leads_state';

export const DEFAULT_GOALS = ['General opportunity discovery'];

export const MAX_SELECTED_DISCOVERY_SOURCES = 3;
export const MAX_SELECTED_PRESENCE_TARGETS = 5;

export const PREFERRED_DISCOVERY_SOURCE_ORDER = [
  'GOOGLE_MAPS',
  'WEBSITE',
  'SERPAPI',
];

export const PREFERRED_PRESENCE_TARGET_ORDER = [
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'TRIPADVISOR',
  'YELP',
  'X',
  'REDDIT',
];

export const PLATFORM_LABELS = {
  INSTAGRAM: 'Instagram',
  GOOGLE_MAPS: 'Google Maps',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Website',
  SERPAPI: 'Search Metadata',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  TRIPADVISOR: 'TripAdvisor',
  YELP: 'Yelp',
  REDDIT: 'Reddit',
  X: 'X',
};

export const SEARCH_STEPS = [
  'Preparing search',
  'Checking available sources',
  'Matching business records',
  'Saving lead list',
  'Ready',
];

export const EMPTY_FORM_STATE = {
  service: '',
  businessType: '',
  goal: DEFAULT_GOALS[0],
  country: '',
  city: '',
  maxResults: 20,
};

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
