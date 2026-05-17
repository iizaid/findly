import { describe, expect, it } from 'vitest';
import {
  buildDiscoveryPlan,
  mapTargetSourcesToDiscoveryMethods,
  normalizeSelectedSources,
} from '../../src/modules/search/sourceTargetMapping.service.js';

const mappingFor = (source) => mapTargetSourcesToDiscoveryMethods([source])[0];

describe('source target mapping', () => {
  it('normalizes selected sources without duplicates', () => {
    expect(normalizeSelectedSources([' instagram ', 'INSTAGRAM', 'google_maps'])).toEqual(['INSTAGRAM', 'GOOGLE_MAPS']);
  });

  it('maps social platforms to future SerpAPI discovery, not direct scraping adapters', () => {
    for (const source of ['INSTAGRAM', 'TIKTOK', 'FACEBOOK']) {
      const mapping = mappingFor(source);
      expect(mapping.targetSource).toBe(source);
      expect(mapping.discoveryMethod).toBe('SERPAPI_DISCOVERY');
      expect(mapping.adapter).toBe('SERPAPI');
      expect(mapping.runnable).toBe(false);
      expect(mapping.reason).toContain('Direct scraping is disabled');
    }
  });

  it('maps Google Maps to Google Places', () => {
    expect(mappingFor('GOOGLE_MAPS')).toMatchObject({
      targetSource: 'GOOGLE_MAPS',
      discoveryMethod: 'GOOGLE_PLACES',
      adapter: 'GOOGLE_MAPS',
      runnable: true,
    });
  });

  it('maps website as enrichment only', () => {
    expect(mappingFor('WEBSITE')).toMatchObject({
      targetSource: 'WEBSITE',
      discoveryMethod: 'WEBSITE_METADATA',
      adapter: 'WEBSITE',
      enrichmentOnly: true,
      runnable: false,
    });
  });

  it('maps local dataset and CSV safely', () => {
    expect(mappingFor('LOCAL_DATASET')).toMatchObject({
      targetSource: 'LOCAL_DATASET',
      discoveryMethod: 'LOCAL_DATASET',
      adapter: 'LOCAL_DATASET',
      runnable: true,
    });
    expect(mappingFor('CSV')).toMatchObject({
      targetSource: 'CSV',
      discoveryMethod: 'CSV_IMPORT',
      adapter: 'CSV',
      importOnly: true,
    });
  });

  it('handles unknown sources safely', () => {
    expect(mappingFor('UNKNOWN_SOURCE')).toMatchObject({
      discoveryMethod: 'UNSUPPORTED',
      runnable: false,
      unsupported: true,
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
        sources: ['INSTAGRAM', 'LOCAL_DATASET'],
      },
    });

    expect(plan.targetSources).toEqual(['INSTAGRAM', 'LOCAL_DATASET']);
    expect(plan.expandedQuery).toContain('Coffee Shop');
    expect(plan.geography).toBe('Amman, Jordan');
    expect(plan.disabledMappings).toHaveLength(1);
    expect(plan.runnableMappings).toHaveLength(1);
  });
});
