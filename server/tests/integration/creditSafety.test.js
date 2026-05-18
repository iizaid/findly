import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4120';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';

describe('Credit Safety', () => {
  let createApp;
  let prisma;
  let agent;
  let user;

  const unique = Date.now().toString(36);
  const userEmail = `credit.user.${unique}@findly.local`;
  const password = 'Secure12345@#$';

  beforeAll(async () => {
    ({ createApp } = await import('../../src/app.js'));
    ({ prisma } = await import('../../src/db/prisma.js'));

    const app = createApp();
    agent = request.agent(app);

    await prisma.user.deleteMany({ where: { email: userEmail } }).catch(() => {});
    await agent.post('/api/auth/register').send({ name: 'Credit User', email: userEmail, password }).expect(201);
    user = await prisma.user.update({
      where: { email: userEmail },
      data: { emailVerified: true, creditsBalance: 5 },
    });
    await agent.post('/api/auth/login').send({ email: userEmail, password }).expect(200);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: userEmail } }).catch(() => {});
      await prisma.$disconnect();
    }
  });

  it('deductCredits safely blocks overdraft using atomic updates', async () => {
    const { deductCredits } = await import('../../src/modules/credits/credit.service.js');

    await expect(
      deductCredits({
        userId: user.id,
        amount: 10,
        reason: 'Test deduction',
      })
    ).rejects.toThrow('Insufficient credits');

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser.creditsBalance).toBe(5);
  });
});
