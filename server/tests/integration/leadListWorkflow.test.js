import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4102';

const unique = Date.now().toString(36);

let createApp;
let prisma;
let getTestOutbox;
let agent1;
let agent2;
let user1Id;
let workspace1Id;
let leadListId;
let campaignId;
let listItems = [];

const hiddenUserSourceTerms = [
  'LOCAL_DATASET',
  'DATASET_IMPORT',
  'MANUAL_ADMIN',
  'INSTAGRAM_DATASET',
  'GOOGLE_MAPS_DATASET',
  'sourceFile',
  'sourceUsed',
  'sourceRequested',
  'fallbackUsed',
  'fallbackReason',
  'searchMode',
  'sourceMode',
  'localDatasetScore',
  'datasetStats',
  'importedLeadCount',
  'fallbackAvailable',
  'business intelligence index',
  'stored',
  'local',
  'dataset',
  'fallback',
];

const expectNoUserFacingSourceDisclosure = (payload) => {
  const text = JSON.stringify(payload).toLowerCase();
  for (const term of hiddenUserSourceTerms) {
    expect(text).not.toContain(term.toLowerCase());
  }
};

const getCsrfToken = async (agent) => {
  const response = await agent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const verificationTokenFor = (userEmail) => {
  const emailRecord = [...getTestOutbox()].reverse().find((item) => item.to === userEmail);
  const url = new URL(emailRecord.verificationUrl);
  return url.searchParams.get('token');
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  ({ getTestOutbox } = await import('../../src/modules/mail/mail.service.js'));

  // Setup User 1
  agent1 = request.agent(createApp());
  await agent1.post('/api/auth/register').send({
    name: 'User 1',
    email: `u1.${unique}@test.local`,
    password: 'Secure12345@#$',
  });
  
  const dbUser1 = await prisma.user.findUnique({ where: { email: `u1.${unique}@test.local` } });
  user1Id = dbUser1.id;
  await agent1.post('/api/auth/verify-email').send({ token: verificationTokenFor(dbUser1.email) });
  await agent1.post('/api/auth/login').send({ email: `u1.${unique}@test.local`, password: 'Secure12345@#$' });
  const me1 = await agent1.get('/api/auth/me');
  workspace1Id = me1.body.data.workspace.id;

  // Setup User 2
  agent2 = request.agent(createApp());
  await agent2.post('/api/auth/register').send({
    name: 'User 2',
    email: `u2.${unique}@test.local`,
    password: 'Secure12345@#$',
  });
  const dbUser2 = await prisma.user.findUnique({ where: { email: `u2.${unique}@test.local` } });
  await agent2.post('/api/auth/verify-email').send({ token: verificationTokenFor(dbUser2.email) });
  await agent2.post('/api/auth/login').send({ email: `u2.${unique}@test.local`, password: 'Secure12345@#$' });

  // Create Campaign & LeadList for User 1
  const campaign = await prisma.searchCampaign.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      name: `Test Campaign ${unique}`,
      query: 'cafes',
      country: 'Jordan',
      city: 'Amman',
      sources: ['INSTAGRAM', 'GOOGLE_MAPS'],
      status: 'COMPLETED',
    }
  });
  campaignId = campaign.id;

  const leadList = await prisma.leadList.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      name: `Test List ${unique}`,
      sourceRequested: 'INSTAGRAM, GOOGLE_MAPS',
      sourceUsed: 'LOCAL_DATASET',
      resultCount: 2,
    }
  });
  leadListId = leadList.id;

  // Add items from Global Catalog
  const catalog1 = await prisma.leadCatalog.create({
    data: {
      businessName: `Global Cafe 1 ${unique}`,
      category: 'Cafe',
      country: 'Jordan',
      city: 'Amman',
      source: 'LOCAL_DATASET',
      sourceId: `g1-${unique}`,
      normalizedFingerprint: `g1-fingerprint-${unique}`,
    }
  });

  const catalog2 = await prisma.leadCatalog.create({
    data: {
      businessName: `Global Cafe 2 ${unique}`,
      category: 'Cafe',
      country: 'Jordan',
      city: 'Amman',
      source: 'LOCAL_DATASET',
      sourceId: `g2-${unique}`,
      normalizedFingerprint: `g2-fingerprint-${unique}`,
    }
  });

  await prisma.leadCatalog.create({
    data: {
      businessName: `Specialty Roastery ${unique}`,
      category: 'Coffee Shop',
      country: 'Jordan',
      city: 'Amman',
      source: 'INSTAGRAM_DATASET',
      sourceId: `coffee-shop-${unique}`,
      normalizedFingerprint: `coffee-shop-fingerprint-${unique}`,
      instagramUsername: `roastery_${unique}`,
      detectedSignals: ['HAS_INSTAGRAM', 'NO_WEBSITE'],
    }
  });

  await prisma.lead.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      businessName: `Direct Internal Lead ${unique}`,
      category: 'Cafe',
      country: 'Jordan',
      city: 'Amman',
      source: 'LOCAL_DATASET',
      sourceFile: 'private-source.xlsx',
      sourceId: `direct-internal-${unique}`,
      detectedSignals: ['HAS_INSTAGRAM', 'DATASET_IMPORTED', 'NO_WEBSITE'],
      rawData: { sourceFile: 'private-source.xlsx', source: 'LOCAL_DATASET' },
    },
  });

  const item1 = await prisma.leadListLead.create({
    data: {
      leadListId: leadListId,
      catalogLeadId: catalog1.id,
      rank: 1,
      status: 'NEW',
    }
  });
  
  const item2 = await prisma.leadListLead.create({
    data: {
      leadListId: leadListId,
      catalogLeadId: catalog2.id,
      rank: 2,
      status: 'NEW',
    }
  });

  listItems = [item1, item2];
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('LeadList Workflow Architecture', () => {
  it('verifies status and notes can be updated via the new item endpoints', async () => {
    const csrfToken = await getCsrfToken(agent1);
    
    // Update status
    const statusRes = await agent1.patch(`/api/search/lists/${leadListId}/items/${listItems[0].id}/status`)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'CONTACTED' })
      .expect(200);
      
    expect(statusRes.body.data.item.status).toBe('CONTACTED');

    // Update notes
    const notesRes = await agent1.patch(`/api/search/lists/${leadListId}/items/${listItems[0].id}/notes`)
      .set('X-CSRF-Token', csrfToken)
      .send({ notes: 'These are my custom notes.' })
      .expect(200);
      
    expect(notesRes.body.data.item.notes).toBe('These are my custom notes.');
  });

  it('verifies cross-tenant isolation (user 2 cannot modify user 1 list items)', async () => {
    const csrfToken = await getCsrfToken(agent2);
    
    // User 2 trying to update User 1's list item status
    const failRes = await agent2.patch(`/api/search/lists/${leadListId}/items/${listItems[0].id}/status`)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'QUALIFIED' })
      .expect(404);

    expect(failRes.body.error.code).toBe('NOT_FOUND');
  });

  it('verifies single item analysis deduplicates and links correctly', async () => {
    const csrfToken = await getCsrfToken(agent1);
    const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;

    // First analysis
    const analyze1 = await agent1.post(`/api/search/lists/${leadListId}/items/${listItems[0].id}/analyze`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(analyze1.body.data.creditsUsed).toBe(1);
    expect(analyze1.body.data.reused).toBe(false);
    expect(analyze1.body.data.analysis.leadListLeadId).toBe(listItems[0].id);

    const midCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(midCredits).toBe(beforeCredits - 1);

    // Re-analyzing same item should reuse
    const analyze2 = await agent1.post(`/api/search/lists/${leadListId}/items/${listItems[0].id}/analyze`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(analyze2.body.data.creditsUsed).toBe(0);
    expect(analyze2.body.data.reused).toBe(true);

    const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCredits).toBe(midCredits); // No additional charge
  });

  it('verifies batch list analysis works and charges credits accurately', async () => {
    const csrfToken = await getCsrfToken(agent1);
    const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;

    // We analyzed listItems[0] previously. listItems[1] is unanalyzed.
    // Batch analyze should only charge for unanalyzed items (which is 1).
    const batchRes = await agent1.post(`/api/search/lists/${leadListId}/analyze`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(batchRes.body.data.analyzedCount).toBe(1);
    expect(batchRes.body.data.creditsUsed).toBe(1);

    const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCredits).toBe(beforeCredits - 1);
  });

  it('runs a multi-platform campaign, charges credits, and hides internal source metadata', async () => {
    const csrfToken = await getCsrfToken(agent1);
    const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    
    // Create Campaign
    const campaignRes = await agent1.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: workspace1Id,
        name: 'Multi-platform Search',
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM', 'GOOGLE_MAPS'],
        requestedLimit: 5,
      });

    expect(campaignRes.status).toBe(201);
    const newCampaignId = campaignRes.body.data.campaign.id;

    // Run Campaign
    const runRes = await agent1.post(`/api/search/campaigns/${newCampaignId}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(runRes.status).toBe(200);
    const runData = runRes.body.data;

    expect(runData.platformsRequested).toContain('INSTAGRAM');
    expect(runData.platformsRequested).toContain('GOOGLE_MAPS');
    expect(runData.leadListId).toBeDefined();
    expect(runData.leadsReturned).toBeGreaterThanOrEqual(1); // Should match our global catalog
    expect(runData.resultCount).toBe(runData.leadsReturned);
    expect(runData.creditsUsed).toBe(5 + runData.leadsReturned);
    for (const hiddenField of ['sourceUsed', 'fallbackUsed', 'fallbackReason', 'searchMode', 'sourceMode', 'sourceRequested', 'matchedLeads']) {
      expect(runData).not.toHaveProperty(hiddenField);
    }
    expect(JSON.stringify(runData)).not.toContain('LOCAL_DATASET');

    const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCredits).toBe(beforeCredits - runData.creditsUsed);

    const campaign = await prisma.searchCampaign.findUnique({ where: { id: newCampaignId } });
    expect(campaign.creditsUsed).toBe(runData.creditsUsed);
  });

  it('does not expose internal source metadata from user-facing search endpoints', async () => {
    const csrfToken = await getCsrfToken(agent1);

    const endpoints = [
      '/api/search/intelligence',
      `/api/search/campaigns/${campaignId}/leads`,
      '/api/search/lists',
      `/api/search/lists/${leadListId}`,
      `/api/search/lists/${leadListId}/leads`,
      '/api/search/leads',
      `/api/search/leads?listId=${leadListId}`,
      `/api/search/leads/${listItems[0].id}`,
      '/api/search/leads/map',
    ];

    for (const endpoint of endpoints) {
      const response = await agent1.get(endpoint).expect(200);
      expectNoUserFacingSourceDisclosure(response.body);
    }

    const statusResponse = await agent1
      .patch(`/api/search/lists/${leadListId}/items/${listItems[0].id}/status`)
      .set('X-CSRF-Token', csrfToken)
      .send({ status: 'QUALIFIED' })
      .expect(200);
    expectNoUserFacingSourceDisclosure(statusResponse.body);

    const notesResponse = await agent1
      .patch(`/api/search/lists/${leadListId}/items/${listItems[0].id}/notes`)
      .set('X-CSRF-Token', csrfToken)
      .send({ notes: 'Safe user note.' })
      .expect(200);
    expectNoUserFacingSourceDisclosure(notesResponse.body);
  });

  it('rejects internal source keys during public campaign creation', async () => {
    const csrfToken = await getCsrfToken(agent1);
    const basePayload = {
      workspaceId: workspace1Id,
      name: 'Rejected internal source',
      query: 'cafes in Amman',
      country: 'Jordan',
      city: 'Amman',
      requestedLimit: 5,
    };

    for (const source of ['LOCAL_DATASET', 'DATASET_IMPORT', 'MANUAL_ADMIN', 'CSV', 'INSTAGRAM_DATASET', 'GOOGLE_MAPS_DATASET']) {
      await agent1
        .post('/api/search/campaigns')
        .set('X-CSRF-Token', csrfToken)
        .send({ ...basePayload, sources: [source] })
        .expect(400);
    }

    await agent1
      .post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({ ...basePayload, name: 'Accepted Instagram source', sources: ['INSTAGRAM'] })
      .expect(201);

    await agent1
      .post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({ ...basePayload, name: 'Accepted Google source', sources: ['GOOGLE_MAPS'] })
      .expect(201);
  });

  it('paginates merged lead results without duplicates for list-specific queries', async () => {
    const extraList = await prisma.leadList.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        name: `Pagination List ${unique}`,
        resultCount: 12,
      },
    });

    const createdCatalogLeads = [];
    for (let index = 0; index < 12; index += 1) {
      createdCatalogLeads.push(await prisma.leadCatalog.create({
        data: {
          businessName: `Pagination Cafe ${index} ${unique}`,
          category: 'Cafe',
          country: 'Jordan',
          city: 'Amman',
          source: 'LOCAL_DATASET',
          sourceId: `pagination-${index}-${unique}`,
          normalizedFingerprint: `pagination-fingerprint-${index}-${unique}`,
        },
      }));
    }

    await prisma.leadListLead.createMany({
      data: createdCatalogLeads.map((lead, index) => ({
        leadListId: extraList.id,
        catalogLeadId: lead.id,
        rank: index + 1,
        status: 'NEW',
      })),
    });

    const page1 = await agent1.get(`/api/search/leads?listId=${extraList.id}&limit=5&page=1`).expect(200);
    const page2 = await agent1.get(`/api/search/leads?listId=${extraList.id}&limit=5&page=2`).expect(200);

    expect(page1.body.data.pagination.total).toBe(12);
    expect(page2.body.data.pagination.total).toBe(12);
    expect(page1.body.data.leads).toHaveLength(5);
    expect(page2.body.data.leads).toHaveLength(5);

    const page1Ids = new Set(page1.body.data.leads.map((lead) => lead.id));
    const page2Ids = new Set(page2.body.data.leads.map((lead) => lead.id));
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
    expectNoUserFacingSourceDisclosure(page1.body);
    expectNoUserFacingSourceDisclosure(page2.body);
  });

  it('blocks stored-intelligence campaign runs when the user cannot cover the maximum estimated search cost', async () => {
    const csrfToken = await getCsrfToken(agent2);
    const me2 = await agent2.get('/api/auth/me').expect(200);

    const campaignRes = await agent2.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: me2.body.data.workspace.id,
        name: 'Too expensive stored intelligence search',
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM'],
        requestedLimit: 46,
      })
      .expect(201);

    const beforeCredits = (await agent2.get('/api/credits')).body.data.credits.balance;
    const runRes = await agent2.post(`/api/search/campaigns/${campaignRes.body.data.campaign.id}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(402);

    expect(runRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    const afterCredits = (await agent2.get('/api/credits')).body.data.credits.balance;
    expect(afterCredits).toBe(beforeCredits);

    const lists = await prisma.leadList.count({ where: { campaignId: campaignRes.body.data.campaign.id } });
    expect(lists).toBe(0);
  });

  it('calculates zero-result search cost as zero while preserving maximum pre-run reservation', async () => {
    const {
      calculateSearchCreditCost,
      estimateSearchCreditReservation,
    } = await import('../../src/modules/credits/credit.service.js');

    expect(calculateSearchCreditCost({ returnedLeadsCount: 0 })).toBe(0);
    expect(calculateSearchCreditCost({ returnedLeadsCount: -5 })).toBe(0);
    expect(calculateSearchCreditCost({ returnedLeadsCount: 3 })).toBe(8);
    expect(estimateSearchCreditReservation({ requestedLimit: 3 })).toBe(8);
  });

  it('matches smart business type aliases such as Cafes to Coffee Shop leads', async () => {
    const csrfToken = await getCsrfToken(agent1);

    const campaignRes = await agent1.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: workspace1Id,
        name: 'Cafe alias intelligence search',
        query: 'cafes in Amman without websites',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafes'],
        sources: ['INSTAGRAM'],
        filters: { goal: 'Find businesses without websites' },
        requestedLimit: 5,
      });

    expect(campaignRes.status).toBe(201);
    const campaignId = campaignRes.body.data.campaign.id;

    const runRes = await agent1.post(`/api/search/campaigns/${campaignId}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    const runData = runRes.body.data;
    expect(runData.leadsReturned).toBeGreaterThanOrEqual(1);
    expect(runData).not.toHaveProperty('matchedLeads');

    const leadsRes = await agent1.get(`/api/search/lists/${runData.leadListId}/leads`).expect(200);
    expect(leadsRes.body.data.leads.some((lead) => lead.businessName.includes('Specialty Roastery'))).toBe(true);
    expect(leadsRes.body.data.leads[0]).not.toHaveProperty('sourceFile');
    expect(JSON.stringify(leadsRes.body.data.leads)).not.toContain('LOCAL_DATASET');
    expect(JSON.stringify(leadsRes.body.data.leads)).not.toContain('DATASET_IMPORT');
  });
});
