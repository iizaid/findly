import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4114';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let env;
let clearProviderCache;
let SerperProvider;
let SerpApiProvider;
let searchWithMetadataProviders;
let getSearchMetadataProviderStatus;
let evaluateProviderResultQuality;
let normalizeSerpResult;

beforeEach(async () => {
  vi.restoreAllMocks();
  global.fetch = vi.fn();
  ({ env } = await import('../../src/config/env.js'));
  ({ clearProviderCache } = await import('../../src/modules/search/providerCache.service.js'));
  ({ SerperProvider } = await import('../../src/modules/search/metadataProviders/serper.provider.js'));
  ({ SerpApiProvider } = await import('../../src/modules/search/metadataProviders/serpapi.provider.js'));
  ({
    searchWithMetadataProviders,
    getSearchMetadataProviderStatus,
    evaluateProviderResultQuality,
  } = await import('../../src/modules/search/metadataProviders/searchMetadataProviderRegistry.js'));
  ({ normalizeSerpResult } = await import('../../src/modules/search/serpResultNormalizer.service.js'));
  clearProviderCache();

  env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED = true;
  env.LIVE_SERP_DISCOVERY_ENABLED = false;
  env.SEARCH_METADATA_PROVIDER_PRIMARY = 'serper';
  env.SEARCH_METADATA_PROVIDER_FALLBACK = 'serpapi';
  env.SEARCH_METADATA_MIN_PROVIDER_RESULTS = 2;
  env.SEARCH_METADATA_MIN_AVERAGE_CONFIDENCE = 55;
  env.SERPER_API_KEY = 'test-serper-key';
  env.SERPAPI_API_KEY = 'test-serpapi-key';
  env.SERPER_BASE_URL = 'https://google.serper.dev/search';
  env.SERPAPI_BASE_URL = 'https://serpapi.com/search.json';
});

const campaign = {
  country: 'Jordan',
  city: 'Amman',
  businessTypes: ['coffee shops'],
  sources: ['INSTAGRAM'],
};

const normalize = ({ result }) => normalizeSerpResult({ result, targetSource: 'INSTAGRAM', campaign });

describe('search metadata providers', () => {
  it('selects Serper as primary and SerpAPI as fallback without exposing keys', () => {
    const status = getSearchMetadataProviderStatus();
    expect(status.primaryProvider).toBe('serper');
    expect(status.fallbackProvider).toBe('serpapi');
    expect(status.primaryConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toContain('test-serper-key');
    expect(JSON.stringify(status)).not.toContain('test-serpapi-key');
  });

  it('Serper sends POST and parses organic results into unified shape', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        organic: [{
          title: 'Example Cafe | Instagram',
          link: 'https://instagram.com/example_cafe',
          displayedLink: 'instagram.com/example_cafe',
          snippet: 'Coffee shops in Amman Jordan',
          position: 1,
        }],
      }),
    });

    const results = await SerperProvider.search({ query: 'site:instagram.com coffee Amman', campaign, limit: 5 });
    expect(global.fetch).toHaveBeenCalledWith('https://google.serper.dev/search', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('site:instagram.com coffee Amman'),
    }));
    expect(results[0]).toMatchObject({
      provider: 'SERPER',
      link: 'https://instagram.com/example_cafe',
      displayedLink: 'instagram.com/example_cafe',
    });
    expect(JSON.stringify(results)).not.toContain('test-serper-key');
  });

  it('SerpAPI parses organic_results into unified shape', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        organic_results: [{
          title: 'Example Cafe | Instagram',
          link: 'https://instagram.com/example_cafe',
          displayed_link: 'instagram.com/example_cafe',
          snippet: 'Coffee shops in Amman Jordan',
          position: 1,
        }],
      }),
    });

    const results = await SerpApiProvider.search({ query: 'site:instagram.com coffee Amman', campaign, limit: 5 });
    expect(global.fetch.mock.calls[0][0]).toContain('https://serpapi.com/search.json');
    expect(global.fetch.mock.calls[0][0]).toContain('q=site%3Ainstagram.com+coffee+Amman');
    expect(results[0]).toMatchObject({
      provider: 'SERPAPI',
      link: 'https://instagram.com/example_cafe',
      displayedLink: 'instagram.com/example_cafe',
    });
    expect(JSON.stringify(results)).not.toContain('test-serpapi-key');
  });

  it('good Serper results skip SerpAPI fallback', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        organic: [
          {
            title: 'Example Cafe | Instagram',
            link: 'https://instagram.com/example_cafe',
            snippet: 'Coffee shops in Amman Jordan',
            position: 1,
          },
          {
            title: 'Second Coffee | Instagram',
            link: 'https://instagram.com/second_coffee',
            snippet: 'Coffee shops in Amman Jordan',
            position: 2,
          },
        ],
      }),
    });

    const result = await searchWithMetadataProviders({
      queries: ['site:instagram.com coffee Amman'],
      campaign,
      limit: 5,
      requestedMissingCount: 2,
      normalizeResult: normalize,
    });

    expect(result.providerUsed).toBe('SERPER');
    expect(result.fallbackUsed).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('weak Serper results trigger SerpAPI fallback', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic: [{
            title: 'Unrelated page',
            link: 'https://example.com/unrelated',
            snippet: 'No useful location or category',
            position: 1,
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic_results: [
            {
              title: 'Fallback Cafe | Instagram',
              link: 'https://instagram.com/fallback_cafe',
              snippet: 'Coffee shops in Amman Jordan',
              position: 1,
            },
            {
              title: 'Fallback Roasters | Instagram',
              link: 'https://instagram.com/fallback_roasters',
              snippet: 'Coffee shops in Amman Jordan',
              position: 2,
            },
          ],
        }),
      });

    const result = await searchWithMetadataProviders({
      queries: ['site:instagram.com coffee Amman'],
      campaign,
      limit: 5,
      requestedMissingCount: 2,
      normalizeResult: normalize,
    });

    expect(result.providerUsed).toBe('SERPAPI');
    expect(result.fallbackUsed).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('legacy LIVE_SERP_DISCOVERY_ENABLED can run SerpAPI without new live flag', async () => {
    env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED = false;
    env.LIVE_SERP_DISCOVERY_ENABLED = true;

    const status = getSearchMetadataProviderStatus();
    expect(status.legacySerpEnabled).toBe(true);
    expect(status.runnable).toBe(true);
  });

  it('quality gate reports weak result sets', () => {
    const quality = evaluateProviderResultQuality({
      candidates: [{ sourceUrl: 'https://example.com', confidenceScore: 30 }],
      requestedMissingCount: 3,
    });
    expect(quality.passed).toBe(false);
    expect(quality.reason).toBe('QUALITY_GATE_FAILED');
  });
});
