import { createEvidenceLocator, type EvidenceTrace } from './extraction-evidence.ts';
import { normalizeExtractionValue, type ExtractedCell } from './extraction-resilience.ts';

export type ValidatedExtractionCell = {
  cell: ExtractedCell;
  trace: EvidenceTrace | null;
  issues: string[];
};

function numericTokens(value: string) {
  return [...value.matchAll(/(?<!\p{L})-?\d+(?:[.,]\d+)*/gu)]
    .map((match) => match[0].replace(',', '.'));
}

const CONTEXT_LABELS = /\b(?:case|control|intervention|placebo|baseline|follow[- ]?up|month|months|week|weeks|group\s+[a-z])\b/gi;

function contextLabels(value: string) {
  return [...value.matchAll(CONTEXT_LABELS)].map((match) => match[0].toLowerCase().replace(/[-\s]+/g, ' '));
}

export function validateExtractionCells(
  articleText: string,
  citationText: string,
  cells: ExtractedCell[],
): ValidatedExtractionCell[] {
  const locate = createEvidenceLocator(articleText, citationText);
  return cells.map((cell) => {
    if (normalizeExtractionValue(cell.value) === 'NR')
      return { cell, trace: null, issues: cell.reviewReason ? [cell.reviewReason] : [] };
    const trace = locate(cell.evidence);
    const issues: string[] = [];
    if (!trace) issues.push('The quoted evidence could not be located in the prepared TXT or citation.');
    else {
      const source = trace.source === 'article' ? articleText : citationText;
      const nearby = source.slice(Math.max(0, trace.start - 100), Math.min(source.length, trace.end + 100));
      const sourceNumbers = numericTokens(nearby);
      const unmatched = numericTokens(cell.value).filter((value) => !sourceNumbers.includes(value));
      if (unmatched.length) issues.push(`The value contains number(s) absent from nearby source text: ${unmatched.join(', ')}.`);
      if (numericTokens(cell.value).length) {
        const nearbyLabels = new Set(contextLabels(nearby));
        const valueLabels = contextLabels(cell.value);
        const quoteLabels = contextLabels(cell.evidence);
        const missingLabels = valueLabels.filter((label) => !nearbyLabels.has(label));
        if (missingLabels.length) issues.push(`The value's group or timepoint is absent near the cited evidence: ${missingLabels.join(', ')}.`);
        if (quoteLabels.length && valueLabels.length && !valueLabels.some((label) => quoteLabels.includes(label)))
          issues.push('The cited evidence names a different group or timepoint than the value.');
        if (trace.source === 'article' && /\btable\s*\d+\b/i.test(trace.excerpt) &&
          !/\d/.test(cell.evidence))
          issues.push('A numeric value cites a table caption without a numeric row excerpt.');
      }
    }
    if (cell.reviewReason) issues.push(cell.reviewReason);
    return { cell, trace, issues };
  });
}
