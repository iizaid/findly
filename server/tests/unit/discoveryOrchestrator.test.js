import { describe, expect, it } from 'vitest';
import {
  buildQueryVariants,
  getDiscoveryReadinessForCampaign,
} from '../../src/modules/search/discoveryOrchestrator.service.js';

describe('discovery orchestrator helpers', () => {
  it('builds multiple query variants for richer discovery', () => {
    const variants = buildQueryVariants({
      businessTypes: ['Clinics'],
      city: 'Amman',
      country: 'Jordan',
      filters: { goal: 'Website Development' },
      presenceTargets: ['INSTAGRAM', 'FACEBOOK'],
    });

    expect(variants.length).toBeGreaterThan(3);
    expect(variants.some((item) => /instagram/i.test(item))).toBe(true);
    expect(variants.some((item) => /contact/i.test(item))).toBe(true);
    expect(variants.some((item) => /no website/i.test(item))).toBe(true);
  });

  it('reports provider readiness without exposing secrets', () => {
    const readiness = getDiscoveryReadinessForCampaign({
      sources: ['GOOGLE_MAPS', 'SERPAPI', 'WEBSITE'],
      filters: { presenceTargets: ['INSTAGRAM'] },
    });

    expect(readiness).toMatchObject({
      localDataset: { configured: true, available: true },
    });
    expect(readiness.searchMetadata).toHaveProperty('configured');
    expect(readiness.googlePlaces).toHaveProperty('configured');
    expect(readiness.targeting.presenceTargets).toContain('INSTAGRAM');
  });
});
