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
let user2Id;
let workspace2Id;
let leadListId;
let listItems = [];

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
    password: 'Secure12345',
  });
  
  const dbUser1 = await prisma.user.findUnique({ where: { email: `u1.${unique}@test.local` } });
  user1Id = dbUser1.id;
  await agent1.post('/api/auth/verify-email').send({ token: verificationTokenFor(dbUser1.email) });
  await agent1.post('/api/auth/login').send({ email: `u1.${unique}@test.local`, password: 'Secure12345' });
  const me1 = await agent1.get('/api/auth/me');
  workspace1Id = me1.body.data.workspace.id;

  // Setup User 2
  agent2 = request.agent(createApp());
  await agent2.post('/api/auth/register').send({
    name: 'User 2',
    email: `u2.${unique}@test.local`,
    password: 'Secure12345',
  });
  const dbUser2 = await prisma.user.findUnique({ where: { email: `u2.${unique}@test.local` } });
  user2Id = dbUser2.id;
  await agent2.post('/api/auth/verify-email').send({ token: verificationTokenFor(dbUser2.email) });
  await agent2.post('/api/auth/login').send({ email: `u2.${unique}@test.local`, password: 'Secure12345' });
  const me2 = await agent2.get('/api/auth/me');
  workspace2Id = me2.body.data.workspace.id;

  // Create Campaign & LeadList for User 1
  const campaign = await prisma.searchCampaign.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      name: `Test Campaign ${unique}`,
      query: 'cafes',
      country: 'Jordan',
      city: 'Amman',
      sources: ['LOCAL_DATASET'],
      status: 'COMPLETED',
    }
  });

  const leadList = await prisma.leadList.create({
    data: {
      userId: user1Id,
      workspaceId: workspace1Id,
      campaignId: campaign.id,
      name: `Test List ${unique}`,
      sourceRequested: 'LOCAL_DATASET',
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
});
