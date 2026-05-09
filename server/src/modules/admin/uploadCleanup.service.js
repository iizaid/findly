import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx']);

/**
 * Returns the absolute path to the admin upload directory.
 * Always resolves relative to process.cwd().
 */
export const getAdminUploadDir = () => path.resolve(process.cwd(), 'uploads');

/**
 * Ensures the upload directory exists (creates it if missing).
 */
export const ensureUploadDir = async () => {
  await fs.mkdir(getAdminUploadDir(), { recursive: true }).catch(() => {});
};

/**
 * Validates a fileKey and resolves it to a safe absolute path inside the upload directory.
 * Returns null if the fileKey is invalid or the resolved path escapes the upload directory.
 *
 * @param {string} fileKey - The basename of the uploaded file.
 * @returns {string|null} Absolute path if safe, null otherwise.
 */
export const safeResolveUploadFile = (fileKey) => {
  if (!fileKey || typeof fileKey !== 'string') return null;

  // Block path traversal characters
  if (fileKey.includes('/') || fileKey.includes('\\') || fileKey.includes('..')) return null;

  // Must be a clean basename (no directory components)
  if (path.basename(fileKey) !== fileKey) return null;

  // Must have an allowed extension
  const ext = path.extname(fileKey).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;

  const uploadDir = getAdminUploadDir();
  const resolved = path.resolve(uploadDir, fileKey);

  // Final containment check: resolved path must start with uploadDir
  if (!resolved.startsWith(uploadDir + path.sep) && resolved !== uploadDir) return null;

  return resolved;
};

/**
 * Removes a specific uploaded file by its fileKey.
 * Only deletes files inside the upload directory.
 *
 * @param {string} fileKey - The basename of the file to delete.
 * @returns {Promise<boolean>} true if deleted, false otherwise.
 */
export const removeAdminUploadFile = async (fileKey) => {
  const filePath = safeResolveUploadFile(fileKey);
  if (!filePath) return false;

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Deletes temporary upload files older than IMPORT_UPLOAD_TTL_MINUTES.
 * Only operates inside the upload directory. Never follows symlinks.
 *
 * @returns {Promise<{checked: number, deleted: number, skipped: number, errors: number}>}
 */
export const cleanupExpiredAdminUploads = async () => {
  const uploadDir = getAdminUploadDir();
  const ttlMs = (env.IMPORT_UPLOAD_TTL_MINUTES || 60) * 60 * 1000;
  const cutoff = Date.now() - ttlMs;
  const summary = { checked: 0, deleted: 0, skipped: 0, errors: 0 };

  let entries;
  try {
    entries = await fs.readdir(uploadDir, { withFileTypes: true });
  } catch (err) {
    // Directory doesn't exist yet — nothing to clean
    if (err.code === 'ENOENT') return summary;
    logger.warn({ err, uploadDir }, 'upload-cleanup: failed to read upload directory');
    return summary;
  }

  for (const entry of entries) {
    summary.checked++;

    // Only delete regular files, never directories or symlinks
    if (!entry.isFile()) {
      summary.skipped++;
      continue;
    }

    // Only delete files with allowed extensions
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      summary.skipped++;
      continue;
    }

    const filePath = path.join(uploadDir, entry.name);

    // Double-check containment
    if (!filePath.startsWith(uploadDir + path.sep)) {
      summary.skipped++;
      continue;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        summary.deleted++;
        logger.info({ fileName: entry.name }, 'upload-cleanup: deleted expired upload');
      } else {
        summary.skipped++;
      }
    } catch (err) {
      summary.errors++;
      logger.warn({ err, fileName: entry.name }, 'upload-cleanup: failed to process file');
    }
  }

  return summary;
};

/**
 * Validates that a multer file has an allowed extension.
 * Used as a multer fileFilter callback.
 */
export const uploadFileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Only .csv and .xlsx are allowed.`));
  }
};
