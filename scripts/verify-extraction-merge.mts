import assert from 'node:assert/strict';
import { mergeIndependentExtractions } from '../lib/extraction-merge.ts';
import { finalizeSpecializedCell } from '../lib/extraction-cell-policy.ts';
import type { ColumnPlan } from '../lib/extraction-resilience.ts';

const headers = ['Luna fills NR', 'Haiku fills NR', 'Different values', 'Same value', 'Numeric formatting', 'Both NR'];
const columns: ColumnPlan[] = headers.map((header) => ({ header, instruction: header, kind: 'article' }));
const makeCells = (model: 'haiku' | 'luna', values: string[]) => values.map((value, index) =>
  finalizeSpecializedCell(columns[index], {
    cell: { header: headers[index], value, evidence: value === 'NR' ? '' : `Source: ${value}` },
    trace: null, issues: [],
  }, model));
const haiku = makeCells('haiku', ['NR', 'Turkey', '12', '2022', '5', 'NR']);
const luna = makeCells('luna', ['2021', 'NR', '13', '2022', '5.0', 'NR']);
const result = mergeIndependentExtractions(columns, haiku, luna);
assert.deepEqual(result.map((cell) => cell.value), ['2021', 'Turkey', '13', '2022', '5.0', 'NR']);
assert.deepEqual(result.map((cell) => cell.selectedModel), ['luna', 'haiku', 'luna', 'luna', 'luna', 'luna']);
assert.deepEqual(result.map((cell) => cell.conflict), [true, true, true, false, false, false]);
assert.ok(result[2].reviewReason?.includes('disagree'));
assert.equal(result[2].evidence, 'Source: 13');
assert.equal(result[2].haiku.value, '12');
assert.equal(result[2].luna.value, '13');
assert.throws(() => mergeIndependentExtractions(columns, haiku.slice(1), luna));
console.log('Independent extraction merge and Luna conflict precedence verified.');
