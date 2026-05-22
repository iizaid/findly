import { prisma } from '../src/db/prisma.js';

const requireInstalled = process.argv.includes('--require-installed');

const printResult = (available, installed) => {
  if (available && installed) {
    console.log('PostGIS status: available and installed.');
    return 0;
  }

  if (available && !installed) {
    console.log('PostGIS status: available in this PostgreSQL runtime but not installed in the current database.');
    console.log('Next step: run `CREATE EXTENSION IF NOT EXISTS postgis;` through the geo migration or directly in the target database.');
    return requireInstalled ? 1 : 0;
  }

  console.log('PostGIS status: not available in this PostgreSQL runtime.');
  console.log('The database server is running without the PostGIS package, so the geo migration cannot be applied yet.');
  console.log('Use a PostGIS-capable runtime such as `postgis/postgis:16-3.4` or a managed PostgreSQL service with PostGIS enabled.');
  return requireInstalled ? 1 : 0;
};

try {
  const [availableRows, installedRows] = await Promise.all([
    prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') AS available`,
    prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed`,
  ]);

  const available = Boolean(availableRows?.[0]?.available);
  const installed = Boolean(installedRows?.[0]?.installed);
  process.exitCode = printResult(available, installed);
} catch (error) {
  console.error('PostGIS check failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
