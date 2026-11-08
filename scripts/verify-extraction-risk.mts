import assert from 'node:assert/strict';
import { collectExtractionRisks } from '../lib/extraction-risk.ts';
import { validateExtractionCells } from '../lib/extraction-validation.ts';

const text = 'PAGE 1\nPublished 2024\nMethods\nParticipants were recruited in Iran.\nTable 1\nGroup\tN\nControl\t25\nIntervention\t30';
const columns = [
  { header: 'Year', instruction: 'Publication year', kind: 'metadata' as const },
  { header: 'Country', instruction: 'Study location', kind: 'article' as const },
  { header: 'Group size', instruction: 'Intervention N', kind: 'article' as const },
];
const haiku = validateExtractionCells(text, '2024', [
  { header: 'Year', value: 'NR', evidence: '' },
  { header: 'Country', value: 'NR', evidence: '' },
  { header: 'Group size', value: '30', evidence: 'Intervention\t30' },
]);
const luna = validateExtractionCells(text, '2024', [
  { header: 'Year', value: '2024', evidence: '2024' },
  { header: 'Country', value: 'Iran', evidence: 'Participants were recruited in Iran' },
  { header: 'Group size', value: '25', evidence: 'Control\t25' },
]);
const risks = collectExtractionRisks(columns, haiku, luna, '2024');
assert.deepEqual(risks.map((risk) => risk.header), columns.map((column) => column.header));
assert.ok(risks[0].reasons.includes('year_or_study_country_nr'));
assert.ok(risks[1].reasons.includes('nr_value_disagreement'));
assert.ok(risks[2].reasons.includes('numeric_value'));
assert.ok(risks[2].reasons.includes('table_context'));
assert.ok(risks[2].reasons.includes('model_disagreement'));
console.log('High-risk extraction selection verified.');
