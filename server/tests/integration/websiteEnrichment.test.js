import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4120';

let prisma;
let enrichLeadWebsite;
let userId;
let workspaceId;
let catalogLeadId;

const unique = Date.now().toString(36);
const html = `
<html>
  <head>
    <title>Website Enrichment Cafe ${unique}</title>
    <meta name="description" content="A real cafe homepage with contact, menu, WhatsApp, and booking links for customers.">
  </head>
  <body>
    <a href="/contact">Contact</a>
    <a href="/menu">Menu</a>
    <a href="/book">Book now</a>
    <a href="https://wa.me/962799999999">WhatsApp</a>
    <a href="https://instagram.com/website_enrichment_${unique}">Instagram</a>
  </body>
</html>`;

beforeAll(async () => {
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ enrichLeadWebsite } = await import('../../src/modules/search/websiteMetadata.service.js'));

  const user = await prisma.user.create({
    data: {
      name: 'Website Enrichment Test',
      email: `website.enrichment.${unique}@findly.local`,
      passwordHash: 'hashed-password',
      emailVerified: true,
    },
  });
  userId = user.id;

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: userId,
      name: `Website Enrichment Workspace ${unique}`,
    },
  });
  workspaceId = workspace.id;

  const catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Website Enrichment Cafe ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `website-enrichment-${unique}`,
      normalizedFingerprint: `website-enrichment-${unique}`,
      websiteUrl: `https://website-enrichment-${unique}.example.com`,
    },
  });
  catalogLeadId = catalogLead.id;
});

afterAll(async () => {
  await prisma.leadEvidence.deleteMany({ where: { catalogLeadId } }).catch(() => {});
  await prisma.leadCatalog.deleteMany({ where: { id: catalogLeadId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('website enrichment evidence', () => {
  it('creates sanitized WEBSITE_METADATA evidence for an existing catalog lead', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      text: html,
      truncated: false,
      finalUrl: `https://website-enrichment-${unique}.example.com/`,
      redirectsFollowed: 0,
    }));

    const result = await enrichLeadWebsite({
      catalogLeadId,
      websiteUrl: `website-enrichment-${unique}.example.com`,
      requestedByUserId: userId,
      workspaceId,
      fetcher,
    });

    expect(result.evidenceId).toBeTruthy();
    expect(result.cached).toBe(false);
    expect(result.metadata.title).toContain(unique);
    expect(result.signals.map((item) => item.key)).toEqual(expect.arrayContaining([
      'WEBSITE_REACHABLE',
      'HAS_CONTACT_LINK',
      'HAS_MENU_LINK',
      'HAS_BOOKING_LINK',
      'HAS_WHATSAPP_LINK',
    ]));

    const evidence = await prisma.leadEvidence.findUnique({ where: { id: result.evidenceId } });
    expect(evidence.catalogLeadId).toBe(catalogLeadId);
    expect(evidence.targetSource).toBe('WEBSITE');
    expect(evidence.discoveryMethod).toBe('WEBSITE_METADATA');
    expect(evidence.sourceType).toBe('WEBSITE_METADATA');
    expect(evidence.sourceUrl).toBe(`https://website-enrichment-${unique}.example.com/`);
    expect(evidence.snippetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(evidence.rawMetadata)).not.toContain('<html');
    expect(JSON.stringify(evidence.extractedFields)).not.toContain('<html');
    expect(evidence.confidenceScore).toBeGreaterThanOrEqual(60);
  });

  it('reuses recent website metadata evidence without refetching', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('Fetcher should not run when cache is valid');
    });

    const result = await enrichLeadWebsite({
      catalogLeadId,
      websiteUrl: `https://website-enrichment-${unique}.example.com/`,
      requestedByUserId: userId,
      workspaceId,
      fetcher,
    });

    expect(result.cached).toBe(true);
    expect(result.warnings).toContain('CACHE_HIT');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('records unreachable websites as evidence without raw HTML', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('Website fetch failed safely.');
    });
    const result = await enrichLeadWebsite({
      catalogLeadId,
      websiteUrl: `https://offline-${unique}.example.com`,
      requestedByUserId: userId,
      workspaceId,
      forceRefresh: true,
      fetcher,
    });

    expect(result.reachable).toBe(false);
    expect(result.signals[0].key).toBe('WEBSITE_UNREACHABLE');
    const evidence = await prisma.leadEvidence.findUnique({ where: { id: result.evidenceId } });
    expect(evidence.rawMetadata.reachable).toBe(false);
    expect(JSON.stringify(evidence.rawMetadata)).not.toContain('<html');
  });
});
