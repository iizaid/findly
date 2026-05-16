import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4106';
process.env.SESSION_SECRET ??= 'test-session-secret';

let createApp;
let prisma;
let agentRoot;
let agentAdmin;
let agentMod;
let agentUser;
let _agentGuest;

const unique = Date.now().toString(36);
const rootEmail = `root.role.${unique}@findly.local`;
const adminEmail = `admin.role.${unique}@findly.local`;
const modEmail = `mod.role.${unique}@findly.local`;
const userEmail = `user.role.${unique}@findly.local`;
const targetEmail = `target.role.${unique}@findly.local`;
const password = 'SecurePass123!@#';

let targetUserId;
let rootCsrfToken;
let adminCsrfToken;
let modCsrfToken;
let userCsrfToken;

const getCsrfToken = async (agent) => {
  const res = await agent.get('/api/csrf-token').expect(200);
  const token = res.body?.data?.csrfToken;
  expect(token).toBeTypeOf('string');
  expect(token.length).toBeGreaterThan(0);
  return token;
};

const errorMessage = (body) => body?.error?.message || body?.message || '';

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));

  const app = createApp();
  agentRoot = request.agent(app);
  agentAdmin = request.agent(app);
  agentMod = request.agent(app);
  agentUser = request.agent(app);
  _agentGuest = request.agent(app);

  const emails = [rootEmail, adminEmail, modEmail, userEmail, targetEmail];
  await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});

  // Register all accounts
  for (const [agent, email, name] of [
    [agentRoot, rootEmail, 'Root User'],
    [agentAdmin, adminEmail, 'Admin User'],
    [agentMod, modEmail, 'Mod User'],
    [agentUser, userEmail, 'Normal User'],
    [request.agent(app), targetEmail, 'Target User'],
  ]) {
    await agent.post('/api/auth/register').send({ name, email, password });
  }

  // Verify all and set roles
  await prisma.user.updateMany({
    where: { email: { in: emails } },
    data: { emailVerified: true },
  });

  await prisma.user.update({ where: { email: rootEmail }, data: { role: 'ROOT' } });
  await prisma.user.update({ where: { email: adminEmail }, data: { role: 'ADMIN' } });
  await prisma.user.update({ where: { email: modEmail }, data: { role: 'MODERATOR' } });

  const target = await prisma.user.findUnique({ where: { email: targetEmail } });
  targetUserId = target.id;

  // Log in
  await agentRoot.post('/api/auth/login').send({ email: rootEmail, password });
  await agentAdmin.post('/api/auth/login').send({ email: adminEmail, password });
  await agentMod.post('/api/auth/login').send({ email: modEmail, password });
  await agentUser.post('/api/auth/login').send({ email: userEmail, password });

  rootCsrfToken = await getCsrfToken(agentRoot);
  adminCsrfToken = await getCsrfToken(agentAdmin);
  modCsrfToken = await getCsrfToken(agentMod);
  userCsrfToken = await getCsrfToken(agentUser);
});

afterAll(async () => {
  const emails = [rootEmail, adminEmail, modEmail, userEmail, targetEmail];
  await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Role Management System', () => {

  /* ---- ACCESS CONTROL ---- */

  it('USER cannot access admin routes', async () => {
    await agentUser.get('/api/admin/summary').expect(403);
  });

  it('MODERATOR cannot access admin routes requiring ADMIN', async () => {
    await agentMod.get('/api/admin/summary').expect(403);
  });

  it('ADMIN can access normal admin routes', async () => {
    const res = await agentAdmin.get('/api/admin/summary').expect(200);
    expect(res.body.success).toBe(true);
  });

  it('ROOT can access normal admin routes', async () => {
    const res = await agentRoot.get('/api/admin/summary').expect(200);
    expect(res.body.success).toBe(true);
  });

  it('ADMIN cannot access ROOT-only role endpoint', async () => {
    const res = await agentAdmin
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ role: 'MODERATOR', reason: 'Testing admin blocked', confirmEmail: targetEmail })
      .expect(403);
    expect(res.body.success).toBe(false);
  });

  it('MODERATOR cannot access ROOT-only role endpoint', async () => {
    const res = await agentMod
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', modCsrfToken)
      .send({ role: 'MODERATOR', reason: 'Testing mod blocked', confirmEmail: targetEmail })
      .expect(403);
    expect(res.body.success).toBe(false);
  });

  /* ---- ROOT ROLE MANAGEMENT ---- */

  it('ROOT can promote USER to MODERATOR', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'MODERATOR', reason: 'Promoting for support access', confirmEmail: targetEmail })
      .expect(200);
    expect(res.body.data.user.role).toBe('MODERATOR');
    expect(res.body.data.change.from).toBe('User');
    expect(res.body.data.change.to).toBe('Moderator');
  });

  it('ROOT can promote MODERATOR to ADMIN', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'ADMIN', reason: 'Upgrading to full admin access', confirmEmail: targetEmail })
      .expect(200);
    expect(res.body.data.user.role).toBe('ADMIN');
  });

  it('ROOT can demote ADMIN to USER', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'USER', reason: 'Revoking admin privileges entirely', confirmEmail: targetEmail })
      .expect(200);
    expect(res.body.data.user.role).toBe('USER');
  });

  it('ROOT cannot assign ROOT from dashboard endpoint', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'ROOT', reason: 'Trying to assign root', confirmEmail: targetEmail })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('ROOT cannot modify another ROOT from dashboard endpoint', async () => {
    // Create a second ROOT temporarily
    const secondRootEmail = `root2.role.${unique}@findly.local`;
    const app = agentRoot.app;
    const tempAgent = request.agent(app);
    
    try {
      await tempAgent.post('/api/auth/register').send({ name: 'Root 2', email: secondRootEmail, password });
      await prisma.user.updateMany({
        where: { email: secondRootEmail },
        data: { emailVerified: true, role: 'ROOT' },
      });
      const secondRoot = await prisma.user.findUnique({ where: { email: secondRootEmail } });

      const res = await agentRoot
        .patch(`/api/admin/users/${secondRoot.id}/role`)
        .set('x-csrf-token', rootCsrfToken)
        .send({ role: 'ADMIN', reason: 'Demoting second root user', confirmEmail: secondRootEmail })
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(errorMessage(res.body)).toContain('ROOT');
    } finally {
      // Cleanup
      await prisma.user.deleteMany({ where: { email: secondRootEmail } }).catch(() => {});
    }
  });

  it('last ROOT cannot be demoted', async () => {
    const rootUser = await prisma.user.findUnique({ where: { email: rootEmail } });
    const rootCount = await prisma.user.count({ where: { role: 'ROOT' } });
    expect(rootCount).toBeGreaterThanOrEqual(1);

    const res = await agentRoot
      .patch(`/api/admin/users/${rootUser.id}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'ADMIN', reason: 'Trying self demotion from root', confirmEmail: rootEmail })
      .expect(403);
    expect(res.body.success).toBe(false);
    expect(errorMessage(res.body)).toMatch(/only root|ROOT users/i);
  });

  /* ---- VALIDATION ---- */

  it('role change requires reason (min 8 chars)', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'MODERATOR', reason: 'short', confirmEmail: targetEmail })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('role change requires confirmEmail', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'MODERATOR', reason: 'This is a valid long reason' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('role change rejects wrong confirmEmail', async () => {
    const res = await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'MODERATOR', reason: 'This is a valid long reason', confirmEmail: 'wrong@email.com' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('role change writes audit log', async () => {
    // First promote to have a fresh change
    await agentRoot
      .patch(`/api/admin/users/${targetUserId}/role`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ role: 'MODERATOR', reason: 'Promoting for audit log verification', confirmEmail: targetEmail })
      .expect(200);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'ADMIN_ROLE_CHANGED', entityId: targetUserId },
      orderBy: { createdAt: 'desc' },
    });

    expect(log).toBeTruthy();
    expect(log.metadata.previousRole).toBe('USER');
    expect(log.metadata.nextRole).toBe('MODERATOR');
    expect(log.metadata.reason).toBe('Promoting for audit log verification');
    expect(log.metadata.targetEmail).toBe(targetEmail);
  });

  /* ---- USERS LIST ---- */

  it('returns users list with role filter', async () => {
    const res = await agentRoot.get('/api/admin/users?role=ROOT').expect(200);
    expect(res.body.data.users.every(u => u.role === 'ROOT')).toBe(true);
  });

  it('user detail does not expose secrets', async () => {
    const res = await agentRoot.get(`/api/admin/users/${targetUserId}`).expect(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('passwordHash');
    expect(bodyStr).not.toContain('tokenHash');
    expect(res.body.data.user.email).toBe(targetEmail);
  });

  /* ---- ROOT CREDIT GRANTS ---- */

  it('USER cannot grant credits', async () => {
    await agentUser
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', userCsrfToken)
      .send({ amount: 10, reason: 'Testing blocked user grant', confirmEmail: targetEmail })
      .expect(403);
  });

  it('MODERATOR cannot grant credits', async () => {
    await agentMod
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', modCsrfToken)
      .send({ amount: 10, reason: 'Testing blocked moderator grant', confirmEmail: targetEmail })
      .expect(403);
  });

  it('ADMIN cannot grant credits', async () => {
    await agentAdmin
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ amount: 10, reason: 'Testing blocked admin grant', confirmEmail: targetEmail })
      .expect(403);
  });

  it('ROOT can grant credits and writes ledger and audit entries', async () => {
    const before = await prisma.user.findUnique({ where: { id: targetUserId }, select: { creditsBalance: true } });

    const res = await agentRoot
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ amount: 123, reason: 'Manual support credit adjustment', confirmEmail: targetEmail })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.creditsBalance).toBe(before.creditsBalance + 123);

    const ledger = await prisma.creditLedger.findFirst({
      where: { userId: targetUserId, referenceType: 'AdminCreditGrant', referenceId: targetUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).toBeTruthy();
    expect(ledger.type).toBe('CREDIT_GRANTED');
    expect(ledger.amount).toBe(123);
    expect(ledger.balanceAfter).toBe(before.creditsBalance + 123);
    expect(ledger.reason).toContain('Admin credit grant: Manual support credit adjustment');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ADMIN_CREDITS_GRANTED', entityId: targetUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect(audit.metadata.actorEmail).toBe(rootEmail);
    expect(audit.metadata.targetEmail).toBe(targetEmail);
    expect(audit.metadata.amount).toBe(123);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('passwordHash');
    expect(bodyStr).not.toContain('tokenHash');
    expect(bodyStr).not.toContain('sessions');
  });

  it('credit grant rejects wrong confirmEmail, short reason, negative amount, and excessive amount', async () => {
    await agentRoot
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ amount: 10, reason: 'Valid reason text', confirmEmail: 'wrong@email.com' })
      .expect(400);

    await agentRoot
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ amount: 10, reason: 'short', confirmEmail: targetEmail })
      .expect(400);

    await agentRoot
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ amount: -1, reason: 'Negative amount rejected', confirmEmail: targetEmail })
      .expect(400);

    await agentRoot
      .post(`/api/admin/users/${targetUserId}/credits/grant`)
      .set('x-csrf-token', rootCsrfToken)
      .send({ amount: 1000001, reason: 'Excessive amount rejected', confirmEmail: targetEmail })
      .expect(400);
  });

  /* ---- USERS LIST FILTERING ---- */

  it('users list supports role, search, verification filters, and accurate pagination totals', async () => {
    const app = agentRoot.app;
    const unverifiedEmail = `unverified.role.${unique}@findly.local`;
    const tempAgent = request.agent(app);

    try {
      await tempAgent.post('/api/auth/register').send({ name: 'Unverified Role User', email: unverifiedEmail, password });

      const roleRes = await agentRoot.get('/api/admin/users?role=ROOT').expect(200);
      expect(roleRes.body.data.users.every((u) => u.role === 'ROOT')).toBe(true);
      expect(roleRes.body.data.pagination.total).toBeGreaterThanOrEqual(1);

      const searchRes = await agentRoot.get(`/api/admin/users?search=${encodeURIComponent(targetEmail)}`).expect(200);
      expect(searchRes.body.data.pagination.total).toBeGreaterThanOrEqual(1);
      expect(searchRes.body.data.users.some((u) => u.email === targetEmail)).toBe(true);

      const unverifiedRes = await agentRoot.get('/api/admin/users?emailVerified=false').expect(200);
      expect(unverifiedRes.body.data.users.every((u) => u.emailVerified === false)).toBe(true);
      expect(unverifiedRes.body.data.users.some((u) => u.email === unverifiedEmail)).toBe(true);

      const pageRes = await agentRoot.get('/api/admin/users?limit=1&page=1').expect(200);
      expect(pageRes.body.data.users.length).toBeLessThanOrEqual(1);
      expect(pageRes.body.data.pagination.total).toBeGreaterThanOrEqual(pageRes.body.data.users.length);
    } finally {
      await prisma.user.deleteMany({ where: { email: unverifiedEmail } }).catch(() => {});
    }
  });
});
