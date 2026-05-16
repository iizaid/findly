import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const main = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      if (process.env.ADMIN_TOPUP_ALLOW_PRODUCTION !== 'true') {
        console.error('Error: Refusing to run in production. Set ADMIN_TOPUP_ALLOW_PRODUCTION="true" to override.');
        process.exit(1);
      }
    }

    const email = process.env.ADMIN_TOPUP_EMAIL;
    if (!email) {
      console.error('Error: ADMIN_TOPUP_EMAIL is not set in the environment.');
      process.exit(1);
    }

    const amountStr = process.env.ADMIN_TOPUP_AMOUNT || '1000000';
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount <= 0) {
      console.error('Error: ADMIN_TOPUP_AMOUNT must be a valid positive integer.');
      process.exit(1);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.error(`Error: User with email ${email} not found.`);
      process.exit(1);
    }

    // Only set plan to PRO if explicitly requested via env flag.
    const setPlanPro = process.env.ADMIN_TOPUP_SET_PLAN_PRO === 'true';

    const updateData = {
      creditsBalance: { increment: amount },
    };

    if (setPlanPro) {
      updateData.plan = 'PRO';
    }

    // Never change role from this script.

    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await tx.creditLedger.create({
        data: {
          userId: user.id,
          type: 'CREDIT_GRANTED',
          amount,
          balanceAfter: u.creditsBalance,
          reason: 'Admin testing credit top-up',
          referenceType: 'AdminTopup',
          referenceId: user.id,
        },
      });

      return u;
    });

    console.log('');
    console.log('=== Admin Credit Top-Up Complete ===');
    console.log(`User:            ${email}`);
    console.log(`Role:            ${updatedUser.role} (unchanged)`);
    console.log(`Plan:            ${updatedUser.plan}${setPlanPro ? ' (set to PRO)' : ' (unchanged)'}`);
    console.log(`Credits Added:   ${amount}`);
    console.log(`New Balance:     ${updatedUser.creditsBalance}`);
    console.log('');

  } catch (error) {
    console.error('Error running admin topup:', error);
  } finally {
    await prisma.$disconnect();
  }
};

main();
