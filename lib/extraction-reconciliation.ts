import { normalizeExtractionValue, type ColumnPlan, type ExtractedCell } from './extraction-resilience.ts';
import type { EvidenceTrace } from './extraction-evidence.ts';

export const EXTRACTION_PIPELINE_VERSION = 'dual_luna_priority_v1';

export type ConflictJudgment = {
  header: string;
  conflict: boolean;
  reason: string;
  preferred: 'haiku' | 'luna';
  finalValue: string;
};
export type ReconciledCell = {
  header: string;
  value: string;
  evidence: string;
  conflict: boolean;
  reviewReason?: string;
  selectedModel: 'haiku' | 'luna' | 'luna-pro' | 'citation';
  haiku: ExtractedCell;
  luna: ExtractedCell;
  haikuTrace?: EvidenceTrace | null;
  lunaTrace?: EvidenceTrace | null;
  finalTrace?: EvidenceTrace | null;
  riskReasons?: string[];
};
export type ExtractionAudit = {
  pipelineVersion: typeof EXTRACTION_PIPELINE_VERSION;
  cells: ReconciledCell[];
} | {
  pipelineVersion: 'haiku_combined_sd_design_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'haiku'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'luna_combined_sd_design_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'luna'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'luna_specialized_columns_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'luna'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'luna_affiliation_fallback_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'luna'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'haiku_only_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'haiku'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'luna_only_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'luna'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'dual_evidence_risk_v1';
  cells: ReconciledCell[];
} | {
  pipelineVersion: 'luna_pro_only_v1';
  cells: Array<{
    header: string; value: string; evidence: string; conflict: boolean;
    reviewReason?: string; selectedModel: 'luna-pro'; finalTrace?: EvidenceTrace | null;
  }>;
} | {
  pipelineVersion: 'dual_full_text_v5';
  cells: ReconciledCell[];
};

function comparable(value: string) {
  return normalizeExtractionValue(value).normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function numbers(value: string) {
  return [...value.matchAll(/(?<!\p{L})-?\d[\d,.]*/gu)]
    .map((match) => match[0].replace(/[.,]+$/, ''))
    .map((raw) => /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)
      ? raw.replace(/,/g, '') : raw.replace(',', '.'))
    .map((raw) => Number(raw))
    .filter(Number.isFinite);
}

function nonNumericContext(value: string) {
  return comparable(value).replace(/-?\d+(?:[.,]\d+)*/g, '').replace(/\s+/g, ' ').trim();
}

export function reconcileExtraction(
  columns: ColumnPlan[],
  haiku: ExtractedCell[],
  luna: ExtractedCell[],
  judgments: ConflictJudgment[],
): ReconciledCell[] {
  const haikuByHeader = new Map(haiku.map((cell) => [cell.header, cell]));
  const lunaByHeader = new Map(luna.map((cell) => [cell.header, cell]));
  const judgmentsByHeader = new Map(judgments.map((cell) => [cell.header, cell]));
  return columns.map((column) => {
    const first = haikuByHeader.get(column.header);
    const second = lunaByHeader.get(column.header);
    if (!first || !second) throw new Error(`Both extractions must contain “${column.header}”.`);
    const firstValue = normalizeExtractionValue(first.value);
    const secondValue = normalizeExtractionValue(second.value);
    const oneMissing = (firstValue === 'NR') !== (secondValue === 'NR');
    const equal = comparable(firstValue) === comparable(secondValue);
    const firstNumbers = numbers(firstValue);
    const secondNumbers = numbers(secondValue);
    const numericConflict = firstNumbers.length > 0 && secondNumbers.length > 0 &&
      JSON.stringify(firstNumbers) !== JSON.stringify(secondNumbers) &&
      nonNumericContext(firstValue) === nonNumericContext(secondValue);
    const judgment = judgmentsByHeader.get(column.header);
    if (judgment && normalizeExtractionValue(judgment.finalValue) !==
      (judgment.preferred === 'luna' ? secondValue : firstValue))
      throw new Error(`The adjudicated value for “${column.header}” does not match its source extraction.`);
    const equivalent = judgment?.conflict === false && Boolean(judgment.reason.trim());
    const conflict = oneMissing || numericConflict || judgment?.conflict === true || (!equal && !equivalent);
    const chosen = judgment?.preferred === 'luna' ? second
      : !judgment && firstValue === 'NR' && secondValue !== 'NR' ? second : first;
    const selectedModel = chosen === second ? 'luna' : 'haiku';
    const reviewReason = conflict
      ? oneMissing ? 'One extraction reported NR while the other found a value. Check the article.'
        : numericConflict ? 'The extracted numbers differ. Check the article.'
          : judgment?.reason?.trim() || 'The two extractions differ. Check the article.'
      : chosen.reviewReason || (firstValue === 'NR' ? second.reviewReason : undefined);
    return {
      header: column.header,
      value: normalizeExtractionValue(chosen.value),
      evidence: chosen.evidence,
      conflict,
      selectedModel,
      ...(reviewReason ? { reviewReason } : {}),
      haiku: first,
      luna: second,
    };
  });
}

export function isExtractionAudit(value: unknown): value is ExtractionAudit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const audit = value as Partial<ExtractionAudit>;
  return (audit.pipelineVersion === EXTRACTION_PIPELINE_VERSION ||
    audit.pipelineVersion === 'haiku_combined_sd_design_v1' ||
    audit.pipelineVersion === 'luna_combined_sd_design_v1' ||
    audit.pipelineVersion === 'luna_specialized_columns_v1' ||
    audit.pipelineVersion === 'luna_affiliation_fallback_v1' || audit.pipelineVersion === 'haiku_only_v1' ||
    audit.pipelineVersion === 'luna_only_v1' ||
    audit.pipelineVersion === 'dual_evidence_risk_v1' ||
    audit.pipelineVersion === 'luna_pro_only_v1' ||
    audit.pipelineVersion === 'dual_full_text_v5') &&
    Array.isArray(audit.cells);
}
