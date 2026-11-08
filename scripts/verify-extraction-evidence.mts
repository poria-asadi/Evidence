import assert from 'node:assert/strict';
import { createEvidenceLocator, evidenceAppearsInArticle } from '../lib/extraction-evidence.ts';
import { validateExtractionCells } from '../lib/extraction-validation.ts';

const article = 'PAGE 1\nThe nerve tissue was a de-\nPAGE 2\ncellularized rat sciatic nerve. Figure 3 shows axon counts.';
assert.equal(evidenceAppearsInArticle(article, 'decellularized rat sciatic nerve'), true);
assert.equal(evidenceAppearsInArticle(article, 'Figure 3 shows axon counts'), true);
assert.equal(evidenceAppearsInArticle(article, 'human spinal cord tissue'), false);
const locate = createEvidenceLocator(article, 'Smith et al. 2024');
const trace = locate('decellularized rat sciatic nerve');
assert.equal(trace?.source, 'article');
assert.equal(trace?.page, 1);
assert.equal(trace?.start, article.indexOf('de-'));
assert.match(trace?.excerpt || '', /de-\nPAGE 2\ncellularized/);
assert.equal(locate('Smith et al. 2024')?.source, 'citation');
assert.equal(locate('human spinal cord tissue'), null);
const checked = validateExtractionCells('PAGE 1\nThe treatment group included 30 patients.', '', [
  { header: 'Patients', value: '30 patients', evidence: '30 patients' },
  { header: 'Wrong number', value: '40 patients', evidence: '30 patients' },
  { header: 'Missing', value: 'NR', evidence: '' },
]);
assert.equal(checked[0].trace?.page, 1);
assert.deepEqual(checked[0].issues, []);
assert.match(checked[1].issues[0], /40/);
assert.deepEqual(checked[2].issues, []);
const groupMismatch = validateExtractionCells('PAGE 1\nControl group: 30 patients. Intervention group: 25 patients.', '', [
  { header: 'Group size', value: 'Intervention group: 30 patients', evidence: 'Control group: 30 patients' },
]);
assert.match(groupMismatch[0].issues.join(' '), /group|timepoint/i);
const distantNumber = validateExtractionCells(`PAGE 1\n30 patients ${'unrelated text '.repeat(20)} 25 patients`, '', [
  { header: 'Patients', value: '25 patients', evidence: '30 patients' },
]);
assert.match(distantNumber[0].issues.join(' '), /25/);
const footer = createEvidenceLocator('PAGE 1\nMethods\nPatients were recruited consecutively.\nStudy conducted in Iran', '');
assert.equal(footer('Study conducted in Iran')?.page, 1);
console.log('Extraction evidence normalization verified.');
