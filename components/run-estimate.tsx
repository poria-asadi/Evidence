'use client';

import { Clock3, DollarSign, Info } from 'lucide-react';
import {
  estimateRun,
  formatRunDuration,
  PLANNING_SECONDS_PER_ITEM,
  type RunBenchmark,
  type RunStage,
} from '@/lib/run-estimates';

export default function RunEstimate({
  stage,
  count,
  benchmark,
  running = false,
  remaining = false,
  setupUnits = 0,
  columnCount,
}: {
  stage: RunStage;
  count: number;
  benchmark?: RunBenchmark | null;
  running?: boolean;
  remaining?: boolean;
  setupUnits?: number;
  columnCount?: number;
}) {
  const value = benchmark ?? {
    secondsPerItem: PLANNING_SECONDS_PER_ITEM[stage],
    timeSamples: 0,
    costUsdPerItem: null,
    costSamples: 0,
  };
  if (stage === 'extraction' && !columnCount)
    return <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">Name at least one extraction column to see a time and cost estimate.</div>;
  const estimate = estimateRun(value, count, setupUnits, columnCount);
  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
      <p className="font-semibold">
        {remaining ? 'Estimated remaining' : 'Estimate'} for{' '}
        {estimate.count.toLocaleString()}{' '}
        {stage === 'titleAbstract' ? 'records' : 'articles'}
        {stage === 'extraction' && columnCount ? ` and ${columnCount.toLocaleString()} columns` : ''}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <p className="flex items-center gap-2">
          <Clock3 className="size-4 shrink-0" /> Time:{' '}
          <strong>{formatRunDuration(estimate.seconds)}</strong>
        </p>
        <p className="flex items-center gap-2">
          <DollarSign className="size-4 shrink-0" /> Estimated AI cost:{' '}
          <strong>
            {estimate.costUsd === null
              ? 'Not enough cost history'
              : estimate.costUsd > 0 && estimate.costUsd < 0.000001
                ? '<$0.000001 USD'
                : `$${estimate.costUsd.toFixed(estimate.costUsd < 0.01 ? 6 : 2)} USD`}
          </strong>
        </p>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-sky-800">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {value.timeSamples
            ? `Time uses ${value.timeSamples} completed articles or records`
            : 'Time uses an initial planning rate'}
          ;{' '}
          {value.costBasis === 'five-paper-benchmark'
            ? stage === 'extraction'
              ? 'cost uses a five-article run and a paired six-versus-twelve-column comparison on two articles'
              : 'cost uses a five-article run with the current AI models'
            : value.costSamples
            ? 'cost uses recorded requests for the current AI models'
            : 'cost appears after priced requests for the current AI models'}
          . Actual time and cost can vary with article length, retries and
          service speed.
        </span>
      </p>
      <p
        className={`mt-3 rounded-lg px-3 py-2 font-semibold ${running ? 'bg-amber-100 text-amber-950' : 'bg-white/80 text-sky-950'}`}
      >
        Keep this tab open until the run completes. Closing it can interrupt the
        remaining work.
      </p>
    </div>
  );
}
