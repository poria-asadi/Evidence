import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import { PROMPT_VERSION } from '@/lib/llm-providers';
import {
  runReferenceAssessment,
  ScreeningRunError,
} from '@/lib/screening-runner';
import { jobSelect } from '../../route';

type JobRow = {
  id: string;
  status: string;
  requested_count: number;
  processed_count: number;
  current_reference_id: string | null;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!(await hasActiveAccess(user.userId)))
    return Response.json(
      { error: 'An active plan or trial is required to run AI screening.' },
      { status: 402 },
    );
  const { id, jobId } = await params;
  const job = await env.DB.prepare(
    'SELECT id, status, requested_count, processed_count, current_reference_id FROM screening_jobs WHERE id = ? AND review_id = ? AND owner_id = ?',
  )
    .bind(jobId, id, user.userId)
    .first<JobRow>();
  if (!job)
    return Response.json({ error: 'Batch not found.' }, { status: 404 });
  if (job.status !== 'running')
    return Response.json(
      {
        error:
          job.status === 'paused'
            ? 'Resume this batch before continuing.'
            : 'This batch is no longer running.',
      },
      { status: 409 },
    );
  if (job.processed_count >= job.requested_count) return finish(jobId);

  let referenceId = job.current_reference_id;
  if (!referenceId) {
    const next = await env.DB.prepare(`SELECT r.id FROM "references" r
      LEFT JOIN screening_assessments ga ON ga.review_id = r.review_id AND ga.reference_id = r.id AND ga.provider = 'gemini' AND ga.prompt_version = ?
      LEFT JOIN screening_assessments oa ON oa.review_id = r.review_id AND oa.reference_id = r.id AND oa.provider = 'openai' AND oa.prompt_version = ?
      LEFT JOIN screening_assessments za ON za.review_id = r.review_id AND za.reference_id = r.id AND za.provider = 'zeous' AND za.prompt_version = ?
      WHERE r.review_id = ?
      AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')
      AND (ga.status IS NULL OR ga.status != 'complete' OR oa.status IS NULL OR oa.status != 'complete' OR za.status IS NULL OR za.status != 'complete')
      ORDER BY r.created_at ASC LIMIT 1`)
      .bind(PROMPT_VERSION, PROMPT_VERSION, PROMPT_VERSION, id)
      .first<{ id: string }>();
    if (!next) return finish(jobId);
    referenceId = next.id;
    await env.DB.prepare(
      'UPDATE screening_jobs SET current_reference_id = ?, updated_at = ? WHERE id = ?',
    )
      .bind(referenceId, Date.now(), jobId)
      .run();
  }

  try {
    const result = await runReferenceAssessment({
      reviewId: id,
      referenceId,
      userId: user.userId,
    });
    if (result.status === 'partial_failure') {
      await env.DB.prepare(
        "UPDATE screening_jobs SET failed_count = failed_count + 1, updated_at = ? WHERE id = ? AND status = 'running'",
      )
        .bind(Date.now(), jobId)
        .run();
    } else {
      await env.DB.prepare(`UPDATE screening_jobs SET processed_count = processed_count + 1, successful_count = successful_count + 1,
        current_reference_id = NULL, status = CASE WHEN processed_count + 1 >= requested_count THEN 'completed' ELSE 'running' END, updated_at = ? WHERE id = ? AND status = 'running'`)
        .bind(Date.now(), jobId)
        .run();
    }
    const updatedJob = await env.DB.prepare(`${jobSelect} WHERE id = ?`)
      .bind(jobId)
      .first<Record<string, unknown>>();
    return Response.json({
      result,
      job: {
        ...updatedJob,
        failures: result.providers
          .filter((provider) => provider.status === 'failed')
          .map((provider) => ({
            provider: provider.provider,
            errorCode: provider.errorCode,
          })),
      },
    });
  } catch (error) {
    if (error instanceof ScreeningRunError)
      return Response.json({ error: error.message }, { status: error.status });
    await env.DB.prepare(
      "UPDATE screening_jobs SET failed_count = failed_count + 1, updated_at = ? WHERE id = ? AND status = 'running'",
    )
      .bind(Date.now(), jobId)
      .run();
    return Response.json({
      result: { status: 'partial_failure', providers: [] },
      job: await env.DB.prepare(`${jobSelect} WHERE id = ?`)
        .bind(jobId)
        .first(),
    });
  }
}

async function finish(jobId: string) {
  await env.DB.prepare(
    "UPDATE screening_jobs SET status = 'completed', current_reference_id = NULL, updated_at = ? WHERE id = ? AND status = 'running'",
  )
    .bind(Date.now(), jobId)
    .run();
  return Response.json({
    result: { status: 'complete' },
    job: await env.DB.prepare(`${jobSelect} WHERE id = ?`).bind(jobId).first(),
  });
}
