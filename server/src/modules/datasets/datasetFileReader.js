import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { AppError, errorCodes } from '../../utils/AppError.js';

export const MAX_IMPORT_ROWS = Number(process.env.MAX_IMPORT_ROWS || 25000);
export const MAX_IMPORT_COLUMNS = Number(process.env.MAX_IMPORT_COLUMNS || 120);
export const MAX_IMPORT_SHEETS = Number(process.env.MAX_IMPORT_SHEETS || 20);
export const MAX_XLSX_XML_BYTES = Number(process.env.MAX_XLSX_XML_BYTES || 10 * 1024 * 1024);
export const MAX_JSON_IMPORT_BYTES = Number(process.env.MAX_JSON_IMPORT_BYTES || 10 * 1024 * 1024);

const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const safeJsonKey = (key) => !DANGEROUS_JSON_KEYS.has(String(key));

const jsonScalarValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value).slice(0, 1000);
};

const columnIndexFromRef = (ref = '') => {
  const letters = ref.match(/[A-Z]+/i)?.[0] || '';
  return letters.split('').reduce((acc, letter) => (acc * 26) + letter.toUpperCase().charCodeAt(0) - 64, 0) - 1;
};

const readSharedStrings = async (zip) => {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];

  const sharedStringsBuffer = await file.async('uint8array');
  if (sharedStringsBuffer.byteLength > MAX_XLSX_XML_BYTES) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Shared strings XML is too large to import safely.', 400);
  }
  const xml = xmlParser.parse(Buffer.from(sharedStringsBuffer).toString('utf8'));
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
      if (index >= MAX_IMPORT_COLUMNS) {
        throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_COLUMNS} columns.`, 400);
      }
      values[index >= 0 ? index : values.length] = parseCellValue(cell, sharedStrings);
    }
    if (values.length > MAX_IMPORT_COLUMNS) {
      throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_COLUMNS} columns.`, 400);
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
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid workbook structure.', 400);
  const workbook = xmlParser.parse(await workbookFile.async('text'));
  const rels = xmlParser.parse(await relsFile.async('text'));
  const relMap = Object.fromEntries(
    asArray(rels.Relationships?.Relationship).map((relationship) => [
      relationship.Id,
      relationship.Target.startsWith('/') ? relationship.Target.slice(1) : `xl/${relationship.Target}`,
    ]),
  );

  const sheets = [];
  const workbookSheets = asArray(workbook.workbook?.sheets?.sheet);
  if (workbookSheets.length > MAX_IMPORT_SHEETS) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_SHEETS} sheets.`, 400);
  }

  let totalRows = 0;
  for (const sheet of workbookSheets) {
    const target = relMap[sheet.id];
    const worksheetFile = target ? zip.file(target) : null;
    if (!worksheetFile) continue;
    const worksheetBuffer = await worksheetFile.async('uint8array');
    if (worksheetBuffer.byteLength > MAX_XLSX_XML_BYTES) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Worksheet XML is too large to import safely.', 400);
    }
    const rows = parseSheetRows(Buffer.from(worksheetBuffer).toString('utf8'), sharedStrings);
    totalRows += rows.length;
    if (totalRows > MAX_IMPORT_ROWS) {
      throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_ROWS} rows.`, 400);
    }
    sheets.push({
      name: sheet.name,
      rows,
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
    .map((line, index) => {
      const values = parseCsvLine(line);
      if (values.length > MAX_IMPORT_COLUMNS) {
        throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_COLUMNS} columns.`, 400);
      }
      return { rowNumber: index + 1, values };
    });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_ROWS} rows.`, 400);
  }

  return {
    fileName: path.basename(filePath),
    sheets: [{ name: 'CSV', rows }],
  };
};

const extractJsonRows = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (!isPlainObject(parsed)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'JSON imports must be an array or an object containing leads, businesses, results, or items.', 400);
  }

  for (const key of ['leads', 'businesses', 'results', 'items']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }

  throw new AppError(errorCodes.VALIDATION_ERROR, 'Unsupported JSON import shape. Expected array, leads, businesses, results, or items.', 400);
};

const flattenJsonRow = (row, prefix = '', output = {}) => {
  if (!isPlainObject(row)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Each JSON import row must be an object.', 400);
  }

  for (const [key, value] of Object.entries(row)) {
    if (!safeJsonKey(key)) continue;
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      flattenJsonRow(value, nextKey, output);
    } else if (Array.isArray(value)) {
      output[nextKey] = value.map(jsonScalarValue).join(', ');
    } else {
      output[nextKey] = jsonScalarValue(value);
    }
  }
  return output;
};

export const readJsonWorkbook = async (filePath) => {
  const stat = await fs.stat(filePath);
  if (stat.size <= 0) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'JSON import file is empty.', 400);
  }
  if (stat.size > MAX_JSON_IMPORT_BYTES) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `JSON import files may be at most ${MAX_JSON_IMPORT_BYTES} bytes.`, 400);
  }

  let parsed;
  try {
    parsed = JSON.parse((await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid JSON import file.', 400);
  }

  const sourceRows = extractJsonRows(parsed);
  if (sourceRows.length > MAX_IMPORT_ROWS) {
    throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_ROWS} rows.`, 400);
  }

  const flattenedRows = sourceRows.map((row) => flattenJsonRow(row));
  const headerSet = new Set();
  for (const row of flattenedRows) {
    for (const key of Object.keys(row)) {
      if (safeJsonKey(key)) headerSet.add(key);
      if (headerSet.size > MAX_IMPORT_COLUMNS) {
        throw new AppError(errorCodes.VALIDATION_ERROR, `Import files may contain at most ${MAX_IMPORT_COLUMNS} columns.`, 400);
      }
    }
  }

  const headers = [...headerSet];
  return {
    fileName: path.basename(filePath),
    detectedFileType: 'json',
    sheets: [{
      name: 'JSON',
      rows: [
        { rowNumber: 1, values: headers },
        ...flattenedRows.map((row, index) => ({
          rowNumber: index + 2,
          values: headers.map((header) => row[header] ?? ''),
        })),
      ],
    }],
  };
};

export const readDatasetWorkbook = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.xlsx') return readXlsxWorkbook(filePath);
  if (extension === '.csv') return readCsvWorkbook(filePath);
  if (extension === '.json') return readJsonWorkbook(filePath);
  
  throw new AppError(errorCodes.VALIDATION_ERROR, `Unsupported dataset file extension: ${extension}`, 400);
};
