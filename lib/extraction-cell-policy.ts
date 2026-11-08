import type { ColumnPlan, ExtractedCell } from './extraction-resilience.ts';
import type { ValidatedExtractionCell } from './extraction-validation.ts';
import { publicationYearHeader, studyCountryHeader } from './extraction-year.ts';

export function finalizeSpecializedCell(
  column: ColumnPlan, checked: ValidatedExtractionCell, model: 'haiku' | 'luna' = 'haiku',
) {
  let cell: ExtractedCell = checked.cell;
  let trace = checked.trace;
  const reasons = [...checked.issues];
  const statistic = column.statistic || 'none';
  const actual = cell.sourceStatistic;
  if (cell.value !== 'NR' && statistic === 'sd' && actual !== 'sd') {
    reasons.push('SD was requested, but the cited value was not identified as standard deviation.');
    cell = { ...cell, value: 'NR', evidence: '' };
    trace = null;
  }
  if (cell.value !== 'NR' && (statistic === 'mean' || statistic === 'median')) {
    const alternate = statistic === 'mean' ? 'median' : 'mean';
    if (actual === alternate)
      reasons.push(`${alternate === 'median' ? 'Median' : 'Mean'} substituted for requested ${statistic}. ${cell.note || 'Verify the source statistic.'}`);
    else if (actual !== statistic) {
      reasons.push(`The source statistic for requested ${statistic} was not verified.`);
      cell = { ...cell, value: 'NR', evidence: '' };
      trace = null;
    }
  }
  if (cell.value !== 'NR' && statistic === 'central' && (actual === 'mean' || actual === 'median'))
    reasons.push(`Combined mean/median column uses the reported ${actual}. ${cell.note || 'These statistics are not equivalent.'}`);
  if (cell.value !== 'NR' && column.valueFormat === 'numeric' && /[;؛]/.test(cell.value))
    reasons.push(`Multiple numeric values appear in source order. ${cell.note || 'Verify group and timepoint mapping.'}`);
  if (cell.value !== 'NR' && column.valueFormat === 'numeric' && trace?.source === 'article' &&
    /\btable\s*\d+\b/i.test(trace.excerpt) &&
    [...cell.evidence.matchAll(/(?<!\p{L})\d+(?:[.,]\d+)*/gu)].length > 1 &&
    !/[;؛]/.test(cell.value))
    reasons.push('The cited table row contains several numbers; verify the selected column and group.');
  if (cell.value === 'NR' && (publicationYearHeader(cell.header) || studyCountryHeader(cell.header)))
    reasons.push('The publication year or study country was not verified from the article TXT or citation.');
  const reviewReason = [...new Set(reasons)].join(' ').slice(0, 1000) || undefined;
  return {
    ...cell, selectedModel: model, conflict: Boolean(reviewReason),
    ...(reviewReason ? { reviewReason } : {}), finalTrace: trace,
  };
}
