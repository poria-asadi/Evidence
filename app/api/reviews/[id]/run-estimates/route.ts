import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import {
  FULL_TEXT_PROMPT_VERSION,
  modelForProvider,
  PRIMARY_PROVIDER_IDS,
  PROMPT_VERSION,
} from '@/lib/llm-providers';
import { EXTRACTION_MODELS } from '@/lib/extraction-ai';
import {
  FIVE_PAPER_BENCHMARK,
  PLANNING_SECONDS_PER_ITEM,
  type RunBenchmark,
  type RunBenchmarks,
} from '@/lib/run-estimates';

type TimingRow = { averageMs: number | null; samples: number };
type PriceRow = {
  operation: string;
  model: string;
  averageNanos: number;
  samples: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const review = await env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(id, user.userId)
    .first();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const [titleTiming, fullTextTiming, prices] = await Promise.all([
    timing('screening_assessments', PROMPT_VERSION),
    timing('full_text_assessments', FULL_TEXT_PROMPT_VERSION),
    env.DB.prepare(`SELECT operation, model, AVG(cost_usd_nanos) AS averageNanos,
      COUNT(*) AS samples FROM ai_usage_events
      WHERE cost_usd_nanos IS NOT NULL AND http_status BETWEEN 200 AND 299
      GROUP BY operation, model`).all<PriceRow>(),
  ]);

  const primaryModels = PRIMARY_PROVIDER_IDS.map(modelForProvider).filter(
    (model): model is string => Boolean(model),
  );
  const costFor = (operation: string, models: string[]) => {
    if (!models.length) return { costUsdPerItem: null, costSamples: 0 };
    const rows = models.map((model) =>
      prices.results.find(
        (row) => row.operation === operation && row.model === model,
      ),
    );
    if (rows.some((row) => !row || Number(row.samples) < 1))
      return { costUsdPerItem: null, costSamples: 0 };
    return {
      costUsdPerItem:
        rows.reduce((total, row) => total + Number(row!.averageNanos), 0) /
        1_000_000_000,
      costSamples: Math.min(...rows.map((row) => Number(row!.samples))),
    };
  };
  const make = (
    stage: keyof RunBenchmarks,
    timingRow: TimingRow | null,
    price: ReturnType<typeof costFor>,
  ): RunBenchmark => ({
    secondsPerItem:
      Number(timingRow?.samples) >= 3 && Number(timingRow?.averageMs) > 0
        ? Math.max(1, Number(timingRow!.averageMs) / 1000 + 0.5)
        : PLANNING_SECONDS_PER_ITEM[stage],
    timeSamples:
      Number(timingRow?.samples) >= 3 ? Number(timingRow?.samples) : 0,
    ...price,
  });

  const configuredPrimaryModels =
    primaryModels.length === PRIMARY_PROVIDER_IDS.length ? primaryModels : [];
  const matchesMeasuredModels = configuredPrimaryModels.join('|') ===
    'google/gemini-2.5-flash-lite|openai/gpt-6-luna|anthropic/claude-haiku-5.5';
  const titleAbstract = make(
    'titleAbstract',
    titleTiming,
    costFor('title_abstract', configuredPrimaryModels),
  );
  const fullText = make(
    'fullText',
    fullTextTiming,
    costFor('full_text', configuredPrimaryModels),
  );
  const extraction = make(
    'extraction',
    null,
    costFor('extraction', [...EXTRACTION_MODELS]),
  );
  const setup = costFor('extraction_plan', [EXTRACTION_MODELS[0]]);
  extraction.setupCostUsd = setup.costUsdPerItem;
  if (matchesMeasuredModels) {
    for (const [stage, value] of [
      [titleAbstract, FIVE_PAPER_BENCHMARK.titleAbstract],
      [fullText, FIVE_PAPER_BENCHMARK.fullText],
    ] as const) {
      stage.costUsdPerItem = value.costUsdPerItem;
      stage.costSamples = 5;
      stage.costBasis = 'five-paper-benchmark';
      if (!stage.timeSamples) {
        stage.secondsPerItem = value.secondsPerItem;
        stage.timeSamples = 5;
      }
    }
  }
  if (EXTRACTION_MODELS.join('|') === 'anthropic/claude-haiku-5.5|openai/gpt-6-luna') {
    Object.assign(extraction, FIVE_PAPER_BENCHMARK.extraction, {
      timeSamples: 5,
      costSamples: 5,
      costBasis: 'five-paper-benchmark' as const,
    });
  }
  const benchmarks: RunBenchmarks = { titleAbstract, fullText, extraction };
  return Response.json(benchmarks, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function timing(
  table: 'screening_assessments' | 'full_text_assessments',
  promptVersion: string,
) {
  return env.DB.prepare(`SELECT AVG(itemMs) AS averageMs, COUNT(*) AS samples FROM (
    SELECT MAX(latency_ms) AS itemMs FROM ${table}
    WHERE prompt_version = ? AND status = 'complete'
      AND provider IN ('gemini', 'openai', 'zeous')
    GROUP BY review_id, reference_id
    HAVING COUNT(DISTINCT provider) = 3
  )`)
    .bind(promptVersion)
    .first<TimingRow>();
}
