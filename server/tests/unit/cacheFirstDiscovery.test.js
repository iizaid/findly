import { describe, expect, it } from 'vitest';
import {
  calculateMissingResultCount,
  evaluateLocalCoverage,
  mergeLocalAndExternalResults,
  shouldRunExternalDiscovery,
} from '../../src/modules/search/cacheFirstDiscovery.service.js';

const campaign = (overrides = {}) => ({
  requestedLimit: 20,
  sources: ['INSTAGRAM'],
  filters: {},
  ...overrides,
});

const results = (count, score = 75) => Array.from({ length: count }, (_, index) => ({
  id: `lead-${index}`,
  businessName: `Lead ${index}`,
  city: 'Amman',
  localDatasetScore: score,
}));

describe('cache-first discovery decisions', () => {
  it('skips external discovery when local coverage is enough', () => {
    const coverage = evaluateLocalCoverage({ campaign: campaign(), localResults: results(20, 75) });
    expect(coverage.decision).toBe('USE_LOCAL_ONLY');
    expect(coverage.reason).toBe('LOCAL_COVERAGE_SUFFICIENT');
    expect(shouldRunExternalDiscovery({ campaign: campaign(), localResults: results(20, 75) })).toBe(false);
  });

  it('runs external discovery when local coverage is weak', () => {
    const coverage = evaluateLocalCoverage({ campaign: campaign(), localResults: results(6, 75) });
    expect(coverage.decision).toBe('RUN_EXTERNAL');
    expect(calculateMissingResultCount({ campaign: campaign(), localResults: results(6, 75) })).toBe(14);
  });

  it('does not run external discovery for local-only campaigns', () => {
    const coverage = evaluateLocalCoverage({
      campaign: campaign({ sources: ['LOCAL_DATASET'] }),
      localResults: results(0),
    });
    expect(coverage.decision).toBe('USE_LOCAL_ONLY');
    expect(coverage.reason).toBe('LOCAL_ONLY_SOURCE_SELECTED');
  });

  it('honors force and disable discovery overrides', () => {
    expect(evaluateLocalCoverage({
      campaign: campaign({ filters: { discovery: { forceLiveDiscovery: true } } }),
      localResults: results(16, 80),
    }).decision).toBe('RUN_EXTERNAL');

    expect(evaluateLocalCoverage({
      campaign: campaign({ filters: { discovery: { disableLiveDiscovery: true } } }),
      localResults: results(1, 80),
    }).decision).toBe('USE_LOCAL_ONLY');
  });

  it('deduplicates merged local and external results', () => {
    const merged = mergeLocalAndExternalResults({
      campaign: campaign({ requestedLimit: 3 }),
      localResults: [{ id: '1', businessName: 'A', city: 'Amman' }],
      externalResults: [
        { id: '1', businessName: 'A', city: 'Amman' },
        { id: '2', businessName: 'B', city: 'Amman' },
      ],
    });
    expect(merged).toHaveLength(2);
  });
});
