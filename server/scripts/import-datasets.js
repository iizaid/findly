#!/usr/bin/env node
import { importDatasets } from '../src/modules/datasets/datasetImport.service.js';
import { prisma } from '../src/db/prisma.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

try {
  const result = await importDatasets({ dryRun });
  const rows = result.files.map((file) => ({
    file: file.fileName,
    source: file.sourceType,
    total: file.totalRows,
    imported: file.importedRows,
    duplicates: file.duplicateRows,
    skipped: file.skippedRows,
    errors: file.errorRows,
    catalog: file.importedRows,
    importId: file.importId || '',
  }));

  console.log(dryRun ? 'Findly dataset dry run completed.' : 'Findly dataset import completed.');
  console.log(`Data directory: ${result.dataDir}`);
  console.log('Mode: shared internal catalog. Users search this catalog from the dashboard; imports do not create user lead lists.');
  if (result.owner) {
    console.log(`Owner: ${result.owner.userEmail} / workspace ${result.owner.workspaceId}`);
  }
  console.table(rows);
  console.log('Totals:', result.totals);
} catch (error) {
  console.error('Findly dataset import failed.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
