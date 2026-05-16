import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Migration Repair ---');
  console.log('Safely applying missing columns/tables from 20260515084500_add_avatar_url...');

  try {
    // We do NOT use IF NOT EXISTS for columns in standard PostgreSQL before v14 sometimes, 
    // but Prisma uses standard PG 14+ usually. Alternatively, we catch the error.
    
    console.log('Adding notifyReports...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyReports" BOOLEAN NOT NULL DEFAULT true;`).catch(e => console.log('  -> Already exists or error:', e.message));

    console.log('Adding notifySecurity...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifySecurity" BOOLEAN NOT NULL DEFAULT true;`).catch(e => console.log('  -> Already exists or error:', e.message));

    console.log('Adding notifyMarketing...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyMarketing" BOOLEAN NOT NULL DEFAULT false;`).catch(e => console.log('  -> Already exists or error:', e.message));

    console.log('Adding twoFactorEnabled...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;`).catch(e => console.log('  -> Already exists or error:', e.message));

    console.log('Creating FailedLoginAttempt table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FailedLoginAttempt" (
        "ipAddress" TEXT NOT NULL,
        "emailHash" TEXT NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 1,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "FailedLoginAttempt_pkey" PRIMARY KEY ("ipAddress","emailHash")
      );
    `).catch(e => console.log('  -> Already exists or error:', e.message));

    console.log('Creating FailedLoginAttempt index...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "FailedLoginAttempt_expiresAt_idx" ON "FailedLoginAttempt"("expiresAt");
    `).catch(e => console.log('  -> Already exists or error:', e.message));

    console.log('\nRepair finished. Please run the diagnostic script again to verify.');
    
  } catch (error) {
    console.error('Failed during repair:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
