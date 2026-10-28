import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import { PROMPT_VERSION } from '@/lib/llm-providers';
import {
  ScreeningRunError,
  validateScreeningRun,
} from '@/lib/screening-runner';

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
  let job = await env.DB.prepare(
    `${jobSelect} WHERE review_id = ? AND owner_id = ? ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(id, user.userId)
    .first<Record<string, unknown>>();
  if (!job) return Response.json({ job: null });
  if (job.status === 'paused') {
    await env.DB.prepare(
      "UPDATE screening_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'paused'",
    )
      .bind(Date.now(), job.id)
      .run();
    job = (await env.DB.prepare(`${jobSelect} WHERE id = ?`)
      .bind(job.id)
      .first<Record<string, unknown>>())!;
  }
  return Response.json({ job });
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
      { error: 'An active plan or trial is required to run AI screening.' },
      { status: 402 },
    );
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    requestedCount?: number;
    costConfirmed?: boolean;
  };
  const requestedCount = Math.floor(Number(body.requestedCount));
  if (
    !Number.isFinite(requestedCount) ||
    requestedCount < 1 ||
    requestedCount > 2000
  )
    return Response.json(
      { error: 'Choose between 1 and 2,000 records.' },
      { status: 400 },
    );
  if (body.costConfirmed !== true)
    return Response.json(
      {
        error:
          'Confirm that this batch may use all three screening detectives.',
      },
      { status: 400 },
    );
  try {
    await validateScreeningRun(id, user.userId);
  } catch (error) {
    if (error instanceof ScreeningRunError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const active = await env.DB.prepare(
    "SELECT id FROM screening_jobs WHERE review_id = ? AND owner_id = ? AND status IN ('running', 'paused') LIMIT 1",
  )
    .bind(id, user.userId)
    .first();
  if (active)
    return Response.json(
      {
        error:
          'Finish, resume, or stop the current batch before starting another.',
      },
      { status: 409 },
    );
  const eligible =
    await env.DB.prepare(`SELECT COUNT(*) AS count FROM "references" r
    LEFT JOIN screening_assessments ga ON ga.review_id = r.review_id AND ga.reference_id = r.id AND ga.provider = 'gemini' AND ga.prompt_version = ?
    LEFT JOIN screening_assessments oa ON oa.review_id = r.review_id AND oa.reference_id = r.id AND oa.provider = 'openai' AND oa.prompt_version = ?
    LEFT JOIN screening_assessments za ON za.review_id = r.review_id AND za.reference_id = r.id AND za.provider = 'zeous' AND za.prompt_version = ?
    WHERE r.review_id = ?
    AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')
    AND (ga.status IS NULL OR ga.status != 'complete' OR oa.status IS NULL OR oa.status != 'complete' OR za.status IS NULL OR za.status != 'complete')`)
      .bind(PROMPT_VERSION, PROMPT_VERSION, PROMPT_VERSION, id)
      .first<{ count: number }>();
  const availableCount = Number(eligible?.count ?? 0);
  if (!availableCount)
    return Response.json(
      {
        error:
          'Every deduplicated reference already has all three detective decisions.',
      },
      { status: 409 },
    );
  const jobId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO screening_jobs (id, review_id, owner_id, status, requested_count, processed_count, successful_count, failed_count, current_reference_id, cost_confirmed, created_at, updated_at)
    VALUES (?, ?, ?, 'running', ?, 0, 0, 0, NULL, 1, ?, ?)`)
    .bind(jobId, id, user.userId, requestedCount, now, now)
    .run();
  const job = await env.DB.prepare(`${jobSelect} WHERE id = ?`)
    .bind(jobId)
    .first();
  return Response.json({ job, availableCount }, { status: 201 });
}

export const jobSelect = `SELECT id, review_id AS reviewId, status, requested_count AS requestedCount,
  processed_count AS processedCount, successful_count AS successfulCount, failed_count AS failedCount,
  current_reference_id AS currentReferenceId, cost_confirmed AS costConfirmed, created_at AS createdAt, updated_at AS updatedAt
  FROM screening_jobs`;
