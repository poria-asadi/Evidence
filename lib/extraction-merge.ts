import type { ColumnPlan } from './extraction-resilience.ts';
import { normalizeExtractionValue } from './extraction-resilience.ts';
import type { finalizeSpecializedCell } from './extraction-cell-policy.ts';

type ModelCell = ReturnType<typeof finalizeSpecializedCell>;

function comparable(value: string) {
  return value.normalize('NFKC').trim().toLowerCase()
    .replace(/\s+/g, ' ').replace(/[؛]/g, ';').replace(/\s*([;±])\s*/g, '$1')
    .replace(/[.!?]+$/g, '');
}

function equivalent(first: string, second: string) {
  if (comparable(first) === comparable(second)) return true;
  const numeric = /^-?[\d.,]+(?:[;±/–-]-?[\d.,]+)*$/;
  const a = comparable(first).replace(/\s/g, '');
  const b = comparable(second).replace(/\s/g, '');
  if (!numeric.test(a) || !numeric.test(b)) return false;
  const canonical = (value: string) => value.replace(/-?\d+(?:\.\d+)?/g, (number) =>
    Number.isFinite(Number(number)) ? String(Number(number)) : number);
  return canonical(a) === canonical(b);
}

export function mergeIndependentExtractions(
  columns: ColumnPlan[], haiku: ModelCell[], luna: ModelCell[],
) {
  if (haiku.length !== columns.length || luna.length !== columns.length)
    throw new Error('Both models must return every extraction column.');
  return columns.map((column, index) => {
    const first = haiku[index];
    const second = luna[index];
    if (first.header !== column.header || second.header !== column.header)
      throw new Error(`Both models must return “${column.header}” in sheet order.`);
    const firstNR = normalizeExtractionValue(first.value) === 'NR';
    const secondNR = normalizeExtractionValue(second.value) === 'NR';
    const disagree = firstNR !== secondNR || (!firstNR && !secondNR && !equivalent(first.value, second.value));
    const selected = firstNR && !secondNR ? second : secondNR && !firstNR ? first
      : !disagree && second.conflict && !first.conflict ? first : second;
    const reviewReason = [
      disagree ? firstNR !== secondNR
        ? 'One extraction returned NR while another found a value; verify the source.'
        : 'Independent extractions disagree; verify the selected value against the article.' : '',
      selected.reviewReason || '',
    ].filter(Boolean).join(' ').slice(0, 1000) || undefined;
    return {
      header: column.header, value: selected.value, evidence: selected.evidence,
      sourceStatistic: selected.sourceStatistic, note: selected.note,
      selectedModel: selected.selectedModel,
      conflict: disagree || selected.conflict,
      ...(reviewReason ? { reviewReason } : {}),
      haiku: first, luna: second,
      haikuTrace: first.finalTrace, lunaTrace: second.finalTrace,
      finalTrace: selected.finalTrace,
    };
  });
}
