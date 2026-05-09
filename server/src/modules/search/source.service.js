import { prisma } from '../../db/prisma.js';
import { getSourceStatuses as getBaseSourceStatuses } from './source.registry.js';

const datasetSources = ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET'];
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
          ? 'Search imported Excel/CSV business datasets.'
          : source.reason,
      };
    }

    if (localFallbackSourceKeys.has(source.key) && (!source.configured || source.key === 'WEBSITE')) {
      return {
        ...source,
        fallbackAvailable,
        reason: fallbackAvailable
          ? 'Stored Local Dataset results can be used while this source is not connected.'
          : source.reason,
      };
    }

    return source;
  });
};
