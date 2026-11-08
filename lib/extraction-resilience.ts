import { evidenceAppearsInArticle } from './extraction-evidence.ts';

export type ColumnPlan = {
  header: string; instruction: string; kind: 'article' | 'metadata';
  valueFormat?: 'numeric' | 'text';
  statistic?: 'mean' | 'median' | 'sd' | 'central' | 'none';
  measureKey?: string;
  includeSdWithCentral?: boolean;
  userGuidance?: string;
};
export type ExtractedCell = {
  header: string; value: string; evidence: string; reviewReason?: string;
  sourceStatistic?: 'mean' | 'median' | 'sd' | 'other' | 'not_applicable';
  note?: string;
};
export type RepairContext = { issue: string; previousAnswer: unknown };

export class ExtractionResponseError extends Error {}

export function normalizeExtractionValue(value: string) {
  const normalized = value.trim();
  return !normalized || normalized.toUpperCase() === 'NR' ? 'NR' : normalized;
}

export async function fillMissingExtractionCells(
  columns: ColumnPlan[],
  primary: ExtractedCell[],
  recheck: (columns: ColumnPlan[]) => Promise<ExtractedCell[]>,
): Promise<ExtractedCell[]> {
  const primaryByHeader = new Map(primary.map((cell) => [cell.header, cell]));
  const missing = columns.filter((column) =>
    normalizeExtractionValue(primaryByHeader.get(column.header)?.value ?? '') === 'NR');
  if (!missing.length) return primary;

  const secondaryByHeader = new Map((await recheck(missing)).map((cell) => [cell.header, cell]));
  return columns.map((column) => {
    const original = primaryByHeader.get(column.header)!;
    if (normalizeExtractionValue(original.value) !== 'NR') return original;
    const candidate = secondaryByHeader.get(column.header);
    return candidate && !candidate.reviewReason && normalizeExtractionValue(candidate.value) !== 'NR'
      ? candidate : original;
  });
}

export function markInterruptedRecheck(cells: ExtractedCell[]): ExtractedCell[] {
  return cells.map((cell) => normalizeExtractionValue(cell.value) === 'NR'
    ? { ...cell, value: 'NR', reviewReason: cell.reviewReason || 'Automatic second check was interrupted. Verify this field.' }
    : cell);
}

export async function extractWithRecovery(
  columns: ColumnPlan[],
  articleText: string,
  request: (columns: ColumnPlan[], repair?: RepairContext) => Promise<unknown>,
): Promise<ExtractedCell[]> {
  const cells: ExtractedCell[] = [];
  for (let start = 0; start < columns.length; start += 3) {
    const batch = columns.slice(start, start + 3);
    let response: unknown;
    try { response = await request(batch); }
    catch (error) {
      if (!(error instanceof ExtractionResponseError)) throw error;
    }
    const raw = isRecord(response) && Array.isArray(response.cells) ? response.cells : [];
    for (const column of batch) {
      let candidate = raw.find((item) => isRecord(item) && item.header === column.header);
      let issue = cellIssue(candidate, column, articleText);
      for (let retry = 0; issue && retry < 2; retry++) {
        try {
          const repair = await request([column], { issue, previousAnswer: candidate ?? null });
          const repaired = isRecord(repair) && Array.isArray(repair.cells) ? repair.cells : [];
          candidate = repaired.find((item) => isRecord(item) && item.header === column.header);
          issue = cellIssue(candidate, column, articleText);
        } catch (error) {
          if (!(error instanceof ExtractionResponseError)) throw error;
          issue = error.message;
        }
      }
      cells.push(issue || !isRecord(candidate)
        ? { header: column.header, value: 'NR', evidence: '', reviewReason: issue || 'No valid response.' }
        : { header: column.header, value: normalizeExtractionValue(String(candidate.value)),
          evidence: normalizeExtractionValue(String(candidate.value)) === 'NR' ? '' : String(candidate.evidence).trim(),
          ...(typeof candidate.sourceStatistic === 'string' &&
            ['mean', 'median', 'sd', 'other', 'not_applicable'].includes(candidate.sourceStatistic)
            ? { sourceStatistic: candidate.sourceStatistic as ExtractedCell['sourceStatistic'] } : {}),
          ...(typeof candidate.note === 'string' && candidate.note.trim()
            ? { note: candidate.note.trim().slice(0, 500) } : {}) });
    }
  }
  return cells;
}

function cellIssue(candidate: unknown, column: ColumnPlan, articleText: string) {
  if (!isRecord(candidate) || typeof candidate.value !== 'string' || typeof candidate.evidence !== 'string')
    return 'The column was missing or malformed.';
  const value = candidate.value.trim();
  const evidence = candidate.evidence.trim();
  if (value.length > 500) return 'The value contains excessive narrative.';
  if (!value || value.toUpperCase() === 'NR') return null;
  if (column.valueFormat === 'numeric' && !/^-?[\d.,]+(?:\s*[;؛±/–-]\s*-?[\d.,]+)*$/.test(value))
    return 'The numeric cell contains words, units, or an unsupported value format.';
  if (column.includeSdWithCentral === false && /±/.test(value))
    return 'This sheet has a separate SD column; put only the central value here.';
  if (column.includeSdWithCentral && /\d\s*±\s*\d/.test(evidence) && !/±/.test(value))
    return 'The source reports mean/median ± SD and no separate SD column exists; include both numbers here.';
  if (column.statistic && column.statistic !== 'none' &&
    !['mean', 'median', 'sd', 'other'].includes(String(candidate.sourceStatistic)))
    return 'The reported statistic type was not identified.';
  if (!evidence) return 'The source evidence was missing.';
  if (!evidenceAppearsInArticle(articleText, evidence)) return 'The source quote could not be verified.';
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
