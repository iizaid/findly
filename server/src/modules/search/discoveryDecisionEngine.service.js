import { getCampaignBudget, estimateExternalCostMicrousd } from './campaignBudget.service.js';
import { evaluateLocalCoverage, calculateMissingResultCount } from './cacheFirstDiscovery.service.js';
import { evaluateEvidenceReuseCoverage } from './evidenceCache.service.js';
import { getPolicyWarningsForCampaign } from './sourceIntelligencePolicy.service.js';

/**
 * Source targets that are fulfilled via search metadata providers (Serper/SerpAPI).
 * When a campaign selects any of these, the decision engine enables paid search metadata.
 */
const SEARCH_METADATA_TARGET_SOURCES = new Set([
  'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'YOUTUBE',
  'X', 'TRIPADVISOR', 'YELP', 'REDDIT', 'SERPAPI',
]);

/**
 * Build the authoritative discovery plan for a campaign.
 *
 * This function delegates to evaluateLocalCoverage (which already handles
 * forceLiveDiscovery / disableLiveDiscovery / localOnly correctly) and layers
 * evidence-cache awareness and budget checks on top.
 */
export const buildDiscoveryPlan = ({ campaign, localResults = [], evidenceCandidates = [] }) => {
  const requestedLimit = Math.max(1, Number(campaign?.requestedLimit) || 20);
  const budget = getCampaignBudget(campaign);
  const sources = campaign?.sources || [];

  // ── Layer 1: Local coverage evaluation (uses cacheFirstDiscovery logic) ──
  const localCoverage = evaluateLocalCoverage({ campaign, localResults });

  // ── Layer 2: Evidence cache evaluation ──
  const evidenceCoverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates });

  // ── Layer 3: Policy warnings ──
  const sourcePolicyWarnings = getPolicyWarningsForCampaign(campaign);

  // Missing count respects forceLiveDiscovery via the cacheFirstDiscovery module
  const missingFromLocal = calculateMissingResultCount({ campaign, localResults });
  // If evidence fills the gap, reduce the missing count
  const missingCount = Math.max(0, missingFromLocal - evidenceCandidates.length);

  // ── Determine whether we should go external ──
  // We respect the cacheFirstDiscovery decision as the baseline.
  // If it says USE_LOCAL_ONLY and evidence also fills the gap → skip paid.
  // If it says RUN_EXTERNAL but evidence fills the gap → skip paid.
  let shouldGoExternal = localCoverage.decision === 'RUN_EXTERNAL' && missingCount > 0;

  const skippedReasons = [];
  const riskWarnings = [];

  // ── Search Metadata Plan ──
  const searchMetadataRequested = sources.some(s => SEARCH_METADATA_TARGET_SOURCES.has(s));

  const searchMetadataPlan = {
    enabled: false,
    primaryProvider: 'SERPER',
    fallbackProvider: 'SERPAPI',
    maxQueriesAllowed: 0,
    maxExternalResults: budget.maxExternalResults,
    fallbackAllowed: true,
    reason: 'Not requested',
  };

  let runPaidSearchMetadata = false;

  if (searchMetadataRequested && shouldGoExternal) {
    searchMetadataPlan.enabled = true;
    searchMetadataPlan.maxQueriesAllowed = budget.maxSerpQueries;

    // Budget guard: check estimated cost
    const estimatedSerpCost = estimateExternalCostMicrousd({
      discoveryMethod: 'SERPAPI_DISCOVERY',
      count: budget.maxSerpQueries,
    });

    if (estimatedSerpCost > budget.maxEstimatedExternalCostMicrousd) {
      searchMetadataPlan.reason = 'BUDGET_LIMIT';
      skippedReasons.push('BUDGET_LIMIT');
    } else if (budget.maxSerpQueries > 0) {
      runPaidSearchMetadata = true;
      searchMetadataPlan.reason = `Running paid search. Missing ${missingCount} results.`;
    } else {
      searchMetadataPlan.reason = 'maxSerpQueries is 0';
      skippedReasons.push(searchMetadataPlan.reason);
    }
  } else if (searchMetadataRequested && !shouldGoExternal) {
    searchMetadataPlan.enabled = true;
    searchMetadataPlan.reason = localCoverage.reason || 'Sufficient local/evidence coverage';
    skippedReasons.push(localCoverage.reason || 'LOCAL_COVERAGE_SUFFICIENT');
  }

  // ── Google Places Plan ──
  const googlePlacesRequested = sources.includes('GOOGLE_MAPS');

  const googlePlacesPlan = {
    enabled: false,
    shouldRun: false,
    maxQueriesAllowed: 0,
    reason: 'Not requested',
  };

  if (googlePlacesRequested && shouldGoExternal) {
    googlePlacesPlan.enabled = true;

    const estimatedGoogleCost = estimateExternalCostMicrousd({
      discoveryMethod: 'GOOGLE_PLACES',
      count: Math.min(budget.maxGooglePlacesQueries, 1),
    });

    if (estimatedGoogleCost > budget.maxEstimatedExternalCostMicrousd) {
      googlePlacesPlan.reason = 'BUDGET_LIMIT';
      if (!skippedReasons.includes('BUDGET_LIMIT')) skippedReasons.push('BUDGET_LIMIT');
    } else {
      googlePlacesPlan.shouldRun = true;
      googlePlacesPlan.maxQueriesAllowed = Math.min(budget.maxGooglePlacesQueries, 1);
      googlePlacesPlan.reason = `Running Google Places. Missing ${missingCount} results.`;
    }
  } else if (googlePlacesRequested && !shouldGoExternal) {
    googlePlacesPlan.enabled = true;
    googlePlacesPlan.reason = localCoverage.reason || 'Sufficient local/evidence coverage';
  }

  // ── Enrichment Plan ──
  const enrichmentPlan = {
    websiteMetadataAllowed: sources.includes('WEBSITE'),
    emailEnrichmentAllowed: false,
    reason: sources.includes('WEBSITE') ? 'Website metadata enrichment enabled' : 'Enrichment not active in this phase',
  };

  // ── Final stage decision ──
  const stageDecision = (runPaidSearchMetadata || googlePlacesPlan.shouldRun)
    ? 'LIVE_DISCOVERY'
    : 'LOCAL_DATASET_ONLY';

  // If local coverage said USE_LOCAL_ONLY, surface that reason
  if (stageDecision === 'LOCAL_DATASET_ONLY' && skippedReasons.length === 0) {
    skippedReasons.push(localCoverage.reason || 'LOCAL_COVERAGE_SUFFICIENT');
  }

  // ── Cost estimate ──
  let estimatedCostMicrousd = 0;
  if (runPaidSearchMetadata) estimatedCostMicrousd += searchMetadataPlan.maxQueriesAllowed * 1000;
  if (googlePlacesPlan.shouldRun) estimatedCostMicrousd += googlePlacesPlan.maxQueriesAllowed * 1500;

  return {
    stageDecision,
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
      reusableCatalogLeadCount: evidenceCoverage.reusableCatalogLeadCount,
      coverageRatio: evidenceCoverage.coverageRatio,
      enoughEvidence: evidenceCoverage.enoughEvidence,
      savedExternalCallsEstimate: evidenceCoverage.savedExternalCallsEstimate,
      reason: evidenceCoverage.enoughEvidence ? 'EVIDENCE_SUFFICIENT' : 'EVIDENCE_PARTIAL',
    },
    missingCount,
    runPaidSearchMetadata,
    searchMetadataPlan,
    googlePlacesPlan,
    enrichmentPlan,
    estimatedCostMicrousd,
    riskLevel: riskWarnings.length > 0 ? 'HIGH' : 'LOW',
    skippedReasons,
    riskWarnings,
    sourcePolicyWarnings,
    savedExternalCalls: evidenceCoverage.savedExternalCallsEstimate,
    explanation: stageDecision === 'LIVE_DISCOVERY'
      ? `Proceeding with live discovery to fill ${missingCount} missing results.`
      : `Sufficient results found locally or via evidence cache. Reason: ${skippedReasons[0] || 'unknown'}.`,
  };
};

export const shouldRunSearchMetadataProviders = (decision) => decision.runPaidSearchMetadata;

export const shouldRunGooglePlaces = (decision) => decision.googlePlacesPlan?.shouldRun;

export const shouldRunEnrichment = (decision) =>
  decision.enrichmentPlan?.websiteMetadataAllowed || decision.enrichmentPlan?.emailEnrichmentAllowed;

export const explainDiscoveryDecision = (decision) => decision.explanation || 'No explanation provided.';
