import { prisma } from '../../db/prisma.js';
import { getPresenceTargetDefinitions, getSourceStatuses as getBaseSourceStatuses } from './source.registry.js';

const datasetSources = ['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN'];
const localFallbackDiscoveryKeys = new Set(['GOOGLE_MAPS', 'WEBSITE', 'SERPAPI']);
const userVisibleDiscoveryKeys = new Set(['GOOGLE_MAPS', 'WEBSITE', 'SERPAPI']);

const discoveryLabelOverrides = {
  SERPAPI: 'Search Metadata',
};

const sanitizeDiscoverySourceForUserResponse = (source, { fallbackAvailable = false } = {}) => {
  if (!userVisibleDiscoveryKeys.has(source.key)) return null;

  const sourceAvailable = Boolean(source.runtimeAvailable ?? source.available);
  const canContinue = Boolean(fallbackAvailable && localFallbackDiscoveryKeys.has(source.key));
  const canSearch = Boolean(sourceAvailable || canContinue);
  const later = !canSearch;
  const layerWarning = !sourceAvailable && canContinue
    ? `${discoveryLabelOverrides[source.key] || source.label} is not configured yet. Findly will continue with available discovery layers.`
    : null;

  return {
    key: source.key,
    label: discoveryLabelOverrides[source.key] || source.label,
    kind: 'discovery_source',
    group: source.group,
    status: canSearch ? (sourceAvailable ? 'ready' : 'index_ready') : 'later',
    configured: sourceAvailable,
    available: canSearch,
    searchable: canSearch,
    selectable: true,
    executable: Boolean(source.executable),
    directScraping: Boolean(source.directScraping),
    canContinue,
    comingSoon: later,
    warning: layerWarning,
    reason: canSearch
      ? (sourceAvailable
        ? 'Ready through a compliant source or official business API.'
        : 'Available from Findly’s current business intelligence index.')
      : 'This discovery source is not configured yet.',
  };
};

const sanitizePresenceTargetForUserResponse = (target) => ({
  key: target.key,
  label: target.label,
  kind: 'presence_target',
  group: 'presence_target',
  status: 'ready',
  configured: true,
  available: true,
  searchable: false,
  selectable: true,
  executable: false,
  directScraping: false,
  canContinue: true,
  comingSoon: false,
  description: target.description,
  reason: 'These options guide discovery and analysis. Findly does not perform direct login-based scraping.',
});

export const getSourceStatuses = () => getBaseSourceStatuses()
  .map((source) => sanitizeDiscoverySourceForUserResponse(source))
  .filter(Boolean);

export const getPresenceTargetStatuses = () => getPresenceTargetDefinitions()
  .map(sanitizePresenceTargetForUserResponse);

export const getSourceStatusesWithRuntime = async (_context = {}) => {
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
          ? "Available from Findly's current business intelligence index."
          : source.reason,
      };
    }

    if (localFallbackDiscoveryKeys.has(source.key) && (!source.configured || source.key === 'WEBSITE')) {
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

  return {
    sources: internalStatuses
      .map((source) => sanitizeDiscoverySourceForUserResponse(source, { fallbackAvailable }))
      .filter(Boolean),
    presenceTargets: getPresenceTargetStatuses(),
  };
};
