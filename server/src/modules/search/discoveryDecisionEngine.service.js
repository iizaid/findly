import { getCampaignBudget, estimateExternalCostMicrousd } from './campaignBudget.service.js';
import { evaluateLocalCoverage, calculateMissingResultCount } from './cacheFirstDiscovery.service.js';
import { evaluateEvidenceReuseCoverage } from './evidenceCache.service.js';
import { getPolicyWarningsForCampaign } from './sourceIntelligencePolicy.service.js';

export const DISCOVERY_DECISION_REASONS = Object.freeze({
  LOCAL_COVERAGE_SUFFICIENT: 'LOCAL_COVERAGE_SUFFICIENT',
  EVIDENCE_COVERAGE_SUFFICIENT: 'EVIDENCE_COVERAGE_SUFFICIENT',
  LIVE_DISCOVERY_DISABLED: 'LIVE_DISCOVERY_DISABLED',
  LOCAL_DATASET_ONLY: 'LOCAL_DATASET_ONLY',
  BUDGET_LIMIT: 'BUDGET_LIMIT',
  NO_SEARCH_METADATA_TARGETS: 'NO_SEARCH_METADATA_TARGETS',
  SEARCH_METADATA_NOT_CONFIGURED: 'SEARCH_METADATA_NOT_CONFIGURED',
  GOOGLE_PLACES_NOT_CONFIGURED: 'GOOGLE_PLACES_NOT_CONFIGURED',
  SMART_QUERY_BUDGET_ZERO: 'SMART_QUERY_BUDGET_ZERO',
  RUN_SEARCH_METADATA: 'RUN_SEARCH_METADATA',
  RUN_GOOGLE_PLACES: 'RUN_GOOGLE_PLACES',
  FORCE_LIVE_DISCOVERY: 'FORCE_LIVE_DISCOVERY',
  NO_MISSING_RESULTS: 'NO_MISSING_RESULTS',
});

const SEARCH_METADATA_TARGET_SOURCES = new Set([
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
  'X',
  'TRIPADVISOR',
  'YELP',
  'REDDIT',
  'SERPAPI',
]);

const unique = (values) => [...new Set(values.filter(Boolean))];

const getSources = (campaign) => Array.isArray(campaign?.sources) ? campaign.sources : [];

const selectedOnlyLocalDataset = (sources) => sources.length > 0
  && sources.every((source) => source === 'LOCAL_DATASET');

const providerSearchMetadataRunnable = (providerReadiness) => {
  if (!providerReadiness) return null;
  const readiness = providerReadiness.searchMetadata || providerReadiness.sources?.searchMetadata;
  if (!readiness) return null;
  return readiness.runnable === true || readiness.liveEnabled === true;
};

const providerGooglePlacesRunnable = (providerReadiness) => {
  if (!providerReadiness) return null;
  const readiness = providerReadiness.googlePlaces
    || providerReadiness.sources?.googlePlaces
    || providerReadiness.sources?.googleMaps;
  if (!readiness) return null;
  return readiness.runnable === true || readiness.configured === true;
};

const getReusableCoverageRatio = ({ campaign, localResults, evidenceCoverage }) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const reusableEvidenceCount = evidenceCoverage?.reusableForLeadListCount || 0;
  return Math.min(1, (localResults.length + reusableEvidenceCount) / requestedLimit);
};

export const calculateSmartQueryBudget = ({
  campaign,
  localResults = [],
  evidenceCoverage,
  budget,
  localCoverage,
}) => {
  const sources = getSources(campaign);
  const maxSerpQueries = Math.max(0, Number(budget?.maxSerpQueries) || 0);
  const forceLiveDiscovery = campaign?.filters?.discovery?.forceLiveDiscovery === true;
  const disableLiveDiscovery = campaign?.filters?.discovery?.disableLiveDiscovery === true;
  const reusableCoverageRatio = getReusableCoverageRatio({ campaign, localResults, evidenceCoverage });
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const reusableCount = localResults.length + (evidenceCoverage?.reusableForLeadListCount || 0);

  if (disableLiveDiscovery) {
    return { maxQueriesAllowed: 0, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.LIVE_DISCOVERY_DISABLED };
  }

  if (selectedOnlyLocalDataset(sources)) {
    return { maxQueriesAllowed: 0, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.LOCAL_DATASET_ONLY };
  }

  if (forceLiveDiscovery && maxSerpQueries === 0) {
    return { maxQueriesAllowed: 0, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.SMART_QUERY_BUDGET_ZERO };
  }

  if (forceLiveDiscovery) {
    return { maxQueriesAllowed: maxSerpQueries, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.FORCE_LIVE_DISCOVERY };
  }

  if (reusableCount >= requestedLimit) {
    return { maxQueriesAllowed: 0, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.NO_MISSING_RESULTS };
  }

  if (maxSerpQueries === 0) {
    return { maxQueriesAllowed: 0, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.SMART_QUERY_BUDGET_ZERO };
  }

  const minimumAverageScore = localCoverage?.minimumAverageScore || 60;
  const averageLocalScore = localCoverage?.averageLocalScore || 0;
  if (reusableCoverageRatio >= 0.7 && averageLocalScore >= minimumAverageScore) {
    return { maxQueriesAllowed: 0, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT };
  }

  if (reusableCoverageRatio >= 0.5) {
    return { maxQueriesAllowed: Math.min(2, maxSerpQueries), coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.RUN_SEARCH_METADATA };
  }

  if (reusableCoverageRatio >= 0.3) {
    return { maxQueriesAllowed: Math.min(3, maxSerpQueries), coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.RUN_SEARCH_METADATA };
  }

  return { maxQueriesAllowed: maxSerpQueries, coverageRatio: reusableCoverageRatio, reason: DISCOVERY_DECISION_REASONS.RUN_SEARCH_METADATA };
};

export const buildDiscoveryPlan = ({
  campaign,
  localResults = [],
  evidenceCandidates = [],
  providerReadiness = null,
}) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const budget = getCampaignBudget(campaign);
  const sources = getSources(campaign);
  const localCoverage = evaluateLocalCoverage({ campaign, localResults });
  const evidenceCoverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates });
  const sourcePolicyWarnings = getPolicyWarningsForCampaign(campaign);
  const missingFromLocal = calculateMissingResultCount({ campaign, localResults });
  const missingCount = Math.max(0, missingFromLocal - evidenceCoverage.reusableForLeadListCount);
  const searchMetadataRequested = sources.some((source) => SEARCH_METADATA_TARGET_SOURCES.has(source));
  const googlePlacesRequested = sources.includes('GOOGLE_MAPS');
  const forceLiveDiscovery = campaign?.filters?.discovery?.forceLiveDiscovery === true;
  const disableLiveDiscovery = campaign?.filters?.discovery?.disableLiveDiscovery === true;
  const skippedReasons = [];
  const allowedReasons = [];
  const warnings = [];

  const smartQueryBudget = calculateSmartQueryBudget({
    campaign,
    localResults,
    evidenceCoverage,
    budget,
    localCoverage,
  });

  let externalAllowed = localCoverage.decision === 'RUN_EXTERNAL' && missingCount > 0;
  if (forceLiveDiscovery && !disableLiveDiscovery && !selectedOnlyLocalDataset(sources)) {
    externalAllowed = true;
    allowedReasons.push(DISCOVERY_DECISION_REASONS.FORCE_LIVE_DISCOVERY);
  }

  if (disableLiveDiscovery) skippedReasons.push(DISCOVERY_DECISION_REASONS.LIVE_DISCOVERY_DISABLED);
  if (selectedOnlyLocalDataset(sources)) skippedReasons.push(DISCOVERY_DECISION_REASONS.LOCAL_DATASET_ONLY);
  if (!forceLiveDiscovery) {
    if (missingCount === 0 && localCoverage.enoughCount) skippedReasons.push(DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT);
    if (evidenceCoverage.enoughEvidence) skippedReasons.push(DISCOVERY_DECISION_REASONS.EVIDENCE_COVERAGE_SUFFICIENT);
    if (missingCount === 0) skippedReasons.push(DISCOVERY_DECISION_REASONS.NO_MISSING_RESULTS);
  }
  if (!externalAllowed && skippedReasons.length === 0) skippedReasons.push(DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT);

  const searchMetadataPlan = {
    enabled: searchMetadataRequested,
    primaryProvider: 'SERPER',
    fallbackProvider: 'SERPAPI',
    maxQueriesAllowed: 0,
    maxExternalResults: budget.maxExternalResults,
    fallbackAllowed: true,
    reason: searchMetadataRequested
      ? DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT
      : DISCOVERY_DECISION_REASONS.NO_SEARCH_METADATA_TARGETS,
    smartQueryBudget,
  };

  let runPaidSearchMetadata = false;
  if (!searchMetadataRequested) {
    skippedReasons.push(DISCOVERY_DECISION_REASONS.NO_SEARCH_METADATA_TARGETS);
  } else if (externalAllowed) {
    const readinessRunnable = providerSearchMetadataRunnable(providerReadiness);
    if (readinessRunnable === false) {
      searchMetadataPlan.reason = DISCOVERY_DECISION_REASONS.SEARCH_METADATA_NOT_CONFIGURED;
      skippedReasons.push(DISCOVERY_DECISION_REASONS.SEARCH_METADATA_NOT_CONFIGURED);
    } else if (smartQueryBudget.maxQueriesAllowed <= 0) {
      searchMetadataPlan.reason = smartQueryBudget.reason || DISCOVERY_DECISION_REASONS.SMART_QUERY_BUDGET_ZERO;
      skippedReasons.push(searchMetadataPlan.reason);
    } else {
      const estimatedSearchCost = estimateExternalCostMicrousd({
        discoveryMethod: 'SERPAPI_DISCOVERY',
        count: smartQueryBudget.maxQueriesAllowed,
      });

      if (estimatedSearchCost > budget.maxEstimatedExternalCostMicrousd) {
        searchMetadataPlan.reason = DISCOVERY_DECISION_REASONS.BUDGET_LIMIT;
        skippedReasons.push(DISCOVERY_DECISION_REASONS.BUDGET_LIMIT);
      } else {
        runPaidSearchMetadata = true;
        searchMetadataPlan.maxQueriesAllowed = smartQueryBudget.maxQueriesAllowed;
        searchMetadataPlan.reason = DISCOVERY_DECISION_REASONS.RUN_SEARCH_METADATA;
        allowedReasons.push(DISCOVERY_DECISION_REASONS.RUN_SEARCH_METADATA);
      }
    }
  } else {
    searchMetadataPlan.reason = evidenceCoverage.enoughEvidence
      ? DISCOVERY_DECISION_REASONS.EVIDENCE_COVERAGE_SUFFICIENT
      : (smartQueryBudget.reason || DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT);
  }

  const googlePlacesPlan = {
    enabled: googlePlacesRequested,
    shouldRun: false,
    maxQueriesAllowed: 0,
    reason: googlePlacesRequested
      ? DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT
      : 'Not requested',
  };

  if (googlePlacesRequested && externalAllowed) {
    const readinessRunnable = providerGooglePlacesRunnable(providerReadiness);
    if (readinessRunnable === false) {
      googlePlacesPlan.reason = DISCOVERY_DECISION_REASONS.GOOGLE_PLACES_NOT_CONFIGURED;
      skippedReasons.push(DISCOVERY_DECISION_REASONS.GOOGLE_PLACES_NOT_CONFIGURED);
    } else {
      const maxQueries = Math.min(Math.max(0, Number(budget.maxGooglePlacesQueries) || 0), 1);
      const estimatedGoogleCost = estimateExternalCostMicrousd({
        discoveryMethod: 'GOOGLE_PLACES',
        count: maxQueries,
      });

      if (maxQueries <= 0) {
        googlePlacesPlan.reason = DISCOVERY_DECISION_REASONS.SMART_QUERY_BUDGET_ZERO;
        skippedReasons.push(DISCOVERY_DECISION_REASONS.SMART_QUERY_BUDGET_ZERO);
      } else if (estimatedGoogleCost > budget.maxEstimatedExternalCostMicrousd) {
        googlePlacesPlan.reason = DISCOVERY_DECISION_REASONS.BUDGET_LIMIT;
        skippedReasons.push(DISCOVERY_DECISION_REASONS.BUDGET_LIMIT);
      } else {
        googlePlacesPlan.shouldRun = true;
        googlePlacesPlan.maxQueriesAllowed = maxQueries;
        googlePlacesPlan.reason = DISCOVERY_DECISION_REASONS.RUN_GOOGLE_PLACES;
        allowedReasons.push(DISCOVERY_DECISION_REASONS.RUN_GOOGLE_PLACES);
      }
    }
  } else if (googlePlacesRequested) {
    googlePlacesPlan.reason = evidenceCoverage.enoughEvidence
      ? DISCOVERY_DECISION_REASONS.EVIDENCE_COVERAGE_SUFFICIENT
      : (smartQueryBudget.reason || DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT);
  }

  const enrichmentPlan = {
    websiteMetadataAllowed: sources.includes('WEBSITE'),
    emailEnrichmentAllowed: false,
    reason: sources.includes('WEBSITE') ? 'Website metadata enrichment enabled' : 'Enrichment not active in this phase',
  };

  const stageDecision = (runPaidSearchMetadata || googlePlacesPlan.shouldRun)
    ? 'LIVE_DISCOVERY'
    : 'LOCAL_DATASET_ONLY';

  let estimatedCostMicrousd = 0;
  if (runPaidSearchMetadata) estimatedCostMicrousd += estimateExternalCostMicrousd({
    discoveryMethod: 'SERPAPI_DISCOVERY',
    count: searchMetadataPlan.maxQueriesAllowed,
  });
  if (googlePlacesPlan.shouldRun) estimatedCostMicrousd += estimateExternalCostMicrousd({
    discoveryMethod: 'GOOGLE_PLACES',
    count: googlePlacesPlan.maxQueriesAllowed,
  });

  if (evidenceCoverage.unlinkedEvidenceCount > 0) {
    warnings.push('UNLINKED_EVIDENCE_NOT_DIRECTLY_REUSABLE');
  }

  const finalSkippedReasons = unique(skippedReasons);
  const finalAllowedReasons = unique(allowedReasons);
  const primaryReason = finalAllowedReasons[0]
    || finalSkippedReasons[0]
    || DISCOVERY_DECISION_REASONS.LOCAL_COVERAGE_SUFFICIENT;

  return {
    stageDecision,
    decision: stageDecision,
    primaryReason,
    skippedReasons: finalSkippedReasons,
    allowedReasons: finalAllowedReasons,
    requestedLimit,
    externalAllowed,
    localCoverage: {
      requestedLimit,
      localCount: localResults.length,
      coverageRatio: localCoverage.coverageRatio,
      averageLocalScore: localCoverage.averageLocalScore,
      enoughLocalResults: localCoverage.enoughCount,
      decision: localCoverage.decision,
      reason: localCoverage.reason,
    },
    evidenceCoverage: {
      evidenceCount: evidenceCoverage.evidenceCount,
      linkedEvidenceCount: evidenceCoverage.linkedEvidenceCount,
      unlinkedEvidenceCount: evidenceCoverage.unlinkedEvidenceCount,
      reusableCatalogLeadCount: evidenceCoverage.reusableCatalogLeadCount,
      highConfidenceUnlinkedCount: evidenceCoverage.highConfidenceUnlinkedCount,
      reusableForLeadListCount: evidenceCoverage.reusableForLeadListCount,
      coverageRatio: evidenceCoverage.coverageRatio,
      enoughEvidence: evidenceCoverage.enoughEvidence,
      savedExternalCallsEstimate: evidenceCoverage.savedExternalCallsEstimate,
      skippedReasons: evidenceCoverage.skippedReasons,
      reason: evidenceCoverage.enoughEvidence ? 'EVIDENCE_SUFFICIENT' : 'EVIDENCE_PARTIAL',
    },
    missingCount,
    runPaidSearchMetadata,
    searchMetadataPlan,
    googlePlacesPlan,
    enrichmentPlan,
    estimatedCostMicrousd,
    expectedBenefitScore: missingCount > 0 ? Math.min(100, missingCount * 5) : 0,
    riskLevel: warnings.length > 0 ? 'MEDIUM' : 'LOW',
    warnings,
    riskWarnings: warnings,
    sourcePolicyWarnings,
    savedExternalCalls: evidenceCoverage.savedExternalCallsEstimate,
    smartQueryBudget,
    explanation: stageDecision === 'LIVE_DISCOVERY'
      ? `Proceeding with live discovery. Reason: ${primaryReason}.`
      : `Paid providers skipped. Reason: ${primaryReason}.`,
  };
};

export const shouldRunSearchMetadataProviders = (decision) => decision.runPaidSearchMetadata;

export const shouldRunGooglePlaces = (decision) => decision.googlePlacesPlan?.shouldRun;

export const shouldRunEnrichment = (decision) =>
  decision.enrichmentPlan?.websiteMetadataAllowed || decision.enrichmentPlan?.emailEnrichmentAllowed;

export const explainDiscoveryDecision = (decision) => decision.explanation || 'No explanation provided.';
