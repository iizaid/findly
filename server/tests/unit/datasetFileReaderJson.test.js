import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readJsonWorkbook } from '../../src/modules/datasets/datasetFileReader.js';

const tempFiles = [];
const writeJson = async (name, content) => {
  const filePath = path.join(process.cwd(), 'uploads', `json-reader-${Date.now()}-${name}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, typeof content === 'string' ? content : JSON.stringify(content));
  tempFiles.push(filePath);
  return filePath;
};

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((file) => fs.unlink(file).catch(() => {})));
});

describe('JSON dataset reader', () => {
  it('reads an array of objects as a workbook', async () => {
    const filePath = await writeJson('array.json', [
      { businessName: 'Cafe Example', city: 'Amman', websiteUrl: 'https://example.com' },
    ]);

    const workbook = await readJsonWorkbook(filePath);
    expect(workbook.detectedFileType).toBe('json');
    expect(workbook.sheets[0].name).toBe('JSON');
    expect(workbook.sheets[0].rows[0].values).toEqual(expect.arrayContaining(['businessName', 'city', 'websiteUrl']));
    expect(workbook.sheets[0].rows[1].values).toContain('Cafe Example');
  });

  it('reads object wrappers with leads, businesses, results, or items arrays', async () => {
    for (const key of ['leads', 'businesses', 'results', 'items']) {
      const filePath = await writeJson(`${key}.json`, { [key]: [{ name: `${key} Cafe`, city: 'Amman' }] });
      const workbook = await readJsonWorkbook(filePath);
      expect(workbook.sheets[0].rows).toHaveLength(2);
      expect(workbook.sheets[0].rows[1].values).toContain(`${key} Cafe`);
    }
  });

  it('rejects invalid JSON and unsupported top-level shapes', async () => {
    await expect(readJsonWorkbook(await writeJson('bad.json', '{not json'))).rejects.toThrow(/Invalid JSON/);
    await expect(readJsonWorkbook(await writeJson('shape.json', { meta: { count: 1 } }))).rejects.toThrow(/Unsupported JSON import shape/);
  });

  it('rejects row-level non-objects', async () => {
    await expect(readJsonWorkbook(await writeJson('rows.json', ['Cafe', 'Other']))).rejects.toThrow(/Each JSON import row must be an object/);
  });

  it('drops dangerous prototype pollution keys', async () => {
    const filePath = await writeJson('dangerous.json', [{
      businessName: 'Safe Cafe',
      __proto__: { polluted: true },
      constructor: 'bad',
      prototype: 'bad',
    }]);

    const workbook = await readJsonWorkbook(filePath);
    expect(workbook.sheets[0].rows[0].values).toContain('businessName');
    expect(workbook.sheets[0].rows[0].values).not.toContain('__proto__');
    expect(workbook.sheets[0].rows[0].values).not.toContain('constructor');
    expect(workbook.sheets[0].rows[0].values).not.toContain('prototype');
  });
});
