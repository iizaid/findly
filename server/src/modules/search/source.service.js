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
]);

export const getSourceStatuses = getBaseSourceStatuses;

export const getSourceStatusesWithRuntime = async () => {
  const catalogWhere = {
    source: { in: datasetSources },
  };

  const localLeadCount = await prisma.leadCatalog.count({ where: catalogWhere }).catch(() => 0);
  const fallbackAvailable = localLeadCount > 0;

  return getBaseSourceStatuses().map((source) => {
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
          ? 'Available business intelligence can be used for this platform.'
          : source.reason,
      };
    }

    return source;
  });
};
