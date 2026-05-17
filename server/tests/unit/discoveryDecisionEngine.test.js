import { describe, it, expect, vi } from 'vitest';
import { buildDiscoveryPlan } from '../../src/modules/search/discoveryDecisionEngine.service.js';

vi.mock('../../src/modules/search/campaignBudget.service.js', () => ({
  getCampaignBudget: () => ({
    maxDiscoveryCalls: 25,
    maxSerpQueries: 5,
    maxGooglePlacesQueries: 2,
    maxExternalResults: 20,
    maxEstimatedExternalCostMicrousd: 250000,
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

  it('decides to use local only if enough coverage exists', () => {
    const localResults = Array.from({ length: 20 }).map(() => ({ localDatasetScore: 80 }));
    const plan = buildDiscoveryPlan({ campaign, localResults, evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.googlePlacesPlan.shouldRun).toBe(false);
    expect(plan.missingCount).toBe(0);
  });

  it('runs paid APIs if missing results and no evidence', () => {
    const localResults = Array.from({ length: 5 }).map(() => ({ localDatasetScore: 80 }));
    const plan = buildDiscoveryPlan({ campaign, localResults, evidenceCandidates: [] });

    expect(plan.stageDecision).toBe('LIVE_DISCOVERY');
    expect(plan.runPaidSearchMetadata).toBe(true);
    expect(plan.googlePlacesPlan.shouldRun).toBe(true);
    expect(plan.missingCount).toBeGreaterThan(0);
  });

  it('skips paid APIs if evidence candidates fulfill the missing limit', () => {
    const localResults = Array.from({ length: 5 }).map(() => ({ localDatasetScore: 80 }));
    const evidenceCandidates = Array.from({ length: 15 }).map(() => ({ catalogLeadId: 'xyz' }));
    const plan = buildDiscoveryPlan({ campaign, localResults, evidenceCandidates });

    expect(plan.stageDecision).toBe('LOCAL_DATASET_ONLY');
    expect(plan.runPaidSearchMetadata).toBe(false);
    expect(plan.googlePlacesPlan.shouldRun).toBe(false);
    expect(plan.savedExternalCalls).toBe(15);
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
});
