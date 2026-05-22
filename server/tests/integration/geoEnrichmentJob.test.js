import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/utils/crypto.js';
import { buildGeoNormalization } from '../../src/modules/geo/geoQueryNormalizer.service.js';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4131';

const unique = Date.now().toString(36);

let prisma;
let enqueueGeoEnrichmentJob;
let processNextWorkerJob;
let userId;
let workspaceId;
let unresolvedLeadId;
let preservedLeadId;
let lowConfidenceLeadId;

beforeAll(async () => {
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ enqueueGeoEnrichmentJob } = await import('../../src/modules/geo/geoEnrichment.service.js'));
  ({ processNextWorkerJob } = await import('../../src/workers/searchWorker.js'));

  const passwordHash = await hashPassword('Secure12345@#$');
  const user = await prisma.user.create({
    data: {
      name: 'Geo Job User',
      email: `geo.job.${unique}@findly.local`,
      passwordHash,
      emailVerified: true,
    },
  });
  userId = user.id;

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: user.id,
      name: `Geo Job Workspace ${unique}`,
    },
  });
  workspaceId = workspace.id;

  const unresolvedLead = await prisma.lead.create({
    data: {
      userId,
      workspaceId,
      businessName: `Resolvable Lead ${unique}`,
      address: 'Rainbow Street',
      city: 'Amman',
      country: 'Jordan',
      source: 'INSTAGRAM',
    },
  });
  unresolvedLeadId = unresolvedLead.id;

  const preservedLead = await prisma.lead.create({
    data: {
      userId,
      workspaceId,
      businessName: `Preserved Lead ${unique}`,
      address: 'Abdali Boulevard',
      city: 'Amman',
      country: 'Jordan',
      latitude: 31.954,
      longitude: 35.911,
      geoStatus: 'RESOLVED',
      geoSource: 'GEOCODER',
      geoProvider: 'geoapify',
      geoConfidence: 93,
      geoAccuracy: 'business',
      geoResolvedAt: new Date(),
      source: 'GOOGLE_MAPS',
    },
  });
  preservedLeadId = preservedLead.id;

  const lowConfidenceLead = await prisma.lead.create({
    data: {
      userId,
      workspaceId,
      businessName: `Low Confidence Lead ${unique}`,
      address: 'Unknown',
      city: 'Amman',
      country: 'Jordan',
      source: 'WEBSITE',
    },
  });
  lowConfidenceLeadId = lowConfidenceLead.id;

  const highConfidenceQuery = buildGeoNormalization({
    businessName: unresolvedLead.businessName,
    address: unresolvedLead.address,
    city: unresolvedLead.city,
    country: unresolvedLead.country,
  });

  const lowConfidenceQuery = buildGeoNormalization({
    businessName: lowConfidenceLead.businessName,
    address: lowConfidenceLead.address,
    city: lowConfidenceLead.city,
    country: lowConfidenceLead.country,
  });

  await prisma.geoLocationCache.createMany({
    data: [
      {
        normalizedQuery: highConfidenceQuery.cacheKey,
        normalizedCountry: 'Jordan',
        normalizedCity: 'Amman',
        provider: 'geoapify',
        providerPlaceId: `cache-high-${unique}`,
        latitude: 31.955,
        longitude: 35.945,
        confidence: 91,
        accuracy: 'business',
        resultType: 'amenity',
        normalizedAddress: 'Rainbow Street, Amman, Jordan',
        sourceHash: highConfidenceQuery.sourceHash,
      },
      {
        normalizedQuery: lowConfidenceQuery.cacheKey,
        normalizedCountry: 'Jordan',
        normalizedCity: 'Amman',
        provider: 'geoapify',
        providerPlaceId: `cache-low-${unique}`,
        latitude: 31.95,
        longitude: 35.93,
        confidence: 60,
        accuracy: 'city',
        resultType: 'city',
        normalizedAddress: 'Amman, Jordan',
        sourceHash: lowConfidenceQuery.sourceHash,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.job.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.geoLocationCache.deleteMany({ where: { providerPlaceId: { contains: unique } } }).catch(() => {});
  await prisma.lead.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.workspace.deleteMany({ where: { ownerId: userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('geo enrichment jobs', () => {
  it('updates unresolved leads from cached high-confidence coordinates', async () => {
    await enqueueGeoEnrichmentJob({
      userId,
      workspaceId,
      leadIds: [unresolvedLeadId],
    });

    const result = await processNextWorkerJob({ workerId: `geo-worker-${unique}` });
    expect(result?.status).toBe('COMPLETED');

    const lead = await prisma.lead.findUnique({ where: { id: unresolvedLeadId } });
    expect(lead.geoStatus).toBe('RESOLVED');
    expect(lead.latitude).toBeCloseTo(31.955, 3);
    expect(lead.geoConfidence).toBeGreaterThanOrEqual(90);
  });

  it('does not overwrite an already valid resolved lead without force refresh', async () => {
    await enqueueGeoEnrichmentJob({
      userId,
      workspaceId,
      leadIds: [preservedLeadId],
    });

    await processNextWorkerJob({ workerId: `geo-worker-preserve-${unique}` });
    const lead = await prisma.lead.findUnique({ where: { id: preservedLeadId } });
    expect(lead.latitude).toBeCloseTo(31.954, 3);
    expect(lead.longitude).toBeCloseTo(35.911, 3);
    expect(lead.geoStatus).toBe('RESOLVED');
  });

  it('records low-confidence coordinates without making the lead mappable', async () => {
    await enqueueGeoEnrichmentJob({
      userId,
      workspaceId,
      leadIds: [lowConfidenceLeadId],
      forceRefresh: true,
    });

    await processNextWorkerJob({ workerId: `geo-worker-low-${unique}` });
    const lead = await prisma.lead.findUnique({ where: { id: lowConfidenceLeadId } });
    expect(lead.geoStatus).toBe('LOW_CONFIDENCE');
    expect(lead.geoConfidence).toBe(60);
  });
});
