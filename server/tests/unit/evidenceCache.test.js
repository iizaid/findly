import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evaluateEvidenceReuseCoverage,
  shouldSkipPaidProvidersDueToEvidenceCache,
  convertEvidenceToReusableLeadCandidates,
} from '../../src/modules/search/evidenceCache.service.js';

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
});
