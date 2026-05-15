export const STORAGE_KEY = 'findly_find_leads_state';

export const DEFAULT_GOALS = ['General opportunity discovery'];

export const MAX_SELECTED_PLATFORMS = 5;

export const PREFERRED_SOURCE_ORDER = [
  'INSTAGRAM',
  'GOOGLE_MAPS',
  'FACEBOOK',
  'WEBSITE',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'TRIPADVISOR',
  'YELP',
  'X',
];

export const SEARCH_READY_SOURCES = new Set([
  'GOOGLE_MAPS',
  'INSTAGRAM',
  'FACEBOOK',
  'WEBSITE',
  'YELP',
  'SERPAPI',
  'TRIPADVISOR',
  'YOUTUBE',
  'X',
  'LINKEDIN',
  'TIKTOK',
]);

export const PLATFORM_LABELS = {
  INSTAGRAM: 'Instagram',
  GOOGLE_MAPS: 'Google Maps',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Website',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  TRIPADVISOR: 'TripAdvisor',
  YELP: 'Yelp',
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
