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
  'REDDIT',
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
  'REDDIT',
]);

export const PLATFORM_LABELS = {
  INSTAGRAM: 'Instagram signals',
  GOOGLE_MAPS: 'Google Maps',
  FACEBOOK: 'Facebook signals',
  WEBSITE: 'Website signal',
  TIKTOK: 'TikTok signals',
  LINKEDIN: 'LinkedIn signals',
  YOUTUBE: 'YouTube signals',
  TRIPADVISOR: 'TripAdvisor signals',
  YELP: 'Yelp signals',
  REDDIT: 'Reddit signals',
  X: 'X signals',
};

export const SEARCH_STEPS = [
  'Preparing search',
  'Checking available signal targets',
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
