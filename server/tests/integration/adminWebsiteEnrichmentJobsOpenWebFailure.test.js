import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4147';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let prisma;
let env;
let createWebsiteEnrichmentJob;
let processWebsiteEnrichmentJob;
let clearCommonCrawlIndexCache;
let adminUser;
let workspace;
let catalogLead;

const unique = Date.now().toString(36);
const adminEmail = `admin.website.openweb.failure.${unique}@findly.local`;
const html = `
  <html>
    <head>
      <title>Open Web Timeout Fallback ${unique}</title>
      <meta name="description" content="A website job fallback fixture with contact and menu links." />
    </head>
    <body>
      <a href="/contact">Contact</a>
      <a href="/menu">Menu</a>
    </body>
  </html>
`;

beforeAll(async () => {
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

  await prisma.user.deleteMany({ where: { email: adminEmail } }).catch(() => {});
  adminUser = await prisma.user.create({
    data: {
      name: 'Website Open Web Failure Admin',
      email: adminEmail,
      passwordHash: 'test-password-hash',
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  workspace = await prisma.workspace.create({
    data: { ownerId: adminUser.id, name: `Website Open Web Failure Workspace ${unique}` },
  });
  catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Open Web Timeout Fallback ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `open-web-timeout-fallback-${unique}`,
      normalizedFingerprint: `open-web-timeout-fallback-${unique}`,
      websiteUrl: `https://open-web-timeout-fallback-${unique}.example.com`,
    },
  });
});

afterAll(async () => {
  await prisma.job.deleteMany({ where: { type: 'WEBSITE_ENRICHMENT_RUN', userId: adminUser?.id } }).catch(() => {});
  await prisma.leadEvidence.deleteMany({ where: { catalogLeadId: catalogLead?.id } }).catch(() => {});
  await prisma.leadCatalog.deleteMany({ where: { id: catalogLead?.id } }).catch(() => {});
  await prisma.workspace.deleteMany({ where: { id: workspace?.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: adminEmail } }).catch(() => {});
  await prisma.$disconnect();
});

describe('admin website enrichment jobs open web failure fallback', () => {
  it('continues with live website fetch when Open Web Evidence times out', async () => {
    vi.restoreAllMocks();
    clearCommonCrawlIndexCache();
    env.OPEN_WEB_EVIDENCE_ENABLED = true;
    env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS = true;
    env.OPEN_WEB_EVIDENCE_FAIL_OPEN = true;
    env.COMMON_CRAWL_ENABLED = true;
    env.COMMON_CRAWL_FETCH_WARC_ENABLED = true;

    global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' }));
    const liveFetcher = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      text: html,
      truncated: false,
      finalUrl: url,
      redirectsFollowed: 0,
    }));

    const job = await createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id],
      forceRefresh: true,
    });

    const processed = await processWebsiteEnrichmentJob({ jobId: job.id, fetcher: liveFetcher });

    expect(processed.status).toBe('COMPLETED');
    expect(processed.succeededItems).toBe(1);
    expect(processed.failedItems).toBe(0);
    expect(processed.items[0].openWebEvidence).toMatchObject({
      used: false,
      timeout: true,
      skippedReason: 'TIMEOUT',
      durationMs: expect.any(Number),
      shouldSkipLiveFetch: false,
    });
    expect(processed.items[0].liveFetchUsed).toBe(true);
    expect(processed.items[0].durationMs).toEqual(expect.any(Number));
    expect(processed.summary.observability).toMatchObject({
      openWebEvidenceUsedCount: 0,
      openWebEvidenceTimeoutCount: 1,
      liveFetchUsedCount: 1,
    });
    expect(liveFetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(processed)).not.toContain('Common Crawl');
    expect(JSON.stringify(processed)).not.toContain('CC-MAIN');
    expect(JSON.stringify(processed)).not.toContain('<html');
  });

  it('continues with live website fetch when Open Web Evidence is disabled', async () => {
    vi.restoreAllMocks();
    clearCommonCrawlIndexCache();
    env.OPEN_WEB_EVIDENCE_ENABLED = false;
    env.OPEN_WEB_EVIDENCE_ENABLE_WEBSITE_JOBS = true;
    env.OPEN_WEB_EVIDENCE_FAIL_OPEN = true;
    env.COMMON_CRAWL_ENABLED = true;

    global.fetch = vi.fn();
    const liveFetcher = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      text: html,
      truncated: false,
      finalUrl: url,
      redirectsFollowed: 0,
    }));

    const job = await createWebsiteEnrichmentJob({
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      targetType: 'CATALOG_LEAD',
      mode: 'EXPLICIT_IDS',
      catalogLeadIds: [catalogLead.id],
      forceRefresh: true,
    });

    const processed = await processWebsiteEnrichmentJob({ jobId: job.id, fetcher: liveFetcher });

    expect(processed.status).toBe('COMPLETED');
    expect(processed.succeededItems).toBe(1);
    expect(processed.failedItems).toBe(0);
    expect(processed.items[0].openWebEvidence).toMatchObject({
      used: false,
      skippedReason: 'DISABLED',
      shouldSkipLiveFetch: false,
    });
    expect(processed.items[0].liveFetchUsed).toBe(true);
    expect(processed.summary.observability).toMatchObject({
      openWebEvidenceUsedCount: 0,
      liveFetchUsedCount: 1,
    });
    expect(liveFetcher).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(processed)).not.toContain('Common Crawl');
    expect(JSON.stringify(processed)).not.toContain('CC-MAIN');
    expect(JSON.stringify(processed)).not.toContain('<html');
  });
});
