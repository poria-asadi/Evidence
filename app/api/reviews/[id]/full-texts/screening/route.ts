import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import {
  FULL_TEXT_ADJUDICATOR_PROMPT_VERSION,
  FULL_TEXT_PROMPT_VERSION,
  getFullTextProviderReadiness,
} from '@/lib/llm-providers';
import {
  FullTextScreeningError,
  runFullTextAssessment,
} from '@/lib/full-text-screening-runner';

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

  const items = await env.DB.prepare(`SELECT r.id, r.title, r.authors, r.doi,
    f.file_name AS fileName, f.size,
    fd.decision AS researcherDecision, fd.notes AS researcherNotes,
    ga.status AS marpleStatus, ga.decision AS marpleDecision, ga.reason AS marpleReason, ga.error_code AS marpleError,
    oa.status AS poirotStatus, oa.decision AS poirotDecision, oa.reason AS poirotReason, oa.error_code AS poirotError,
    za.status AS zeousStatus, za.decision AS zeousDecision, za.reason AS zeousReason, za.error_code AS zeousError,
    ja.status AS sherlockStatus, ja.decision AS sherlockDecision, ja.reason AS sherlockReason, ja.error_code AS sherlockError
    FROM full_text_files f
    JOIN "references" r ON r.id = f.reference_id AND r.review_id = f.review_id
    LEFT JOIN full_text_decisions fd ON fd.review_id = f.review_id AND fd.reference_id = f.reference_id
    LEFT JOIN full_text_assessments ga ON ga.review_id = f.review_id AND ga.reference_id = f.reference_id AND ga.provider = 'gemini' AND ga.prompt_version = ?
    LEFT JOIN full_text_assessments oa ON oa.review_id = f.review_id AND oa.reference_id = f.reference_id AND oa.provider = 'openai' AND oa.prompt_version = ?
    LEFT JOIN full_text_assessments za ON za.review_id = f.review_id AND za.reference_id = f.reference_id AND za.provider = 'zeous' AND za.prompt_version = ?
    LEFT JOIN full_text_assessments ja ON ja.review_id = f.review_id AND ja.reference_id = f.reference_id AND ja.provider = 'adjudicator' AND ja.prompt_version = ?
    WHERE f.review_id = ? AND f.owner_id = ?
    ORDER BY f.created_at ASC`)
    .bind(
      FULL_TEXT_PROMPT_VERSION,
      FULL_TEXT_PROMPT_VERSION,
      FULL_TEXT_PROMPT_VERSION,
      FULL_TEXT_ADJUDICATOR_PROMPT_VERSION,
      id,
      user.userId,
    )
    .all();

  return Response.json({
    items: items.results,
    providers: getFullTextProviderReadiness(),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!(await hasActiveAccess(user.userId)))
    return Response.json(
      { error: 'Charge your account before running full-text screening.' },
      { status: 402 },
    );
  const { id } = await params;
  const body = (await request.json()) as {
    referenceId?: string;
    adjudicate?: boolean;
    costConfirmed?: boolean;
  };
  if (!body.costConfirmed)
    return Response.json(
      { error: 'Confirm the account charge before starting screening.' },
      { status: 400 },
    );
  if (!body.referenceId)
    return Response.json(
      { error: 'Choose a full-text article to screen.' },
      { status: 400 },
    );
  try {
    return Response.json(
      await runFullTextAssessment({
        reviewId: id,
        referenceId: body.referenceId,
        userId: user.userId,
        adjudicate: body.adjudicate === true,
      }),
    );
  } catch (error) {
    if (error instanceof FullTextScreeningError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
