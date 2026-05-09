import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..', '..');
const projectRoot = path.resolve(serverRoot, '..');

export const supportedDatasetExtensions = new Set(['.xlsx', '.csv']);
export const unsupportedDatasetExtensions = new Set(['.xls']);

const candidateDirs = () => {
  const dirs = [];
  if (env.DATASET_IMPORT_DIR) {
    dirs.push(path.resolve(serverRoot, env.DATASET_IMPORT_DIR));
    dirs.push(path.resolve(projectRoot, env.DATASET_IMPORT_DIR));
  }
  dirs.push(path.resolve(projectRoot, 'Data'));
  dirs.push(path.resolve(projectRoot, 'local data'));
  return [...new Set(dirs)];
};

export const resolveDatasetDir = () => candidateDirs().find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()) || null;

export const getDatasetStatus = () => {
  const dir = resolveDatasetDir();
  if (!dir) {
    return {
      configured: false,
      available: false,
      directoryFound: false,
      fileCount: 0,
    };
  }

  const files = fs.readdirSync(dir)
    .filter((fileName) => supportedDatasetExtensions.has(path.extname(fileName).toLowerCase()));

  return {
    configured: true,
    available: true,
    directoryFound: true,
    fileCount: files.length,
  };
};

export const listDatasetFiles = (dir = resolveDatasetDir()) => {
  if (!dir) return [];

  return fs.readdirSync(dir)
    .map((fileName) => ({
      fileName,
      filePath: path.join(dir, fileName),
      extension: path.extname(fileName).toLowerCase(),
    }))
    .filter((file) => supportedDatasetExtensions.has(file.extension) || unsupportedDatasetExtensions.has(file.extension))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
};
