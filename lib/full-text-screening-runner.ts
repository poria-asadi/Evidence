import { Buffer } from 'node:buffer';
import { env } from 'cloudflare:workers';
import { normalizedPdfText } from '@/lib/searchable-pdf';
import {
  adjudicateFullTextConflict,
  assessFullTextWithProvider,
  FULL_TEXT_ADJUDICATOR_PROMPT_VERSION,
  FULL_TEXT_PROMPT_VERSION,
  fullTextModelForProvider,
  getFullTextProviderReadiness,
  PRIMARY_PROVIDER_IDS,
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
      value: Awaited<ReturnType<typeof assessFullTextWithProvider>>;
      latencyMs: number;
    }
  | {
      provider: ProviderId;
      status: 'failed';
      errorCode: string;
      latencyMs: number;
    };

export class FullTextScreeningError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function runFullTextAssessment({
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
  const required = getFullTextProviderReadiness().filter(
    (provider) => !provider.optional,
  );
  if (!required.every((provider) => provider.configured))
    throw new FullTextScreeningError(
      409,
      'The three full-text detectives are not ready. Ask the workspace administrator to check the private AI configuration.',
    );
  if (
    adjudicate &&
    !getFullTextProviderReadiness().find(
      (provider) => provider.id === 'adjudicator',
    )?.configured
  )
    throw new FullTextScreeningError(
      409,
      'Sherlock Holmes is not ready for full-text conflict review.',
    );

  const review =
    await env.DB.prepare(`SELECT id, purpose, inclusion, exclusion, population, intervention, comparison, outcomes,
      full_text_use_tiab_criteria AS fullTextUseTiabCriteria,
      full_text_inclusion AS fullTextInclusion,
      full_text_exclusion AS fullTextExclusion,
      full_text_criteria_updated_at AS fullTextCriteriaUpdatedAt
      FROM reviews WHERE id = ? AND owner_id = ?`)
      .bind(reviewId, userId)
      .first<Record<string, string | null>>();
  if (!review) throw new FullTextScreeningError(404, 'Review not found.');
  if (!review.fullTextCriteriaUpdatedAt)
    throw new FullTextScreeningError(
      409,
      'Declare and save the required full-text criteria before starting screening.',
    );

  const article =
    await env.DB.prepare(`SELECT r.id, r.title, f.file_name AS fileName, f.r2_key AS r2Key,
      f.ai_r2_key AS aiR2Key, f.ai_size AS aiSize, f.content_type AS contentType,
      f.size AS size
      FROM "references" r JOIN full_text_files f ON f.review_id = r.review_id AND f.reference_id = r.id
      WHERE r.id = ? AND r.review_id = ? AND f.owner_id = ?`)
      .bind(referenceId, reviewId, userId)
      .first<{
        id: string;
        title: string | null;
        fileName: string;
        r2Key: string;
        aiR2Key: string | null;
        aiSize: number | null;
        contentType: string;
        size: number;
      }>();
  if (!article)
    throw new FullTextScreeningError(
      404,
      'Add or retrieve the article full text before running screening.',
    );
  const isPdf = article.contentType === 'application/pdf';
  const textObject = isPdf
    ? await env.FILES.get(`${article.r2Key}.txt`)
    : null;
  const extractedText = textObject ? await textObject.text() : undefined;
  if (extractedText && (normalizedPdfText(extractedText).length < 200 || extractedText.length > 300_000))
    throw new FullTextScreeningError(409, 'The extracted article text is incomplete. Prepare this PDF again.');
  const pdfKey = article.aiR2Key?.endsWith('.pdf')
    ? article.aiR2Key
    : article.r2Key;
  const sendPdf = isPdf && !article.aiR2Key?.endsWith('.txt') &&
    (pdfKey !== article.r2Key || article.size <= 8 * 1024 * 1024);
  const storedFullText = sendPdf || !isPdf
    ? await env.FILES.get(pdfKey)
    : null;
  if ((sendPdf || !isPdf) && !storedFullText)
    throw new FullTextScreeningError(
      404,
      'The stored full text could not be found. Replace the file and retry.',
    );
  if (isPdf && !extractedText && article.aiR2Key?.endsWith('v2.pdf'))
    throw new FullTextScreeningError(409, 'Prepare this PDF again so its article text can be verified.');
  if (isPdf && !extractedText && !sendPdf)
    throw new FullTextScreeningError(409, 'This PDF needs a readable text layer before AI screening.');
  const pdfDataUrl = sendPdf && storedFullText
    ? `data:application/pdf;base64,${Buffer.from(await storedFullText.arrayBuffer()).toString('base64')}`
    : undefined;
  const fullText = isPdf
    ? extractedText
    : articleText(await storedFullText!.text(), article.contentType);
  const input = {
    protocol: protocolText(review),
    title: article.title || 'Untitled article',
    fileName: article.fileName,
    pdfDataUrl,
    fullText,
  };

  let previous = await getStoredAssessments(reviewId, referenceId);
  const completed = new Set(
    previous
      .filter((item) => item.status === 'complete')
      .map((item) => item.provider),
  );
  const firstLine = PRIMARY_PROVIDER_IDS.filter(
    (provider) => !completed.has(provider),
  );
  const results = await Promise.all(
    firstLine.map((provider) =>
      runProvider(provider, () => assessFullTextWithProvider(provider, input)),
    ),
  );
  if (results.length) await persistResults(reviewId, referenceId, results);
  if (results.some((result) => result.status === 'failed'))
    return response('partial_failure', referenceId, results);

  previous = await getStoredAssessments(reviewId, referenceId);
  const assessments = Object.fromEntries(
    PRIMARY_PROVIDER_IDS.map((provider) => [
      provider,
      completedAssessment(previous, provider),
    ]),
  ) as Record<PrimaryProviderId, ScreeningAssessment | null>;
  if (PRIMARY_PROVIDER_IDS.some((provider) => !assessments[provider]))
    return response('partial_failure', referenceId, results);

  const decisions = PRIMARY_PROVIDER_IDS.map(
    (provider) => assessments[provider]!.decision,
  );
  const conflict =
    decisions.filter((decision) => decision === 'include').length < 2 &&
    decisions.filter((decision) => decision === 'exclude').length < 2;
  if (adjudicate && !conflict)
    throw new FullTextScreeningError(
      409,
      'Sherlock Holmes is available only for conflicting or unclear full-text decisions.',
    );
  if (adjudicate && !completed.has('adjudicator')) {
    const adjudication = await runProvider('adjudicator', () =>
      adjudicateFullTextConflict({
        ...input,
        assessments: assessments as Record<
          PrimaryProviderId,
          ScreeningAssessment
        >,
      }),
    );
    await persistResults(reviewId, referenceId, [adjudication]);
    results.push(adjudication);
    if (adjudication.status === 'failed')
      return response('partial_failure', referenceId, results);
  }

  return response(
    results.length ? 'complete' : 'already_assessed',
    referenceId,
    results,
  );
}

async function runProvider(
  provider: ProviderId,
  call: () => Promise<Awaited<ReturnType<typeof assessFullTextWithProvider>>>,
): Promise<RunResult> {
  const started = Date.now();
  let errorCode = 'provider_error';
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      if (attempt === maxAttempts || !RETRYABLE_PROVIDER_ERRORS.has(errorCode))
        break;
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
    FROM full_text_assessments WHERE review_id = ? AND reference_id = ? AND (
      (provider = 'adjudicator' AND prompt_version = ?) OR
      (provider != 'adjudicator' AND prompt_version = ?)
    )`)
      .bind(
        reviewId,
        referenceId,
        FULL_TEXT_ADJUDICATOR_PROMPT_VERSION,
        FULL_TEXT_PROMPT_VERSION,
      )
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
    return env.DB.prepare(`INSERT INTO full_text_assessments (id, review_id, reference_id, provider, model, prompt_version, status, decision, score, confidence, matched_criteria, reason, missing_information, raw_response, error_code, input_tokens, output_tokens, latency_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id, reference_id, provider, prompt_version) DO UPDATE SET model=excluded.model, status=excluded.status, decision=excluded.decision, score=excluded.score, confidence=excluded.confidence, matched_criteria=excluded.matched_criteria, reason=excluded.reason, missing_information=excluded.missing_information, raw_response=excluded.raw_response, error_code=excluded.error_code, input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens, latency_ms=excluded.latency_ms, created_at=excluded.created_at`).bind(
      crypto.randomUUID(),
      reviewId,
      referenceId,
      result.provider,
      fullTextModelForProvider(result.provider) || 'Not configured',
      result.provider === 'adjudicator'
        ? FULL_TEXT_ADJUDICATOR_PROMPT_VERSION
        : FULL_TEXT_PROMPT_VERSION,
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
  const useTiabCriteria = Number(review.fullTextUseTiabCriteria) === 1;
  const inclusion = useTiabCriteria
    ? review.inclusion
    : review.fullTextInclusion;
  const exclusion = useTiabCriteria
    ? review.exclusion
    : review.fullTextExclusion;
  return [
    `Purpose: ${review.purpose}`,
    `Full-text inclusion criteria: ${inclusion}`,
    `Full-text exclusion criteria: ${exclusion}`,
    review.population && `Population: ${review.population}`,
    review.intervention && `Intervention: ${review.intervention}`,
    review.comparison && `Comparison: ${review.comparison}`,
    review.outcomes && `Outcomes: ${review.outcomes}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function articleText(value: string, contentType: string) {
  const withoutReferences = value.replace(
    /<ref-list\b[^>]*>[\s\S]*?<\/ref-list>/gi,
    ' ',
  );
  const plain = (contentType.includes('xml') ? withoutReferences : value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= 300_000) return plain;
  return `${plain.slice(0, 240_000)}\n\n[Middle section shortened to fit the detective context window.]\n\n${plain.slice(-60_000)}`;
}
