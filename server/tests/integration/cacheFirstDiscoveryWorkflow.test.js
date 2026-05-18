import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4114';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.LIVE_SERP_DISCOVERY_ENABLED = 'true';
process.env.SERPAPI_API_KEY = 'test-serp-key';

let prisma;
let runCampaign;
let env;
let clearProviderCache;
let userId;
let workspaceId;
const unique = Date.now().toString(36);

const createCampaign = (data = {}) => prisma.searchCampaign.create({
  data: {
    userId,
    workspaceId,
    name: `Cache-first ${unique}`,
    query: `phase4 ${unique}`,
    country: 'Narnia',
    city: `Cache City ${unique}`,
    businessTypes: [`Phase4 Cafes ${unique}`],
    sources: ['INSTAGRAM'],
    requestedLimit: 2,
    status: 'DRAFT',
    filters: { goal: 'General opportunity discovery' },
    ...data,
  },
});

beforeAll(async () => {
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ runCampaign } = await import('../../src/modules/search/search.service.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ clearProviderCache } = await import('../../src/modules/search/providerCache.service.js'));
  env.LIVE_SERP_DISCOVERY_ENABLED = true;
  env.SERPAPI_API_KEY = 'test-serp-key';
  env.SERPAPI_BASE_URL = 'https://serpapi.com/search.json';
  env.SERPER_API_KEY = 'test-serper-key';
  env.SERPER_BASE_URL = 'https://google.serper.dev/search';

  const user = await prisma.user.create({
    data: {
      name: 'Cache First Test',
      email: `cache.first.${unique}@findly.local`,
      passwordHash: 'hashed-password',
      emailVerified: true,
      creditsBalance: 500,
    },
  });
  userId = user.id;

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: userId,
      name: 'Cache First Workspace',
    },
  });
  workspaceId = workspace.id;
});

beforeEach(() => {
  vi.restoreAllMocks();
  clearProviderCache();
  env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED = false;
  env.LIVE_SERP_DISCOVERY_ENABLED = true;
  env.SEARCH_METADATA_PROVIDER_PRIMARY = 'serper';
  env.SEARCH_METADATA_PROVIDER_FALLBACK = 'serpapi';
  env.SEARCH_METADATA_MIN_PROVIDER_RESULTS = 1;
  env.SEARCH_METADATA_MIN_AVERAGE_CONFIDENCE = 55;
  env.SERPER_API_KEY = 'test-serper-key';
  env.SERPAPI_API_KEY = 'test-serp-key';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.leadCatalog.deleteMany({
    where: {
      OR: [
        { sourceId: { contains: unique } },
        { businessName: { contains: unique } },
        { normalizedFingerprint: { contains: unique } },
      ],
    },
  }).catch(() => {});
  await prisma.$disconnect();
});

describe('cache-first live discovery workflow', () => {
  it('does not call SerpAPI when local results are enough', async () => {
    global.fetch = vi.fn();
    await prisma.leadCatalog.createMany({
      data: [0, 1].map((index) => ({
        businessName: `Local Phase4 Cafe ${index} ${unique}`,
        category: `Phase4 Cafes ${unique}`,
        country: 'LocalLand',
        city: `Cache City ${unique}`,
        source: 'LOCAL_DATASET',
        sourceId: `local-phase4-${index}-${unique}`,
        normalizedFingerprint: `local-phase4-${index}-${unique}`,
        instagramUrl: `https://instagram.com/local_phase4_${index}_${unique}`,
        detectedSignals: ['HAS_INSTAGRAM'],
      })),
    });

    const campaign = await createCampaign({
      country: 'LocalLand',
      requestedLimit: 2,
      filters: { goal: 'General opportunity discovery' },
    });

    const result = await runCampaign(campaign.id, userId);
    expect(result.resultCount).toBe(2);
    expect(result.externalDiscoveryUsed).toBe(false);
    expect(result.externalDiscoverySkippedReason).toMatch(/LOCAL_COVERAGE/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses mocked SerpAPI when local coverage is insufficient and live discovery is enabled', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organic_results: [
          {
            title: `External Phase4 Cafe ${unique} | Instagram`,
            link: `https://instagram.com/external_phase4_${unique}`,
            displayed_link: `instagram.com/external_phase4_${unique}`,
            snippet: `External Phase4 Cafes ${unique} in External City ${unique}, ExternalLand`,
            position: 1,
          },
        ],
      }),
    });

    const campaign = await createCampaign({
      country: 'ExternalLand',
      city: `External City ${unique}`,
      businessTypes: [`External Phase4 Cafes ${unique}`],
      requestedLimit: 1,
      filters: {
        goal: 'General opportunity discovery',
        discovery: { forceLiveDiscovery: true },
        budget: { maxSerpQueries: 1, maxEstimatedExternalCostMicrousd: 50000 },
      },
    });

    const result = await runCampaign(campaign.id, userId);
    expect(result.externalDiscoveryUsed).toBe(true);
    expect(result.externalProvider).toBe('SERPAPI');
    expect(result.evidenceCreatedCount).toBeGreaterThanOrEqual(1);
    expect(result.promotedToCatalogCount).toBeGreaterThanOrEqual(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const promoted = await prisma.leadCatalog.findFirst({
      where: { source: 'SERPAPI', instagramUsername: `external_phase4_${unique}` },
    });
    expect(promoted).toBeTruthy();
  });

  it('uses Serper as primary search metadata provider when enabled', async () => {
    env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED = true;
    env.LIVE_SERP_DISCOVERY_ENABLED = false;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organic: [
          {
            title: `Serper Phase4 Cafe ${unique} | Instagram`,
            link: `https://instagram.com/serper_phase4_${unique}`,
            displayedLink: `instagram.com/serper_phase4_${unique}`,
            snippet: `External Phase4 Cafes ${unique} in Serper City ${unique}, SerperLand`,
            position: 1,
          },
        ],
      }),
    });

    const campaign = await createCampaign({
      country: 'SerperLand',
      city: `Serper City ${unique}`,
      businessTypes: [`External Phase4 Cafes ${unique}`],
      requestedLimit: 1,
      filters: {
        goal: 'General opportunity discovery',
        discovery: { forceLiveDiscovery: true },
        budget: { maxSerpQueries: 1, maxEstimatedExternalCostMicrousd: 50000 },
      },
    });

    const result = await runCampaign(campaign.id, userId);
    expect(result.externalDiscoveryUsed).toBe(true);
    expect(result.searchMetadataProviderUsed).toBe('SERPER');
    expect(result.searchMetadataFallbackUsed).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://google.serper.dev/search');
  });

  it('falls back to SerpAPI when Serper results are weak', async () => {
    env.LIVE_SEARCH_METADATA_DISCOVERY_ENABLED = true;
    env.LIVE_SERP_DISCOVERY_ENABLED = false;
    env.SEARCH_METADATA_MIN_PROVIDER_RESULTS = 2;
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic: [{
            title: 'Weak unrelated result',
            link: `https://example.com/weak-${unique}`,
            snippet: 'No location or category match',
            position: 1,
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic_results: [
            {
              title: `Fallback Phase4 Cafe ${unique} | Instagram`,
              link: `https://instagram.com/fallback_phase4_${unique}`,
              displayed_link: `instagram.com/fallback_phase4_${unique}`,
              snippet: `External Phase4 Cafes ${unique} in Fallback City ${unique}, FallbackLand`,
              position: 1,
            },
            {
              title: `Fallback Roasters ${unique} | Instagram`,
              link: `https://instagram.com/fallback_roasters_${unique}`,
              displayed_link: `instagram.com/fallback_roasters_${unique}`,
              snippet: `External Phase4 Cafes ${unique} in Fallback City ${unique}, FallbackLand`,
              position: 2,
            },
          ],
        }),
      });

    const campaign = await createCampaign({
      country: 'FallbackLand',
      city: `Fallback City ${unique}`,
      businessTypes: [`External Phase4 Cafes ${unique}`],
      requestedLimit: 2,
      filters: {
        goal: 'General opportunity discovery',
        discovery: { forceLiveDiscovery: true },
        budget: { maxSerpQueries: 1, maxEstimatedExternalCostMicrousd: 50000 },
      },
    });

    const result = await runCampaign(campaign.id, userId);
    expect(result.externalDiscoveryUsed).toBe(true);
    expect(result.searchMetadataProviderUsed).toBe('SERPAPI');
    expect(result.searchMetadataFallbackUsed).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns local results without SerpAPI when budget blocks external discovery', async () => {
    global.fetch = vi.fn();
    const campaign = await createCampaign({
      country: 'BudgetLand',
      city: `Budget City ${unique}`,
      businessTypes: [`Budget Phase4 Cafes ${unique}`],
      requestedLimit: 1,
      filters: {
        goal: 'General opportunity discovery',
        discovery: { forceLiveDiscovery: true },
        budget: { maxSerpQueries: 1, maxEstimatedExternalCostMicrousd: 0 },
      },
    });

    const result = await runCampaign(campaign.id, userId);
    expect(result.externalDiscoveryUsed).toBe(false);
    expect(result.externalDiscoverySkippedReason).toBe('BUDGET_LIMIT');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not create ghost lead list rows from unlinked evidence cache entries', async () => {
    global.fetch = vi.fn();
    await prisma.leadEvidence.create({
      data: {
        userId,
        workspaceId,
        targetSource: 'REDDIT',
        discoveryMethod: 'SERPAPI_DISCOVERY',
        sourceType: 'SERPAPI_ORGANIC_RESULT',
        sourceUrl: `https://reddit.com/r/findly/comments/unlinked_phase4_${unique}`,
        title: `Unlinked Phase4 Cafe ${unique}`,
        extractedFields: {
          businessName: `Unlinked Phase4 Cafe ${unique}`,
          city: `Unlinked City ${unique}`,
          country: 'UnlinkedLand',
          category: `Unlinked Phase4 Cafes ${unique}`,
        },
        confidenceScore: 90,
        storeUntil: null,
      },
    });

    const campaign = await createCampaign({
      country: 'UnlinkedLand',
      city: `Unlinked City ${unique}`,
      businessTypes: [`Unlinked Phase4 Cafes ${unique}`],
      sources: ['REDDIT'],
      requestedLimit: 5,
      filters: {
        goal: 'General opportunity discovery',
        discovery: { disableLiveDiscovery: true },
      },
    });

    const result = await runCampaign(campaign.id, userId);
    expect(result.externalDiscoveryUsed).toBe(false);

    const leadList = await prisma.leadList.findUnique({
      where: { id: result.leadListId },
      include: { leadItems: true },
    });
    expect(leadList.leadItems.every((item) => item.leadId || item.catalogLeadId)).toBe(true);
    expect(leadList.filters.discovery.unlinkedEvidenceCandidatesCount).toBeGreaterThanOrEqual(1);
    expect(leadList.filters.discovery.evidenceSkippedUnlinkedCount).toBeGreaterThanOrEqual(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
