import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  evaluateEvidenceReuseCoverage,
  shouldSkipPaidProvidersDueToEvidenceCache,
  convertEvidenceToReusableLeadCandidates,
  findReusableEvidenceCandidates,
  isSafeEvidenceUrl,
  matchesBusinessType,
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const evidence = (overrides = {}) => ({
    id: overrides.id || 'e1',
    title: overrides.title ?? 'Dubai Tech Hub',
    confidenceScore: overrides.confidenceScore ?? 85,
    targetSource: overrides.targetSource || 'INSTAGRAM',
    sourceUrl: overrides.sourceUrl ?? 'https://instagram.com/dubaitechhub',
    catalogLeadId: Object.prototype.hasOwnProperty.call(overrides, 'catalogLeadId')
      ? overrides.catalogLeadId
      : 'catalog-1',
    storeUntil: overrides.storeUntil,
    createdAt: overrides.createdAt || new Date('2026-05-01T00:00:00.000Z'),
    extractedFields: {
      businessName: overrides.businessName ?? 'Dubai Tech Hub',
      city: overrides.city ?? 'Dubai',
      country: overrides.country ?? 'AE',
      category: overrides.category ?? 'Tech',
      ...(overrides.extractedFields || {}),
    },
  });

  it('converts evidence to lead candidates without creating standalone ghost rows', () => {
    const candidates = convertEvidenceToReusableLeadCandidates({ evidences: [evidence()], campaign });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].businessName).toBe('Dubai Tech Hub');
    expect(candidates[0].isReusableEvidence).toBe(true);
    expect(candidates[0].catalogLeadId).toBe('catalog-1');
  });

  it('evaluates coverage using linked evidence only', () => {
    const localResults = Array.from({ length: 5 }).map(() => ({ localDatasetScore: 80 }));
    const linkedEvidence = Array.from({ length: 15 }).map((_, index) => ({ catalogLeadId: `catalog-${index}` }));
    const unlinkedEvidence = Array.from({ length: 10 }).map((_, index) => ({ id: `unlinked-${index}` }));

    const linkedCoverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates: linkedEvidence });
    const unlinkedCoverage = evaluateEvidenceReuseCoverage({ campaign, localResults, evidenceCandidates: unlinkedEvidence });

    expect(linkedCoverage.enoughEvidence).toBe(true);
    expect(linkedCoverage.reusableForLeadListCount).toBe(15);
    expect(unlinkedCoverage.enoughEvidence).toBe(false);
    expect(unlinkedCoverage.unlinkedEvidenceCount).toBe(10);
    expect(unlinkedCoverage.skippedReasons).toContain('UNLINKED_EVIDENCE_NOT_DIRECTLY_REUSABLE');
  });

  it('decides to skip paid providers only when local + linked evidence satisfies limit', () => {
    const localResults = Array.from({ length: 10 }).map(() => ({ localDatasetScore: 80 }));
    const linkedEvidence = Array.from({ length: 10 }).map((_, index) => ({ catalogLeadId: `catalog-${index}` }));
    const unlinkedEvidence = Array.from({ length: 10 }).map((_, index) => ({ id: `unlinked-${index}` }));

    expect(shouldSkipPaidProvidersDueToEvidenceCache({ campaign, localResults, evidenceCandidates: linkedEvidence })).toBe(true);
    expect(shouldSkipPaidProvidersDueToEvidenceCache({ campaign, localResults, evidenceCandidates: unlinkedEvidence })).toBe(false);
  });

  it('uses safe broad DB filters for confidence, target source, and storeUntil', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([]);
    await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });

    const callArgs = prisma.leadEvidence.findMany.mock.calls[0][0];
    const storeUntilCondition = callArgs.where.AND.find(c => c.OR && c.OR.some(o => o.storeUntil === null));
    const exactCityCondition = callArgs.where.AND.find(c => c.extractedFields?.path?.includes('city'));

    expect(storeUntilCondition).toBeDefined();
    expect(callArgs.where.AND).toContainEqual({ confidenceScore: { gte: 65 } });
    expect(callArgs.where.AND).toContainEqual({ targetSource: { in: ['INSTAGRAM'] } });
    expect(exactCityCondition).toBeUndefined();
  });

  it('reuses null or future storeUntil and skips expired evidence', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([
      evidence({ id: 'null-store', storeUntil: null }),
      evidence({ id: 'future-store', storeUntil: new Date('2099-01-01T00:00:00.000Z') }),
      evidence({ id: 'expired-store', storeUntil: new Date('2020-01-01T00:00:00.000Z') }),
    ]);

    const results = await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });
    expect(results.map((item) => item.id)).toEqual(['null-store', 'future-store']);
  });

  it('skips unsafe URLs and missing or short titles', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([
      evidence({ id: 'valid' }),
      evidence({ id: 'unsafe', sourceUrl: 'javascript:alert(1)' }),
      evidence({ id: 'data-url', sourceUrl: 'data:text/html,test' }),
      evidence({ id: 'blank-title', title: '', businessName: '' }),
      evidence({ id: 'short-title', title: 'AB', businessName: '' }),
    ]);

    const results = await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('valid');
  });

  it('skips clear city, country, and category mismatches', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([
      evidence({ id: 'valid' }),
      evidence({ id: 'wrong-city', city: 'Amman' }),
      evidence({ id: 'wrong-country', country: 'JO' }),
      evidence({ id: 'wrong-category', category: 'Restaurant' }),
    ]);

    const results = await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });
    expect(results.map((item) => item.id)).toEqual(['valid']);
  });

  it('does not reject missing category when source and geography still match', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([
      evidence({ id: 'missing-category', category: null, extractedFields: { category: null } }),
    ]);

    const results = await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('missing-category');
  });

  it('prioritizes linked catalog evidence before unlinked evidence', async () => {
    prisma.leadEvidence.findMany.mockResolvedValue([
      evidence({ id: 'unlinked-high', catalogLeadId: null, confidenceScore: 99 }),
      evidence({ id: 'linked-lower', catalogLeadId: 'catalog-2', confidenceScore: 70 }),
    ]);

    const results = await findReusableEvidenceCandidates({ campaign, targetSources: ['INSTAGRAM'], limit: 10 });
    expect(results.map((item) => item.id)).toEqual(['linked-lower', 'unlinked-high']);
  });

  it('exposes URL and category helpers for deterministic safety checks', () => {
    expect(isSafeEvidenceUrl('https://example.com')).toBe(true);
    expect(isSafeEvidenceUrl('ftp://example.com')).toBe(false);
    expect(matchesBusinessType(['coffee shop'], 'Coffee')).toBe(true);
    expect(matchesBusinessType(['Tech'], 'Restaurant')).toBe(false);
  });
});
