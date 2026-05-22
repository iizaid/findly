const DEFAULT_MIN_COVERAGE_RATIO = 0.7;
const DEFAULT_MIN_AVERAGE_SCORE = 60;
const DEFAULT_MAX_EXTERNAL_RESULTS = 20;

const datasetOnlySources = new Set(['LOCAL_DATASET', 'DATASET_IMPORT', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET', 'MANUAL_ADMIN', 'CSV']);

const positiveNumberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const discoveryOverrides = (campaign = {}) => {
  const discovery = campaign.filters?.discovery && typeof campaign.filters.discovery === 'object'
    ? campaign.filters.discovery
    : {};

  return {
    minLocalCoverageRatio: Math.min(1, positiveNumberOrDefault(discovery.minLocalCoverageRatio, DEFAULT_MIN_COVERAGE_RATIO)),
    minLocalAverageScore: Math.min(100, positiveNumberOrDefault(discovery.minLocalAverageScore, DEFAULT_MIN_AVERAGE_SCORE)),
    forceLiveDiscovery: discovery.forceLiveDiscovery === true,
    disableLiveDiscovery: discovery.disableLiveDiscovery === true,
    maxExternalResults: Math.max(0, Math.floor(positiveNumberOrDefault(discovery.maxExternalResults, DEFAULT_MAX_EXTERNAL_RESULTS))),
  };
};

const averageScore = (localResults = []) => {
  if (!localResults.length) return 0;
  const total = localResults.reduce((sum, result) => sum + (Number(result.localDatasetScore ?? result.score ?? 0) || 0), 0);
  return Math.round(total / localResults.length);
};

const selectedSources = (campaign = {}) => normalizeCampaignTargeting(campaign).discoverySources;
const selectedPresenceTargets = (campaign = {}) => normalizeCampaignTargeting(campaign).presenceTargets;

const freshnessStatusFor = (localResults = []) => {
  if (!localResults.length) return 'NO_LOCAL_RESULTS';
  const now = Date.now();
  const staleAfterMs = 180 * 24 * 60 * 60 * 1000;
  const dated = localResults
    .map((result) => result.lastEnrichedAt || result.updatedAt || result.importedAt || result.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!dated.length) return 'UNKNOWN';
  const staleCount = dated.filter((value) => now - value > staleAfterMs).length;
  if (staleCount === dated.length) return 'STALE';
  if (staleCount > 0) return 'MIXED';
  return 'FRESH';
};

const localOnlySelected = (campaign) => {
  const sources = selectedSources(campaign);
  return sources.length > 0 && sources.every((source) => datasetOnlySources.has(source));
};

export const evaluateLocalCoverage = ({ campaign, localResults = [] }) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const overrides = discoveryOverrides(campaign);
  const localCount = localResults.length;
  const coverageRatio = Math.min(1, localCount / requestedLimit);
  const avgScore = averageScore(localResults);
  const enoughCount = localCount >= requestedLimit;
  const enoughCoverage = coverageRatio >= overrides.minLocalCoverageRatio;
  const strongEnough = avgScore >= overrides.minLocalAverageScore;
  const localOnly = localOnlySelected(campaign);

  const freshnessStatus = freshnessStatusFor(localResults);
  const warnings = [];
  let decision = 'RUN_EXTERNAL';
  let reason = localCount === 0 ? 'LOW_LOCAL_COUNT' : 'LOCAL_COVERAGE_BELOW_THRESHOLD';

  if (overrides.disableLiveDiscovery) {
    decision = 'USE_LOCAL_ONLY';
    reason = 'LIVE_DISCOVERY_DISABLED';
  } else if (localOnly) {
    decision = 'USE_LOCAL_ONLY';
    reason = 'LOCAL_ONLY_SOURCE_SELECTED';
  } else if (overrides.forceLiveDiscovery) {
    decision = 'RUN_EXTERNAL';
    reason = 'LIVE_DISCOVERY_FORCED';
  } else if (enoughCount && strongEnough) {
    decision = 'USE_LOCAL_ONLY';
    reason = 'LOCAL_COVERAGE_SUFFICIENT';
  } else if (enoughCoverage && strongEnough) {
    decision = 'USE_LOCAL_ONLY';
    reason = 'LOCAL_COVERAGE_ACCEPTABLE';
  } else if (!strongEnough && localCount > 0) {
    reason = 'WEAK_LOCAL_SCORE';
  }

  if (freshnessStatus === 'STALE') warnings.push('LOCAL_RESULTS_STALE');
  if (!strongEnough && localCount > 0) warnings.push('LOCAL_RESULTS_WEAK_SCORE');

  return {
    decision,
    reason,
    requestedLimit,
    localCount,
    averageLocalScore: avgScore,
    coverageRatio,
    minimumCoverageRatio: overrides.minLocalCoverageRatio,
    minimumAverageScore: overrides.minLocalAverageScore,
    enoughCount,
    enoughCoverage,
    strongEnough,
    freshnessStatus,
    selectedSignals: [...new Set([...selectedSources(campaign), ...selectedPresenceTargets(campaign)])],
    externalAllowed: decision === 'RUN_EXTERNAL',
    maxExternalResults: overrides.maxExternalResults,
    warnings,
    localOnly,
  };
};

export const shouldRunExternalDiscovery = ({ campaign, localResults = [] }) =>
  evaluateLocalCoverage({ campaign, localResults }).decision === 'RUN_EXTERNAL';

export const calculateMissingResultCount = ({ campaign, localResults = [] }) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const overrides = discoveryOverrides(campaign);
  if (overrides.forceLiveDiscovery && !overrides.disableLiveDiscovery && !localOnlySelected(campaign)) {
    return Math.max(
      1,
      Math.min(requestedLimit, overrides.maxExternalResults),
    );
  }
  return Math.max(0, Math.min(requestedLimit - localResults.length, overrides.maxExternalResults));
};

const resultKey = (result = {}) => [
  result.source,
  result.sourceId,
  result.id,
  result.instagramUsername,
  result.instagramUrl,
  result.websiteUrl,
  result.businessName,
  result.city,
].filter(Boolean).join('|').toLowerCase();

export const mergeLocalAndExternalResults = ({ campaign, localResults = [], externalResults = [] }) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const seen = new Set();
  const merged = [];

  for (const result of [...localResults, ...externalResults]) {
    const key = resultKey(result);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(result);
    if (merged.length >= requestedLimit) break;
  }

  return merged;
};
import { normalizeCampaignTargeting } from './sourceTargetMapping.service.js';
