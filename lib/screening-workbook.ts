import { strToU8, zipSync } from 'fflate';

type Cell = string | number | null;
type ScreeningRow = Record<string, Cell>;

const columns = [
  ['title', 'Title'],
  ['first_author', 'First author'],
  ['doi', 'DOI'],
  ['gemini_decision', 'Miss Marple decision'],
  ['openai_decision', 'Poirot decision'],
  ['zeous_decision', 'Zeous decision'],
  ['reasoning', 'Screening reasoning'],
] as const;

export function createScreeningWorkbook(
  rows: ScreeningRow[],
  protocol: Record<string, Cell>,
) {
  const screeningRows: Cell[][] = [
    columns.map((column) => column[1]),
    ...rows.map((row) => columns.map(([key]) => row[key] ?? null)),
  ];
  const protocolRows: Cell[][] = [
    ['Protocol field', 'Value'],
    ...Object.entries(protocol).map(([key, value]) => [key, value]),
  ];
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': xml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': xml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Screening" sheetId="1" r:id="rId1"/><sheet name="Protocol" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': xml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': xml(styles()),
    'xl/worksheets/sheet1.xml': xml(
      sheet(screeningRows, [58, 28, 24, 20, 20, 20, 72], true),
    ),
    'xl/worksheets/sheet2.xml': xml(sheet(protocolRows, [24, 100], false)),
  };
  return zipSync(files, { level: 6 });
}

function sheet(rows: Cell[][], widths: number[], filter: boolean) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const needsExtraHeight = row.some(
        (value) =>
          typeof value === 'string' &&
          (value.includes('\n') || value.length > 90),
      );
      const height = rowIndex === 0 ? 30 : needsExtraHeight ? 44 : 24;
      return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${row.map((value, columnIndex) => cell(value, columnIndex + 1, rowIndex + 1, rowIndex === 0 ? 1 : 2)).join('')}</row>`;
    })
    .join('');
  const last = cellRef(widths.length, Math.max(1, rows.length));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rowXml}</sheetData>${filter ? `<autoFilter ref="A1:${last}"/>` : ''}</worksheet>`;
}

function cell(value: Cell, column: number, row: number, style: number) {
  const ref = cellRef(column, row);
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value == null ? '' : String(value))}</t></is></c>`;
}
function cellRef(column: number, row: number) {
  let letters = '';
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26))
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  return `${letters}${row}`;
}
function escapeXml(value: string) {
  return (/^[=+\-@]/.test(value) ? `'${value}` : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function xml(value: string) {
  return strToU8(value);
}
function styles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos Display"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5746C8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
