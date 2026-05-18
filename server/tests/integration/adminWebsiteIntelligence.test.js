import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4134';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

const { mockEnrichLeadWebsite } = vi.hoisted(() => ({
  mockEnrichLeadWebsite: vi.fn(),
}));

vi.mock('../../src/modules/search/websiteMetadata.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    enrichLeadWebsite: mockEnrichLeadWebsite,
  };
});

let createApp;
let prisma;
let agentAdmin;
let agentUser;
let agentGuest;
let adminUser;
let workspace;
let catalogLead;
let noWebsiteLead;
let changedWebsiteLead;

const unique = Date.now().toString(36);
const adminEmail = `admin.website.${unique}@findly.local`;
const userEmail = `user.website.${unique}@findly.local`;

const csrfFor = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const sampleIntelligence = (overrides = {}) => ({
  websiteUrl: `https://phase5b-${unique}.example.com/`,
  finalUrl: `https://phase5b-${unique}.example.com/`,
  reachable: true,
  statusCode: 200,
  cached: false,
  observedAt: new Date('2026-05-18T00:00:00.000Z'),
  evidenceId: `evidence-${unique}`,
  metadata: {
    title: `Phase 5B Cafe ${unique}`,
    description: 'A cafe website with light metadata.',
    canonicalUrl: `https://phase5b-${unique}.example.com/`,
    language: 'en',
    links: {
      contactLinks: [],
      menuLinks: [],
      bookingLinks: [],
      whatsAppLinks: [],
      socialLinks: [],
      googleMapsLinks: [],
      emailHints: [],
      phoneHints: [],
    },
    schema: {
      hasJsonLd: true,
      hasLocalBusinessSchema: false,
    },
    page: {
      possiblePlaceholder: false,
    },
  },
  signals: [
    {
      key: 'WEBSITE_REACHABLE',
      severity: 'POSITIVE',
      confidence: 85,
      reason: 'Website homepage responded to a safe metadata fetch.',
    },
    {
      key: 'MISSING_CONTACT_LINK',
      severity: 'OPPORTUNITY',
      confidence: 80,
      reason: 'Homepage did not expose an obvious contact path.',
    },
  ],
  warnings: [],
  ...overrides,
});

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));

  const app = createApp();
  agentAdmin = request.agent(app);
  agentUser = request.agent(app);
  agentGuest = request.agent(app);

  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, userEmail] } } }).catch(() => {});

  await agentAdmin.post('/api/auth/register').send({
    name: 'Website Admin',
    email: adminEmail,
    password: 'Secure12345@#$',
  }).expect(201);
  await agentUser.post('/api/auth/register').send({
    name: 'Website User',
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
      data: { ownerId: adminUser.id, name: `Website Admin Workspace ${unique}` },
    });
  }

  await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'Secure12345@#$' }).expect(200);
  await agentUser.post('/api/auth/login').send({ email: userEmail, password: 'Secure12345@#$' }).expect(200);

  catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5B Cafe ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5b-${unique}`,
      normalizedFingerprint: `phase-5b-${unique}`,
      websiteUrl: `https://phase5b-${unique}.example.com`,
    },
  });
  noWebsiteLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5B No Website ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5b-no-website-${unique}`,
      normalizedFingerprint: `phase-5b-no-website-${unique}`,
    },
  });
  changedWebsiteLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Phase 5B Changed Website ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `phase-5b-changed-website-${unique}`,
      normalizedFingerprint: `phase-5b-changed-website-${unique}`,
      websiteUrl: `https://current-phase5b-${unique}.example.com`,
    },
  });
});

beforeEach(() => {
  mockEnrichLeadWebsite.mockReset();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: 'ADMIN_WEBSITE_INTELLIGENCE_ENRICHED' } }).catch(() => {});
  await prisma.leadEvidence.deleteMany({
    where: { catalogLeadId: { in: [catalogLead?.id, noWebsiteLead?.id, changedWebsiteLead?.id].filter(Boolean) } },
  }).catch(() => {});
  await prisma.leadCatalog.deleteMany({
    where: { id: { in: [catalogLead?.id, noWebsiteLead?.id, changedWebsiteLead?.id].filter(Boolean) } },
  }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, userEmail] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('admin website intelligence workflow', () => {
  it('protects website intelligence reads from guests and normal users', async () => {
    await agentGuest.get(`/api/admin/catalog-leads/${catalogLead.id}/website-intelligence`).expect(401);
    await agentUser.get(`/api/admin/catalog-leads/${catalogLead.id}/website-intelligence`).expect(403);
  });

  it('returns an empty state for admins when website intelligence has not been generated', async () => {
    const response = await agentAdmin
      .get(`/api/admin/catalog-leads/${catalogLead.id}/website-intelligence`)
      .expect(200);

    expect(response.body.data.catalogLeadId).toBe(catalogLead.id);
    expect(response.body.data.websiteUrl).toBe(catalogLead.websiteUrl);
    expect(response.body.data.intelligence).toBeNull();
  });

  it('protects enrichment writes with auth, admin role, and CSRF', async () => {
    await agentGuest.post(`/api/admin/catalog-leads/${catalogLead.id}/enrich-website`).send({}).expect(403);
    const userCsrf = await csrfFor(agentUser);
    await agentUser
      .post(`/api/admin/catalog-leads/${catalogLead.id}/enrich-website`)
      .set('X-CSRF-Token', userCsrf)
      .send({})
      .expect(403);
    await agentAdmin.post(`/api/admin/catalog-leads/${catalogLead.id}/enrich-website`).send({}).expect(403);
  });

  it('lets admins enrich one existing catalog lead without returning raw HTML or creating catalog leads', async () => {
    mockEnrichLeadWebsite.mockResolvedValue(sampleIntelligence());
    const token = await csrfFor(agentAdmin);
    const catalogCountBefore = await prisma.leadCatalog.count();

    const response = await agentAdmin
      .post(`/api/admin/catalog-leads/${catalogLead.id}/enrich-website`)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(200);

    expect(mockEnrichLeadWebsite).toHaveBeenCalledWith(expect.objectContaining({
      catalogLeadId: catalogLead.id,
      websiteUrl: catalogLead.websiteUrl,
      requestedByUserId: adminUser.id,
      workspaceId: workspace.id,
      forceRefresh: false,
    }));
    expect(response.body.data.catalogLeadId).toBe(catalogLead.id);
    expect(response.body.data.reachable).toBe(true);
    expect(response.body.data.signals.map((item) => item.key)).toContain('MISSING_CONTACT_LINK');
    const bodyText = JSON.stringify(response.body);
    expect(bodyText).not.toContain('<html');
    expect(bodyText).not.toContain('rawMetadata');

    const catalogCountAfter = await prisma.leadCatalog.count();
    expect(catalogCountAfter).toBe(catalogCountBefore);
  });

  it('returns cached state when the website service reuses recent evidence', async () => {
    mockEnrichLeadWebsite.mockResolvedValue(sampleIntelligence({
      cached: true,
      warnings: ['CACHE_HIT'],
    }));
    const token = await csrfFor(agentAdmin);

    const response = await agentAdmin
      .post(`/api/admin/catalog-leads/${catalogLead.id}/enrich-website`)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(200);

    expect(response.body.data.cached).toBe(true);
    expect(response.body.data.warnings).toContain('CACHE_HIT');
  });

  it('returns latest persisted WEBSITE_METADATA evidence safely', async () => {
    const evidence = await prisma.leadEvidence.create({
      data: {
        userId: adminUser.id,
        workspaceId: workspace.id,
        catalogLeadId: catalogLead.id,
        targetSource: 'WEBSITE',
        discoveryMethod: 'WEBSITE_METADATA',
        sourceType: 'WEBSITE_METADATA',
        sourceUrl: `https://phase5b-${unique}.example.com/`,
        title: `Phase 5B Cafe ${unique}`,
        snippetHash: 'a'.repeat(64),
        confidenceScore: 80,
        extractedFields: {
          metadata: sampleIntelligence().metadata,
          signals: sampleIntelligence().signals,
        },
        rawMetadata: {
          reachable: true,
          statusCode: 200,
          finalUrl: `https://phase5b-${unique}.example.com/`,
          warnings: [],
        },
      },
    });

    const response = await agentAdmin
      .get(`/api/admin/catalog-leads/${catalogLead.id}/website-intelligence`)
      .expect(200);

    expect(response.body.data.intelligence.evidenceId).toBe(evidence.id);
    expect(response.body.data.intelligence.metadata.title).toContain(unique);
    expect(JSON.stringify(response.body)).not.toContain('<html');
    expect(JSON.stringify(response.body)).not.toContain('rawMetadata');
  });

  it('does not show stale website intelligence when the lead website URL changed', async () => {
    await prisma.leadEvidence.create({
      data: {
        userId: adminUser.id,
        workspaceId: workspace.id,
        catalogLeadId: changedWebsiteLead.id,
        targetSource: 'WEBSITE',
        discoveryMethod: 'WEBSITE_METADATA',
        sourceType: 'WEBSITE_METADATA',
        sourceUrl: `https://old-phase5b-${unique}.example.com/`,
        title: `Old Phase 5B Website ${unique}`,
        snippetHash: 'b'.repeat(64),
        confidenceScore: 80,
        extractedFields: {
          metadata: sampleIntelligence({ websiteUrl: `https://old-phase5b-${unique}.example.com/` }).metadata,
          signals: sampleIntelligence().signals,
        },
        rawMetadata: {
          reachable: true,
          statusCode: 200,
          finalUrl: `https://old-phase5b-${unique}.example.com/`,
          warnings: [],
        },
      },
    });

    const response = await agentAdmin
      .get(`/api/admin/catalog-leads/${changedWebsiteLead.id}/website-intelligence`)
      .expect(200);

    expect(response.body.data.websiteUrl).toBe(changedWebsiteLead.websiteUrl);
    expect(response.body.data.intelligence).toBeNull();
  });

  it('returns a safe 400 when a catalog lead has no website URL', async () => {
    const token = await csrfFor(agentAdmin);

    const response = await agentAdmin
      .post(`/api/admin/catalog-leads/${noWebsiteLead.id}/enrich-website`)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(400);

    expect(response.body.error.message).toBe('Lead does not have a website URL to enrich.');
    expect(mockEnrichLeadWebsite).not.toHaveBeenCalled();
  });

  it('returns safe validation errors for unsafe website URLs', async () => {
    const { AppError, errorCodes } = await import('../../src/utils/AppError.js');
    mockEnrichLeadWebsite.mockImplementationOnce(async () => {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Website URL must use http or https.', 400);
    });
    const token = await csrfFor(agentAdmin);

    const response = await agentAdmin
      .post(`/api/admin/catalog-leads/${catalogLead.id}/enrich-website`)
      .set('X-CSRF-Token', token)
      .send({ websiteUrl: 'javascript:alert(1)' })
      .expect(400);

    expect(response.body.error.message).toBe('Website URL must use http or https.');
    expect(JSON.stringify(response.body)).not.toContain('javascript:alert');
  });
});
