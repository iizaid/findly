import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { AppError, errorCodes } from '../../utils/AppError.js';

const MAX_XLSX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1500;
const MAX_SHARED_STRINGS = 100_000;
const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 10_000;
const MAX_COLUMNS_PER_ROW = 200;
const MAX_CELL_CHARS = 10_000;
const MAX_CSV_ROWS = 50_000;
const MAX_CSV_FILE_BYTES = 20 * 1024 * 1024;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  removeNSPrefix: true,
});

const rejectOversizedWorkbook = (message) => {
  throw new AppError(errorCodes.PAYLOAD_TOO_LARGE, message, 413);
};

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const textOf = (value) => {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? value['#text'] ?? '' : String(value);
  return raw.length > MAX_CELL_CHARS ? raw.slice(0, MAX_CELL_CHARS) : raw;
};

const columnIndexFromRef = (ref = '') => {
  const letters = ref.match(/[A-Z]+/i)?.[0] || '';
  return letters.split('').reduce((acc, letter) => (acc * 26) + letter.toUpperCase().charCodeAt(0) - 64, 0) - 1;
};

const readSharedStrings = async (zip) => {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];

  const xml = xmlParser.parse(await file.async('text'));
  const sharedStrings = asArray(xml.sst?.si);

  if (sharedStrings.length > MAX_SHARED_STRINGS) {
    rejectOversizedWorkbook(`Workbook has too many shared strings. Maximum allowed is ${MAX_SHARED_STRINGS}.`);
  }

  return sharedStrings.map((si) => {
    if (si.t !== undefined) return textOf(si.t);
    return asArray(si.r).map((run) => textOf(run.t)).join('').slice(0, MAX_CELL_CHARS);
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
  const sheetRows = asArray(xml.worksheet?.sheetData?.row);

  if (sheetRows.length > MAX_ROWS_PER_SHEET) {
    rejectOversizedWorkbook(`Sheet has too many rows. Maximum allowed is ${MAX_ROWS_PER_SHEET}.`);
  }

  return sheetRows.map((row) => {
    const cells = asArray(row.c);
    if (cells.length > MAX_COLUMNS_PER_ROW) {
      rejectOversizedWorkbook(`Sheet row has too many columns. Maximum allowed is ${MAX_COLUMNS_PER_ROW}.`);
    }

    const values = [];
    for (const cell of cells) {
      const index = columnIndexFromRef(cell.r);
      if (index >= MAX_COLUMNS_PER_ROW) {
        rejectOversizedWorkbook(`Sheet has columns beyond the maximum allowed ${MAX_COLUMNS_PER_ROW}.`);
      }
      values[index >= 0 ? index : values.length] = parseCellValue(cell, sharedStrings);
    }
    return {
      rowNumber: Number(row.r) || null,
      values,
    };
  });
};

export const readXlsxWorkbook = async (filePath) => {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_XLSX_FILE_BYTES) {
    rejectOversizedWorkbook(`XLSX file is too large. Maximum parse size is ${Math.round(MAX_XLSX_FILE_BYTES / 1024 / 1024)}MB.`);
  }

  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const zipEntries = Object.keys(zip.files || {});
  if (zipEntries.length > MAX_ZIP_ENTRIES) {
    rejectOversizedWorkbook(`Workbook has too many internal files. Maximum allowed is ${MAX_ZIP_ENTRIES}.`);
  }

  const sharedStrings = await readSharedStrings(zip);
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');

  if (!workbookFile || !relsFile) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid XLSX workbook structure.', 400);
  }

  const workbook = xmlParser.parse(await workbookFile.async('text'));
  const rels = xmlParser.parse(await relsFile.async('text'));
  const relMap = Object.fromEntries(
    asArray(rels.Relationships?.Relationship).map((relationship) => [
      relationship.Id,
      relationship.Target.startsWith('/') ? relationship.Target.slice(1) : `xl/${relationship.Target}`,
    ]),
  );

  const workbookSheets = asArray(workbook.workbook?.sheets?.sheet);
  if (workbookSheets.length > MAX_SHEETS) {
    rejectOversizedWorkbook(`Workbook has too many sheets. Maximum allowed is ${MAX_SHEETS}.`);
  }

  const sheets = [];
  for (const sheet of workbookSheets) {
    const target = relMap[sheet.id];
    const worksheetFile = target ? zip.file(target) : null;
    if (!worksheetFile) continue;
    sheets.push({
      name: String(sheet.name || `Sheet ${sheets.length + 1}`).slice(0, 200),
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
      values.push(current.slice(0, MAX_CELL_CHARS));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.slice(0, MAX_CELL_CHARS));

  if (values.length > MAX_COLUMNS_PER_ROW) {
    rejectOversizedWorkbook(`CSV row has too many columns. Maximum allowed is ${MAX_COLUMNS_PER_ROW}.`);
  }

  return values;
};

export const readCsvWorkbook = async (filePath) => {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_CSV_FILE_BYTES) {
    rejectOversizedWorkbook(`CSV file is too large. Maximum parse size is ${Math.round(MAX_CSV_FILE_BYTES / 1024 / 1024)}MB.`);
  }

  const content = await fs.readFile(filePath, 'utf8');
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length > MAX_CSV_ROWS) {
    rejectOversizedWorkbook(`CSV has too many rows. Maximum allowed is ${MAX_CSV_ROWS}.`);
  }

  const rows = lines.map((line, index) => ({ rowNumber: index + 1, values: parseCsvLine(line) }));

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
