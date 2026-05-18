import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  configs: {
    serper: { apiKey: 'dashboard-serper-key', source: 'dashboard' },
    serpapi: { apiKey: 'dashboard-serpapi-key', source: 'dashboard' },
    google_places: { apiKey: 'dashboard-google-key', source: 'dashboard' },
  },
  searchMetadata: {
    liveEnabled: true,
    legacySerpEnabled: true,
    primaryProvider: 'serper',
    primaryConfigured: true,
    fallbackProvider: 'serpapi',
    fallbackConfigured: true,
    availableProviders: ['serper', 'serpapi'],
    runnable: true,
    status: 'ready',
  },
}));

vi.mock('../../src/db/prisma.js', () => ({
  prisma: {
    leadCatalog: { count: vi.fn().mockResolvedValue(3) },
    discoveryQuery: { count: vi.fn().mockResolvedValue(2) },
    leadEvidence: { count: vi.fn().mockResolvedValue(4) },
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    LIVE_SERP_DISCOVERY_ENABLED: false,
    SERPER_API_KEY: '',
    SERPAPI_API_KEY: '',
  },
}));

vi.mock('../../src/modules/search/source.registry.js', () => ({
  getSourceStatusByKey: (key) => ({
    configured: false,
    available: key === 'GOOGLE_MAPS',
    status: 'mocked',
  }),
}));

vi.mock('../../src/modules/search/metadataProviders/searchMetadataProviderRegistry.js', () => ({
  getSearchMetadataProviderStatus: () => state.searchMetadata,
}));

vi.mock('../../src/modules/search/metadataProviders/searchMetadataProviderConfig.service.js', () => ({
  getResolvedDiscoveryProviderConfig: (provider) => state.configs[provider] || { apiKey: null, source: 'missing' },
}));

vi.mock('../../src/modules/search/discoveryProviderSecretsVault.service.js', () => ({
  DISCOVERY_PROVIDERS: {
    SERPER: 'serper',
    SERPAPI: 'serpapi',
    GOOGLE_PLACES: 'google_places',
  },
  isDiscoverySecretManagementConfigured: () => true,
  listDiscoveryProviderSecretStatuses: () => Promise.resolve([
    { provider: 'serper', fingerprint: 'fp-serper' },
    { provider: 'serpapi', fingerprint: 'fp-serpapi' },
    { provider: 'google_places', fingerprint: 'fp-google' },
  ]),
}));

describe('discovery readiness summary', () => {
  beforeEach(() => {
    state.configs.serper = { apiKey: 'dashboard-serper-key', source: 'dashboard' };
    state.configs.serpapi = { apiKey: 'dashboard-serpapi-key', source: 'dashboard' };
    state.configs.google_places = { apiKey: 'dashboard-google-key', source: 'dashboard' };
    state.searchMetadata.liveEnabled = true;
    state.searchMetadata.legacySerpEnabled = true;
  });

  it('uses resolved provider config for dashboard-managed provider status without exposing keys', async () => {
    const { getDiscoveryReadinessSummary } = await import('../../src/modules/search/discoveryReadiness.service.js');

    const readiness = await getDiscoveryReadinessSummary();
    const serialized = JSON.stringify(readiness);

    expect(readiness.sources.serper).toMatchObject({
      configured: true,
      source: 'dashboard',
      fingerprint: 'fp-serper',
      runnable: true,
      status: 'ready_cache_first',
    });
    expect(readiness.sources.serpApi).toMatchObject({
      configured: true,
      source: 'dashboard',
      fingerprint: 'fp-serpapi',
      runnable: true,
      status: 'ready_cache_first',
    });
    expect(readiness.sources.googlePlaces).toMatchObject({
      configured: true,
      source: 'dashboard',
      fingerprint: 'fp-google',
      runnable: true,
      status: 'ready',
    });
    expect(serialized).not.toContain('dashboard-serper-key');
    expect(serialized).not.toContain('dashboard-serpapi-key');
    expect(serialized).not.toContain('dashboard-google-key');
  });

  it('reports missing_or_disabled when resolved Serper config is missing even if live metadata is enabled', async () => {
    state.configs.serper = { apiKey: null, source: 'missing' };
    const { getDiscoveryReadinessSummary } = await import('../../src/modules/search/discoveryReadiness.service.js');

    const readiness = await getDiscoveryReadinessSummary();
    expect(readiness.sources.serper).toMatchObject({
      configured: false,
      source: 'missing',
      runnable: false,
      status: 'missing_or_disabled',
    });
  });
});
