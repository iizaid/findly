import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Migration Recovery Diagnostic: 20260516013000_worker_reliability_credit_reservations ---');
  let missingItems = [];
  let inconsistentState = [];

  try {
    // 1. Check Enum
    console.log('\n1. Checking Enum: CreditReservationStatus...');
    const enumCheck = await prisma.$queryRawUnsafe(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'CreditReservationStatus'
    `);
    
    if (enumCheck.length === 0) {
      console.log('  -> MISSING: Enum CreditReservationStatus');
      missingItems.push('Enum: CreditReservationStatus');
    } else {
      const enumValues = enumCheck.map(e => e.enumlabel);
      const expectedEnums = ['ACTIVE', 'CAPTURED', 'RELEASED', 'CANCELLED'];
      const missingEnums = expectedEnums.filter(e => !enumValues.includes(e));
      if (missingEnums.length > 0) {
        console.log(`  -> INCONSISTENT: Enum exists but missing values: ${missingEnums.join(', ')}`);
        inconsistentState.push(`Enum missing values: ${missingEnums.join(', ')}`);
      } else {
        console.log('  -> OK: Enum exists with all expected values.');
      }
    }

    // 2. Check Job table columns
    console.log('\n2. Checking Job table columns...');
    const jobColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Job'
    `);
    const jobColNames = jobColumns.map(c => c.column_name);
    
    ['lastHeartbeatAt', 'cancelRequestedAt'].forEach(col => {
      if (jobColNames.includes(col)) {
        console.log(`  -> OK: Job.${col} exists.`);
      } else {
        console.log(`  -> MISSING: Job.${col}`);
        missingItems.push(`Job column: ${col}`);
      }
    });

    // 3. Check CreditReservation table
    console.log('\n3. Checking CreditReservation table...');
    const tableCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'CreditReservation'
      ) as exists
    `);
    const tableExists = tableCheck[0].exists;

    if (!tableExists) {
      console.log('  -> MISSING: Table CreditReservation');
      missingItems.push('Table: CreditReservation');
    } else {
      console.log('  -> OK: Table exists.');

      // 4. Check CreditReservation columns
      const crColumns = await prisma.$queryRawUnsafe(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'CreditReservation'
      `);
      const crColNames = crColumns.map(c => c.column_name);
      const expectedCrCols = [
        'id', 'userId', 'workspaceId', 'campaignId', 'jobId', 
        'amount', 'capturedAmount', 'releasedAmount', 'status', 
        'reason', 'createdAt', 'capturedAt', 'releasedAt', 'updatedAt'
      ];
      
      expectedCrCols.forEach(col => {
        if (!crColNames.includes(col)) {
          console.log(`  -> MISSING: CreditReservation.${col}`);
          missingItems.push(`CreditReservation column: ${col}`);
        }
      });

      // 5. Check CreditReservation indexes
      const crIndexesQuery = await prisma.$queryRawUnsafe(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'CreditReservation'
      `);
      const crIndexes = crIndexesQuery.map(i => i.indexname);
      const expectedCrIndexes = [
        'CreditReservation_userId_status_idx',
        'CreditReservation_workspaceId_idx',
        'CreditReservation_campaignId_idx',
        'CreditReservation_jobId_idx',
        'CreditReservation_createdAt_idx'
      ];

      expectedCrIndexes.forEach(idx => {
        if (!crIndexes.includes(idx)) {
          console.log(`  -> MISSING: Index ${idx}`);
          missingItems.push(`Index: ${idx}`);
        }
      });

      // 7. Check Foreign Keys on CreditReservation
      const fksQuery = await prisma.$queryRawUnsafe(`
        SELECT conname 
        FROM pg_constraint 
        JOIN pg_class ON pg_class.oid = pg_constraint.conrelid 
        WHERE pg_class.relname = 'CreditReservation' AND contype = 'f'
      `);
      const fks = fksQuery.map(f => f.conname);
      // Prisma typically names foreign keys ending with _fkey
      const expectedFks = [
        'CreditReservation_userId_fkey',
        'CreditReservation_workspaceId_fkey',
        'CreditReservation_campaignId_fkey',
        'CreditReservation_jobId_fkey'
      ];

      expectedFks.forEach(fk => {
        if (!fks.includes(fk)) {
          console.log(`  -> MISSING: Foreign Key ${fk}`);
          missingItems.push(`Foreign Key: ${fk}`);
        }
      });
    }

    // 6. Check Job indexes
    console.log('\n4. Checking Job indexes...');
    const jobIndexesQuery = await prisma.$queryRawUnsafe(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Job'
    `);
    const jobIndexes = jobIndexesQuery.map(i => i.indexname);
    ['Job_status_lastHeartbeatAt_idx', 'Job_cancelRequestedAt_idx'].forEach(idx => {
      if (!jobIndexes.includes(idx)) {
        console.log(`  -> MISSING: Index ${idx}`);
        missingItems.push(`Index: ${idx}`);
      } else {
        console.log(`  -> OK: Index ${idx} exists.`);
      }
    });

    console.log('\n--- DIAGNOSIS RESULT ---');
    if (inconsistentState.length > 0) {
      console.log('CASE C: Dangerous inconsistent state detected.');
      console.log('The following issues need manual DBA resolution before proceeding:');
      inconsistentState.forEach(item => console.log(`  - ${item}`));
      console.log('STOP. Do not proceed until these are fixed manually.');
    } else if (missingItems.length > 0) {
      console.log('CASE B: Some objects are missing.');
      console.log('Missing items:');
      missingItems.forEach(item => console.log(`  - ${item}`));
      console.log('Action: Do not repair automatically. Determine why these are missing, apply a safe partial repair manually if needed, then run migrate resolve.');
    } else {
      console.log('CASE A: All migration objects already exist in the database.');
      console.log('Safe next command:');
      console.log('npx prisma migrate resolve --applied 20260516013000_worker_reliability_credit_reservations');
    }

  } catch (error) {
    console.error('Diagnostic script encountered an error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
