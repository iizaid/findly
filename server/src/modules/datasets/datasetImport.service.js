import path from 'node:path';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { listDatasetFiles, resolveDatasetDir, unsupportedDatasetExtensions } from './datasetPaths.js';
import { readDatasetWorkbook } from './datasetFileReader.js';
import { buildDatasetDedupeKeys, mapColumns, normalizeDatasetRow, normalizeUrlForStorage } from './datasetImport.mapper.js';
import { assertSourceAllowedForStage, getSourcePolicy, STAGES } from '../search/sourceIntelligencePolicy.service.js';
import { recordLeadEvidence } from '../search/discoveryEvidence.service.js';

const isMeaningfulRow = (values = []) => values.some((value) => value !== null && value !== undefined && String(value).trim() !== '');

const findHeaderRow = (rows) => rows.find((row) => isMeaningfulRow(row.values) && row.values.filter((value) => String(value || '').trim()).length >= 2);

const importPolicyByExtension = {
  '.csv': 'CSV_IMPORT',
  '.xlsx': 'XLSX_IMPORT',
  '.json': 'JSON_IMPORT',
};

const acquisitionByExtension = {
  '.csv': 'CSV_UPLOAD',
  '.xlsx': 'XLSX_UPLOAD',
  '.json': 'JSON_UPLOAD',
};

const presetByExtension = {
  '.csv': 'csv_dataset',
  '.xlsx': 'xlsx_dataset',
  '.json': 'generic_json',
};

const sourceTypeByPolicy = {
  CSV_IMPORT: 'DATASET_IMPORT',
  XLSX_IMPORT: 'DATASET_IMPORT',
  JSON_IMPORT: 'DATASET_IMPORT',
  GOOGLE_MAPS_SCRAPER_OUTPUT: 'GOOGLE_MAPS_DATASET',
  COMMON_CRAWL: 'DATASET_IMPORT',
  HUGGING_FACE_DATASETS: 'DATASET_IMPORT',
  LOCAL_DATASET: 'LOCAL_DATASET',
  MANUAL_ADMIN_IMPORT: 'MANUAL_ADMIN',
};

const sourceTypeByExtension = {
  '.csv': 'DATASET_IMPORT',
  '.xlsx': 'DATASET_IMPORT',
  '.json': 'DATASET_IMPORT',
};

const cleanNullableText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizeImportMetadata = ({ extension, importMetadata = null, sourceTypeOverride = null }) => {
  const sourcePolicyKey = importMetadata?.sourcePolicyKey || importPolicyByExtension[extension] || 'LOCAL_DATASET';
  const policy = getSourcePolicy(sourcePolicyKey);
  return {
    sourceName: cleanNullableText(importMetadata?.sourceName) || policy?.label || sourcePolicyKey,
    sourceUrl: normalizeUrlForStorage(importMetadata?.sourceUrl),
    sourcePolicyKey,
    acquisitionMethod: importMetadata?.acquisitionMethod || acquisitionByExtension[extension] || 'INTERNAL_RESEARCH',
    commercialUseAllowed: importMetadata?.commercialUseAllowed ?? null,
    attributionRequired: importMetadata?.attributionRequired ?? false,
    licenseName: cleanNullableText(importMetadata?.licenseName),
    licenseUrl: normalizeUrlForStorage(importMetadata?.licenseUrl),
    importedFromTool: cleanNullableText(importMetadata?.importedFromTool),
    riskLevel: importMetadata?.riskLevel || policy?.riskLevel || 'LOW',
    requiresManualReview: importMetadata?.requiresManualReview ?? Boolean(policy?.requiresManualReview),
    dataFreshness: cleanNullableText(importMetadata?.dataFreshness),
    importPreset: importMetadata?.importPreset || presetByExtension[extension] || 'generic_business_directory',
    evidenceCreationMode: importMetadata?.evidenceCreationMode || 'CATALOG_ONLY',
    promoteToCatalogMode: importMetadata?.promoteToCatalogMode || 'ALL_VALID_ROWS',
    requestedSourceType: sourceTypeOverride || null,
  };
};

const validateImportPolicy = (metadata) => {
  const policy = getSourcePolicy(metadata.sourcePolicyKey);
  if (!policy) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `Unknown sourcePolicyKey: ${metadata.sourcePolicyKey}`, 400);
  }

  const stageCheck = assertSourceAllowedForStage(metadata.sourcePolicyKey, STAGES.ADMIN_IMPORT);
  if (!stageCheck.allowed) {
    throw new AppError(errorCodes.VALIDATION_ERROR, stageCheck.reason, 400);
  }

  if (metadata.evidenceCreationMode === 'EVIDENCE_ONLY') {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'EVIDENCE_ONLY imports are not supported in Phase 4E. Use CATALOG_ONLY or CREATE_EVIDENCE_AND_CATALOG.', 400);
  }

  if (metadata.riskLevel === 'BLOCKED') {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Blocked import sources cannot be committed.', 400);
  }

  if (metadata.riskLevel === 'HIGH' && metadata.requiresManualReview !== true) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'High-risk imports require requiresManualReview=true.', 400);
  }

  if (metadata.commercialUseAllowed === false && metadata.requiresManualReview !== true) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Imports without commercial-use permission require manual review.', 400);
  }

  if (policy.requiresLicenseReview && metadata.requiresManualReview !== true) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `${policy.label} imports require manual review.`, 400);
  }

  if (policy.requiresLicenseReview && !metadata.licenseName && !metadata.licenseUrl) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `${policy.label} imports require licenseName or licenseUrl.`, 400);
  }

  return {
    sourcePolicyKey: metadata.sourcePolicyKey,
    allowed: true,
    stage: STAGES.ADMIN_IMPORT,
    riskLevel: metadata.riskLevel,
    requiresManualReview: metadata.requiresManualReview,
    warnings: [
      policy.blockedStages.includes(STAGES.LIVE_DISCOVERY) ? 'Blocked from LIVE_DISCOVERY runtime.' : null,
      metadata.commercialUseAllowed === false ? 'Commercial use not confirmed; manual review required.' : null,
      policy.requiresLicenseReview ? 'License review required by source policy.' : null,
    ].filter(Boolean),
  };
};

const discoveryMethodForImport = ({ extension, metadata }) => {
  if (metadata.sourcePolicyKey === 'GOOGLE_MAPS_SCRAPER_OUTPUT') return 'GOOGLE_MAPS_SCRAPER_OUTPUT';
  if (metadata.sourcePolicyKey === 'COMMON_CRAWL') return 'COMMON_CRAWL_IMPORT';
  if (metadata.sourcePolicyKey === 'HUGGING_FACE_DATASETS') return 'HUGGING_FACE_DATASET_IMPORT';
  if (extension === '.json') return 'JSON_IMPORT';
  if (extension === '.xlsx') return 'XLSX_IMPORT';
  return 'CSV_IMPORT';
};

const sourceTypeForEvidence = ({ extension, metadata }) => {
  if (metadata.sourcePolicyKey === 'GOOGLE_MAPS_SCRAPER_OUTPUT') return 'GOOGLE_MAPS_SCRAPER_OUTPUT_ROW';
  if (metadata.sourcePolicyKey === 'COMMON_CRAWL') return 'COMMON_CRAWL_EXPORT_ROW';
  if (metadata.sourcePolicyKey === 'HUGGING_FACE_DATASETS') return 'HUGGING_FACE_DATASET_ROW';
  if (extension === '.json') return 'JSON_IMPORT_ROW';
  return 'DATASET_IMPORT_ROW';
};

const targetSourceForLead = (lead, metadata) => {
  if (metadata.sourcePolicyKey === 'GOOGLE_MAPS_SCRAPER_OUTPUT' || lead.googleMapsUrl) return 'GOOGLE_MAPS';
  if (lead.instagramUrl || lead.instagramUsername) return 'INSTAGRAM';
  if (lead.facebookUrl) return 'FACEBOOK';
  if (lead.websiteUrl) return 'WEBSITE';
  return 'LOCAL_DATASET';
};

const preferredLeadSourceUrl = (lead) =>
  normalizeUrlForStorage(lead.googleMapsUrl)
  || normalizeUrlForStorage(lead.instagramUrl)
  || normalizeUrlForStorage(lead.facebookUrl)
  || normalizeUrlForStorage(lead.websiteUrl)
  || normalizeUrlForStorage(lead.rawData?.sourceUrl)
  || null;

const importEvidenceConfidence = (lead, metadata) => {
  let score = lead.businessName ? 60 : 45;
  if (lead.city) score += 5;
  if (lead.country) score += 5;
  if (preferredLeadSourceUrl(lead) || lead.phone || lead.email) score += 10;
  if (metadata.riskLevel === 'HIGH') score -= 10;
  if (metadata.requiresManualReview) score -= 5;
  return Math.max(30, Math.min(80, score));
};

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
  const extension = path.extname(filePath).toLowerCase();
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
    detectedFileType: extension.replace('.', ''),
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
  evidenceCreatedRows: 0,
  catalogCreatedRows: 0,
  duplicateCatalogRows: 0,
  importMetadata: null,
  policyDecision: null,
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

export const importDatasetFile = async ({ filePath, owner, dryRun = false, mappingConfig = null, sourceTypeOverride = null, importMetadata = null } = {}) => {
  const extension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  if (unsupportedDatasetExtensions.has(extension)) {
    return {
      ...emptySummary(fileName),
      errorRows: 1,
      errors: [`${extension} files are not supported yet. Please convert to .xlsx or .csv.`],
    };
  }

  const normalizedImportMetadata = normalizeImportMetadata({ extension, importMetadata, sourceTypeOverride });
  const policyDecision = validateImportPolicy(normalizedImportMetadata);
  const effectiveSourceType = sourceTypeOverride
    || sourceTypeByPolicy[normalizedImportMetadata.sourcePolicyKey]
    || sourceTypeByExtension[extension]
    || null;

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
    detectedFileType: extension.replace('.', ''),
    sourceType: effectiveSourceType || detectedSourceType,
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

  if (dryRun) {
    const drySummary = summarizeInspection(inspection);
    drySummary.importMetadata = normalizedImportMetadata;
    drySummary.policyDecision = policyDecision;
    return drySummary;
  }

  const summary = emptySummary(inspection.fileName, inspection.sourceType);
  summary.unmappedColumns = [...new Set(inspection.sheets.flatMap((sheet) => sheet.unmappedHeaders || []))];
  summary.importMetadata = normalizedImportMetadata;
  summary.policyDecision = policyDecision;

  await prisma.$transaction(async (tx) => {
    const datasetImport = await tx.datasetImport.create({
      data: {
        userId: owner?.userId || null,
        workspaceId: owner?.workspaceId || null,
        fileName: inspection.fileName,
        filePath: null,
        sourceType: inspection.sourceType,
        status: 'RUNNING',
        mapping: {
          ...inspection.mapping,
          importMetadata: normalizedImportMetadata,
          policyDecision,
        },
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
        summary.duplicateCatalogRows += 1;
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
        if (normalizedImportMetadata.evidenceCreationMode === 'CREATE_EVIDENCE_AND_CATALOG') {
          await recordLeadEvidence({
            tx,
            userId: owner?.userId,
            workspaceId: owner?.workspaceId,
            catalogLeadId: duplicate.id,
            targetSource: targetSourceForLead(row.normalizedData, normalizedImportMetadata),
            discoveryMethod: discoveryMethodForImport({ extension, metadata: normalizedImportMetadata }),
            sourceType: sourceTypeForEvidence({ extension, metadata: normalizedImportMetadata }),
            sourceUrl: preferredLeadSourceUrl(row.normalizedData),
            externalId: row.normalizedData.sourceId || null,
            title: row.normalizedData.businessName,
            snippet: row.normalizedData.category || row.normalizedData.address || null,
            extractedFields: row.normalizedData,
            rawMetadata: {
              importId: datasetImport.id,
              rowNumber: row.rowNumber,
              sourcePolicyKey: normalizedImportMetadata.sourcePolicyKey,
              importPreset: normalizedImportMetadata.importPreset,
            },
            confidenceScore: importEvidenceConfidence(row.normalizedData, normalizedImportMetadata),
            attributionRequired: Boolean(normalizedImportMetadata.attributionRequired),
          });
          summary.evidenceCreatedRows += 1;
        }
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
      summary.catalogCreatedRows += 1;
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
      if (normalizedImportMetadata.evidenceCreationMode === 'CREATE_EVIDENCE_AND_CATALOG') {
        await recordLeadEvidence({
          tx,
          userId: owner?.userId,
          workspaceId: owner?.workspaceId,
          catalogLeadId: lead.id,
          targetSource: targetSourceForLead(row.normalizedData, normalizedImportMetadata),
          discoveryMethod: discoveryMethodForImport({ extension, metadata: normalizedImportMetadata }),
          sourceType: sourceTypeForEvidence({ extension, metadata: normalizedImportMetadata }),
          sourceUrl: preferredLeadSourceUrl(row.normalizedData),
          externalId: row.normalizedData.sourceId || null,
          title: row.normalizedData.businessName,
          snippet: row.normalizedData.category || row.normalizedData.address || null,
          extractedFields: row.normalizedData,
          rawMetadata: {
            importId: datasetImport.id,
            rowNumber: row.rowNumber,
            sourcePolicyKey: normalizedImportMetadata.sourcePolicyKey,
            importPreset: normalizedImportMetadata.importPreset,
          },
          confidenceScore: importEvidenceConfidence(row.normalizedData, normalizedImportMetadata),
          attributionRequired: Boolean(normalizedImportMetadata.attributionRequired),
        });
        summary.evidenceCreatedRows += 1;
      }
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
