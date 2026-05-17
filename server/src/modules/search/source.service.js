import { prisma } from '../../db/prisma.js';
import { getSourceStatuses as getBaseSourceStatuses } from './source.registry.js';

const datasetSources = ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN'];
const localFallbackSourceKeys = new Set([
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

const userVisibleSourceKeys = new Set([
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

const sanitizeSourceForUserResponse = (source, { fallbackAvailable = false } = {}) => {
  if (!userVisibleSourceKeys.has(source.key)) return null;

  const canSearch = Boolean(source.available || (fallbackAvailable && localFallbackSourceKeys.has(source.key)));
  const later = Boolean(source.comingSoon) && !canSearch;

  return {
    key: source.key,
    label: source.label,
    group: source.group,
    status: canSearch ? (source.available ? 'ready' : 'index_ready') : 'later',
    available: canSearch,
    searchable: canSearch,
    comingSoon: later,
    reason: canSearch 
      ? (source.available ? 'Ready through a compliant source or official business API.' : 'Available from Findly’s current business intelligence index.') 
      : 'This signal target will be available through unified discovery later.',
  };
};

export const getSourceStatuses = () => getBaseSourceStatuses()
  .map((source) => sanitizeSourceForUserResponse(source))
  .filter(Boolean);

export const getSourceStatusesWithRuntime = async () => {
  const catalogWhere = {
    source: { in: datasetSources },
  };

  const localLeadCount = await prisma.leadCatalog.count({ where: catalogWhere }).catch(() => 0);
  const fallbackAvailable = localLeadCount > 0;

  const internalStatuses = getBaseSourceStatuses().map((source) => {
    if (source.key === 'LOCAL_DATASET') {
      return {
        ...source,
        configured: true,
        available: source.available || fallbackAvailable,
        searchable: fallbackAvailable,
        importedLeadCount: localLeadCount,
        reason: fallbackAvailable
          ? "Platform signals are available from Findly's current business intelligence index."
          : source.reason,
      };
    }

    if (localFallbackSourceKeys.has(source.key) && (!source.configured || source.key === 'WEBSITE')) {
      return {
        ...source,
        fallbackAvailable,
        reason: fallbackAvailable
          ? 'Available from Findly’s current business intelligence index.'
          : source.reason,
      };
    }

    return source;
  });

  return internalStatuses
    .map((source) => sanitizeSourceForUserResponse(source, { fallbackAvailable }))
    .filter(Boolean);
};
