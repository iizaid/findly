import { describe, expect, it } from 'vitest';
import { assessLeadCandidateQuality } from '../../src/modules/search/leadQuality.service.js';

describe('lead quality gate', () => {
  it('does not accept a generic search result title without business evidence', () => {
    const result = assessLeadCandidateQuality({
      candidate: {
        businessName: 'Best Cafes in Amman',
        city: 'Amman',
        country: 'Jordan',
        sourceUrl: 'https://www.google.com/search?q=best+cafes+amman',
      },
      campaign: {
        city: 'Amman',
        country: 'Jordan',
      },
      sourceKind: 'external',
    });

    expect(result.accepted).toBe(false);
    expect(result.code).toBe('REJECTED_MISSING_BUSINESS_EVIDENCE');
  });
});
