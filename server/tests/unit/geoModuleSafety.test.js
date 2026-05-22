import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const geoDir = path.resolve(process.cwd(), 'src', 'modules', 'geo');

const listJsFiles = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(dirPath, entry.name);
  if (entry.isDirectory()) return listJsFiles(entryPath);
  if (!entry.name.endsWith('.js')) return [];
  return [entryPath];
});

describe('geo module safety', () => {
  it('does not use $executeRawUnsafe anywhere in the geo module', () => {
    const violations = listJsFiles(geoDir)
      .map((filePath) => ({
        filePath,
        content: fs.readFileSync(filePath, 'utf8'),
      }))
      .filter(({ content }) => content.includes('$executeRawUnsafe'))
      .map(({ filePath }) => path.relative(process.cwd(), filePath));

    expect(violations).toEqual([]);
  });
});
