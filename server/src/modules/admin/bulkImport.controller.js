import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '../../db/prisma.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { successResponse } from '../../utils/apiResponse.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { inspectDatasetFile, importDatasetFile } from '../datasets/datasetImport.service.js';
import { env } from '../../config/env.js';

const tempUploadDir = path.resolve(process.cwd(), 'uploads');

// Ensure uploads directory exists
await fs.mkdir(tempUploadDir, { recursive: true }).catch(() => {});

export const parseImportFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'No file uploaded.', 400);
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    const inspection = await inspectDatasetFile(filePath);
    
    // We want to return the inspection info so the admin can review the mapping
    return successResponse(res, {
      fileName: originalName,
      fileKey: path.basename(filePath),
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
    // Clean up if inspection fails
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }
});

export const commitImportFile = asyncHandler(async (req, res) => {
  const { fileKey, mappingConfig, sourceType } = req.body;
  
  if (!fileKey || typeof fileKey !== 'string' || fileKey.includes('/') || fileKey.includes('\\')) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid file key.', 400);
  }

  const filePath = path.join(tempUploadDir, fileKey);

  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(errorCodes.NOT_FOUND, 'Uploaded file not found or expired.', 404);
  }

  try {
    // In a real advanced scenario, we'd apply mappingConfig here to override the default mapping.
    // For now, we rely on the internal inspectDatasetFile to do mapping, but we can pass the sourceType override.
    
    const owner = {
      userId: req.user.id,
      userEmail: req.user.email,
      workspaceId: req.user.ownedWorkspaces?.[0]?.id || null, // Best effort for workspace
    };

    // Note: datasetImport.service.js's importDatasetFile does the full import
    const summary = await importDatasetFile({
      filePath,
      owner,
      dryRun: false,
      mappingConfig,
      sourceTypeOverride: sourceType,
    });

    // Cleanup
    await fs.unlink(filePath).catch(() => {});

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
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    return successResponse(res, { summary }, 'Import completed successfully.', 200);
  } catch (error) {
    throw error;
  }
});
