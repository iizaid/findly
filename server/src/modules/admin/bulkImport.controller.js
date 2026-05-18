import fs from 'node:fs/promises';
import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { inspectDatasetFile, importDatasetFile } from '../datasets/datasetImport.service.js';
import { readDatasetWorkbook } from '../datasets/datasetFileReader.js';
import { getDefaultWorkspace } from '../workspaces/workspace.service.js';
import {
  safeResolveUploadFile,
  removeAdminUploadFile,
  cleanupExpiredAdminUploads,
  ensureUploadDir,
  validateAdminUploadContent,
} from './uploadCleanup.service.js';

await ensureUploadDir();

const buildInternalMappingConfig = async (filePath, mappingConfig) => {
  if (!mappingConfig) return null;

  const workbook = await readDatasetWorkbook(filePath);
  const sheetHeaders = new Map();

  for (const sheet of workbook.sheets) {
    const headerRow = sheet.rows.find(
      (row) => row.values.some((v) => v !== null && v !== undefined && String(v).trim() !== '')
        && row.values.filter((v) => String(v || '').trim()).length >= 2,
    );
    if (headerRow) {
      const headers = Array.from({ length: headerRow.values.length }, (_, i) => String(headerRow.values[i] || `column_${i + 1}`).trim());
      sheetHeaders.set(sheet.name, headers);
    }
  }

  const internalMapping = [];

  for (const sheetConfig of mappingConfig.sheets) {
    const { sheetName, columns } = sheetConfig;
    const headers = sheetHeaders.get(sheetName);
    if (!headers) throw new AppError(errorCodes.VALIDATION_ERROR, `Sheet "${sheetName}" not found in uploaded file.`, 400);

    for (const col of columns) {
      if (!headers.includes(col.sourceHeader)) {
        throw new AppError(errorCodes.VALIDATION_ERROR, `Column "${col.sourceHeader}" not found in sheet "${sheetName}".`, 400);
      }
    }

    const mapping = {};
    for (const col of columns) {
      if (col.targetField === 'ignore') continue;
      mapping[col.targetField] = headers.indexOf(col.sourceHeader);
    }

    internalMapping.push({ sheetName, mapping });
  }

  return internalMapping;
};

export const parseImportFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(errorCodes.VALIDATION_ERROR, 'No file uploaded.', 400);

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const fileKey = req.file.filename;

  await cleanupExpiredAdminUploads().catch(() => {});

  try {
    const safeContent = await validateAdminUploadContent(filePath, originalName);
    if (!safeContent) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Uploaded file content does not match an allowed CSV or XLSX file.', 400);
    }

    const inspection = await inspectDatasetFile(filePath);
    return successResponse(res, {
      fileName: originalName,
      fileKey,
      sourceType: inspection.sourceType,
      detectedFileType: inspection.detectedFileType,
      sheets: inspection.sheets.map(sheet => ({
        name: sheet.sheetName || 'Sheet1',
        rowCount: sheet.rows.length,
        headers: sheet.headers,
        mapping: sheet.mapping,
        unmappedHeaders: sheet.unmappedHeaders,
        skippedSheet: sheet.skippedSheet,
        errorMessage: sheet.errorMessage,
        sampleRows: sheet.rows.slice(0, 5).map(r => r.rawData || r.values),
      })),
    }, 'File parsed successfully.');
  } catch (error) {
    await removeAdminUploadFile(fileKey);
    throw error;
  }
});

export const commitImportFile = asyncHandler(async (req, res) => {
  const { fileKey, mappingConfig, sourceType, importMetadata } = req.validated.body;
  const filePath = safeResolveUploadFile(fileKey);
  if (!filePath) throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid file key.', 400);

  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(errorCodes.NOT_FOUND, 'The uploaded file expired or was not found. Please upload it again.', 404);
  }

  const internalMappingConfig = await buildInternalMappingConfig(filePath, mappingConfig);
  const workspace = await getDefaultWorkspace(req.user.id);

  if (!workspace) throw new AppError(errorCodes.NOT_FOUND, 'Default workspace not found for this admin user.', 404);

  const owner = { userId: req.user.id, userEmail: req.user.email, workspaceId: workspace.id };

  let summary;
  try {
    summary = await importDatasetFile({
      filePath,
      owner,
      dryRun: false,
      mappingConfig: internalMappingConfig,
      sourceTypeOverride: sourceType,
      importMetadata,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_BULK_IMPORT_COMMITTED',
        entityType: 'DatasetImport',
        entityId: summary.importId,
        metadata: {
          workspaceId: workspace.id,
          fileName: summary.fileName,
          totalRows: summary.totalRows,
          importedRows: summary.importedRows,
          evidenceCreatedRows: summary.evidenceCreatedRows,
          policyDecision: summary.policyDecision,
          usedCustomMapping: Boolean(mappingConfig),
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
  } finally {
    await removeAdminUploadFile(fileKey).catch(() => {});
  }

  return successResponse(res, { summary }, 'Import completed successfully.', 200);
});
