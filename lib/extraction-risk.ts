import type { ColumnPlan } from './extraction-resilience.ts';
import type { ValidatedExtractionCell } from './extraction-validation.ts';
import { publicationYearHeader, studyCountryHeader } from './extraction-year.ts';

export type ExtractionRisk = { header: string; reasons: string[] };

function comparable(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, ' ').trim();
}

function tableContext(item: ValidatedExtractionCell) {
  return item.trace?.source === 'article' &&
    (/\btable\s*\d+\b/i.test(item.trace.excerpt) || item.trace.excerpt.includes('\t'));
}

export function collectExtractionRisks(
  columns: ColumnPlan[], haiku: ValidatedExtractionCell[], luna: ValidatedExtractionCell[],
  citationYear: string | null,
): ExtractionRisk[] {
  const first = new Map(haiku.map((item) => [item.cell.header, item]));
  const second = new Map(luna.map((item) => [item.cell.header, item]));
  return columns.flatMap((column) => {
    const a = first.get(column.header);
    const b = second.get(column.header);
    if (!a || !b) throw new Error(`Both models must extract “${column.header}”.`);
    const reasons: string[] = [];
    const aNR = a.cell.value === 'NR';
    const bNR = b.cell.value === 'NR';
    if ((publicationYearHeader(column.header) || studyCountryHeader(column.header)) && (aNR || bNR))
      reasons.push('year_or_study_country_nr');
    if (aNR !== bNR) reasons.push('nr_value_disagreement');
    if (a.issues.length || b.issues.length) reasons.push('invalid_or_weak_evidence');
    if (/\d/.test(a.cell.value) || /\d/.test(b.cell.value)) reasons.push('numeric_value');
    if (tableContext(a) || tableContext(b)) reasons.push('table_context');
    if (comparable(a.cell.value) !== comparable(b.cell.value)) reasons.push('model_disagreement');
    if (citationYear && publicationYearHeader(column.header) &&
      ((a.cell.value !== 'NR' && a.cell.value !== citationYear) ||
       (b.cell.value !== 'NR' && b.cell.value !== citationYear))) reasons.push('citation_year_mismatch');
    return reasons.length ? [{ header: column.header, reasons }] : [];
  });
}
