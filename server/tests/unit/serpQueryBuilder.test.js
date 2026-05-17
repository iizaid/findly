import { describe, expect, it } from 'vitest';
import { buildSerpQueriesForCampaign } from '../../src/modules/search/serpQueryBuilder.service.js';

const campaign = {
  businessTypes: ['Coffee Shops'],
  city: 'Amman',
  country: 'Jordan',
  filters: { budget: { maxSerpQueries: 5 } },
};

describe('Serp query builder', () => {
  it('builds focused platform queries', () => {
    expect(buildSerpQueriesForCampaign({ campaign, targetSources: ['INSTAGRAM'], missingResultCount: 5 })[0])
      .toContain('site:instagram.com');
    expect(buildSerpQueriesForCampaign({ campaign, targetSources: ['TIKTOK'], missingResultCount: 5 })[0])
      .toContain('site:tiktok.com');
    expect(buildSerpQueriesForCampaign({ campaign, targetSources: ['REDDIT'], missingResultCount: 5 })[0])
      .toContain('site:reddit.com');
    expect(buildSerpQueriesForCampaign({ campaign, targetSources: ['YELP'], missingResultCount: 5 })[0])
      .toContain('site:yelp.com');
    expect(buildSerpQueriesForCampaign({ campaign, targetSources: ['TRIPADVISOR'], missingResultCount: 5 })[0])
      .toContain('site:tripadvisor.com');
  });

  it('limits and deduplicates generated queries', () => {
    const queries = buildSerpQueriesForCampaign({
      campaign: { ...campaign, filters: { budget: { maxSerpQueries: 3 } } },
      targetSources: ['INSTAGRAM', 'INSTAGRAM', 'FACEBOOK'],
      missingResultCount: 20,
    });
    expect(queries).toHaveLength(3);
    expect(new Set(queries).size).toBe(3);
  });
});
