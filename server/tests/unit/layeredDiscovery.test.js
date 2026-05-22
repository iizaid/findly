import { describe, expect, it } from 'vitest';
import {
  buildLayeredDiscoveryReport,
  shouldUseLayeredDiscovery,
} from '../../src/modules/search/layeredDiscovery.service.js';

describe('layered discovery engine', () => {
  it('uses layered discovery for user-facing discovery campaigns', () => {
    expect(shouldUseLayeredDiscovery({
      sources: ['GOOGLE_MAPS', 'WEBSITE'],
      filters: { presenceTargets: ['INSTAGRAM'] },
    })).toBe(true);

    expect(shouldUseLayeredDiscovery({
      sources: ['UNSUPPORTED_PROVIDER'],
    })).toBe(false);
  });

  it('marks Google Places as skipped when it is selected but not configured', () => {
    const report = buildLayeredDiscoveryReport({
      campaign: {
        sources: ['GOOGLE_MAPS', 'WEBSITE'],
        filters: { presenceTargets: ['INSTAGRAM'] },
        requestedLimit: 10,
      },
      matchedLeads: [],
      evidenceCandidates: [],
      openWebEvidence: {
        openWebUsed: false,
        skippedReason: 'NO_ELIGIBLE_SEEDS',
        linkedCandidates: [],
        promotableCandidates: [],
        results: [],
        cacheHits: 0,
      },
      discoveryDecision: {
        searchMetadataPlan: { enabled: true, reason: 'SEARCH_METADATA_NOT_CONFIGURED' },
        googlePlacesPlan: { shouldRun: false, reason: 'GOOGLE_PLACES_NOT_CONFIGURED' },
        runPaidSearchMetadata: false,
      },
      externalDiscovery: {
        candidates: [],
        metadata: {
          searchMetadataProviderUsed: null,
          externalProvider: null,
          externalDiscoverySkippedReason: 'SEARCH_METADATA_NOT_CONFIGURED',
          searchMetadataFallbackUsed: false,
          externalCostEstimate: 0,
        },
      },
    });

    const googlePlaces = report.layerSummary.find((layer) => layer.layerKey === 'GOOGLE_PLACES');
    expect(googlePlaces.status).toBe('SKIPPED');
    expect(googlePlaces.reason).toMatch(/not configured/i);
  });

  it('completes search metadata as no-results instead of global failure when configured but empty', () => {
    const report = buildLayeredDiscoveryReport({
      campaign: {
        sources: ['SERPAPI'],
        requestedLimit: 5,
      },
      matchedLeads: [],
      evidenceCandidates: [],
      openWebEvidence: {
        openWebUsed: false,
        skippedReason: 'NO_ELIGIBLE_SEEDS',
        linkedCandidates: [],
        promotableCandidates: [],
        results: [],
        cacheHits: 0,
      },
      discoveryDecision: {
        searchMetadataPlan: { enabled: true, reason: 'RUN_SEARCH_METADATA' },
        googlePlacesPlan: { shouldRun: false, reason: 'Not requested' },
        runPaidSearchMetadata: true,
      },
      externalDiscovery: {
        candidates: [],
        metadata: {
          searchMetadataProviderUsed: 'SERPER',
          externalProvider: 'SERPER',
          externalDiscoverySkippedReason: 'SEARCH_METADATA_NO_RESULTS',
          searchMetadataFallbackUsed: false,
          externalCostEstimate: 1000,
        },
      },
    });

    const searchMetadata = report.layerSummary.find((layer) => layer.layerKey === 'SEARCH_METADATA');
    expect(searchMetadata.status).toBe('NO_RESULTS');
  });
});
