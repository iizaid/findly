import { describe, expect, it } from 'vitest';
import {
  buildDiscoveryPlan,
  mapTargetSourcesToDiscoveryMethods,
  normalizeCampaignTargeting,
  normalizePresenceTargets,
  normalizeSelectedSources,
} from '../../src/modules/search/sourceTargetMapping.service.js';

const mappingFor = (source) => mapTargetSourcesToDiscoveryMethods([source])[0];

describe('source target mapping', () => {
  it('normalizes selected sources without duplicates', () => {
    expect(normalizeSelectedSources([' instagram ', 'INSTAGRAM', 'google_maps'])).toEqual(['INSTAGRAM', 'GOOGLE_MAPS']);
  });

  it('normalizes presence targets without duplicates', () => {
    expect(normalizePresenceTargets([' instagram ', 'INSTAGRAM', 'google_maps', 'facebook'])).toEqual(['INSTAGRAM', 'FACEBOOK']);
  });

  it('maps social and directory platforms to unified search metadata targets', () => {
    for (const source of ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'REDDIT', 'YELP', 'TRIPADVISOR', 'LINKEDIN', 'YOUTUBE', 'X']) {
      const mapping = mappingFor(source);
      expect(mapping.targetSource).toBe(source);
      expect(mapping.discoveryMethod).toBe('SERPAPI_DISCOVERY');
      expect(mapping.adapter).toBe('SERPAPI');
      expect(mapping.runnable).toBe(false);
      expect(mapping.targetOnly).toBe(true);
      expect(mapping.directPlatformApi).toBe(false);
      expect(mapping.reason).toContain('Direct scraping');
    }
  });

  it('maps Google Maps to Google Places', () => {
    expect(mappingFor('GOOGLE_MAPS')).toMatchObject({
      targetSource: 'GOOGLE_MAPS',
      discoveryMethod: 'GOOGLE_PLACES',
      adapter: 'GOOGLE_MAPS',
      runnable: true,
      targetOnly: false,
      directPlatformApi: true,
    });
  });

  it('maps website as a discovery source without direct scraping', () => {
    expect(mappingFor('WEBSITE')).toMatchObject({
      targetSource: 'WEBSITE',
      discoveryMethod: 'WEBSITE_METADATA',
      adapter: 'WEBSITE',
      runnable: false,
      targetOnly: false,
      directPlatformApi: false,
    });
  });

  it('maps local dataset and CSV safely', () => {
    expect(mappingFor('LOCAL_DATASET')).toMatchObject({
      targetSource: 'LOCAL_DATASET',
      discoveryMethod: 'LOCAL_DATASET',
      adapter: 'LOCAL_DATASET',
      runnable: true,
      targetOnly: false,
      directPlatformApi: false,
    });
    expect(mappingFor('CSV')).toMatchObject({
      targetSource: 'CSV',
      discoveryMethod: 'CSV_IMPORT',
      adapter: 'CSV',
      importOnly: true,
      directPlatformApi: false,
    });
  });

  it('handles unknown sources safely', () => {
    expect(mappingFor('UNKNOWN_SOURCE')).toMatchObject({
      discoveryMethod: 'UNSUPPORTED',
      runnable: false,
      unsupported: true,
    });
  });

  it('splits discovery sources from presence targets with legacy compatibility', () => {
    expect(normalizeCampaignTargeting({
      sources: ['INSTAGRAM', 'GOOGLE_MAPS'],
      presenceTargets: ['FACEBOOK'],
      filters: { presenceTargets: ['YOUTUBE'] },
    })).toEqual({
      rawSources: ['INSTAGRAM', 'GOOGLE_MAPS'],
      discoverySources: ['GOOGLE_MAPS'],
      presenceTargets: ['FACEBOOK', 'YOUTUBE', 'INSTAGRAM'],
      legacyPresenceTargets: ['INSTAGRAM'],
    });
  });

  it('builds a campaign discovery plan without network calls', () => {
    const plan = buildDiscoveryPlan({
      campaign: {
        id: 'campaign-1',
        query: 'cafes',
        city: 'Amman',
        country: 'Jordan',
        businessTypes: ['Coffee Shop'],
        sources: ['GOOGLE_MAPS'],
        filters: { presenceTargets: ['INSTAGRAM'] },
      },
    });

    expect(plan.discoverySources).toEqual(['GOOGLE_MAPS']);
    expect(plan.presenceTargets).toEqual(['INSTAGRAM']);
    expect(plan.targetSources).toEqual(['GOOGLE_MAPS', 'INSTAGRAM']);
    expect(plan.expandedQuery).toContain('Coffee Shop');
    expect(plan.geography).toBe('Amman, Jordan');
    expect(plan.disabledMappings).toHaveLength(1);
    expect(plan.runnableMappings).toHaveLength(1);
  });
});
