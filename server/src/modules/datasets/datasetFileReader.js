import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { AppError, errorCodes } from '../../utils/AppError.js';

export const MAX_IMPORT_ROWS = Number(process.env.MAX_IMPORT_ROWS || 25000);
export const MAX_IMPORT_COLUMNS = Number(process.env.MAX_IMPORT_COLUMNS || 120);
export const MAX_IMPORT_SHEETS = Number(process.env.MAX_IMPORT_SHEETS || 20);
export const MAX_XLSX_XML_BYTES = Number(process.env.MAX_XLSX_XML_BYTES || 10 * 1024 * 1024);

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

export const readDatasetWorkbook = async (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.xlsx') return readXlsxWorkbook(filePath);
  if (extension === '.csv') return readCsvWorkbook(filePath);
  
  throw new AppError(errorCodes.VALIDATION_ERROR, `Unsupported dataset file extension: ${extension}`, 400);
};
