import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

let createApp;
let prisma;
let agentAdmin;
let agentUser;
let agentGuest;

const unique = Date.now().toString(36);
const adminEmail = `admin.status.${unique}@findly.local`;
const userEmail = `user.status.${unique}@findly.local`;

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));

  const app = createApp();
  agentAdmin = request.agent(app);
  agentUser = request.agent(app);
  agentGuest = request.agent(app);

  await prisma.user.deleteMany({
    where: { email: { in: [adminEmail, userEmail] } }
  }).catch(() => {});

  // Create normal user
  await agentUser.post('/api/auth/register').send({
    name: 'Normal User',
    email: userEmail,
    password: 'Secure12345@#$'
  });

  // Create admin user
  await agentAdmin.post('/api/auth/register').send({
    name: 'Admin User',
    email: adminEmail,
    password: 'Secure12345@#$'
  });

  await prisma.user.updateMany({
    where: { email: { in: [adminEmail, userEmail] } },
    data: { emailVerified: true }
  });

  await prisma.user.update({
    where: { email: adminEmail },
    data: { role: 'ADMIN' }
  });

  await agentUser.post('/api/auth/login').send({
    email: userEmail,
    password: 'Secure12345@#$'
  });

  await agentAdmin.post('/api/auth/login').send({
    email: adminEmail,
    password: 'Secure12345@#$'
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [adminEmail, userEmail] } }
  }).catch(() => {});
  await prisma.$disconnect();
});

describe('Admin System Status Endpoint', () => {
  it('rejects unauthenticated users', async () => {
    const res = await agentGuest.get('/api/admin/system/status').expect(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects normal verified users', async () => {
    const res = await agentUser.get('/api/admin/system/status').expect(403);
    expect(res.body.success).toBe(false);
  });

  it('returns structured system status for admins', async () => {
    const res = await agentAdmin.get('/api/admin/system/status').expect(200);
    const data = res.body.data;

    // Database
    expect(data.database).toBeDefined();
    expect(['online', 'degraded', 'offline']).toContain(data.database.status);
    expect(data.database.label).toBe('Database');
    expect(data.database.checkedAt).toBeDefined();

    // Local Dataset
    expect(data.localDataset).toBeDefined();
    expect(['available', 'empty']).toContain(data.localDataset.status);
    expect(data.localDataset.label).toBe('Local Dataset');
    expect(typeof data.localDataset.totalCatalogLeads).toBe('number');

    // Sources
    expect(Array.isArray(data.sources)).toBe(true);
    const googleMaps = data.sources.find(s => s.key === 'GOOGLE_MAPS');
    expect(googleMaps).toBeDefined();
    expect(googleMaps.label).toBe('Google Maps / Places');
    expect(typeof googleMaps.configured).toBe('boolean');

    // Import Pipeline
    expect(data.importPipeline).toBeDefined();
    expect(data.importPipeline.status).toBe('available');
    expect(data.importPipeline.allowedFileTypes).toContain('.csv');
    expect(typeof data.importPipeline.ttlMinutes).toBe('number');

    // Admin System
    expect(data.adminSystem).toBeDefined();
    expect(data.adminSystem.status).toBe('available');

    // AI Providers
    expect(data.aiProviders).toBeDefined();
    expect(['disabled', 'configured']).toContain(data.aiProviders.status);
    expect(Array.isArray(data.aiProviders.providers)).toBe(true);
    expect(data.aiProviders.providers.find((provider) => provider.provider === 'gemini')).toBeDefined();
    expect(data.aiProviders.leadAnalysis.providerChain).toContain('rule_based');
  });

  it('does not expose secrets or sensitive info', async () => {
    const res = await agentAdmin.get('/api/admin/system/status').expect(200);
    const bodyStr = JSON.stringify(res.body);

    // Ensure common secrets are not leaked
    expect(bodyStr).not.toContain(process.env.DATABASE_URL || 'postgres://');
    expect(bodyStr).not.toContain('SMTP');
    expect(bodyStr).not.toContain('sk-'); // Common prefix for OpenAI/Stripe keys
    expect(bodyStr).not.toContain('C:\\');
    expect(bodyStr).not.toContain('/usr/src');
  });
});
