import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import {
  ADJUDICATOR_PROMPT_VERSION,
  PROMPT_VERSION,
} from '@/lib/llm-providers';
import {
  runReferenceAssessment,
  ScreeningRunError,
} from '@/lib/screening-runner';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!(await hasActiveAccess(user.userId)))
    return Response.json(
      { error: 'An active plan or trial is required to run AI screening.' },
      { status: 402 },
    );
  const { id } = await params;
  const body = (await request.json()) as {
    referenceId?: string;
    adjudicate?: boolean;
    resolveNextConflict?: boolean;
  };
  let referenceId = body.referenceId;
  const resolveNextConflict = body.resolveNextConflict === true;
  if (resolveNextConflict) {
    const nextConflict = await env.DB.prepare(`SELECT r.id FROM "references" r
      JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ? AND ga.status = 'complete'
      JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ? AND oa.status = 'complete'
      JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ? AND za.status = 'complete'
      LEFT JOIN screening_assessments ja ON ja.reference_id = r.id AND ja.review_id = r.review_id AND ja.provider = 'adjudicator' AND ja.prompt_version = ?
      LEFT JOIN screening_decisions s ON s.reference_id = r.id AND s.review_id = r.review_id
      WHERE r.review_id = ?
      AND ((CASE WHEN ga.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN oa.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN za.decision = 'include' THEN 1 ELSE 0 END)) < 2
      AND ((CASE WHEN ga.decision = 'exclude' THEN 1 ELSE 0 END) + (CASE WHEN oa.decision = 'exclude' THEN 1 ELSE 0 END) + (CASE WHEN za.decision = 'exclude' THEN 1 ELSE 0 END)) < 2
      AND (s.decision IS NULL OR s.decision = 'unclear')
      AND (ja.status IS NULL OR ja.status != 'complete')
      AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')
      ORDER BY r.created_at ASC LIMIT 1`)
      .bind(
        PROMPT_VERSION,
        PROMPT_VERSION,
        PROMPT_VERSION,
        ADJUDICATOR_PROMPT_VERSION,
        id,
      )
      .first<{ id: string }>();
    referenceId = nextConflict?.id;
  }
  if (!referenceId)
    return Response.json(
      {
        error: resolveNextConflict
          ? 'There are no unresolved screening conflicts.'
          : 'Choose a reference to screen.',
      },
      { status: resolveNextConflict ? 409 : 400 },
    );
  try {
    const adjudicate = body.adjudicate === true || resolveNextConflict;
    return Response.json(
      await runReferenceAssessment({
        reviewId: id,
        referenceId,
        userId: user.userId,
        adjudicate,
      }),
    );
  } catch (error) {
    if (error instanceof ScreeningRunError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
