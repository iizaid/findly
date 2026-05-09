import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4102';
process.env.SESSION_SECRET ??= 'test-session-secret';

let createApp;
let prisma;
let agentAdmin;
let agentUser;
let agentGuest;

const unique = Date.now().toString(36);
const adminEmail = `admin.activity.${unique}@findly.local`;
const userEmail = `user.activity.${unique}@findly.local`;

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

  const { hashPassword } = await import('../../src/utils/crypto.js');
  const hashed = await hashPassword('Secure12345@#$');

  const normalUser = await prisma.user.create({
    data: {
      name: 'Normal User',
      email: userEmail,
      passwordHash: hashed,
      emailVerified: true
    }
  });

  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: adminEmail,
      passwordHash: hashed,
      emailVerified: true,
      role: 'ADMIN'
    }
  });

  // Seed some AuditLog and BackendErrorLog
  await prisma.auditLog.create({
    data: {
      userId: normalUser.id,
      action: 'USER_REGISTERED',
      metadata: { source: 'organic', password: 'plain_text_password123', secret_key: 'sk_live_1234' }
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'ADMIN_ACCESS_DENIED',
      metadata: { reason: 'Invalid token' }
    }
  });

  await prisma.backendErrorLog.create({
    data: {
      userId: normalUser.id,
      statusCode: 500,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Database connection failed',
      route: '/api/something',
      requestId: `req-${unique}`
    }
  });

  await prisma.backendErrorLog.create({
    data: {
      userId: adminUser.id,
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'Bad input provided',
      route: '/api/admin/something',
      requestId: `req2-${unique}`
    }
  });

  // Logins to get session
  await agentUser.post('/api/auth/login').send({ email: userEmail, password: 'Secure12345@#$' }).expect(200);
  await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password: 'Secure12345@#$' }).expect(200);
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [adminEmail, userEmail] } }
  }).catch(() => {});
  await prisma.$disconnect();
});

describe('Admin Activity Logs API', () => {
  it('rejects unauthenticated users', async () => {
    const res = await agentGuest.get('/api/admin/activity').expect(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects normal verified users', async () => {
    const res = await agentUser.get('/api/admin/activity').expect(403);
    expect(res.body.success).toBe(false);
  });

  it('returns combined, normalized logs for admins', async () => {
    const res = await agentAdmin.get('/api/admin/activity?limit=100').expect(200);
    const data = res.body.data.activity;

    expect(data.length).toBeGreaterThanOrEqual(4);
    
    // Check shapes
    const first = data[0];
    expect(first.id).toBeDefined();
    expect(first.type).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.severity).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.createdAt).toBeDefined();
    
    // Audit log check
    const regLog = data.find(l => l.type === 'USER_REGISTERED' && l.actorEmail === userEmail);
    expect(regLog).toBeDefined();
    expect(regLog.category).toBe('auth');
    expect(regLog.severity).toBe('info');
    expect(regLog.actorEmail).toBe(userEmail);
    
    // Error log check
    const errLog = data.find(l => l.type === 'INTERNAL_SERVER_ERROR');
    expect(errLog).toBeDefined();
    expect(errLog.category).toBe('error');
    expect(errLog.severity).toBe('critical'); // 500 maps to critical
    expect(errLog.requestId).toBe(`req-${unique}`);
    
    const warnLog = data.find(l => l.type === 'VALIDATION_ERROR');
    expect(warnLog.severity).toBe('warning'); // 400 maps to warning
    
    const deniedLog = data.find(l => l.type === 'ADMIN_ACCESS_DENIED');
    expect(deniedLog.category).toBe('security');
    expect(deniedLog.severity).toBe('warning');
  });

  it('filters by category and severity', async () => {
    const catRes = await agentAdmin.get('/api/admin/activity?category=error').expect(200);
    for (const log of catRes.body.data.activity) {
      expect(log.category).toBe('error');
    }

    const sevRes = await agentAdmin.get('/api/admin/activity?severity=critical').expect(200);
    for (const log of sevRes.body.data.activity) {
      expect(log.severity).toBe('critical');
    }
  });

  it('searches by request ID or email', async () => {
    const uniqueReqId = `req-${unique}`;
    const reqSearch = await agentAdmin.get(`/api/admin/activity?search=${uniqueReqId}`).expect(200);
    expect(reqSearch.body.data.activity.length).toBe(1);
    expect(reqSearch.body.data.activity[0].type).toBe('INTERNAL_SERVER_ERROR');

    const emailSearch = await agentAdmin.get(`/api/admin/activity?search=${adminEmail}`).expect(200);
    expect(emailSearch.body.data.activity.length).toBeGreaterThan(0);
    for (const log of emailSearch.body.data.activity) {
      expect(log.actorEmail).toBe(adminEmail);
    }
  });

  it('sanitizes metadata and does not expose secrets', async () => {
    const res = await agentAdmin.get('/api/admin/activity?limit=100').expect(200);
    const regLog = res.body.data.activity.find(l => l.type === 'USER_REGISTERED' && l.metadataSummary && l.metadataSummary.source === 'organic');
    
    expect(regLog.metadataSummary).toBeDefined();
    expect(regLog.metadataSummary.source).toBe('organic');
    
    // Check redaction
    expect(regLog.metadataSummary.password).toBe('[REDACTED]');
    expect(regLog.metadataSummary.secret_key).toBe('[REDACTED]');
    
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('plain_text_password123');
    expect(bodyStr).not.toContain('sk_live_1234');
  });
});
