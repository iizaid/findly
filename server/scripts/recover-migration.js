import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Migration Recovery Diagnostic ---');

  // 1. Check _prisma_migrations
  console.log('\n1. Checking _prisma_migrations...');
  const migrations = await prisma.$queryRawUnsafe(`SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`);
  console.log('Recent migrations:');
  migrations.forEach(m => {
    console.log(`- ${m.migration_name} | Applied: ${m.finished_at ? 'YES' : 'NO'} | Logs: ${m.logs ? m.logs.substring(0, 50) : 'none'}`);
  });

  // 2. Check User columns
  console.log('\n2. Checking User table columns...');
  const userColumns = await prisma.$queryRawUnsafe(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'User'
  `);
  const columns = userColumns.map(c => c.column_name);
  console.log('User columns found:');
  console.log(['avatarUrl', 'notifyReports', 'notifySecurity', 'notifyMarketing', 'twoFactorEnabled']
    .map(c => `  - ${c}: ${columns.includes(c) ? 'EXISTS' : 'MISSING'}`).join('\n')
  );

  // 3. Check FailedLoginAttempt table
  console.log('\n3. Checking FailedLoginAttempt table...');
  const tableCheck = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'FailedLoginAttempt'
    ) as exists
  `);
  const tableExists = tableCheck[0].exists;
  console.log(`FailedLoginAttempt table: ${tableExists ? 'EXISTS' : 'MISSING'}`);

  if (tableExists) {
    const flaCols = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'FailedLoginAttempt'
    `);
    const flaColNames = flaCols.map(c => c.column_name);
    console.log('FailedLoginAttempt columns:');
    console.log(['ipAddress', 'emailHash', 'attempts', 'expiresAt']
      .map(c => `  - ${c}: ${flaColNames.includes(c) ? 'EXISTS' : 'MISSING'}`).join('\n')
    );

    const indexCheck = await prisma.$queryRawUnsafe(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'FailedLoginAttempt'
    `);
    const indexes = indexCheck.map(i => i.indexname);
    console.log('FailedLoginAttempt indexes:');
    console.log(`  - FailedLoginAttempt_pkey: ${indexes.includes('FailedLoginAttempt_pkey') ? 'EXISTS' : 'MISSING'}`);
    console.log(`  - FailedLoginAttempt_expiresAt_idx: ${indexes.includes('FailedLoginAttempt_expiresAt_idx') ? 'EXISTS' : 'MISSING'}`);
  }

  // 4. Action Plan
  console.log('\n--- RECOMMENDATION ---');
  let missingItems = [];
  if (!columns.includes('notifyReports')) missingItems.push('User.notifyReports');
  if (!columns.includes('notifySecurity')) missingItems.push('User.notifySecurity');
  if (!columns.includes('notifyMarketing')) missingItems.push('User.notifyMarketing');
  if (!columns.includes('twoFactorEnabled')) missingItems.push('User.twoFactorEnabled');
  if (!tableExists) missingItems.push('Table FailedLoginAttempt');

  if (missingItems.length === 0) {
    console.log('Case A: All schema changes are ALREADY in the database.');
    console.log('Next steps to run:');
    console.log('  1. npx prisma migrate resolve --applied 20260515084500_add_avatar_url');
    console.log('  2. npx prisma migrate deploy');
  } else {
    console.log('Case B/C: Some schema changes are missing:');
    console.log(missingItems.join(', '));
    console.log('Run the repair script (we will generate it next) before resolving the migration.');
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
