import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4108';

let prisma;
let createDiscoveryQuery;
let recordLeadEvidence;
let linkEvidenceToLead;
let linkEvidenceToCatalogLead;
let recordValidationEvent;
let recordEnrichmentRun;
let hashSnippet;
let calculateDefaultStoreUntil;
let sanitizeEvidenceMetadata;
let promoteEvidenceToCatalogLead;

const unique = Date.now().toString(36);
let userId;
let workspaceId;
let campaignId;
let leadId;
let catalogLeadId;

beforeAll(async () => {
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({
    createDiscoveryQuery,
    recordLeadEvidence,
    linkEvidenceToLead,
    linkEvidenceToCatalogLead,
    recordValidationEvent,
    recordEnrichmentRun,
    hashSnippet,
    calculateDefaultStoreUntil,
    sanitizeEvidenceMetadata,
  } = await import('../../src/modules/search/discoveryEvidence.service.js'));
  ({ promoteEvidenceToCatalogLead } = await import('../../src/modules/search/evidencePromotion.service.js'));

  const user = await prisma.user.create({
    data: {
      name: 'Discovery Evidence Test',
      email: `discovery.${unique}@findly.local`,
      passwordHash: 'hashed-password',
      emailVerified: true,
    },
  });
  userId = user.id;

  const workspace = await prisma.workspace.create({
    data: {
      ownerId: userId,
      name: 'Discovery Evidence Workspace',
    },
  });
  workspaceId = workspace.id;

  const campaign = await prisma.searchCampaign.create({
    data: {
      userId,
      workspaceId,
      name: `Discovery Campaign ${unique}`,
      query: 'cafes',
      sources: ['LOCAL_DATASET'],
      status: 'DRAFT',
    },
  });
  campaignId = campaign.id;

  const lead = await prisma.lead.create({
    data: {
      userId,
      workspaceId,
      campaignId,
      businessName: `Evidence Lead ${unique}`,
      source: 'GOOGLE_MAPS',
      sourceId: `place-${unique}`,
    },
  });
  leadId = lead.id;

  const catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `Evidence Catalog Lead ${unique}`,
      source: 'LOCAL_DATASET',
      sourceId: `catalog-${unique}`,
      normalizedFingerprint: `catalog-${unique}`,
    },
  });
  catalogLeadId = catalogLead.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.leadCatalog.deleteMany({ where: { normalizedFingerprint: `catalog-${unique}` } }).catch(() => {});
  await prisma.$disconnect();
});

describe('discovery evidence service', () => {
  it('hashes snippets without requiring full snippet storage', () => {
    const hash = hashSnippet('Coffee shop in Amman');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('Coffee');
  });

  it('calculates retention windows by discovery method', () => {
    const socialStoreUntil = calculateDefaultStoreUntil('SERP_INSTAGRAM_RESULT', 'SERPAPI_DISCOVERY', 'INSTAGRAM');
    const websiteStoreUntil = calculateDefaultStoreUntil('WEBSITE_METADATA_RESULT', 'WEBSITE_METADATA', 'WEBSITE');
    expect(socialStoreUntil).toBeInstanceOf(Date);
    expect(websiteStoreUntil).toBeInstanceOf(Date);
    expect(websiteStoreUntil.getTime()).toBeGreaterThan(socialStoreUntil.getTime());
    expect(calculateDefaultStoreUntil('LOCAL_DATASET_RESULT', 'LOCAL_DATASET', 'LOCAL_DATASET')).toBeNull();
  });

  it('sanitizes metadata recursively', () => {
    const metadata = sanitizeEvidenceMetadata({
      ok: true,
      headers: { authorization: 'Bearer secret-token' },
      nested: { apiKey: 'secret-key', useful: 'value' },
    });

    expect(JSON.stringify(metadata)).not.toContain('secret-token');
    expect(JSON.stringify(metadata)).not.toContain('secret-key');
    expect(metadata.nested.useful).toBe('value');
  });

  it('creates discovery queries and evidence, then links records', async () => {
    await prisma.$transaction(async (tx) => {
      const query = await createDiscoveryQuery({
        tx,
        userId,
        workspaceId,
        campaignId,
        seedQuery: 'cafes',
        expandedQuery: 'cafes | Amman | Instagram',
        geography: 'Amman, Jordan',
        targetSources: ['INSTAGRAM'],
        discoveryMethod: 'SERPAPI_DISCOVERY',
        adapter: 'SERPAPI',
        status: 'COMPLETED',
      });

      const evidence = await recordLeadEvidence({
        tx,
        userId,
        workspaceId,
        campaignId,
        discoveryQueryId: query.id,
        targetSource: 'INSTAGRAM',
        discoveryMethod: 'SERPAPI_DISCOVERY',
        sourceType: 'SERP_INSTAGRAM_RESULT',
        sourceUrl: 'https://instagram.com/example_cafe',
        externalId: 'example_cafe',
        title: 'Example Cafe',
        snippet: 'Do not store this snippet in full',
        extractedFields: { businessName: 'Example Cafe', city: 'Amman' },
        rawMetadata: { cookie: 'private', rank: 1 },
        confidenceScore: 72,
      });

      const linkedLeadEvidence = await linkEvidenceToLead({ tx, evidenceId: evidence.id, leadId });
      const linkedCatalogEvidence = await linkEvidenceToCatalogLead({
        tx,
        evidenceId: linkedLeadEvidence.id,
        catalogLeadId,
      });

      await recordValidationEvent({
        tx,
        userId,
        workspaceId,
        campaignId,
        leadId,
        catalogLeadId,
        evidenceId: evidence.id,
        validator: 'unit_test',
        result: 'ACCEPTED',
        rationale: 'High confidence evidence',
        scoreDelta: 5,
        metadata: { token: 'redacted-value', kept: true },
      });

      await recordEnrichmentRun({
        tx,
        userId,
        workspaceId,
        campaignId,
        leadId,
        catalogLeadId,
        evidenceId: evidence.id,
        provider: 'WEBSITE_METADATA',
        requestedFields: ['websiteUrl'],
        returnedFields: { websiteUrl: 'https://example.com', apiKey: 'redacted-value' },
        marginalCostMicrousd: 100,
      });

      expect(query.executedAt).toBeInstanceOf(Date);
      expect(evidence.snippetHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(evidence)).not.toContain('Do not store this snippet');
      expect(JSON.stringify(evidence.rawMetadata)).not.toContain('private');
      expect(linkedCatalogEvidence.leadId).toBe(leadId);
      expect(linkedCatalogEvidence.catalogLeadId).toBe(catalogLeadId);
    });

    await expect(prisma.validationEvent.count({ where: { campaignId } })).resolves.toBeGreaterThan(0);
    await expect(prisma.enrichmentRun.count({ where: { campaignId } })).resolves.toBeGreaterThan(0);
  });

  it('promotes high-confidence evidence to LeadCatalog and links duplicates', async () => {
    await prisma.$transaction(async (tx) => {
      const query = await createDiscoveryQuery({
        tx,
        userId,
        workspaceId,
        campaignId,
        seedQuery: 'cafes',
        expandedQuery: 'cafes | Amman | Instagram',
        targetSources: ['INSTAGRAM'],
        discoveryMethod: 'SERPAPI_DISCOVERY',
        adapter: 'SERPAPI',
        status: 'COMPLETED',
      });

      const evidence = await recordLeadEvidence({
        tx,
        userId,
        workspaceId,
        campaignId,
        discoveryQueryId: query.id,
        targetSource: 'INSTAGRAM',
        discoveryMethod: 'SERPAPI_DISCOVERY',
        sourceType: 'SERPAPI_ORGANIC_RESULT',
        sourceUrl: `https://instagram.com/promoted_${unique}`,
        title: `Promoted Cafe ${unique}`,
        snippet: 'Coffee shop in Amman',
        extractedFields: {
          businessName: `Promoted Cafe ${unique}`,
          city: 'Amman',
          country: 'Jordan',
          category: 'Cafe',
          platformUsername: `promoted_${unique}`,
          platformUrl: `https://instagram.com/promoted_${unique}`,
        },
        confidenceScore: 82,
      });

      const promoted = await promoteEvidenceToCatalogLead({
        tx,
        evidence,
        campaign: { id: campaignId, city: 'Amman', country: 'Jordan', businessTypes: ['Cafe'] },
      });

      expect(promoted.status).toBe('PROMOTED');
      expect(promoted.catalogLead.source).toBe('SERPAPI');
      expect(promoted.catalogLead.instagramUsername).toBe(`promoted_${unique}`);

      const duplicateEvidence = await recordLeadEvidence({
        tx,
        userId,
        workspaceId,
        campaignId,
        discoveryQueryId: query.id,
        targetSource: 'INSTAGRAM',
        discoveryMethod: 'SERPAPI_DISCOVERY',
        sourceType: 'SERPAPI_ORGANIC_RESULT',
        sourceUrl: `https://instagram.com/promoted_${unique}`,
        title: `Promoted Cafe ${unique}`,
        extractedFields: {
          businessName: `Promoted Cafe ${unique}`,
          city: 'Amman',
          country: 'Jordan',
          category: 'Cafe',
          platformUsername: `promoted_${unique}`,
          platformUrl: `https://instagram.com/promoted_${unique}`,
        },
        confidenceScore: 82,
      });

      const duplicate = await promoteEvidenceToCatalogLead({
        tx,
        evidence: duplicateEvidence,
        campaign: { id: campaignId, city: 'Amman', country: 'Jordan', businessTypes: ['Cafe'] },
      });

      expect(duplicate.status).toBe('LINKED_DUPLICATE');
      expect(duplicate.catalogLead.id).toBe(promoted.catalogLead.id);
    });

    await expect(prisma.validationEvent.count({
      where: { campaignId, validator: 'EVIDENCE_PROMOTION' },
    })).resolves.toBeGreaterThanOrEqual(2);
  });

  it('does not promote low-confidence evidence', async () => {
    await prisma.$transaction(async (tx) => {
      const evidence = await recordLeadEvidence({
        tx,
        userId,
        workspaceId,
        campaignId,
        targetSource: 'INSTAGRAM',
        discoveryMethod: 'SERPAPI_DISCOVERY',
        sourceType: 'SERPAPI_ORGANIC_RESULT',
        sourceUrl: `https://instagram.com/weak_${unique}`,
        title: `Weak Cafe ${unique}`,
        confidenceScore: 40,
      });

      const result = await promoteEvidenceToCatalogLead({
        tx,
        evidence,
        campaign: { id: campaignId, city: 'Amman', country: 'Jordan', businessTypes: ['Cafe'] },
      });

      expect(result.status).toBe('REJECTED_LOW_CONFIDENCE');
      expect(result.catalogLead).toBeNull();
    });
  });
});
