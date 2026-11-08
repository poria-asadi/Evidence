import assert from 'node:assert/strict';
import { specializeExtractionColumn, specializeExtractionColumns, statisticForHeader, studyDesignHeader } from '../lib/extraction-column-rules.ts';
import { finalizeSpecializedCell } from '../lib/extraction-cell-policy.ts';
import { tableExcerptsFromTxt } from '../lib/extraction-tables.ts';
import { extractWithRecovery } from '../lib/extraction-resilience.ts';
import { validateExtractionCells } from '../lib/extraction-validation.ts';

assert.equal(statisticForHeader('Age mean'), 'mean');
assert.equal(statisticForHeader('Age median'), 'median');
assert.equal(statisticForHeader('Age SD'), 'sd');
assert.equal(statisticForHeader('Mean/Median age'), 'central');
assert.equal(statisticForHeader('Age'), 'central');
assert.equal(studyDesignHeader('study design'), true);
assert.match(specializeExtractionColumn({ header: 'study design', kind: 'article', instruction: '' }).instruction, /explicitly described/);
const year = specializeExtractionColumn({ header: 'Year of publication', kind: 'article', instruction: '' });
assert.equal(year.valueFormat, 'numeric');
assert.match(year.instruction, /submission/);
const mean = specializeExtractionColumn({ header: 'Age mean', kind: 'article', instruction: 'Age at surgery.' });
assert.equal(mean.valueFormat, 'numeric');
assert.equal(specializeExtractionColumn(mean).instruction, mean.instruction, 'Specialization must be idempotent.');
const withoutSd = specializeExtractionColumns([{ header: 'Age mean', kind: 'article', instruction: 'Age at surgery.' }]);
assert.equal(withoutSd[0].includeSdWithCentral, true);
assert.match(withoutSd[0].instruction, /central value ± SD/);
const withSd = specializeExtractionColumns([
  { header: 'Age mean', kind: 'article', instruction: 'Age at surgery.' },
  { header: 'Age SD', kind: 'article', instruction: 'Age spread.' },
]);
assert.equal(withSd[0].includeSdWithCentral, false);
assert.equal(withSd[1].statistic, 'sd');

const txt = 'PAGE 1\nTable 2. Baseline characteristics\nVariable\tGroup A\tGroup B\nAge, median (years)\t30\t32\n';
assert.equal(tableExcerptsFromTxt(txt)[0].page, 1);
assert.match(tableExcerptsFromTxt(txt)[0].text, /Age, median \(years\)\t30\t32/);
const checked = validateExtractionCells(txt, '', [{
  header: 'Age mean', value: '30', evidence: 'Age, median (years)\t30\t32',
  sourceStatistic: 'median', note: 'Median used because no mean was reported.',
}])[0];
const finalized = finalizeSpecializedCell(mean, checked);
assert.equal(finalized.value, '30');
assert.equal(finalized.conflict, true);
assert.match(finalized.reviewReason || '', /Median substituted/);
const sd = specializeExtractionColumn({ header: 'Age SD', kind: 'article', instruction: 'Age spread' });
const wrongSd = finalizeSpecializedCell(sd, validateExtractionCells(txt, '', [{
  header: 'Age SD', value: '30', evidence: 'Age, median (years)\t30\t32', sourceStatistic: 'median',
}])[0]);
assert.equal(wrongSd.value, 'NR', 'A median must never populate an SD-only column.');
assert.equal(wrongSd.conflict, true);

const multiple = finalizeSpecializedCell(specializeExtractionColumn({
  header: 'Age', kind: 'article', instruction: 'Age by group', valueFormat: 'numeric',
}), validateExtractionCells(txt, '', [{
  header: 'Age', value: '30; 32', evidence: 'Age, median (years)\t30\t32',
  sourceStatistic: 'median', note: 'Group A; Group B',
}])[0]);
assert.equal(multiple.conflict, true);
assert.match(multiple.reviewReason || '', /Multiple numeric values/);
assert.match(multiple.reviewReason || '', /Combined mean\/median/);

const repaired = await extractWithRecovery([mean], txt, async (_columns, repair) => ({ cells: [{
  header: 'Age mean', value: repair ? '30' : '30 years', evidence: 'Age, median (years)\t30\t32',
  sourceStatistic: 'median', note: 'Median substituted',
}] }));
assert.equal(repaired[0].value, '30');
assert.equal(repaired[0].sourceStatistic, 'median');
const combined = await extractWithRecovery(withoutSd, 'PAGE 1\nAge mean±SD: 30.1±4.1 years.', async () => ({ cells: [{
  header: 'Age mean', value: '30.1±4.1', evidence: 'Age mean±SD: 30.1±4.1 years.',
  sourceStatistic: 'mean', note: 'Mean and SD reported together.',
}] }));
assert.equal(combined[0].value, '30.1±4.1');
const split = await extractWithRecovery(withSd.slice(0, 1), 'PAGE 1\nAge mean±SD: 30.1±4.1 years.', async (_columns, repair) => ({ cells: [{
  header: 'Age mean', value: repair ? '30.1' : '30.1±4.1', evidence: 'Age mean±SD: 30.1±4.1 years.',
  sourceStatistic: 'mean', note: '',
}] }));
assert.equal(split[0].value, '30.1');
console.log('Specialized numeric, statistic, and table rules verified.');
