import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4146';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let prisma;
let env;
let lookupOpenWebEvidence;
let clearCommonCrawlIndexCache;

const unique = Date.now().toString(36);

const buildWarcBuffer = (html) => gzipSync(Buffer.from([
  'WARC/1.0',
  'WARC-Type: response',
  'WARC-Target-URI: https://openweb-test.example.com/',
  '',
  'HTTP/1.1 200 OK',
  'Content-Type: text/html; charset=utf-8',
  '',
  html,
].join('\r\n'), 'utf8'));

beforeAll(async () => {
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ lookupOpenWebEvidence } = await import('../../src/modules/search/openWebEvidence.service.js'));
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
});

beforeEach(() => {
  vi.restoreAllMocks();
  clearCommonCrawlIndexCache();
  env.OPEN_WEB_EVIDENCE_ENABLED = true;
  env.COMMON_CRAWL_ENABLED = true;
  env.OPEN_WEB_EVIDENCE_FAIL_OPEN = true;
  env.OPEN_WEB_EVIDENCE_MAX_RESULTS_PER_DOMAIN = 1;
  env.OPEN_WEB_EVIDENCE_CACHE_TTL_DAYS = 30;
  env.COMMON_CRAWL_FETCH_WARC_ENABLED = true;
  env.COMMON_CRAWL_MAX_WARC_BYTES = 262144;
});

afterEach(async () => {
  await prisma.$executeRaw`
    DELETE FROM "OpenWebEvidenceCache"
    WHERE "normalizedDomain" = 'openweb-test.example.com'
  `.catch(() => {});
});

describe('open web evidence layer', () => {
  it('returns a no-op when disabled', async () => {
    env.OPEN_WEB_EVIDENCE_ENABLED = false;
    const result = await lookupOpenWebEvidence({ websiteUrl: 'https://openweb-test.example.com' });
    expect(result.enabled).toBe(false);
    expect(result.found).toBe(false);
    expect(result.skippedReason).toBe('DISABLED');
    expect(result.durationMs).toEqual(expect.any(Number));
  });

  it('queries Common Crawl safely, extracts archived metadata, stores no raw html, and reports safe runtime metadata', async () => {
    const html = `
      <html>
        <head>
          <title>Open Web Cafe ${unique}</title>
          <meta name="description" content="Archived cafe homepage with contact and menu links." />
        </head>
        <body>
          <a href="/contact">Contact</a>
          <a href="/menu">Menu</a>
          <a href="mailto:hello@openweb-test.example.com">Email</a>
        </body>
      </html>
    `;
    const rangeBuffer = buildWarcBuffer(html);

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'CC-MAIN-2026-08' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => [
          JSON.stringify({
            url: 'https://openweb-test.example.com/',
            timestamp: '20260210120000',
            status: '200',
            mime: 'text/html',
            length: String(rangeBuffer.byteLength),
            offset: '100',
            filename: 'crawl-data/CC-MAIN-2026-08/segments/test/warc/CC-MAIN-test.warc.gz',
            digest: 'ABC123',
          }),
          JSON.stringify({
            url: 'https://cdn.other.example.com/logo.png',
            timestamp: '20260210120000',
            status: '200',
            mime: 'image/png',
          }),
        ].join('\n'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: async () => rangeBuffer,
      });

    const result = await lookupOpenWebEvidence({ websiteUrl: 'https://openweb-test.example.com/' });

    expect(result.found).toBe(true);
    expect(result.metadata.title).toContain(`Open Web Cafe ${unique}`);
    expect(result.signals.map((item) => item.key)).toEqual(expect.arrayContaining([
      'OPEN_WEB_EVIDENCE_FOUND',
      'TITLE_FOUND',
      'CONTACT_PAGE_SIGNAL',
    ]));
    expect(result.shouldSkipPaid).toBe(true);
    expect(result.durationMs).toEqual(expect.any(Number));
    expect(result.cacheHit).toBe(false);
    expect(result.timeout).toBe(false);
    expect(result.skippedReason).toBeNull();
    expect(result.archivedHtmlFetched).toBe(true);

    const cachedResult = await lookupOpenWebEvidence({ websiteUrl: 'https://openweb-test.example.com/' });
    expect(cachedResult.found).toBe(true);
    expect(cachedResult.fromCache).toBe(true);
    expect(cachedResult.cacheHit).toBe(true);
    expect(cachedResult.durationMs).toEqual(expect.any(Number));

    const [cacheEntry] = await prisma.$queryRaw`
      SELECT *
      FROM "OpenWebEvidenceCache"
      WHERE "normalizedUrl" = 'https://openweb-test.example.com/'
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;
    expect(cacheEntry).toBeTruthy();
    expect(JSON.stringify(cacheEntry.metadata)).not.toContain('<html');
    expect(JSON.stringify(cacheEntry.signals)).not.toContain('<html');
  });

  it('fails open on provider timeout', async () => {
    global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' }));
    const result = await lookupOpenWebEvidence({ websiteUrl: 'https://openweb-test.example.com/' });
    expect(result.found).toBe(false);
    expect(result.signals[0].key).toBe('OPEN_WEB_EVIDENCE_TIMEOUT');
    expect(result.timeout).toBe(true);
    expect(result.skippedReason).toBe('TIMEOUT');
    expect(result.durationMs).toEqual(expect.any(Number));
  });

  it('skips unsafe urls without throwing', async () => {
    const result = await lookupOpenWebEvidence({ websiteUrl: 'http://127.0.0.1/private' });
    expect(result.found).toBe(false);
    expect(result.signals[0].key).toBe('OPEN_WEB_EVIDENCE_SKIPPED_UNSAFE_URL');
    expect(result.skippedReason).toBe('UNSAFE_URL');
    expect(result.durationMs).toEqual(expect.any(Number));
  });
});
