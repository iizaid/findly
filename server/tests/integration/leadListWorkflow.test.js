import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4102';

const unique = Date.now().toString(36);

let createApp;
let prisma;
let getTestOutbox;
let processNextSearchJob;
let setAiProviderOverridesForTests;
let MockAiProvider;
let env;
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
  ({ processNextSearchJob } = await import('../../src/workers/searchWorker.js'));
  ({ setAiProviderOverridesForTests } = await import('../../src/modules/ai/aiRouter.service.js'));
  ({ MockAiProvider } = await import('../../src/modules/ai/providers/mockProvider.js'));
  ({ env } = await import('../../src/config/env.js'));

  await prisma.job.updateMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', lockedAt: null, lockedBy: null },
  });
  await prisma.searchCampaign.updateMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', lockedAt: null, lockedBy: null },
  });

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

const processCampaignJob = async (campaignId) => {
  const result = await processNextSearchJob({ workerId: `test-worker-${unique}` });
  expect(result?.status).toBe('COMPLETED');

  const statusResponse = await agent1.get(`/api/search/campaigns/${campaignId}/status`).expect(200);
  expect(statusResponse.body.data.campaign.status).toBe('COMPLETED');
  return statusResponse.body.data.campaign;
};

const createAnalysisFixture = async (suffix) => {
  const campaign = await prisma.searchCampaign.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      name: `AI Analysis ${suffix} ${unique}`,
      query: 'cafes',
      country: 'Jordan',
      city: 'Amman',
      sources: ['INSTAGRAM'],
      status: 'COMPLETED',
    },
  });

  const leadList = await prisma.leadList.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      name: `AI Analysis List ${suffix} ${unique}`,
      resultCount: 1,
    },
  });

  const catalogLead = await prisma.leadCatalog.create({
    data: {
      businessName: `AI Cafe ${suffix} ${unique}`,
      category: 'Cafe',
      country: 'Jordan',
      city: 'Amman',
      source: 'LOCAL_DATASET',
      sourceId: `ai-cafe-${suffix}-${unique}`,
      normalizedFingerprint: `ai-cafe-fingerprint-${suffix}-${unique}`,
      detectedSignals: ['NO_WEBSITE', 'HAS_PHONE'],
    },
  });

  const item = await prisma.leadListLead.create({
    data: {
      leadListId: leadList.id,
      catalogLeadId: catalogLead.id,
      rank: 1,
      status: 'NEW',
    },
  });

  return { campaign, leadList, catalogLead, item };
};

const withAiConfig = async (overrides, callback) => {
  const previous = {
    AI_ENABLED: env.AI_ENABLED,
    AI_ANALYSIS_ENABLED: env.AI_ANALYSIS_ENABLED,
    AI_ANALYSIS_PROVIDER_CHAIN: env.AI_ANALYSIS_PROVIDER_CHAIN,
    AI_ANALYSIS_MAX_RETRIES: env.AI_ANALYSIS_MAX_RETRIES,
  };

  Object.assign(env, overrides.env);
  setAiProviderOverridesForTests(overrides.providers || null);
  try {
    return await callback();
  } finally {
    Object.assign(env, previous);
    setAiProviderOverridesForTests(null);
  }
};

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

  it('single list item analysis uses mock AI when enabled and charges once', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const { leadList, item } = await createAnalysisFixture('assisted');
    const csrfToken = await getCsrfToken(agent1);
    const mock = new MockAiProvider();

    await withAiConfig({
      env: {
        AI_ENABLED: true,
        AI_ANALYSIS_ENABLED: true,
        AI_ANALYSIS_PROVIDER_CHAIN: 'mock,rule_based',
        AI_ANALYSIS_MAX_RETRIES: 0,
      },
      providers: { mock },
    }, async () => {
      const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      const response = await agent1.post(`/api/search/lists/${leadList.id}/items/${item.id}/analyze`)
        .set('X-CSRF-Token', csrfToken)
        .send({})
        .expect(200);

      expect(response.body.data.reused).toBe(false);
      expect(response.body.data.creditsUsed).toBe(1);
      expect(response.body.data.analysisSource).toBe('AI_ASSISTED');
      expect(response.body.data.aiProvider).toBe('mock');
      expect(response.body.data.aiFallbackUsed).toBe(false);
      expect(response.body.data.analysis.analysisSource).toBe('AI_ASSISTED');
      expect(JSON.stringify(response.body)).not.toContain('test-key');

      const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      expect(afterCredits).toBe(beforeCredits - 1);
      expect(mock.callCount).toBe(1);
    });
  });

  it('single list item analysis falls back when AI returns invalid JSON and still charges once', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const { leadList, item } = await createAnalysisFixture('invalidai');
    const csrfToken = await getCsrfToken(agent1);
    const mock = new MockAiProvider({ mode: 'invalid' });

    await withAiConfig({
      env: {
        AI_ENABLED: true,
        AI_ANALYSIS_ENABLED: true,
        AI_ANALYSIS_PROVIDER_CHAIN: 'mock,rule_based',
        AI_ANALYSIS_MAX_RETRIES: 0,
      },
      providers: { mock },
    }, async () => {
      const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      const response = await agent1.post(`/api/search/lists/${leadList.id}/items/${item.id}/analyze`)
        .set('X-CSRF-Token', csrfToken)
        .send({})
        .expect(200);

      expect(response.body.data.reused).toBe(false);
      expect(response.body.data.creditsUsed).toBe(1);
      expect(response.body.data.analysisSource).toBe('AI_FALLBACK');
      expect(response.body.data.aiProvider).toBe(null);
      expect(response.body.data.aiFallbackUsed).toBe(true);

      const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      expect(afterCredits).toBe(beforeCredits - 1);
    });
  });

  it('existing analyzed list item returns reused and does not call AI', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const { leadList, item } = await createAnalysisFixture('reuse');
    const csrfToken = await getCsrfToken(agent1);

    await agent1.post(`/api/search/lists/${leadList.id}/items/${item.id}/analyze`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    const mock = new MockAiProvider();
    await withAiConfig({
      env: {
        AI_ENABLED: true,
        AI_ANALYSIS_ENABLED: true,
        AI_ANALYSIS_PROVIDER_CHAIN: 'mock,rule_based',
        AI_ANALYSIS_MAX_RETRIES: 0,
      },
      providers: { mock },
    }, async () => {
      const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      const response = await agent1.post(`/api/search/lists/${leadList.id}/items/${item.id}/analyze`)
        .set('X-CSRF-Token', csrfToken)
        .send({})
        .expect(200);

      expect(response.body.data.reused).toBe(true);
      expect(response.body.data.creditsUsed).toBe(0);
      expect(mock.callCount).toBe(0);
      const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      expect(afterCredits).toBe(beforeCredits);
    });
  });

  it('concurrent single item analysis does not double charge', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const { leadList, item } = await createAnalysisFixture('concurrent');
    const csrfToken = await getCsrfToken(agent1);
    const mock = new MockAiProvider();
    const originalGenerate = mock.generateJson.bind(mock);
    mock.generateJson = async (args) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return originalGenerate(args);
    };

    await withAiConfig({
      env: {
        AI_ENABLED: true,
        AI_ANALYSIS_ENABLED: true,
        AI_ANALYSIS_PROVIDER_CHAIN: 'mock,rule_based',
        AI_ANALYSIS_MAX_RETRIES: 0,
      },
      providers: { mock },
    }, async () => {
      const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      const [first, second] = await Promise.all([
        agent1.post(`/api/search/lists/${leadList.id}/items/${item.id}/analyze`)
          .set('X-CSRF-Token', csrfToken)
          .send({}),
        agent1.post(`/api/search/lists/${leadList.id}/items/${item.id}/analyze`)
          .set('X-CSRF-Token', csrfToken)
          .send({}),
      ]);

      expect([200, 409]).toContain(first.status);
      expect([200, 409]).toContain(second.status);

      const analysisCount = await prisma.leadAnalysis.count({ where: { leadListLeadId: item.id } });
      expect(analysisCount).toBe(1);
      const ledgerCount = await prisma.creditLedger.count({
        where: {
          userId: user1Id,
          type: 'CREDIT_USED',
          referenceType: 'LeadListLead',
          referenceId: item.id,
        },
      });
      expect(ledgerCount).toBe(1);
      const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
      expect(afterCredits).toBe(beforeCredits - 1);
    });
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

    expect(runRes.status).toBe(202);
    const runData = runRes.body.data;

    expect(runData.status).toBe('QUEUED');
    expect(runData.jobId).toBeDefined();
    const reservedCampaign = await prisma.searchCampaign.findUnique({ where: { id: newCampaignId } });
    const reservation = await prisma.creditReservation.findFirst({ where: { campaignId: newCampaignId } });
    expect(reservedCampaign.creditsReserved).toBe(10);
    expect(reservation.status).toBe('ACTIVE');
    const afterQueueCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterQueueCredits).toBe(beforeCredits - 10);
    await agent1.post(`/api/search/campaigns/${newCampaignId}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(409);

    const completed = await processCampaignJob(newCampaignId);
    expect(completed.leadListId).toBeDefined();
    expect(completed.resultCount).toBeGreaterThanOrEqual(1); // Should match our global catalog
    expect(completed.creditsUsed).toBe(5 + completed.resultCount);
    for (const hiddenField of ['sourceUsed', 'fallbackUsed', 'fallbackReason', 'searchMode', 'sourceMode', 'sourceRequested', 'matchedLeads']) {
      expect(runData).not.toHaveProperty(hiddenField);
    }
    expect(JSON.stringify(runData)).not.toContain('LOCAL_DATASET');

    const afterCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCredits).toBe(beforeCredits - completed.creditsUsed);

    const campaign = await prisma.searchCampaign.findUnique({ where: { id: newCampaignId } });
    expect(campaign.creditsUsed).toBe(completed.creditsUsed);
    expect(campaign.creditsReserved).toBe(0);
    const capturedReservation = await prisma.creditReservation.findFirst({ where: { campaignId: newCampaignId } });
    expect(capturedReservation.status).toBe('CAPTURED');
    expect(capturedReservation.capturedAmount).toBe(completed.creditsUsed);
    expect(capturedReservation.releasedAmount).toBe(10 - completed.creditsUsed);

    const usedLedgerRows = await prisma.creditLedger.count({
      where: {
        userId: user1Id,
        type: 'CREDIT_USED',
        referenceType: 'SearchCampaign',
        referenceId: newCampaignId,
      },
    });
    expect(usedLedgerRows).toBe(1);
  });

  it('releases reserved search credits when a queued campaign is cancelled', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const csrfToken = await getCsrfToken(agent1);
    const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;

    const campaignRes = await agent1.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: workspace1Id,
        name: 'Cancel queued search',
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM'],
        requestedLimit: 5,
      })
      .expect(201);

    const campaignToCancel = campaignRes.body.data.campaign.id;
    await agent1.post(`/api/search/campaigns/${campaignToCancel}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(202);

    const afterQueueCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterQueueCredits).toBe(beforeCredits - 10);

    const cancelResponse = await agent1.post(`/api/search/campaigns/${campaignToCancel}/cancel`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    expect(cancelResponse.body.data.status).toBe('CANCELLED');
    const afterCancelCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCancelCredits).toBe(beforeCredits);

    const reservation = await prisma.creditReservation.findFirst({ where: { campaignId: campaignToCancel } });
    expect(reservation.status).toBe('CANCELLED');
    expect(reservation.releasedAmount).toBe(10);

    const campaign = await prisma.searchCampaign.findUnique({ where: { id: campaignToCancel } });
    expect(campaign.status).toBe('CANCELLED');
    expect(campaign.creditsReserved).toBe(0);
  });

  it('does not charge a cancelled running campaign after its reservation is released', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const csrfToken = await getCsrfToken(agent1);
    const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;

    const campaignRes = await agent1.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: workspace1Id,
        name: 'Cancel running search race',
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM'],
        requestedLimit: 5,
      })
      .expect(201);

    const campaignToCancel = campaignRes.body.data.campaign.id;
    const runRes = await agent1.post(`/api/search/campaigns/${campaignToCancel}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(202);
    const jobId = runRes.body.data.jobId;

    await prisma.searchCampaign.update({
      where: { id: campaignToCancel },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), lockedAt: new Date(), lockedBy: 'test-worker' },
    });

    await agent1.post(`/api/search/campaigns/${campaignToCancel}/cancel`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    const afterCancelCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCancelCredits).toBe(beforeCredits);

    const { captureSearchCreditReservation } = await import('../../src/modules/credits/credit.service.js');
    await expect(prisma.$transaction((tx) => captureSearchCreditReservation({
      tx,
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaignToCancel,
      amountUsed: 6,
      reason: 'Test capture after cancellation',
      referenceType: 'SearchCampaign',
      referenceId: campaignToCancel,
      requireActiveReservation: true,
    }))).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_RUNNABLE' });

    const afterCaptureAttemptCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCaptureAttemptCredits).toBe(beforeCredits);
    const usedLedgerRows = await prisma.creditLedger.count({
      where: {
        userId: user1Id,
        type: 'CREDIT_USED',
        referenceType: 'SearchCampaign',
        referenceId: campaignToCancel,
      },
    });
    expect(usedLedgerRows).toBe(0);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', lockedAt: null, lockedBy: null },
    });
  });

  it('releases a search reservation when a queued campaign fails before provider execution', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const beforeCredits = (await agent1.get('/api/credits')).body.data.credits.balance;

    const { reserveSearchCredits } = await import('../../src/modules/credits/credit.service.js');
    const { enqueueJob } = await import('../../src/modules/jobs/jobQueue.service.js');
    const campaign = await prisma.searchCampaign.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        name: 'Unsupported provider reservation release',
        query: 'unsupported opportunity search',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['UNSUPPORTED_PROVIDER'],
        requestedLimit: 5,
        status: 'QUEUED',
      },
    });
    const job = await enqueueJob({
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      type: 'SEARCH_CAMPAIGN_RUN',
      payload: { campaignId: campaign.id },
    });
    await prisma.$transaction((tx) => reserveSearchCredits({
      tx,
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      jobId: job.id,
      amount: 10,
      reason: `Reserved search credits: ${campaign.name}`,
    }));

    const afterReservationCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterReservationCredits).toBe(beforeCredits - 10);

    const result = await processNextSearchJob({ workerId: `test-worker-failure-${unique}` });
    expect(result?.status).toBe('FAILED');

    const afterFailureCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterFailureCredits).toBe(beforeCredits);
    const reservation = await prisma.creditReservation.findFirst({ where: { campaignId: campaign.id } });
    expect(reservation.status).toBe('RELEASED');
    expect(reservation.releasedAmount).toBe(10);
    const failedCampaign = await prisma.searchCampaign.findUnique({ where: { id: campaign.id } });
    expect(failedCampaign.status).toBe('FAILED');
    expect(failedCampaign.creditsReserved).toBe(0);
  });

  it('captures zero credits and releases the full reservation for zero-result completion', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const { reserveSearchCredits, captureSearchCreditReservation } = await import('../../src/modules/credits/credit.service.js');

    const campaign = await prisma.searchCampaign.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        name: 'Zero result reservation capture',
        query: 'no matches',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM'],
        requestedLimit: 5,
        status: 'RUNNING',
      },
    });

    await reserveSearchCredits({
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      amount: 10,
      reason: 'Test zero-result reservation',
    });
    const afterReserveCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterReserveCredits).toBe(40);

    const captureResult = await prisma.$transaction((tx) => captureSearchCreditReservation({
      tx,
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      amountUsed: 0,
      reason: 'Test zero-result capture',
      referenceType: 'SearchCampaign',
      referenceId: campaign.id,
      requireActiveReservation: true,
    }));

    expect(captureResult.capturedAmount).toBe(0);
    expect(captureResult.releasedAmount).toBe(10);
    const afterCaptureCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterCaptureCredits).toBe(50);
    const reservation = await prisma.creditReservation.findFirst({ where: { campaignId: campaign.id } });
    expect(reservation.status).toBe('CAPTURED');
    expect(reservation.capturedAmount).toBe(0);
    expect(reservation.releasedAmount).toBe(10);
    const usedLedgerRows = await prisma.creditLedger.count({
      where: {
        userId: user1Id,
        type: 'CREDIT_USED',
        referenceType: 'SearchCampaign',
        referenceId: campaign.id,
      },
    });
    expect(usedLedgerRows).toBe(0);

    await prisma.searchCampaign.update({
      where: { id: campaign.id },
      data: { status: 'COMPLETED', creditsUsed: 0, resultCount: 0, completedAt: new Date() },
    });
  });

  it('does not silently deduct credits when campaign completion is missing an active reservation', async () => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const csrfToken = await getCsrfToken(agent1);
    const campaignRes = await agent1.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: workspace1Id,
        name: 'Missing reservation completion',
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM'],
        requestedLimit: 5,
      })
      .expect(201);

    const missingReservationCampaignId = campaignRes.body.data.campaign.id;
    const { captureSearchCreditReservation } = await import('../../src/modules/credits/credit.service.js');
    await expect(prisma.$transaction((tx) => captureSearchCreditReservation({
      tx,
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: missingReservationCampaignId,
      amountUsed: 6,
      reason: 'Test missing reservation capture',
      referenceType: 'SearchCampaign',
      referenceId: missingReservationCampaignId,
      requireActiveReservation: true,
    }))).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_RUNNABLE' });

    const afterAttemptCredits = (await agent1.get('/api/credits')).body.data.credits.balance;
    expect(afterAttemptCredits).toBe(50);
    const usedLedgerRows = await prisma.creditLedger.count({
      where: {
        userId: user1Id,
        type: 'CREDIT_USED',
        referenceType: 'SearchCampaign',
        referenceId: missingReservationCampaignId,
      },
    });
    expect(usedLedgerRows).toBe(0);
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

    const separatedPayload = await agent1
      .post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        ...basePayload,
        name: 'Separated discovery and focus payload',
        sources: ['GOOGLE_MAPS'],
        presenceTargets: ['INSTAGRAM', 'FACEBOOK'],
        filters: { goal: 'General opportunity discovery', presenceTargets: ['INSTAGRAM', 'FACEBOOK'] },
      })
      .expect(201);

    expect(separatedPayload.body.data.campaign.sources).toEqual(['GOOGLE_MAPS']);
    expect(separatedPayload.body.data.campaign.presenceTargets).toEqual(['INSTAGRAM', 'FACEBOOK']);

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

  it('claims queued jobs once, retries failed jobs within attempts, and cleans stale running jobs', async () => {
    const {
      claimNextJob,
      cleanupStaleJobs,
      heartbeatJob,
      retryJobIfAllowed,
    } = await import('../../src/modules/jobs/jobQueue.service.js');
    const { cleanupStaleQueuedCampaigns } = await import('../../src/modules/search/campaignJob.service.js');

    const queuedJob = await prisma.job.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'QUEUED',
        payload: { test: true },
      },
    });

    const claims = await Promise.all([
      claimNextJob({ workerId: 'parallel-worker-a', type: 'SEARCH_CAMPAIGN_RUN' }),
      claimNextJob({ workerId: 'parallel-worker-b', type: 'SEARCH_CAMPAIGN_RUN' }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.filter(Boolean)[0].id).toBe(queuedJob.id);

    const failedJob = await prisma.job.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'FAILED',
        attempts: 1,
        maxAttempts: 3,
        errorCode: 'TEST_FAILURE',
      },
    });
    const retried = await retryJobIfAllowed({ jobId: failedJob.id });
    expect(retried.status).toBe('QUEUED');

    const staleJob = await prisma.job.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'RUNNING',
        attempts: 1,
        lockedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        lockedBy: 'stale-worker',
      },
    });
    const cleanup = await cleanupStaleJobs();
    expect(cleanup.count).toBeGreaterThanOrEqual(1);
    const cleaned = await prisma.job.findUnique({ where: { id: staleJob.id } });
    expect(cleaned.status).toBe('FAILED');

    const heartbeatJobRow = await prisma.job.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'RUNNING',
        attempts: 1,
        lockedAt: new Date(),
        lockedBy: 'heartbeat-worker',
      },
    });
    await heartbeatJob({ jobId: heartbeatJobRow.id, workerId: 'heartbeat-worker' });
    const heartbeated = await prisma.job.findUnique({ where: { id: heartbeatJobRow.id } });
    expect(heartbeated.lastHeartbeatAt).toBeTruthy();

    const stuckCampaign = await prisma.searchCampaign.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        name: `Stuck queued campaign ${unique}`,
        query: 'cafes',
        sources: ['INSTAGRAM'],
        status: 'QUEUED',
        requestedLimit: 5,
      },
    });
    await prisma.job.create({
      data: {
        userId: user1Id,
        workspaceId: workspace1Id,
        campaignId: stuckCampaign.id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'FAILED',
        errorCode: 'TEST_FAILURE',
        errorMessage: 'Queued job failed before running.',
      },
    });
    const queuedCleanup = await cleanupStaleQueuedCampaigns();
    expect(queuedCleanup.count).toBeGreaterThanOrEqual(1);
    const cleanedCampaign = await prisma.searchCampaign.findUnique({ where: { id: stuckCampaign.id } });
    expect(cleanedCampaign.status).toBe('FAILED');

    await prisma.job.updateMany({
      where: { id: { in: [queuedJob.id, failedJob.id, heartbeatJobRow.id] } },
      data: { status: 'CANCELLED', lockedAt: null, lockedBy: null },
    });
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

  it('rejects new campaign runs when the user already has too many active search jobs', async () => {
    const csrfToken = await getCsrfToken(agent2);
    const me2 = await agent2.get('/api/auth/me').expect(200);

    const blockers = await Promise.all([0, 1].map((index) => prisma.job.create({
      data: {
        userId: me2.body.data.user.id,
        workspaceId: me2.body.data.workspace.id,
        type: 'SEARCH_CAMPAIGN_RUN',
        status: 'QUEUED',
        payload: { blocker: index },
      },
    })));

    const campaignRes = await agent2.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: me2.body.data.workspace.id,
        name: 'Backpressure search',
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafe'],
        sources: ['INSTAGRAM'],
        requestedLimit: 5,
      })
      .expect(201);

    const runRes = await agent2.post(`/api/search/campaigns/${campaignRes.body.data.campaign.id}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(409);

    expect(runRes.body.error.code).toBe('JOB_ALREADY_RUNNING');

    await prisma.job.updateMany({
      where: { id: { in: blockers.map((job) => job.id) } },
      data: { status: 'CANCELLED' },
    });
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
      .expect(202);

    const runData = runRes.body.data;
    expect(runData.status).toBe('QUEUED');
    expect(runData).not.toHaveProperty('matchedLeads');
    const completed = await processCampaignJob(campaignId);
    expect(completed.resultCount).toBeGreaterThanOrEqual(1);

    const leadsRes = await agent1.get(`/api/search/lists/${completed.leadListId}/leads`).expect(200);
    expect(leadsRes.body.data.leads.some((lead) => lead.businessName.includes('Specialty Roastery'))).toBe(true);
    expect(leadsRes.body.data.leads[0]).not.toHaveProperty('sourceFile');
    expect(JSON.stringify(leadsRes.body.data.leads)).not.toContain('LOCAL_DATASET');
    expect(JSON.stringify(leadsRes.body.data.leads)).not.toContain('DATASET_IMPORT');

    const listItemsForCampaign = await prisma.leadListLead.findMany({
      where: { leadListId: completed.leadListId },
      select: { catalogLeadId: true },
    });
    const catalogIds = listItemsForCampaign.map((item) => item.catalogLeadId).filter(Boolean);
    const evidenceCount = await prisma.leadEvidence.count({
      where: {
        campaignId,
        discoveryMethod: 'LOCAL_DATASET',
        catalogLeadId: { in: catalogIds },
      },
    });
    const discoveryQueryCount = await prisma.discoveryQuery.count({
      where: {
        campaignId,
        discoveryMethod: 'LOCAL_DATASET',
      },
    });

    expect(listItemsForCampaign).toHaveLength(completed.resultCount);
    expect(evidenceCount).toBe(catalogIds.length);
    expect(discoveryQueryCount).toBe(1);
  });

  it.each(['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'REDDIT', 'YELP', 'TRIPADVISOR', 'LINKEDIN', 'YOUTUBE', 'X', 'WEBSITE'])('uses local dataset fallback for %s signal target without requiring a direct API key', async (source) => {
    await prisma.user.update({ where: { id: user1Id }, data: { creditsBalance: 50 } });
    const csrfToken = await getCsrfToken(agent1);

    const campaignRes = await agent1.post('/api/search/campaigns')
      .set('X-CSRF-Token', csrfToken)
      .send({
        workspaceId: workspace1Id,
        name: `${source} signal fallback ${unique}`,
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafes'],
        sources: [source],
        filters: { goal: 'General opportunity discovery' },
        requestedLimit: 1,
      })
      .expect(201);

    const signalCampaignId = campaignRes.body.data.campaign.id;
    const runRes = await agent1.post(`/api/search/campaigns/${signalCampaignId}/run`)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(202);

    expect(runRes.body.data.status).toBe('QUEUED');
    const completed = await processCampaignJob(signalCampaignId);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.errorCode).toBeNull();

    const list = await prisma.leadList.findFirst({
      where: { campaignId: signalCampaignId },
      select: { sourceUsed: true, fallbackUsed: true, resultCount: true },
    });
    expect(list).toMatchObject({
      sourceUsed: 'LOCAL_DATASET',
      fallbackUsed: true,
    });
    expect(list.resultCount).toBeGreaterThanOrEqual(0);

    const discoveryQuery = await prisma.discoveryQuery.findFirst({
      where: { campaignId: signalCampaignId },
      select: { discoveryMethod: true, adapter: true, targetSources: true },
    });
    expect(discoveryQuery).toMatchObject({
      discoveryMethod: 'LOCAL_DATASET',
      adapter: 'LOCAL_DATASET',
    });
    expect(discoveryQuery.targetSources).toContain(source);
  });
});
