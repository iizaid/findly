import { describe, it, expect, vi } from 'vitest';
import {
  buildDiscoveryPlan,
  calculateSmartQueryBudget,
  DISCOVERY_DECISION_REASONS,
} from '../../src/modules/search/discoveryDecisionEngine.service.js';

vi.mock('../../src/modules/search/campaignBudget.service.js', () => ({
  getCampaignBudget: (campaign) => ({
    maxDiscoveryCalls: 25,
    maxSerpQueries: campaign?.filters?.budget?.maxSerpQueries ?? 5,
    maxGooglePlacesQueries: campaign?.filters?.budget?.maxGooglePlacesQueries ?? 2,
    maxExternalResults: 20,
    maxEstimatedExternalCostMicrousd: campaign?.filters?.budget?.maxEstimatedExternalCostMicrousd ?? 250000,
  }),
  estimateExternalCostMicrousd: ({ discoveryMethod, count }) => {
    const costs = { SERPAPI_DISCOVERY: 1000, GOOGLE_PLACES: 1500 };
    return (costs[discoveryMethod] || 5000) * (count || 1);
  },
}));

describe('Discovery Decision Engine', () => {
  const campaign = {
    requestedLimit: 20,
    city: 'Dubai',
    sources: ['INSTAGRAM', 'GOOGLE_MAPS'],
    filters: {},
  };

  const locals = (count, score = 80) => Array.from({ length: count }).map(() => ({ localDatasetScore: score }));
  const linkedEvidence = (count) => Array.from({ length: count }).map((_, index) => ({ catalogLeadId: `catalog-${index}` }));
  const unlinkedEvidence = (count) => Array.from({ length: count }).map((_, index) => ({ id: `unlinked-${index}` }));

  it('decides to use local only if enough coverage exists', () => {
    const plan = buildDiscoveryPlan({ campaign, localResults: locals(20), evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.googlePlacesPlan.shouldRun).toBe(false);
    expect(plan.missingCount).toBe(0);
  });

  it('runs paid APIs if missing results and no evidence', () => {
    const plan = buildDiscoveryPlan({ campaign, localResults: locals(5), evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LIVE_DISCOVERY');
    expect(plan.runPaidSearchMetadata).toBe(true);
    expect(plan.googlePlacesPlan.shouldRun).toBe(true);
    expect(plan.primaryReason).toBe(DISCOVERY_DECISION_REASONS.RUN_SEARCH_METADATA);
    expect(plan.missingCount).toBeGreaterThan(0);
  });

  it('skips paid APIs if linked evidence candidates fulfill the missing limit', () => {
    const plan = buildDiscoveryPlan({ campaign, localResults: locals(5), evidenceCandidates: linkedEvidence(15) });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.googlePlacesPlan.shouldRun).toBe(false);
    expect(plan.savedExternalCalls).toBe(15);
    expect(plan.skippedReasons).toContain(DISCOVERY_DECISION_REASONS.EVIDENCE_COVERAGE_SUFFICIENT);
  });

  it('does not count unlinked evidence as reusable coverage', () => {
    const plan = buildDiscoveryPlan({ campaign, localResults: locals(5), evidenceCandidates: unlinkedEvidence(15) });

    expect(plan.stageDecision).toBe('LIVE_DISCOVERY');
    expect(plan.runPaidSearchMetadata).toBe(true);
    expect(plan.evidenceCoverage.unlinkedEvidenceCount).toBe(15);
    expect(plan.evidenceCoverage.reusableForLeadListCount).toBe(0);
    expect(plan.warnings).toContain('UNLINKED_EVIDENCE_NOT_DIRECTLY_REUSABLE');
  });

  it('generates source policy warnings for risky sources', () => {
    const riskyCampaign = { ...campaign, sources: ['SPIDERFOOT'] };
    const plan = buildDiscoveryPlan({ campaign: riskyCampaign, localResults: [], evidenceCandidates: [] });

    expect(plan.sourcePolicyWarnings.length).toBeGreaterThan(0);
    expect(plan.sourcePolicyWarnings[0]).toContain('live user campaigns');
  });

  it('generates correct enrichment plans', () => {
    const enrichCampaign = { ...campaign, sources: ['WEBSITE'] };
    const plan = buildDiscoveryPlan({ campaign: enrichCampaign, localResults: [], evidenceCandidates: [] });

    expect(plan.enrichmentPlan.websiteMetadataAllowed).toBe(true);
  });

  it('uses smart query budget thresholds', () => {
    const budget = { maxSerpQueries: 5 };
    const localCoverage = { averageLocalScore: 80, minimumAverageScore: 60 };

    expect(calculateSmartQueryBudget({
      campaign,
      localResults: locals(14),
      evidenceCoverage: { reusableForLeadListCount: 0 },
      budget,
      localCoverage,
    }).maxQueriesAllowed).toBe(0);

    expect(calculateSmartQueryBudget({
      campaign,
      localResults: locals(12),
      evidenceCoverage: { reusableForLeadListCount: 0 },
      budget,
      localCoverage,
    }).maxQueriesAllowed).toBe(2);

    expect(calculateSmartQueryBudget({
      campaign,
      localResults: locals(8),
      evidenceCoverage: { reusableForLeadListCount: 0 },
      budget,
      localCoverage,
    }).maxQueriesAllowed).toBe(3);

    expect(calculateSmartQueryBudget({
      campaign,
      localResults: locals(2),
      evidenceCoverage: { reusableForLeadListCount: 0 },
      budget,
      localCoverage,
    }).maxQueriesAllowed).toBe(5);
  });

  it('disableLiveDiscovery always skips providers', () => {
    const disabledCampaign = { ...campaign, filters: { discovery: { disableLiveDiscovery: true } } };
    const plan = buildDiscoveryPlan({ campaign: disabledCampaign, localResults: locals(0), evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.skippedReasons).toContain(DISCOVERY_DECISION_REASONS.LIVE_DISCOVERY_DISABLED);
  });

  it('forceLiveDiscovery still respects budget and smart query limits', () => {
    const forcedCampaign = {
      ...campaign,
      sources: ['INSTAGRAM'],
      filters: {
        discovery: { forceLiveDiscovery: true },
        budget: { maxSerpQueries: 0 },
      },
    };
    const plan = buildDiscoveryPlan({ campaign: forcedCampaign, localResults: locals(20), evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.searchMetadataPlan.reason).toBe(DISCOVERY_DECISION_REASONS.SMART_QUERY_BUDGET_ZERO);
  });

  it('providerReadiness can block search metadata and Google Places', () => {
    const plan = buildDiscoveryPlan({
      campaign,
      localResults: locals(0),
      evidenceCandidates: [],
      providerReadiness: {
        searchMetadata: { runnable: false },
        googlePlaces: { runnable: false },
      },
    });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.searchMetadataPlan.reason).toBe(DISCOVERY_DECISION_REASONS.SEARCH_METADATA_NOT_CONFIGURED);
    expect(plan.googlePlacesPlan.reason).toBe(DISCOVERY_DECISION_REASONS.GOOGLE_PLACES_NOT_CONFIGURED);
  });

  it('local-only source skips external discovery', () => {
    const localOnlyCampaign = { ...campaign, sources: ['LOCAL_DATASET'] };
    const plan = buildDiscoveryPlan({ campaign: localOnlyCampaign, localResults: locals(0), evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.skippedReasons).toContain(DISCOVERY_DECISION_REASONS.LOCAL_DATASET_ONLY);
    expect(plan.searchMetadataPlan.reason).toBe(DISCOVERY_DECISION_REASONS.NO_SEARCH_METADATA_TARGETS);
  });
});
