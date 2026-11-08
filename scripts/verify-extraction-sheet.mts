import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { completeExtractionSheet, createExtractionWorkbook, readExtractionTemplate } from '../lib/extraction-sheet.ts';

const csv = strToU8('Study,Sample size,Outcome\r\n');
const csvTemplate = readExtractionTemplate('extract.csv', csv);
assert.deepEqual(csvTemplate.headers, ['Study', 'Sample size', 'Outcome']);
const csvOutput = strFromU8(completeExtractionSheet(csv, csvTemplate, [['A study', '42', '4.5, 95% CI']]));
assert.match(csvOutput, /"4\.5, 95% CI"/);
assert.match(strFromU8(completeExtractionSheet(csv, csvTemplate, [['A study', 'NR', 'NR']])), /A study,NR,NR/);

const workbook = zipSync({
  'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extraction" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/sharedStrings.xml': strToU8('<sst><si><t>Study</t></si><si><t>Sample size</t></si><si><t>Outcome</t></si></sst>'),
  'xl/worksheets/sheet1.xml': strToU8('<worksheet><dimension ref="A1:C1"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row></sheetData></worksheet>'),
});
const template = readExtractionTemplate('extract.xlsx', workbook);
assert.deepEqual(template.headers, csvTemplate.headers);
const output = completeExtractionSheet(workbook, template, [['A study', '42', '4.5, 95% CI']]);
const outputXml = strFromU8(unzipSync(output)['xl/worksheets/sheet1.xml']);
assert.match(outputXml, /<row r="2">/);
assert.match(outputXml, /<t>4\.5, 95% CI<\/t>/);
assert.equal(readExtractionTemplate('completed.xlsx', output).preview[0][2], '4.5, 95% CI');
console.log(JSON.stringify({ csvBytes: csvOutput.length, xlsxBytes: output.length, columns: template.headers.length }));

const created = createExtractionWorkbook(['Study', 'Sample size', 'Outcome']);
const createdParts = unzipSync(created);
assert.ok(createdParts['[Content_Types].xml']);
assert.deepEqual(readExtractionTemplate('EvidenceFlow-Columns.xlsx', created).headers, template.headers);
const filled = completeExtractionSheet(created, readExtractionTemplate('EvidenceFlow-Columns.xlsx', created), [['Example', '42', 'NR']]);
assert.deepEqual(readExtractionTemplate('filled.xlsx', filled).preview[0], ['Example', '42', 'NR']);
const flagged = completeExtractionSheet(created, readExtractionTemplate('EvidenceFlow-Columns.xlsx', created),
  [['Example', '42', 'NR']], [[false, true, false]]);
const flaggedParts = unzipSync(flagged);
const flaggedXml = strFromU8(flaggedParts['xl/worksheets/sheet1.xml']);
const flaggedStyles = strFromU8(flaggedParts['xl/styles.xml']);
assert.match(flaggedXml, /<c r="B2" s="1" t="inlineStr">/);
assert.match(flaggedStyles, /fgColor rgb="FFFFD7A8"/);
assert.deepEqual(readExtractionTemplate('flagged.xlsx', flagged).preview[0], ['Example', '42', 'NR']);
const flaggedCsv = strFromU8(completeExtractionSheet(csv, csvTemplate,
  [['Example', '42', 'NR']], [[false, true, false]]));
assert.match(flaggedCsv, /Example,⚠ REVIEW: 42,NR/);
