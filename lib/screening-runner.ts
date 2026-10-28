import { env } from 'cloudflare:workers';
import {
  adjudicateConflict,
  assessWithProvider,
  getProviderReadiness,
  modelForProvider,
  PRIMARY_PROVIDER_IDS,
  PROMPT_VERSION,
  ADJUDICATOR_PROMPT_VERSION,
  ProviderError,
  type PrimaryProviderId,
  type ScreeningAssessment,
} from '@/lib/llm-providers';

type ProviderId = PrimaryProviderId | 'adjudicator';
type StoredAssessment = {
  provider: ProviderId;
  status: string;
  decision: ScreeningAssessment['decision'] | null;
  confidence: number | null;
  matched_criteria: string | null;
  reason: string | null;
  missing_information: string | null;
};
type RunResult =
  | {
      provider: ProviderId;
      status: 'complete';
      value: Awaited<ReturnType<typeof assessWithProvider>>;
      latencyMs: number;
    }
  | {
      provider: ProviderId;
      status: 'failed';
      errorCode: string;
      latencyMs: number;
    };

export class ScreeningRunError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function validateScreeningRun(reviewId: string, userId: string) {
  const required = getProviderReadiness().filter(
    (provider) => !provider.optional,
  );
  if (!required.every((provider) => provider.configured))
    throw new ScreeningRunError(
      409,
      'The three screening detectives are not ready. Ask the workspace administrator to check the private AI configuration.',
    );
  const review =
    await env.DB.prepare(`SELECT id, purpose, inclusion, exclusion, population, intervention, comparison, outcomes
    FROM reviews WHERE id = ? AND owner_id = ?`)
      .bind(reviewId, userId)
      .first<Record<string, string | null>>();
  if (!review) throw new ScreeningRunError(404, 'Review not found.');
  const unresolved = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM duplicate_pairs WHERE review_id = ? AND status = 'suggested'",
  )
    .bind(reviewId)
    .first<{ count: number }>();
  if (Number(unresolved?.count ?? 0) > 0)
    throw new ScreeningRunError(
      409,
      'Resolve duplicate candidates before running AI screening.',
    );
  return review;
}

export async function runReferenceAssessment({
  reviewId,
  referenceId,
  userId,
  adjudicate = false,
}: {
  reviewId: string;
  referenceId: string;
  userId: string;
  adjudicate?: boolean;
}) {
  const review = await validateScreeningRun(reviewId, userId);
  const reference =
    await env.DB.prepare(`SELECT r.id, r.title, r.abstract FROM "references" r WHERE r.id = ? AND r.review_id = ?
    AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')`)
      .bind(referenceId, reviewId)
      .first<{ id: string; title: string | null; abstract: string | null }>();
  if (!reference)
    throw new ScreeningRunError(
      404,
      'Reference not found in the deduplicated library.',
    );
  const input = {
    protocol: protocolText(review),
    title: reference.title || 'Untitled reference',
    abstract: reference.abstract,
  };
  let previous = await getStoredAssessments(reviewId, reference.id);
  const completed = new Set(
    previous
      .filter((item) => item.status === 'complete')
      .map((item) => item.provider),
  );
  const primaryProviders = PRIMARY_PROVIDER_IDS.filter(
    (provider) => !completed.has(provider),
  );
  const results = await Promise.all(
    primaryProviders.map((provider) =>
      runProvider(provider, () => assessWithProvider(provider, input)),
    ),
  );
  if (results.length) await persistResults(reviewId, reference.id, results);
  if (results.some((result) => result.status === 'failed'))
    return response('partial_failure', reference.id, results);

  previous = await getStoredAssessments(reviewId, reference.id);
  const assessments = Object.fromEntries(
    PRIMARY_PROVIDER_IDS.map((provider) => [
      provider,
      completedAssessment(previous, provider),
    ]),
  ) as Record<PrimaryProviderId, ScreeningAssessment | null>;
  if (PRIMARY_PROVIDER_IDS.some((provider) => !assessments[provider]))
    return response('partial_failure', reference.id, results);

  const decisions = PRIMARY_PROVIDER_IDS.map(
    (provider) => assessments[provider]!.decision,
  );
  const decisionConflict =
    decisions.filter((decision) => decision === 'include').length < 2 &&
    decisions.filter((decision) => decision === 'exclude').length < 2;
  if (adjudicate && decisionConflict && env.OPENROUTER_ADJUDICATOR_MODEL) {
    const adjudicatorComplete = previous.some(
      (item) => item.provider === 'adjudicator' && item.status === 'complete',
    );
    if (!adjudicatorComplete) {
      const adjudication = await runProvider('adjudicator', () =>
        adjudicateConflict({
          ...input,
          assessments: assessments as Record<
            PrimaryProviderId,
            ScreeningAssessment
          >,
        }),
      );
      await persistResults(reviewId, reference.id, [adjudication]);
      results.push(adjudication);
      if (adjudication.status === 'failed')
        return response('partial_failure', reference.id, results);
    }
  }

  return response(
    results.length ? 'complete' : 'already_assessed',
    reference.id,
    results,
  );
}

async function runProvider(
  provider: ProviderId,
  call: () => Promise<Awaited<ReturnType<typeof assessWithProvider>>>,
): Promise<RunResult> {
  const started = Date.now();
  let errorCode = 'provider_error';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return {
        provider,
        status: 'complete',
        value: await call(),
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      errorCode =
        error instanceof ProviderError
          ? error.code
          : error instanceof DOMException && error.name === 'TimeoutError'
            ? 'provider_timeout'
            : 'provider_error';
      if (attempt === 3 || !RETRYABLE_PROVIDER_ERRORS.has(errorCode)) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  return {
    provider,
    status: 'failed',
    errorCode,
    latencyMs: Date.now() - started,
  };
}

const RETRYABLE_PROVIDER_ERRORS = new Set([
  'provider_rate_limit',
  'provider_unavailable',
  'provider_timeout',
  'provider_error',
]);

async function getStoredAssessments(reviewId: string, referenceId: string) {
  const rows =
    await env.DB.prepare(`SELECT provider, status, decision, confidence, matched_criteria, reason, missing_information
    FROM screening_assessments WHERE review_id = ? AND reference_id = ? AND (
      (provider = 'adjudicator' AND prompt_version = ?) OR
      (provider != 'adjudicator' AND prompt_version = ?)
    )`)
      .bind(reviewId, referenceId, ADJUDICATOR_PROMPT_VERSION, PROMPT_VERSION)
      .all<StoredAssessment>();
  return rows.results;
}

function completedAssessment(
  rows: StoredAssessment[],
  provider: PrimaryProviderId,
): ScreeningAssessment | null {
  const row = rows.find(
    (item) => item.provider === provider && item.status === 'complete',
  );
  if (!row || !row.decision || !Number.isInteger(row.confidence)) return null;
  return {
    decision: row.decision,
    confidence: Number(row.confidence),
    matchedCriteria: parseStringArray(row.matched_criteria),
    reason: row.reason || '',
    missingInformation: parseStringArray(row.missing_information),
  };
}

function parseStringArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

async function persistResults(
  reviewId: string,
  referenceId: string,
  results: RunResult[],
) {
  const statements = results.map((result) => {
    const assessment =
      result.status === 'complete' ? result.value.assessment : null;
    return env.DB.prepare(`INSERT INTO screening_assessments (id, review_id, reference_id, provider, model, prompt_version, status, decision, score, confidence, matched_criteria, reason, missing_information, raw_response, error_code, input_tokens, output_tokens, latency_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id, reference_id, provider, prompt_version) DO UPDATE SET model=excluded.model, status=excluded.status, decision=excluded.decision, score=excluded.score, confidence=excluded.confidence, matched_criteria=excluded.matched_criteria, reason=excluded.reason, missing_information=excluded.missing_information, raw_response=excluded.raw_response, error_code=excluded.error_code, input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens, latency_ms=excluded.latency_ms, created_at=excluded.created_at`).bind(
      crypto.randomUUID(),
      reviewId,
      referenceId,
      result.provider,
      modelForProvider(result.provider) || 'Not configured',
      result.provider === 'adjudicator'
        ? ADJUDICATOR_PROMPT_VERSION
        : PROMPT_VERSION,
      result.status,
      assessment?.decision ?? null,
      null,
      assessment?.confidence ?? null,
      assessment ? JSON.stringify(assessment.matchedCriteria) : null,
      assessment?.reason ?? null,
      assessment ? JSON.stringify(assessment.missingInformation) : null,
      result.status === 'complete' ? result.value.rawResponse : null,
      result.status === 'failed' ? result.errorCode : null,
      result.status === 'complete' ? result.value.inputTokens : null,
      result.status === 'complete' ? result.value.outputTokens : null,
      result.latencyMs,
      Date.now(),
    );
  });
  await env.DB.batch(statements);
}

function response(
  status: 'complete' | 'partial_failure' | 'already_assessed',
  referenceId: string,
  results: RunResult[],
) {
  return {
    status,
    referenceId,
    providers: results.map((result) => ({
      provider: result.provider,
      status: result.status,
      errorCode: result.status === 'failed' ? result.errorCode : null,
    })),
  };
}

function protocolText(review: Record<string, string | null>) {
  return [
    `Purpose: ${review.purpose}`,
    `Inclusion criteria: ${review.inclusion}`,
    `Exclusion criteria: ${review.exclusion}`,
    review.population && `Population: ${review.population}`,
    review.intervention && `Intervention: ${review.intervention}`,
    review.comparison && `Comparison: ${review.comparison}`,
    review.outcomes && `Outcomes: ${review.outcomes}`,
  ]
    .filter(Boolean)
    .join('\n');
}
