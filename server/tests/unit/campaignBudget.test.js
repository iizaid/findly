import { describe, expect, it } from 'vitest';
import {
  assertAiAnalysisBudget,
  assertDiscoveryBudget,
  assertEnrichmentBudget,
  estimateExternalCostMicrousd,
  getCampaignBudget,
} from '../../src/modules/search/campaignBudget.service.js';

describe('campaign budget guardrails', () => {
  it('returns safe defaults for older campaigns without budget filters', () => {
    expect(getCampaignBudget({ filters: null })).toMatchObject({
      maxDiscoveryCalls: 25,
      maxEnrichmentCalls: 50,
      maxAiAnalyses: 100,
    });
  });

  it('estimates external costs by discovery method', () => {
    expect(estimateExternalCostMicrousd({ discoveryMethod: 'LOCAL_DATASET', count: 10 })).toBe(0);
    expect(estimateExternalCostMicrousd({ discoveryMethod: 'GOOGLE_PLACES', count: 2 })).toBe(3000);
    expect(estimateExternalCostMicrousd({ discoveryMethod: 'SERPAPI_DISCOVERY', count: 3 })).toBe(3000);
  });

  it('enforces discovery call and cost limits', () => {
    const campaign = {
      filters: {
        budget: {
          maxDiscoveryCalls: 1,
          maxEstimatedExternalCostMicrousd: 1000,
        },
      },
    };

    expect(() => assertDiscoveryBudget({ campaign, plannedDiscoveryCalls: 2, discoveryMethod: 'LOCAL_DATASET' }))
      .toThrow('Discovery calls exceeds this campaign budget.');
    expect(() => assertDiscoveryBudget({ campaign, plannedDiscoveryCalls: 1, discoveryMethod: 'GOOGLE_PLACES' }))
      .toThrow('Estimated external discovery cost exceeds this campaign budget.');
  });

  it('enforces enrichment and AI analysis limits', () => {
    const campaign = {
      filters: {
        budget: {
          maxEnrichmentCalls: 1,
          maxAiAnalyses: 2,
        },
      },
    };

    expect(() => assertEnrichmentBudget({ campaign, plannedEnrichmentCalls: 2 })).toThrow('Enrichment calls');
    expect(() => assertAiAnalysisBudget({ campaign, plannedAiAnalyses: 3 })).toThrow('AI analyses');
  });
});
