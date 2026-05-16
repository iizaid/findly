import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const REQUIRED_CONFIRM = 'I_UNDERSTAND_THIS_GRANTS_ROOT';

const main = async () => {
  try {
    // Production guard
    if (process.env.NODE_ENV === 'production') {
      if (process.env.BOOTSTRAP_ROOT_ALLOW_PRODUCTION !== 'true') {
        console.error('Error: Refusing to run in production. Set BOOTSTRAP_ROOT_ALLOW_PRODUCTION="true" to override.');
        process.exit(1);
      }
    }

    const email = process.env.ROOT_USER_EMAIL;
    if (!email) {
      console.error('Error: ROOT_USER_EMAIL is not set.');
      process.exit(1);
    }

    // Safety confirmation
    if (process.env.BOOTSTRAP_ROOT_CONFIRM !== REQUIRED_CONFIRM) {
      console.error(`Error: BOOTSTRAP_ROOT_CONFIRM must be set to "${REQUIRED_CONFIRM}".`);
      process.exit(1);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.error(`Error: User with email ${email} not found. The user must register first.`);
      process.exit(1);
    }

    // Verified email check
    if (!user.emailVerified && process.env.ROOT_ALLOW_UNVERIFIED !== 'true') {
      console.error('Error: User email is not verified. Set ROOT_ALLOW_UNVERIFIED="true" to override.');
      process.exit(1);
    }

    const setPlanPro = process.env.ROOT_SET_PLAN_PRO === 'true';

    const updateData = { role: 'ROOT' };
    if (setPlanPro) {
      updateData.plan = 'PRO';
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'ROOT_USER_BOOTSTRAPPED',
          entityType: 'User',
          entityId: user.id,
          metadata: {
            email: user.email,
            previousRole: user.role,
            newRole: 'ROOT',
            setPlanPro,
          },
        },
      });

      return u;
    });

    console.log('');
    console.log('=== Root User Bootstrap Complete ===');
    console.log(`User:    ${email}`);
    console.log(`Role:    ${updatedUser.role}`);
    console.log(`Plan:    ${updatedUser.plan}${setPlanPro ? ' (set to PRO)' : ''}`);
    console.log(`Credits: ${updatedUser.creditsBalance}`);
    console.log('');
    console.log('This user now has ROOT access to all admin operations.');
    console.log('');

  } catch (error) {
    console.error('Error bootstrapping root user:', error);
  } finally {
    await prisma.$disconnect();
  }
};

main();
