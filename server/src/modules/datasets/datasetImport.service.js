import path from 'node:path';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { listDatasetFiles, resolveDatasetDir, unsupportedDatasetExtensions } from './datasetPaths.js';
import { readDatasetWorkbook } from './datasetFileReader.js';
import { buildDatasetDedupeKeys, mapColumns, normalizeDatasetRow } from './datasetImport.mapper.js';

const isMeaningfulRow = (values = []) => values.some((value) => value !== null && value !== undefined && String(value).trim() !== '');

const findHeaderRow = (rows) => rows.find((row) => isMeaningfulRow(row.values) && row.values.filter((value) => String(value || '').trim()).length >= 2);

const normalizeSheetRows = ({ fileName, sheet }) => {
  const headerRow = findHeaderRow(sheet.rows);
  if (!headerRow) {
    return {
      headers: [],
      mapping: {},
      unmappedHeaders: [],
      rows: [],
      skippedSheet: true,
      errorMessage: 'Sheet does not contain a recognizable header row.',
    };
  }

  const headers = Array.from(
    { length: headerRow.values.length },
    (_, index) => String(headerRow.values[index] || `column_${index + 1}`).trim(),
  );
  const { mapping, unmappedHeaders } = mapColumns(headers);
  if (Object.keys(mapping).length === 0) {
    return {
      headers,
      mapping,
      unmappedHeaders,
      rows: [],
      skippedSheet: true,
      errorMessage: 'Sheet does not contain mapped lead columns.',
    };
  }
  const dataRows = sheet.rows.filter((row) => (row.rowNumber || 0) > headerRow.rowNumber && isMeaningfulRow(row.values));
  const rows = dataRows.map((row) => ({
    sheetName: sheet.name,
    rowNumber: row.rowNumber,
    ...normalizeDatasetRow({
      row: row.values,
      headers,
      mapping,
      fileName,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
    }),
  }));

  return {
    headers,
    mapping,
    unmappedHeaders,
    rows,
    skippedSheet: false,
  };
};

export const inspectDatasetFile = async (filePath, _customMapping = null) => {
  const workbook = await readDatasetWorkbook(filePath);
  const sheets = workbook.sheets.map((sheet) => {
    // If a custom mapping is provided for this sheet, override it.
    // However, during inspection, usually customMapping is null unless we are re-inspecting.
    return normalizeSheetRows({ fileName: workbook.fileName, sheet });
  });
  const rows = sheets.flatMap((sheet) => sheet.rows);
  const sourceTypes = new Set(rows.map((row) => row.normalizedData?.source).filter(Boolean));
  const sourceType = sourceTypes.size === 1 ? [...sourceTypes][0] : 'LOCAL_DATASET';

  return {
    fileName: workbook.fileName,
    filePath,
    sourceType,
    sheets,
    rows,
    mapping: {
      sheets: sheets.map((sheet) => ({
        headers: sheet.headers,
        mapping: sheet.mapping,
        unmappedHeaders: sheet.unmappedHeaders,
        skippedSheet: sheet.skippedSheet,
        errorMessage: sheet.errorMessage,
      })),
    },
  };
};

export const resolveImportOwner = async ({
  userEmail = env.IMPORT_USER_EMAIL,
  workspaceId = env.IMPORT_WORKSPACE_ID,
} = {}) => {
  if (!userEmail) {
    throw new AppError(
      errorCodes.VALIDATION_ERROR,
      'IMPORT_USER_EMAIL is required for dataset imports. Set it to a verified Findly user email.',
      400,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail.toLowerCase() },
    include: {
      workspaceMembers: {
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!user) throw new AppError(errorCodes.NOT_FOUND, `Import user not found: ${userEmail}`, 404);
  if (!user.emailVerified) throw new AppError(errorCodes.FORBIDDEN, 'Dataset import user must be email verified.', 403);

  const membership = workspaceId
    ? user.workspaceMembers.find((member) => member.workspaceId === workspaceId)
    : user.workspaceMembers[0];

  if (!membership) {
    throw new AppError(errorCodes.FORBIDDEN, 'Import user does not belong to the requested workspace.', 403);
  }

  return {
    userId: user.id,
    workspaceId: membership.workspaceId,
    userEmail: user.email,
    workspaceName: membership.workspace.name,
  };
};

const findDuplicateCatalogLead = async ({ tx, lead }) => {
  const or = [];
  if (lead.normalizedFingerprint) or.push({ normalizedFingerprint: lead.normalizedFingerprint });
  if (lead.source && lead.sourceId) or.push({ source: lead.source, sourceId: lead.sourceId });
  if (lead.instagramUsername) or.push({ instagramUsername: lead.instagramUsername });
  if (lead.websiteUrl) or.push({ websiteUrl: lead.websiteUrl });
  if (lead.phone) or.push({ phone: lead.phone });
  if (lead.businessName && lead.city) {
    or.push({
      businessName: { equals: lead.businessName, mode: 'insensitive' },
      city: { equals: lead.city, mode: 'insensitive' },
    });
  }

  if (or.length === 0) return null;
  return tx.leadCatalog.findFirst({ where: { OR: or } });
};

const emptySummary = (fileName, sourceType = 'LOCAL_DATASET') => ({
  fileName,
  sourceType,
  totalRows: 0,
  importedRows: 0,
  skippedRows: 0,
  duplicateRows: 0,
  errorRows: 0,
  leadListId: null,
  importId: null,
  unmappedColumns: [],
  errors: [],
});

const summarizeInspection = (inspection) => {
  const summary = emptySummary(inspection.fileName, inspection.sourceType);
  const seenKeys = new Set();

  summary.unmappedColumns = [...new Set(inspection.sheets.flatMap((sheet) => sheet.unmappedHeaders || []))];
  for (const row of inspection.rows) {
    summary.totalRows += 1;
    if (row.status !== 'READY') {
      summary.skippedRows += 1;
      continue;
    }
    const keys = buildDatasetDedupeKeys(row.normalizedData);
    if (keys.some((key) => seenKeys.has(key))) {
      summary.duplicateRows += 1;
      continue;
    }
    keys.forEach((key) => seenKeys.add(key));
    summary.importedRows += 1;
  }

  return summary;
};

export const importDatasetFile = async ({ filePath, owner, dryRun = false, mappingConfig = null, sourceTypeOverride = null } = {}) => {
  const extension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  if (unsupportedDatasetExtensions.has(extension)) {
    return {
      ...emptySummary(fileName),
      errorRows: 1,
      errors: [`${extension} files are not supported yet. Please convert to .xlsx or .csv.`],
    };
  }

  // If mappingConfig is provided, we need to apply it directly to the workbook rows.
  // Instead of re-writing inspect, let's just get the workbook and normalize using mappingConfig
  const workbook = await readDatasetWorkbook(filePath);
  const sheets = workbook.sheets.map((sheet) => {
    const sheetMapping = mappingConfig ? mappingConfig.find(m => m.sheetName === sheet.name)?.mapping : null;
    
    if (sheetMapping) {
       // Apply custom mapping
       const headerRow = findHeaderRow(sheet.rows);
       if (!headerRow) return { rows: [], skippedSheet: true, mapping: sheetMapping, headers: [] };
       const headers = Array.from({ length: headerRow.values.length }, (_, index) => String(headerRow.values[index] || `column_${index + 1}`).trim());
       const dataRows = sheet.rows.filter((row) => (row.rowNumber || 0) > headerRow.rowNumber && isMeaningfulRow(row.values));
       const rows = dataRows.map((row) => ({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          ...normalizeDatasetRow({
            row: row.values,
            headers,
            mapping: sheetMapping,
            fileName,
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
          }),
        }));
        return { headers, mapping: sheetMapping, unmappedHeaders: [], rows, skippedSheet: false };
    }
    return normalizeSheetRows({ fileName: workbook.fileName, sheet });
  });

  const rows = sheets.flatMap((sheet) => sheet.rows);
  const sourceTypes = new Set(rows.map((row) => row.normalizedData?.source).filter(Boolean));
  const detectedSourceType = sourceTypes.size === 1 ? [...sourceTypes][0] : 'LOCAL_DATASET';
  
  const inspection = {
    fileName: workbook.fileName,
    filePath,
    sourceType: sourceTypeOverride || detectedSourceType,
    sheets,
    rows,
    mapping: {
      sheets: sheets.map((sheet) => ({
        headers: sheet.headers,
        mapping: sheet.mapping,
        unmappedHeaders: sheet.unmappedHeaders,
        skippedSheet: sheet.skippedSheet,
      })),
    },
  };

  if (dryRun) return summarizeInspection(inspection);

  const summary = emptySummary(inspection.fileName, inspection.sourceType);
  summary.unmappedColumns = [...new Set(inspection.sheets.flatMap((sheet) => sheet.unmappedHeaders || []))];

  await prisma.$transaction(async (tx) => {
    const datasetImport = await tx.datasetImport.create({
      data: {
        userId: owner?.userId || null,
        workspaceId: owner?.workspaceId || null,
        fileName: inspection.fileName,
        filePath: null,
        sourceType: inspection.sourceType,
        status: 'RUNNING',
        mapping: inspection.mapping,
      },
    });
    summary.importId = datasetImport.id;

    for (const row of inspection.rows) {
      summary.totalRows += 1;

      if (row.status !== 'READY') {
        summary.skippedRows += 1;
        await tx.datasetImportRow.create({
          data: {
            importId: datasetImport.id,
            rowNumber: row.rowNumber || summary.totalRows,
            sheetName: row.sheetName,
            status: 'SKIPPED',
            rawData: row.rawData,
            normalizedData: row.normalizedData,
            errorMessage: row.errorMessage,
          },
        });
        continue;
      }

      const duplicate = await findDuplicateCatalogLead({
        tx,
        lead: row.normalizedData,
      });

      if (duplicate) {
        summary.duplicateRows += 1;
        await tx.datasetImportRow.create({
          data: {
            importId: datasetImport.id,
            rowNumber: row.rowNumber || summary.totalRows,
            sheetName: row.sheetName,
            status: 'DUPLICATE',
            rawData: row.rawData,
            normalizedData: row.normalizedData,
            catalogLeadId: duplicate.id,
            errorMessage: 'Duplicate lead already exists in this workspace.',
          },
        });
        continue;
      }

      const lead = await tx.leadCatalog.create({
        data: {
          ...row.normalizedData,
          datasetImportId: datasetImport.id,
          sourceFile: inspection.fileName,
          importedAt: new Date(),
        },
      });

      summary.importedRows += 1;
      await tx.datasetImportRow.create({
        data: {
          importId: datasetImport.id,
          rowNumber: row.rowNumber || summary.totalRows,
          sheetName: row.sheetName,
          status: 'IMPORTED',
          rawData: row.rawData,
          normalizedData: row.normalizedData,
          catalogLeadId: lead.id,
        },
      });
    }

    await tx.datasetImport.update({
      where: { id: datasetImport.id },
      data: {
        status: 'COMPLETED',
        totalRows: summary.totalRows,
        importedRows: summary.importedRows,
        skippedRows: summary.skippedRows,
        duplicateRows: summary.duplicateRows,
        errorRows: summary.errorRows,
        summary,
        completedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: owner?.userId || null,
        action: 'DATASET_IMPORTED',
        entityType: 'DatasetImport',
        entityId: datasetImport.id,
        metadata: {
          workspaceId: owner?.workspaceId || null,
          fileName: inspection.fileName,
          totalRows: summary.totalRows,
          importedRows: summary.importedRows,
          duplicateRows: summary.duplicateRows,
          catalog: true,
        },
      },
    });
  }, { timeout: 60_000 });

  return summary;
};

export const importDatasets = async ({ dryRun = false, dataDir = resolveDatasetDir(), owner = null } = {}) => {
  if (!dataDir) {
    throw new AppError(errorCodes.NOT_FOUND, 'No Data/ or local data/ folder was found for dataset import.', 404);
  }

  const files = listDatasetFiles(dataDir);
  if (files.length === 0) {
    throw new AppError(errorCodes.NOT_FOUND, `No supported dataset files found in ${dataDir}.`, 404);
  }

  const resolvedOwner = owner || null;
  const summaries = [];

  for (const file of files) {
    summaries.push(await importDatasetFile({
      filePath: file.filePath,
      owner: resolvedOwner,
      dryRun,
    }));
  }

  return {
    dataDir,
    dryRun,
    owner: resolvedOwner ? {
      userEmail: resolvedOwner.userEmail,
      workspaceId: resolvedOwner.workspaceId,
      workspaceName: resolvedOwner.workspaceName,
    } : null,
    filesProcessed: summaries.length,
    totals: summaries.reduce((acc, summary) => ({
      totalRows: acc.totalRows + summary.totalRows,
      importedRows: acc.importedRows + summary.importedRows,
      skippedRows: acc.skippedRows + summary.skippedRows,
      duplicateRows: acc.duplicateRows + summary.duplicateRows,
      errorRows: acc.errorRows + summary.errorRows,
    }), { totalRows: 0, importedRows: 0, skippedRows: 0, duplicateRows: 0, errorRows: 0 }),
    files: summaries,
  };
};
