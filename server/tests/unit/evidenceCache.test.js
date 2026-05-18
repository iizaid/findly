import { describe, it, expect, vi } from 'vitest';
import {
  evaluateEvidenceReuseCoverage,
  shouldSkipPaidProvidersDueToEvidenceCache,
  convertEvidenceToReusableLeadCandidates,
  findReusableEvidenceCandidates,
} from '../../src/modules/search/evidenceCache.service.js';

vi.mock('../../src/db/prisma.js', () => ({
  prisma: {
    leadEvidence: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/db/prisma.js';

describe('Evidence Cache Brain', () => {
  const campaign = {
    requestedLimit: 20,
    city: 'Dubai',
    country: 'AE',
    businessTypes: ['Tech'],
  };

  it('converts evidence to lead candidates properly', () => {
    const evidence = {
      id: 'e1',
      title: 'Dubai Tech Hub',
      confidenceScore: 85,
      targetSource: 'GOOGLE_MAPS',
      sourceUrl: 'https://maps.google.com/xyz',
      extractedFields: {
        city: 'Dubai',
      },
    };

    const candidates = convertEvidenceToReusableLeadCandidates({ evidences: [evidence], campaign });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].businessName).toBe('Dubai Tech Hub');
    expect(candidates[0].isReusableEvidence).toBe(true);
    expect(candidates[0].googleMapsUrl).toBe('https://maps.google.com/xyz');
  });

  it('evaluates coverage ratio accurately', () => {
    const localResults = Array.from({ length: 5 }).map(() => ({ localDatasetScore: 80 }));
    const evidenceCandidates = Array.from({ length: 15 }).map(() => ({ catalogLeadId: 'xyz' }));

    const coverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates });
    
    expect(coverage.evidenceCount).toBe(15);
    expect(coverage.enoughEvidence).toBe(true);
    expect(coverage.coverageRatio).toBe(1);
  });

  it('decides to skip paid providers if local + evidence satisfies limit', () => {
    const localResults = Array.from({ length: 10 }).map(() => ({ localDatasetScore: 80 }));
    const evidenceCandidates = Array.from({ length: 10 }).map(() => ({ catalogLeadId: 'xyz' }));
    
    const shouldSkip = shouldSkipPaidProvidersDueToEvidenceCache({ campaign, localResults, evidenceCandidates });
    expect(shouldSkip).toBe(true);
  });

  it('decides NOT to skip paid providers if limit not satisfied', () => {
    const localResults = Array.from({ length: 5 }).map(() => ({ localDatasetScore: 80 }));
    const evidenceCandidates = Array.from({ length: 5 }).map(() => ({ catalogLeadId: 'xyz' }));
    
    const shouldSkip = shouldSkipPaidProvidersDueToEvidenceCache({ campaign, localResults, evidenceCandidates });
    expect(shouldSkip).toBe(false);
  });

  it('findReusableEvidenceCandidates uses correct filters for storeUntil', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([]);
    await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });
    
    const callArgs = prisma.leadEvidence.findMany.mock.calls[0][0];
    
    // Check storeUntil OR condition
    const storeUntilCondition = callArgs.where.AND.find(c => c.OR && c.OR.some(o => o.storeUntil === null));
    expect(storeUntilCondition).toBeDefined();
    
    // Check exact matches (city, country, businessTypes) are now strictly ANDed
    const exactMatchCityCondition = callArgs.where.AND.find(c => c.extractedFields?.path?.includes('city'));
    expect(exactMatchCityCondition).toBeDefined();
    const exactMatchCountryCondition = callArgs.where.AND.find(c => c.extractedFields?.path?.includes('country'));
    expect(exactMatchCountryCondition).toBeDefined();
  });
  
  it('filters out invalid evidence records', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([
      { id: '1', title: 'Valid Name', sourceUrl: 'http://valid.com', confidenceScore: 80 },
      { id: '2', title: '', sourceUrl: 'http://valid.com', confidenceScore: 80 }, // empty title
      { id: '3', title: 'Valid Name', sourceUrl: null, confidenceScore: 80 }, // no url
      { id: '4', title: 'Ab', sourceUrl: 'http://valid.com', confidenceScore: 80 }, // too short title
    ]);
    
    const results = await findReusableEvidenceCandidates({ campaign, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });
});
