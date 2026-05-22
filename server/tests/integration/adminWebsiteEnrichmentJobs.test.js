import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4135';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let createApp;
let prisma;
let agentAdmin;
let agentUser;
let agentGuest;
let adminUser;
let workspace;
let catalogLead;
let noWebsiteLead;
let unsafeLead;
let secondLead;
let lockLead;
let createWebsiteEnrichmentJob;
let processWebsiteEnrichmentJob;
let env;
let clearCommonCrawlIndexCache;

const unique = Date.now().toString(36);
const adminEmail = `admin.website.jobs.${unique}@findly.local`;
const userEmail = `user.website.jobs.${unique}@findly.local`;

const csrfFor = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const html = `
  <html>
    <head>
      <title>Phase 5C Cafe ${unique}</title>
      <meta name="description" content="A local cafe website with contact and menu paths for testing." />
    </head>
    <body>
      <a href="/contact">Contact</a>
      <a href="/menu">Menu</a>
      <a href="https://wa.me/962790000000">WhatsApp</a>
    </body>
  </html>
`;

const fetcher = vi.fn(async (url) => ({
  ok: true,
  status: 200,
  contentType: 'text/html; charset=utf-8',
  text: html,
  truncated: false,
  finalUrl: url,
  redirectsFollowed: 0,
}));

const buildWarcBuffer = (body) => gzipSync(Buffer.from([
  'WARC/1.0',
  'WARC-Type: response',
  'WARC-Target-URI: https://phase5c-openweb.example.com/',
  '',
  'HTTP/1.1 200 OK',
  'Content-Type: text/html; charset=utf-8',
  '',
  body,
].join('\r\n'), 'utf8'));

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ createWebsiteEnrichmentJob, processWebsiteEnrichmentJob } = await import('../../src/modules/search/websiteEnrichmentJob.service.js'));
  ({ clearCommonCrawlIndexCache } = await import('../../src/modules/search/providers/commonCrawlProvider.service.js'));
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OpenWebEvidenceCache" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "normalizedDomain" TEXT NOT NULL,
      "normalizedUrl" TEXT,
      "provider" TEXT NOT NULL DEFAULT 'common_crawl',
      "sourceType" TEXT NOT NULL DEFAULT 'OPEN_WEB_ARCHIVE',
      "indexId" TEXT,
      "captureTimestamp" TIMESTAMP(3),
      "evidenceHash" TEXT NOT NULL,
      "confidenceScore" INTEGER NOT NULL DEFAULT 0,
      "signals" JSONB NOT NULL,
      "metadata" JSONB,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "OpenWebEvidenceCache_provider_evidenceHash_key"
    ON "OpenWebEvidenceCache"("provider", "evidenceHash")
  `);

  const app = createApp();
  agentAdmin = request.agent(app);
  agentUser = request.agent(app);
  agentGuest = request.agent(app);

  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, userEmail] } } }).catch(() => {});

  await agentAdmin.post('/api/auth/register').send({
    name: 'Website Jobs Admin',
    email: adminEmail,
    password: 'Secure12345@#$',
  }).expect(201);
  await agentUser.post('/api/auth/register').send({
    name: 'Website Jobs User',
    email: userEmail,
    password: 'Secure12345@#$',
  }).expect(201);

  await prisma.user.updateMany({
    where: { email: { in: [adminEmail, userEmail] } },
    data: { emailVerified: true },
  });
  adminUser = await prisma.user.update({
    where: { email: adminEmail },
    data: { role: 'ADMIN' },
  });

  workspace = await prisma.workspace.findFirst({ where: { ownerId: adminUser.id } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { ownerId: adminUser.id, name: `Website Jobs Workspace ${unique}` },
    });
  }

  await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'Secure12345@#$' }).expect(200);
  await agentUser.post('/api/auth/login').send({ email: userEmail, password: 'Secure12345@#$' }).expect(200);

  catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5C Cafe ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5c-${unique}`,
      normalizedFingerprint: `phase-5c-${unique}`,
      websiteUrl: `https://phase5c-${unique}.example.com`,
    },
  });
  secondLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5C Bakery ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5c-second-${unique}`,
      normalizedFingerprint: `phase-5c-second-${unique}`,
      websiteUrl: `https://phase5c-second-${unique}.example.com`,
    },
  });
  noWebsiteLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5C No Website ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5c-no-website-${unique}`,
      normalizedFingerprint: `phase-5c-no-website-${unique}`,
    },
  });
  unsafeLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5C Unsafe ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5c-unsafe-${unique}`,
      normalizedFingerprint: `phase-5c-unsafe-${unique}`,
      websiteUrl: 'http://127.0.0.1/private',
    },
  });
  lockLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5C Lock ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5c-lock-${unique}`,
      normalizedFingerprint: `phase-5c-lock-${unique}`,
      websiteUrl: `https://phase5c-lock-${unique}.example.com`,
    },
  });
});

afterAll(async () => {
  const leadIds = [catalogLead?.id, secondLead?.id, noWebsiteLead?.id, unsafeLead?.id, lockLead?.id].filter(Boolean);
  await prisma.job.deleteMany({ where: { type: 'WEBSITE_ENRICHMENT_RUN', userId: adminUser?.id } }).catch(() => {});
  await prisma.leadEvidence.deleteMany({ where: { catalogLeadId: { in: leadIds } } }).catch(() => {});
  await prisma.leadListLead.deleteMany({ where: { catalogLeadId: { in: leadIds } } }).catch(() => {});
  await prisma.leadCatalog.deleteMany({ where: { id: { in: leadIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, userEmail] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('admin website enrichment jobs', () => {
  it('protects job creation and reads with admin auth and CSRF', async () => {
    await agentGuest.post('/api/admin/website-intelligence/jobs').send({}).expect(403);
    const userCsrf = await csrfFor(agentUser);
    await agentUser
      .post('/api/admin/website-intelligence/jobs')
      .set('X-CSRF-Token', userCsrf)
      .send({ targetType: 'CATALOG_LEAD', mode: 'EXPLICIT_IDS', catalogLeadIds: [catalogLead.id] })
      .expect(403);
    await agentAdmin
      .post('/api/admin/website-intelligence/jobs')
      .send({ targetType: 'CATALOG_LEAD', mode: 'EXPLICIT_IDS', catalogLeadIds: [catalogLead.id] })
      .expect(403);

    await agentGuest.get('/api/admin/website-intelligence/jobs').expect(401);
    await agentUser.get('/api/admin/website-intelligence/jobs').expect(403);
  });

  it('lets admins create and view a safe website enrichment job', async () => {
    const token = await csrfFor(agentAdmin);
    const response = await agentAdmin
      .post('/api/admin/website-intelligence/jobs')
      .set('X-CSRF-Token', token)
      .send({ targetType: 'CATALOG_LEAD', mode: 'EXPLICIT_IDS', catalogLeadIds: [catalogLead.id, noWebsiteLead.id] })
      .expect(201);

    expect(response.body.data.job.status).toBe('QUEUED');
    expect(response.body.data.job.totalItems).toBe(2);
    expect(response.body.data.job.skippedItems).toBe(1);
    expect(response.body.data.job.summary.observability).toMatchObject({
      itemDurationMsAverage: expect.any(Number),
      liveFetchUsedCount: 0,
    });
    expect(JSON.stringify(response.body)).not.toContain('<html');
    expect(JSON.stringify(response.body)).not.toContain('rawMetadata');

    const detail = await agentAdmin
      .get(`/api/admin/website-intelligence/jobs/${response.body.data.job.id}`)
      .expect(200);
    expect(detail.body.data.job.items).toHaveLength(2);
    expect(detail.body.data.job.items.find((item) => item.catalogLeadId === noWebsiteLead.id).status).toBe('SKIPPED');
    expect(detail.body.data.job.items.find((item) => item.catalogLeadId === noWebsiteLead.id).durationMs).toBe(0);
  });

  it('rejects invalid job requests safely', async () => {
    await expect(createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [],
    })).rejects.toThrow('At least one catalog lead ID is required.');

    await expect(createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id, catalogLead.id],
    })).rejects.toThrow('Duplicate catalog lead IDs are not allowed.');

    await expect(createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id, `missing-${unique}`],
    })).rejects.toThrow('Catalog lead IDs not found:');

    await expect(createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id],
    })).rejects.toThrow('Unsupported website enrichment job targetType.');

    await expect(createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'UNKNOWN',
      catalogLeadIds: [catalogLead.id],
    })).rejects.toThrow('Unsupported website enrichment job mode.');
  });

  it('enforces the configured item cap', async () => {
    const ids = Array.from({ length: 26 }, (_, index) => `missing-${index}-${unique}`);
    await expect(createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: ids,
    })).rejects.toThrow('Website enrichment jobs are limited to 25 items.');
  });

  it('processes queued items, creates WEBSITE_METADATA evidence, and updates counters without creating leads or list rows', async () => {
    fetcher.mockClear();
    const catalogCountBefore = await prisma.leadCatalog.count();
    const listRowsBefore = await prisma.leadListLead.count();
    const job = await createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id, secondLead.id, unsafeLead.id],
      forceRefresh: true,
    });

    const processed = await processWebsiteEnrichmentJob({ jobId: job.id, fetcher });

    expect(processed.status).toBe('COMPLETED');
    expect(processed.succeededItems).toBe(2);
    expect(processed.failedItems).toBe(1);
    expect(processed.summary.observability).toMatchObject({
      itemDurationMsAverage: expect.any(Number),
      itemDurationMsMax: expect.any(Number),
      liveFetchUsedCount: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(processed.items.find((item) => item.catalogLeadId === unsafeLead.id).errorCode).toBe('UNSAFE_WEBSITE_URL');
    expect(processed.items.find((item) => item.catalogLeadId === unsafeLead.id).durationMs).toEqual(expect.any(Number));
    expect(processed.items.find((item) => item.catalogLeadId === catalogLead.id).evidenceId).toBeTruthy();
    expect(processed.items.find((item) => item.catalogLeadId === catalogLead.id).durationMs).toEqual(expect.any(Number));
    expect(processed.items.find((item) => item.catalogLeadId === catalogLead.id).liveFetchUsed).toBe(true);

    const evidence = await prisma.leadEvidence.findMany({
      where: {
        catalogLeadId: { in: [catalogLead.id, secondLead.id] },
        discoveryMethod: 'WEBSITE_METADATA',
        sourceType: 'WEBSITE_METADATA',
      },
    });
    expect(evidence.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(evidence)).not.toContain('<html');
    expect(await prisma.leadCatalog.count()).toBe(catalogCountBefore);
    expect(await prisma.leadListLead.count()).toBe(listRowsBefore);
  });

  it('prevents concurrent process calls from processing the same queued item twice', async () => {
    const previousOpenWebEnabled = env.OPEN_WEB_EVIDENCE_ENABLED;
    const previousWebsiteJobsEnabled = env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS;
    env.OPEN_WEB_EVIDENCE_ENABLED = false;
    env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS = false;

    let releaseFetch;
    const slowFetcher = vi.fn((url) => new Promise((resolve) => {
      releaseFetch = () => resolve({
        ok: true,
        status: 200,
        contentType: 'text/html; charset=utf-8',
        text: html,
        truncated: false,
        finalUrl: url,
        redirectsFollowed: 0,
      });
    }));

    try {
      const job = await createWebsiteEnrichmentJob({
        requestedByUserId: adminUser.id,
        workspaceId: workspace.id,
        targetType: 'CATALOG_LEAD',
        mode: 'EXPLICIT_IDS',
        catalogLeadIds: [lockLead.id],
        forceRefresh: true,
      });

      const firstRun = processWebsiteEnrichmentJob({ jobId: job.id, fetcher: slowFetcher });
      await vi.waitFor(() => expect(slowFetcher).toHaveBeenCalledTimes(1), { timeout: 5000 });

      await expect(processWebsiteEnrichmentJob({ jobId: job.id, fetcher: slowFetcher }))
        .rejects
        .toMatchObject({ code: 'JOB_ALREADY_RUNNING' });

      releaseFetch();
      const processed = await firstRun;

      expect(processed.status).toBe('COMPLETED');
      expect(processed.succeededItems).toBe(1);
      expect(processed.items[0].durationMs).toEqual(expect.any(Number));
      expect(processed.summary.observability.liveFetchUsedCount).toBe(1);
      expect(slowFetcher).toHaveBeenCalledTimes(1);

      const evidenceCount = await prisma.leadEvidence.count({
        where: {
          catalogLeadId: lockLead.id,
          discoveryMethod: 'WEBSITE_METADATA',
          sourceType: 'WEBSITE_METADATA',
        },
      });
      expect(evidenceCount).toBe(1);
    } finally {
      if (typeof releaseFetch === 'function') {
        releaseFetch();
      }
      env.OPEN_WEB_EVIDENCE_ENABLED = previousOpenWebEnabled;
      env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS = previousWebsiteJobsEnabled;
    }
  });

  it('reuses recent evidence when forceRefresh is false and refetches when forceRefresh is true', async () => {
    const cachedJob = await createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id],
      forceRefresh: false,
    });
    const cachedFetcher = vi.fn(async () => {
      throw new Error('Fetcher should not run when recent evidence exists.');
    });
    const cached = await processWebsiteEnrichmentJob({ jobId: cachedJob.id, fetcher: cachedFetcher });
    expect(cached.succeededItems).toBe(1);
    expect(cached.items[0].cached).toBe(true);
    expect(cached.items[0].durationMs).toEqual(expect.any(Number));
    expect(cached.items[0].liveFetchUsed).toBe(false);
    expect(cached.summary.observability.liveFetchUsedCount).toBe(0);
    expect(cachedFetcher).not.toHaveBeenCalled();

    const refreshFetcher = vi.fn(fetcher.getMockImplementation());
    const refreshJob = await createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id],
      forceRefresh: true,
    });
    const refreshed = await processWebsiteEnrichmentJob({ jobId: refreshJob.id, fetcher: refreshFetcher });
    expect(refreshed.succeededItems).toBe(1);
    expect(refreshed.items[0].cached).toBe(false);
    expect(refreshed.items[0].durationMs).toEqual(expect.any(Number));
    expect(refreshed.items[0].liveFetchUsed).toBe(true);
    expect(refreshFetcher).toHaveBeenCalledTimes(1);
  });

  it('uses open web evidence silently and avoids exposing Common Crawl internals', async () => {
    clearCommonCrawlIndexCache();
    env.OPEN_WEB_EVIDENCE_ENABLED = true;
    env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS = true;
    env.COMMON_CRAWL_ENABLED = true;
    env.COMMON_CRAWL_FETCH_WARC_ENABLED = true;
    env.OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN = 1;

    const archivedHtml = `
      <html>
        <head>
          <title>Phase 5C Open Web ${unique}</title>
          <meta name="description" content="Archived metadata with contact and menu paths." />
        </head>
        <body>
          <a href="/contact">Contact</a>
          <a href="/menu">Menu</a>
        </body>
      </html>
    `;
    const warcBuffer = buildWarcBuffer(archivedHtml);

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'CC-MAIN-2026-08' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          url: `https://phase5c-${unique}.example.com/`,
          timestamp: '20260210120000',
          status: '200',
          mime: 'text/html',
          length: String(warcBuffer.byteLength),
          offset: '100',
          filename: 'crawl-data/CC-MAIN-2026-08/segments/test/warc/CC-MAIN-test.warc.gz',
          digest: 'OPENWEB123',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: async () => warcBuffer,
      });

    const noLiveFetcher = vi.fn(async () => {
      throw new Error('Live fetcher should not run when archived evidence is sufficient.');
    });

    const job = await createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id],
      forceRefresh: true,
    });

    const processed = await processWebsiteEnrichmentJob({ jobId: job.id, fetcher: noLiveFetcher });

    expect(processed.status).toBe('COMPLETED');
    expect(processed.succeededItems).toBe(1);
    expect(processed.items[0].openWebEvidence).toMatchObject({
      used: true,
      confidenceScore: expect.any(Number),
      durationMs: expect.any(Number),
      cacheHit: false,
      timeout: false,
      shouldSkipLiveFetch: true,
    });
    expect(processed.items[0].durationMs).toEqual(expect.any(Number));
    expect(processed.items[0].liveFetchUsed).toBe(false);
    expect(processed.summary.observability).toMatchObject({
      openWebEvidenceUsedCount: 1,
      openWebEvidenceDurationMsAverage: expect.any(Number),
      liveFetchUsedCount: 0,
    });
    expect(noLiveFetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(processed)).not.toContain('Common Crawl');
    expect(JSON.stringify(processed)).not.toContain('CC-MAIN');
    expect(JSON.stringify(processed)).not.toContain('<html');
  });
});
