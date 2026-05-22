import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4130';

const unique = Date.now().toString(36);

let prisma;
let createApp;
let hashPassword;
let agent;
let outsiderAgent;
let userId;
let workspaceId;
let directLeadId;
let catalogLeadId;

beforeAll(async () => {
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ hashPassword } = await import('../../src/utils/crypto.js'));

  const passwordHash = await hashPassword('Secure12345@#$');

  const user = await prisma.user.create({
    data: {
      name: 'Lead Map User',
      email: `lead.map.${unique}@findly.local`,
      passwordHash,
      emailVerified: true,
    },
  });
  userId = user.id;

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: user.id,
      name: `Lead Map Workspace ${unique}`,
    },
  });
  workspaceId = workspace.id;

  const outsider = await prisma.user.create({
    data: {
      name: 'Lead Map Outsider',
      email: `lead.map.outsider.${unique}@findly.local`,
      passwordHash,
      emailVerified: true,
    },
  });

  await prisma.workspace.create({
    data: {
      ownerId: outsider.id,
      name: `Lead Map Outsider Workspace ${unique}`,
    },
  });

  const directLead = await prisma.lead.create({
    data: {
      userId,
      workspaceId,
      businessName: `Mapped Direct Lead ${unique}`,
      category: 'Cafe',
      country: 'Jordan',
      city: 'Amman',
      latitude: 31.955,
      longitude: 35.945,
      geoStatus: 'RESOLVED',
      geoSource: 'GEOCODER',
      geoProvider: 'geoapify',
      geoConfidence: 91,
      geoAccuracy: 'business',
      geoResolvedAt: new Date(),
      source: 'INSTAGRAM',
    },
  });
  directLeadId = directLead.id;

  const catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Needs Enrichment ${unique}`,
      category: 'Cafe',
      country: 'Jordan',
      city: 'Amman',
      source: 'GOOGLE_MAPS',
      sourceId: `geo-${unique}`,
      normalizedFingerprint: `geo-${unique}`,
      geoStatus: 'LOW_CONFIDENCE',
      geoConfidence: 61,
      geoAccuracy: 'city',
    },
  });
  catalogLeadId = catalogLead.id;

  const leadList = await prisma.leadList.create({
    data: {
      userId,
      workspaceId,
      name: `Lead Map List ${unique}`,
    },
  });

  await prisma.leadListLead.create({
    data: {
      leadListId: leadList.id,
      catalogLeadId,
      rank: 1,
    },
  });

  agent = request.agent(createApp());
  await agent.post('/api/auth/login').send({ email: user.email, password: 'Secure12345@#$' }).expect(200);

  outsiderAgent = request.agent(createApp());
  await outsiderAgent.post('/api/auth/login').send({ email: outsider.email, password: 'Secure12345@#$' }).expect(200);
});

afterAll(async () => {
  await prisma.leadListLead.deleteMany({ where: { catalogLeadId } }).catch(() => {});
  await prisma.leadList.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.lead.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.leadCatalog.deleteMany({ where: { id: catalogLeadId } }).catch(() => {});
  await prisma.workspace.deleteMany({ where: { ownerId: userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: unique } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('lead map API', () => {
  it('rejects unauthenticated access', async () => {
    await request(createApp())
      .get(`/api/lead-map?leadIds=${directLeadId}`)
      .expect(401);
  });

  it('returns only accessible leads and separates non-mappable items safely', async () => {
    const response = await agent
      .get(`/api/lead-map?leadIds=${directLeadId},${catalogLeadId}`)
      .expect(200);

    expect(response.body.data.mappable).toHaveLength(1);
    expect(response.body.data.mappable[0].id).toBe(directLeadId);
    expect(response.body.data.notMappable).toHaveLength(1);
    expect(response.body.data.notMappable[0]).toMatchObject({
      id: catalogLeadId,
      reason: expect.any(String),
      canEnrich: true,
    });
    expect(JSON.stringify(response.body)).not.toContain('rawData');
    expect(JSON.stringify(response.body)).not.toContain('sourceFile');
  });

  it('deduplicates repeated lead ids', async () => {
    const response = await agent
      .get(`/api/lead-map?leadIds=${directLeadId},${directLeadId},${catalogLeadId},${catalogLeadId}`)
      .expect(200);

    expect(response.body.data.summary.accessibleCount).toBe(2);
  });

  it('enforces the lead id cap', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `fake-${index}`);
    const response = await agent
      .get(`/api/lead-map?leadIds=${ids.join(',')}`)
      .expect(400);

    expect(response.body.error.message).toContain('up to 100');
  });

  it('does not return another user lead', async () => {
    const response = await outsiderAgent
      .get(`/api/lead-map?leadIds=${directLeadId}`)
      .expect(200);

    expect(response.body.data.summary.accessibleCount).toBe(0);
  });
});
