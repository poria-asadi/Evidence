import assert from 'node:assert/strict';
import { citationPublicationYear, publicationYearHeader, studyCountryHeader } from '../lib/extraction-year.ts';

assert.equal(publicationYearHeader('year'), true);
assert.equal(publicationYearHeader('Year of Publication'), true);
assert.equal(publicationYearHeader('Publish year'), true);
assert.equal(publicationYearHeader('سال انتشار'), true);
assert.equal(publicationYearHeader('year of surgery'), false);
assert.equal(citationPublicationYear('Published online 2021'), '2021');
assert.equal(citationPublicationYear(null), null);
assert.equal(studyCountryHeader('Country'), true);
assert.equal(studyCountryHeader('Country of study'), true);
assert.equal(studyCountryHeader('Study setting country'), true);
assert.equal(studyCountryHeader('کشور مطالعه'), true);
assert.equal(studyCountryHeader('Country of author affiliation'), false);
console.log('Publication year mapping verified.');
