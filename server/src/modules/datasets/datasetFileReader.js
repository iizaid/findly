import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  removeNSPrefix: true,
});

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const textOf = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return value['#text'] ?? '';
  return String(value);
};

const columnIndexFromRef = (ref = '') => {
  const letters = ref.match(/[A-Z]+/i)?.[0] || '';
  return letters.split('').reduce((acc, letter) => (acc * 26) + letter.toUpperCase().charCodeAt(0) - 64, 0) - 1;
};

const readSharedStrings = async (zip) => {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];

  const xml = xmlParser.parse(await file.async('text'));
  return asArray(xml.sst?.si).map((si) => {
    if (si.t !== undefined) return textOf(si.t);
    return asArray(si.r).map((run) => textOf(run.t)).join('');
  });
};

const parseCellValue = (cell, sharedStrings) => {
  if (cell.t === 's') return sharedStrings[Number(cell.v)] ?? '';
  if (cell.t === 'inlineStr') return textOf(cell.is?.t);
  if (cell.t === 'str') return textOf(cell.v);
  if (cell.t === 'b') return textOf(cell.v) === '1' ? 'true' : 'false';
  return textOf(cell.v);
};

const parseSheetRows = (worksheetXml, sharedStrings) => {
  const xml = xmlParser.parse(worksheetXml);
  return asArray(xml.worksheet?.sheetData?.row).map((row) => {
    const values = [];
    for (const cell of asArray(row.c)) {
      const index = columnIndexFromRef(cell.r);
      values[index >= 0 ? index : values.length] = parseCellValue(cell, sharedStrings);
    }
    return {
      rowNumber: Number(row.r) || null,
      values,
    };
  });
};

export const readXlsxWorkbook = async (filePath) => {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const sharedStrings = await readSharedStrings(zip);
  const workbook = xmlParser.parse(await zip.file('xl/workbook.xml').async('text'));
  const rels = xmlParser.parse(await zip.file('xl/_rels/workbook.xml.rels').async('text'));
  const relMap = Object.fromEntries(
    asArray(rels.Relationships?.Relationship).map((relationship) => [
      relationship.Id,
      relationship.Target.startsWith('/') ? relationship.Target.slice(1) : `xl/${relationship.Target}`,
    ]),
  );

  const sheets = [];
  for (const sheet of asArray(workbook.workbook?.sheets?.sheet)) {
    const target = relMap[sheet.id];
    const worksheetFile = target ? zip.file(target) : null;
    if (!worksheetFile) continue;
    sheets.push({
      name: sheet.name,
      rows: parseSheetRows(await worksheetFile.async('text'), sharedStrings),
    });
  }

  return { fileName: path.basename(filePath), sheets };
};

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

export const readCsvWorkbook = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  const rows = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => ({ rowNumber: index + 1, values: parseCsvLine(line) }));

  return {
    fileName: path.basename(filePath),
    sheets: [{ name: 'CSV', rows }],
  };
};

export const readDatasetWorkbook = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.xlsx') return readXlsxWorkbook(filePath);
  if (extension === '.csv') return readCsvWorkbook(filePath);
  
  const { AppError, errorCodes } = await import('../../utils/AppError.js');
  throw new AppError(errorCodes.VALIDATION_ERROR, `Unsupported dataset file extension: ${extension}`, 400);
};
