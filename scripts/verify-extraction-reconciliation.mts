import assert from 'node:assert/strict';
import { reconcileExtraction, EXTRACTION_PIPELINE_VERSION, isExtractionAudit } from '../lib/extraction-reconciliation.ts';
import type { ColumnPlan, ExtractedCell } from '../lib/extraction-resilience.ts';

const headers = ['Same', 'One NR', 'Numeric', 'Equivalent', 'Different', 'Both NR', 'Equivalent number', 'Same concept', 'Equivalent units'];
const columns: ColumnPlan[] = headers.map((header) => ({ header, instruction: header, kind: 'article' }));
const cells = (values: string[]): ExtractedCell[] => headers.map((header, index) => ({
  header, value: values[index], evidence: values[index] === 'NR' ? '' : `Evidence ${index}`,
}));
const haiku = cells(['12 patients', 'NR', '12 patients', 'United States', 'Male', 'NR', '5 patients', 'The study included 30 patients in the treatment group', '10 mm']);
const luna = cells(['12 patients', '20 patients', '13 patients', 'USA', 'Female', 'NR', '5.0 patients', 'Treatment group: 30 patients', '1 cm']);
const result = reconcileExtraction(columns, haiku, luna, [
  { header: 'Same', conflict: false, preferred: 'haiku', finalValue: '12 patients', reason: 'The verified values agree.' },
  { header: 'One NR', conflict: false, preferred: 'luna', finalValue: '20 patients', reason: '' },
  { header: 'Numeric', conflict: false, preferred: 'luna', finalValue: '13 patients', reason: 'Incorrectly considered equivalent' },
  { header: 'Equivalent', conflict: false, preferred: 'luna', finalValue: 'USA', reason: 'Both name the same country.' },
  { header: 'Different', conflict: true, preferred: 'luna', finalValue: 'Female', reason: 'Different categories' },
  { header: 'Both NR', conflict: false, preferred: 'haiku', finalValue: 'NR', reason: '' },
  { header: 'Equivalent number', conflict: false, preferred: 'haiku', finalValue: '5 patients', reason: '5 and 5.0 are numerically equal.' },
  { header: 'Same concept', conflict: false, preferred: 'luna', finalValue: 'Treatment group: 30 patients', reason: 'Both report 30 patients in the treatment group.' },
  { header: 'Equivalent units', conflict: false, preferred: 'luna', finalValue: '1 cm', reason: '10 mm equals 1 cm.' },
]);
assert.deepEqual(result.map((cell) => cell.conflict), [false, true, true, false, true, false, false, false, false]);
assert.deepEqual(result.map((cell) => cell.value), ['12 patients', '20 patients', '13 patients', 'USA', 'Female', 'NR', '5 patients', 'Treatment group: 30 patients', '1 cm']);
assert.ok(result[1].reviewReason);
assert.equal(result[2].haiku.value, '12 patients');
assert.equal(result[2].luna.value, '13 patients');
assert.equal(isExtractionAudit({ pipelineVersion: EXTRACTION_PIPELINE_VERSION, cells: result }), true);
assert.equal(isExtractionAudit(result), false);
const interrupted = reconcileExtraction(columns.slice(0, 1), haiku.slice(0, 1), luna.slice(0, 1), [
  { header: 'Same', conflict: true, preferred: 'haiku', finalValue: '12 patients', reason: 'Source-based adjudication was interrupted.' },
]);
assert.equal(interrupted[0].conflict, true);
assert.throws(() => reconcileExtraction(columns.slice(0, 1), haiku.slice(0, 1), luna.slice(0, 1), [
  { header: 'Same', conflict: false, preferred: 'haiku', finalValue: 'Invented value', reason: '' },
]));
console.log('Dual extraction reconciliation and conflict precedence verified.');
