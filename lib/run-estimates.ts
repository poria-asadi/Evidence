export type RunStage = 'titleAbstract' | 'fullText' | 'extraction';

export type RunBenchmark = {
  secondsPerItem: number;
  timeSamples: number;
  costUsdPerItem: number | null;
  costSamples: number;
  setupCostUsd?: number | null;
  referenceColumnCount?: number;
  costUsdPerExtraColumn?: number;
  secondsPerExtraColumn?: number;
  setupCostUsdPerExtraColumn?: number;
  costBasis?: 'five-paper-benchmark' | 'usage-history';
};

export type RunBenchmarks = Record<RunStage, RunBenchmark>;

// Provisional planning rates are used until this deployment has enough
// completed assessments to calculate an observed average. The 5.4-second
// title/abstract rate corresponds to roughly three hours for 2,000 records.
export const PLANNING_SECONDS_PER_ITEM: Record<RunStage, number> = {
  titleAbstract: 5.4,
  fullText: 90,
  extraction: 120,
};

// Measured 2026-11-16 with five public arXiv articles using the configured
// models. The extraction column slope is paired on two of those articles at
// six and twelve columns; it includes retries. See data/benchmark-2026-11-16.json.
export const FIVE_PAPER_BENCHMARK = {
  titleAbstract: { secondsPerItem: 3.9281195498, costUsdPerItem: 0.00039188 },
  fullText: { secondsPerItem: 4.8807681916, costUsdPerItem: 0.00622483 },
  extraction: {
    secondsPerItem: 12.5651212164,
    costUsdPerItem: 0.014490047,
    referenceColumnCount: 6,
    costUsdPerExtraColumn: 0.0015021495833333336,
    secondsPerExtraColumn: 1.5558,
    setupCostUsd: 0.0003957,
    setupCostUsdPerExtraColumn: 0.00005005,
  },
} as const;

export function estimateRun(
  benchmark: RunBenchmark,
  itemCount: number,
  setupUnits = 0,
  columnCount?: number,
) {
  const count = Math.max(0, Math.floor(itemCount));
  const extraColumns = benchmark.referenceColumnCount && columnCount
    ? Math.max(-benchmark.referenceColumnCount + 1, Math.floor(columnCount) - benchmark.referenceColumnCount)
    : 0;
  const perItemSeconds = Math.max(1, benchmark.secondsPerItem +
    extraColumns * (benchmark.secondsPerExtraColumn ?? 0));
  const seconds = Math.ceil(count * perItemSeconds);
  const perItemCost = benchmark.costUsdPerItem === null ? null : Math.max(0,
    benchmark.costUsdPerItem + extraColumns * (benchmark.costUsdPerExtraColumn ?? 0));
  const setupCost = benchmark.setupCostUsd === undefined || benchmark.setupCostUsd === null
    ? null : benchmark.setupCostUsdPerExtraColumn === undefined || !columnCount
      ? setupUnits * benchmark.setupCostUsd
      : Math.max(0, benchmark.setupCostUsd + extraColumns * benchmark.setupCostUsdPerExtraColumn);
  const costUsd =
    perItemCost === null ||
    (setupUnits > 0 && setupCost === null)
      ? null
      : count * perItemCost + (setupUnits > 0 ? setupCost ?? 0 : 0);
  return { count, seconds, costUsd };
}

export function formatRunDuration(seconds: number) {
  if (seconds <= 0) return '—';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `~${hours} h ${remaining} min` : `~${hours} h`;
}
