import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.IMPORT_UPLOAD_TTL_MINUTES = '60';

describe('Upload cleanup service', () => {
  let safeResolveUploadFile, removeAdminUploadFile, cleanupExpiredAdminUploads, getAdminUploadDir, uploadFileFilter;
  let uploadDir;

  beforeAll(async () => {
    ({ safeResolveUploadFile, removeAdminUploadFile, cleanupExpiredAdminUploads, getAdminUploadDir, uploadFileFilter } =
      await import('../../src/modules/admin/uploadCleanup.service.js'));
    uploadDir = getAdminUploadDir();
    await fs.mkdir(uploadDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test files only
    const entries = await fs.readdir(uploadDir).catch(() => []);
    for (const e of entries) {
      if (e.startsWith('test-cleanup-')) await fs.unlink(path.join(uploadDir, e)).catch(() => {});
    }
  });

  it('rejects fileKey with path traversal (../)', () => {
    expect(safeResolveUploadFile('../etc/passwd')).toBeNull();
    expect(safeResolveUploadFile('..\\Windows\\System32')).toBeNull();
    expect(safeResolveUploadFile('../../secret.csv')).toBeNull();
  });

  it('rejects fileKey with slash or backslash', () => {
    expect(safeResolveUploadFile('subdir/file.csv')).toBeNull();
    expect(safeResolveUploadFile('subdir\\file.csv')).toBeNull();
    expect(safeResolveUploadFile('/absolute/path.csv')).toBeNull();
  });

  it('rejects fileKey with unsupported extension', () => {
    expect(safeResolveUploadFile('file.exe')).toBeNull();
    expect(safeResolveUploadFile('file.js')).toBeNull();
    expect(safeResolveUploadFile('file.json')).toBeNull();
    expect(safeResolveUploadFile('file.txt')).toBeNull();
    expect(safeResolveUploadFile('file.xls')).toBeNull();
  });

  it('accepts valid .csv and .xlsx fileKeys', () => {
    const csvPath = safeResolveUploadFile('abc123.csv');
    expect(csvPath).not.toBeNull();
    expect(csvPath.startsWith(uploadDir)).toBe(true);

    const xlsxPath = safeResolveUploadFile('abc123.xlsx');
    expect(xlsxPath).not.toBeNull();
    expect(xlsxPath.startsWith(uploadDir)).toBe(true);
  });

  it('rejects null, empty, and non-string fileKeys', () => {
    expect(safeResolveUploadFile(null)).toBeNull();
    expect(safeResolveUploadFile('')).toBeNull();
    expect(safeResolveUploadFile(undefined)).toBeNull();
    expect(safeResolveUploadFile(123)).toBeNull();
  });

  it('cleanup deletes only old files inside upload dir', async () => {
    // Create an old file (mtime set to 2 hours ago)
    const oldFile = path.join(uploadDir, 'test-cleanup-old.csv');
    const freshFile = path.join(uploadDir, 'test-cleanup-fresh.csv');
    await fs.writeFile(oldFile, 'old data');
    await fs.writeFile(freshFile, 'fresh data');

    // Make oldFile appear old by setting mtime
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.utimes(oldFile, twoHoursAgo, twoHoursAgo);

    const summary = await cleanupExpiredAdminUploads();

    expect(summary.deleted).toBeGreaterThanOrEqual(1);

    // Old file should be gone
    await expect(fs.access(oldFile)).rejects.toThrow();

    // Fresh file should remain
    await expect(fs.access(freshFile)).resolves.toBeUndefined();

    // Cleanup test file
    await fs.unlink(freshFile).catch(() => {});
  });

  it('cleanup does not delete non-csv/xlsx files', async () => {
    const nonCsvFile = path.join(uploadDir, 'test-cleanup-readme.txt');
    await fs.writeFile(nonCsvFile, 'should not be deleted');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.utimes(nonCsvFile, twoHoursAgo, twoHoursAgo);

    await cleanupExpiredAdminUploads();

    // txt file should still be there
    await expect(fs.access(nonCsvFile)).resolves.toBeUndefined();
    await fs.unlink(nonCsvFile).catch(() => {});
  });

  it('cleanup handles missing upload directory gracefully', async () => {
    // Temporarily rename upload dir
    const tempName = uploadDir + '-backup-test';
    await fs.rename(uploadDir, tempName).catch(() => {});

    const summary = await cleanupExpiredAdminUploads();
    expect(summary.checked).toBe(0);
    expect(summary.deleted).toBe(0);

    // Restore
    await fs.rename(tempName, uploadDir).catch(() => {});
  });

  it('removeAdminUploadFile only works for valid keys', async () => {
    expect(await removeAdminUploadFile('../bad.csv')).toBe(false);
    expect(await removeAdminUploadFile('nonexistent.csv')).toBe(false);
    expect(await removeAdminUploadFile('file.exe')).toBe(false);
  });

  it('uploadFileFilter accepts csv/xlsx and rejects others', () => {
    const accepted = [];
    const rejected = [];

    uploadFileFilter(null, { originalname: 'data.csv' }, (err, accept) => {
      if (accept) accepted.push('csv'); else rejected.push('csv');
    });
    uploadFileFilter(null, { originalname: 'data.xlsx' }, (err, accept) => {
      if (accept) accepted.push('xlsx'); else rejected.push('xlsx');
    });
    uploadFileFilter(null, { originalname: 'data.exe' }, (err, accept) => {
      if (err) rejected.push('exe'); else accepted.push('exe');
    });
    uploadFileFilter(null, { originalname: 'data.txt' }, (err, accept) => {
      if (err) rejected.push('txt'); else accepted.push('txt');
    });

    expect(accepted).toEqual(['csv', 'xlsx']);
    expect(rejected).toContain('exe');
    expect(rejected).toContain('txt');
  });
});
