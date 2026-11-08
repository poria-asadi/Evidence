import { unzipSync, zipSync } from 'fflate';

export type ExtractionTemplate = {
  format: 'csv' | 'xlsx';
  headers: string[];
  preview: string[][];
  worksheetPath: string | null;
  headerRow: number;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function readExtractionTemplate(name: string, bytes: Uint8Array): ExtractionTemplate {
  const format = name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
  let rows: { row: number; cells: Map<number, string> }[];
  let worksheetPath: string | null = null;
  if (format === 'csv') {
    rows = parseCsv(decoder.decode(bytes)).map((cells, index) => ({
      row: index + 1,
      cells: new Map(cells.map((value, column) => [column, value])),
    }));
  } else {
    const files = unzipSync(bytes);
    worksheetPath = firstWorksheetPath(files);
    const xml = decoder.decode(files[worksheetPath]);
    rows = parseWorksheet(xml, sharedStrings(files));
  }
  const candidates = rows.slice(0, 25);
  const header = candidates.find(({ cells }) =>
    [...cells.values()].filter((value) => value.trim()).length >= 2,
  ) || candidates.find(({ cells }) => [...cells.values()].some((value) => value.trim()));
  if (!header) throw new Error('The sheet needs a named header column.');
  const maxColumn = Math.max(...header.cells.keys());
  const headers = Array.from({ length: maxColumn + 1 }, (_, index) => header.cells.get(index)?.trim() || '');
  if (headers.some((value) => !value))
    throw new Error('Every column between the first and last header needs a name.');
  if (new Set(headers.map((value) => value.toLowerCase())).size !== headers.length)
    throw new Error('Column names must be unique.');
  return {
    format,
    headers,
    preview: rows.filter((row) => row.row > header.row).slice(0, 4).map((row) =>
      headers.map((_, index) => row.cells.get(index) || ''),
    ),
    worksheetPath,
    headerRow: header.row,
  };
}

export function completeExtractionSheet(
  source: Uint8Array,
  template: ExtractionTemplate,
  rows: string[][],
  conflictFlags: boolean[][] = [],
): Uint8Array {
  if (template.format === 'csv') {
    const original = decoder.decode(source).replace(/^\uFEFF/, '').replace(/\s*$/, '');
    return encoder.encode(`${original}\r\n${rows.map((row, rowIndex) => row.map((value, column) =>
      csvCell(conflictFlags[rowIndex]?.[column] ? `⚠ REVIEW: ${value}` : value)).join(',')).join('\r\n')}\r\n`);
  }
  const files = unzipSync(source);
  const path = template.worksheetPath;
  if (!path || !files[path]) throw new Error('The original worksheet could not be read.');
  let xml = decoder.decode(files[path]);
  const orangeStyle = conflictFlags.some((row) => row.some(Boolean)) ? addConflictStyle(files) : null;
  const rowNumbers = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((match) => Number(match[1]));
  const first = Math.max(template.headerRow, ...rowNumbers) + 1;
  const appended = rows.map((row, index) => {
    const rowNumber = first + index;
    const cells = row.map((value, column) => value || conflictFlags[index]?.[column]
      ? `<c r="${columnName(column)}${rowNumber}"${conflictFlags[index]?.[column] && orangeStyle !== null ? ` s="${orangeStyle}"` : ''} t="inlineStr"><is><t>${xmlEscape(conflictFlags[index]?.[column] && orangeStyle === null ? `⚠ REVIEW: ${value}` : value)}</t></is></c>`
      : '').join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');
  if (!/<\/sheetData>/.test(xml)) throw new Error('The worksheet has no data area.');
  xml = xml.replace('</sheetData>', `${appended}</sheetData>`);
  const lastCell = `${columnName(template.headers.length - 1)}${first + rows.length - 1}`;
  xml = xml.replace(/<dimension\b[^>]*\bref="[^"]*"/, (tag) =>
    tag.replace(/\bref="[^"]*"/, `ref="A1:${lastCell}"`));
  files[path] = encoder.encode(xml);
  return zipSync(files, { level: 6 });
}

function addConflictStyle(files: Record<string, Uint8Array>) {
  const stylePath = 'xl/styles.xml';
  let xml = files[stylePath] ? decoder.decode(files[stylePath])
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
  const fills = xml.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/);
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!fills || !cellXfs) return null;
  const fillIndex = [...fills[1].matchAll(/<fill\b/g)].length;
  const styleIndex = [...cellXfs[1].matchAll(/<xf\b/g)].length;
  const orange = '<fill><patternFill patternType="solid"><fgColor rgb="FFFFD7A8"/><bgColor indexed="64"/></patternFill></fill>';
  xml = xml.replace(fills[0], fills[0].replace(/count="\d+"/, `count="${fillIndex + 1}"`).replace('</fills>', `${orange}</fills>`));
  const xf = `<xf numFmtId="0" fontId="0" fillId="${fillIndex}" borderId="0" xfId="0" applyFill="1"/>`;
  xml = xml.replace(cellXfs[0], cellXfs[0].replace(/count="\d+"/, `count="${styleIndex + 1}"`).replace('</cellXfs>', `${xf}</cellXfs>`));
  files[stylePath] = encoder.encode(xml);

  const relPath = 'xl/_rels/workbook.xml.rels';
  const rels = files[relPath] ? decoder.decode(files[relPath]) : '';
  if (rels && !rels.includes('/styles"')) {
    const ids = [...rels.matchAll(/\bId="rId(\d+)"/g)].map((match) => Number(match[1]));
    const id = Math.max(0, ...ids) + 1;
    files[relPath] = encoder.encode(rels.replace('</Relationships>',
      `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`));
  }
  const typesPath = '[Content_Types].xml';
  const types = files[typesPath] ? decoder.decode(files[typesPath]) : '';
  if (types && !types.includes('PartName="/xl/styles.xml"'))
    files[typesPath] = encoder.encode(types.replace('</Types>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'));
  return styleIndex;
}

export function createExtractionWorkbook(headers: string[]): Uint8Array {
  const columns = headers.map((header, index) =>
    `<c r="${columnName(index)}1" t="inlineStr"><is><t>${xmlEscape(header)}</t></is></c>`,
  ).join('');
  const last = columnName(headers.length - 1);
  const files = {
    '[Content_Types].xml': encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extraction" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData><row r="1">${columns}</row></sheetData></worksheet>`),
  };
  return zipSync(files, { level: 6 });
}

function firstWorksheetPath(files: Record<string, Uint8Array>) {
  const workbook = files['xl/workbook.xml'];
  const relations = files['xl/_rels/workbook.xml.rels'];
  if (!workbook || !relations) throw new Error('This is not a valid XLSX workbook.');
  const sheet = decoder.decode(workbook).match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (!sheet) throw new Error('The workbook has no worksheet.');
  const relation = [...decoder.decode(relations).matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((match) => match[0]).find((tag) => attribute(tag, 'Id') === sheet[1]);
  const target = relation && attribute(relation, 'Target');
  if (!target) throw new Error('The worksheet could not be located.');
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  if (!files[path] || !path.startsWith('xl/worksheets/'))
    throw new Error('The first worksheet is unsupported.');
  return path;
}

function sharedStrings(files: Record<string, Uint8Array>) {
  const bytes = files['xl/sharedStrings.xml'];
  if (!bytes) return [];
  return [...decoder.decode(bytes).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map((match) => [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((text) => xmlUnescape(text[1])).join(''));
}

function parseWorksheet(xml: string, strings: string[]) {
  return [...xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)].map((match) => {
    const row = Number(attribute(match[1], 'r'));
    const cells = new Map<number, string>();
    for (const cell of match[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const address = attribute(cell[1], 'r') || '';
      const column = columnIndex(address.match(/^[A-Z]+/)?.[0] || '');
      if (column < 0) continue;
      const body = cell[2] || '';
      const type = attribute(cell[1], 't');
      const value = type === 'inlineStr'
        ? [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => xmlUnescape(part[1])).join('')
        : xmlUnescape(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '');
      cells.set(column, type === 's' ? strings[Number(value)] || '' : value);
    }
    return { row, cells };
  });
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  if (quoted) throw new Error('The CSV has an unclosed quoted cell.');
  return rows;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`))?.[1] || null;
}
function columnIndex(name: string) {
  if (!name) return -1;
  return name.split('').reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
function columnName(index: number) {
  let name = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26))
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}
function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function xmlUnescape(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric, named) => {
    if (numeric) return String.fromCodePoint(numeric[0].toLowerCase() === 'x'
      ? parseInt(numeric.slice(1), 16) : Number(numeric));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[named] || match;
  });
}
