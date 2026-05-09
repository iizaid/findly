import fs from 'node:fs/promises';
import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { inspectDatasetFile, importDatasetFile } from '../datasets/datasetImport.service.js';
import { readDatasetWorkbook } from '../datasets/datasetFileReader.js';
import {
  safeResolveUploadFile,
  removeAdminUploadFile,
  cleanupExpiredAdminUploads,
  ensureUploadDir,
} from './uploadCleanup.service.js';

// Ensure uploads directory exists on module load
await ensureUploadDir();

/**
 * Converts the frontend mappingConfig shape:
 *   { sheets: [{ sheetName, columns: [{ sourceHeader, targetField }] }] }
 * into the internal format expected by importDatasetFile:
 *   Array<{ sheetName, mapping: { fieldName: columnIndex } }>
 *
 * Also validates that all sourceHeaders exist in the actual file.
 * Ignored columns are excluded from the internal mapping.
 */
const buildInternalMappingConfig = async (filePath, mappingConfig) => {
  if (!mappingConfig) return null;

  const workbook = await readDatasetWorkbook(filePath);

  // Build a lookup of sheetName -> headers[]
  const sheetHeaders = new Map();
  for (const sheet of workbook.sheets) {
    // Find first meaningful row as header row (same logic as service)
    const headerRow = sheet.rows.find(
      (row) => row.values.some((v) => v !== null && v !== undefined && String(v).trim() !== '')
        && row.values.filter((v) => String(v || '').trim()).length >= 2,
    );
    if (headerRow) {
      const headers = Array.from(
        { length: headerRow.values.length },
        (_, i) => String(headerRow.values[i] || `column_${i + 1}`).trim(),
      );
      sheetHeaders.set(sheet.name, headers);
    }
  }

  const internalMapping = [];

  for (const sheetConfig of mappingConfig.sheets) {
    const { sheetName, columns } = sheetConfig;

    const headers = sheetHeaders.get(sheetName);
    if (!headers) {
      throw new AppError(errorCodes.VALIDATION_ERROR, `Sheet "${sheetName}" not found in uploaded file.`, 400);
    }

    // Validate each sourceHeader exists in the actual file
    for (const col of columns) {
      if (!headers.includes(col.sourceHeader)) {
        throw new AppError(
          errorCodes.VALIDATION_ERROR,
          `Column "${col.sourceHeader}" not found in sheet "${sheetName}".`,
          400,
        );
      }
    }

    // Build { fieldName: columnIndex }, excluding ignored columns
    const mapping = {};
    for (const col of columns) {
      if (col.targetField === 'ignore') continue;
      const index = headers.indexOf(col.sourceHeader);
      mapping[col.targetField] = index;
    }

    internalMapping.push({ sheetName, mapping });
  }

  return internalMapping;
};

export const parseImportFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'No file uploaded.', 400);
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const fileKey = req.file.filename;

  // Best-effort cleanup of expired uploads before accepting new ones
  await cleanupExpiredAdminUploads().catch(() => {});

  try {
    const inspection = await inspectDatasetFile(filePath);

    return successResponse(res, {
      fileName: originalName,
      fileKey,
      sourceType: inspection.sourceType,
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
    // Clean up the uploaded file on parse failure
    await removeAdminUploadFile(fileKey);
    throw error;
  }
});

export const commitImportFile = asyncHandler(async (req, res) => {
  const { fileKey, mappingConfig, sourceType } = req.validated.body;

  // Validate fileKey strictly using the safe resolver
  const filePath = safeResolveUploadFile(fileKey);
  if (!filePath) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid file key.', 400);
  }

  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(errorCodes.NOT_FOUND, 'The uploaded file expired or was not found. Please upload it again.', 404);
  }

  // Convert frontend mappingConfig shape → internal format, validating headers
  const internalMappingConfig = await buildInternalMappingConfig(filePath, mappingConfig);

  const owner = {
    userId: req.user.id,
    userEmail: req.user.email,
    workspaceId: req.user.ownedWorkspaces?.[0]?.id || null,
  };

  const summary = await importDatasetFile({
    filePath,
    owner,
    dryRun: false,
    mappingConfig: internalMappingConfig,
    sourceTypeOverride: sourceType,
  });

  // Delete the temp file after successful commit
  await removeAdminUploadFile(fileKey);

  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'ADMIN_BULK_IMPORT_COMMITTED',
      entityType: 'DatasetImport',
      entityId: summary.importId,
      metadata: {
        fileName: summary.fileName,
        totalRows: summary.totalRows,
        importedRows: summary.importedRows,
        usedCustomMapping: Boolean(mappingConfig),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  return successResponse(res, { summary }, 'Import completed successfully.', 200);
});
