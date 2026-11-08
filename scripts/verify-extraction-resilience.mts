import assert from 'node:assert/strict';
import { runExtractionBatch } from '../lib/extraction-batch.ts';
import { extractWithRecovery, fillMissingExtractionCells, markInterruptedRecheck, ExtractionResponseError, normalizeExtractionValue, type ColumnPlan } from '../lib/extraction-resilience.ts';

const columns: ColumnPlan[] = ['Tissue', 'Groups', 'Sample size', 'Country'].map((header) => ({
  header, instruction: header, kind: 'article',
}));
const article = 'The graft used rat sciatic nerve. Two groups were sham and treated. Sample size was 12 rats. Country: Iran.';
const calls: string[][] = [];
const cells = await extractWithRecovery(columns, article, async (batch, repair) => {
  calls.push(batch.map((column) => column.header));
  if (batch.length > 1 && !repair) throw new ExtractionResponseError('The response reached its output limit.');
  const header = batch[0].header;
  if (header === 'Country') return { cells: [{ header, value: 'France', evidence: 'France' }] };
  if (header === 'Tissue' && !repair) return { cells: [{ header, value: 'rat sciatic nerve', evidence: 'unmatched phrase' }] };
  const answer: Record<string, [string, string]> = {
    Tissue: ['rat sciatic nerve', 'rat sciatic nerve'],
    Groups: ['sham; treated', 'sham and treated'],
    'Sample size': ['12 rats', '12 rats'],
  };
  return { cells: [{ header, value: answer[header][0], evidence: answer[header][1] }] };
});
assert.equal(calls[0].length, 3);
assert.deepEqual(cells.map((cell) => cell.value), ['rat sciatic nerve', 'sham; treated', '12 rats', 'NR']);
assert.equal(cells[3].reviewReason, 'The source quote could not be verified.');
assert.equal(cells.slice(0, 3).every((cell) => !cell.reviewReason), true);
const limited = await extractWithRecovery([columns[0]], article, async () => {
  throw new ExtractionResponseError('The response reached its output limit.');
});
assert.equal(limited[0].value, 'NR');
assert.match(limited[0].reviewReason || '', /output limit/);
const missing = await extractWithRecovery([columns[0]], article, async () => ({
  cells: [{ header: 'Tissue', value: '', evidence: '' }],
}));
assert.equal(missing[0].value, 'NR');
assert.equal(missing[0].reviewReason, undefined);
const explicitNr = await extractWithRecovery([columns[0]], article, async () => ({
  cells: [{ header: 'Tissue', value: 'nr', evidence: '' }],
}));
assert.equal(explicitNr[0].value, 'NR');
assert.equal(explicitNr[0].reviewReason, undefined);
assert.equal(normalizeExtractionValue('  '), 'NR');
const metadataWithoutEvidence = await extractWithRecovery(
  [{ header: 'Publication year', instruction: 'Article publication year', kind: 'metadata' }],
  article,
  async () => ({ cells: [{ header: 'Publication year', value: '2024', evidence: '' }] }),
);
assert.equal(metadataWithoutEvidence[0].value, 'NR');
assert.equal(metadataWithoutEvidence[0].reviewReason, 'The source evidence was missing.');
await assert.rejects(
  extractWithRecovery([columns[0]], article, async () => { throw new Error('Provider unavailable'); }),
  /Provider unavailable/,
);
const primary = [
  { header: 'Tissue', value: 'rat sciatic nerve', evidence: 'rat sciatic nerve' },
  { header: 'Groups', value: 'NR', evidence: '' },
  { header: 'Sample size', value: '', evidence: '' },
];
let recheckedHeaders: string[] = [];
const merged = await fillMissingExtractionCells(columns.slice(0, 3), primary, async (missingColumns) => {
  recheckedHeaders = missingColumns.map((column) => column.header);
  return [
    { header: 'Tissue', value: 'different tissue', evidence: 'different tissue' },
    { header: 'Groups', value: 'sham; treated', evidence: 'sham and treated' },
    { header: 'Sample size', value: '12 rats', evidence: '', reviewReason: 'Unverified evidence.' },
  ];
});
assert.deepEqual(recheckedHeaders, ['Groups', 'Sample size']);
assert.deepEqual(merged.map((cell) => cell.value), ['rat sciatic nerve', 'sham; treated', '']);
assert.equal(merged[0], primary[0]);
await fillMissingExtractionCells([columns[0]], [primary[0]], async () => {
  throw new Error('The second pass must be skipped when no cell is NR.');
});
const attempts: string[] = [];
const progress: number[] = [];
const batch = await runExtractionBatch(['first', 'interrupted', 'invalid'], async (item, attempt) => {
  attempts.push(`${item}:${attempt}`);
  if (item === 'interrupted' && attempt === 1) throw Object.assign(new Error('Temporary provider failure'), { status: 502 });
  if (item === 'invalid') throw Object.assign(new Error('Missing article TXT'), { status: 409 });
}, {
  maxAttempts: 3,
  retryable: (error) => (error as { status?: number }).status === 502,
  onCompleted: (count) => progress.push(count),
  wait: async () => undefined,
});
assert.deepEqual(attempts, ['first:1', 'interrupted:1', 'invalid:1', 'interrupted:2']);
assert.deepEqual(progress, [1, 2]);
assert.equal(batch.completed, 2);
assert.equal(batch.failures.length, 1);
assert.equal(batch.failures[0].item, 'invalid');
const savedAfterInterruptedRecheck = markInterruptedRecheck(primary);
assert.equal(savedAfterInterruptedRecheck[0], primary[0]);
assert.deepEqual(savedAfterInterruptedRecheck.slice(1).map((cell) => cell.value), ['NR', 'NR']);
assert.equal(savedAfterInterruptedRecheck.slice(1).every((cell) => Boolean(cell.reviewReason)), true);
console.log('Extraction batch recovery and cell isolation verified.');
