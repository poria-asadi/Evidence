import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import { jobSelect } from '../route';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id, jobId } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const job = await env.DB.prepare(
    'SELECT id, status FROM screening_jobs WHERE id = ? AND review_id = ? AND owner_id = ?',
  )
    .bind(jobId, id, user.userId)
    .first<{ id: string; status: string }>();
  if (!job)
    return Response.json({ error: 'Batch not found.' }, { status: 404 });
  if (body.action === 'cancel') {
    if (job.status === 'completed')
      return Response.json(
        { error: 'A completed batch cannot be stopped.' },
        { status: 409 },
      );
    await env.DB.prepare(
      "UPDATE screening_jobs SET status = 'cancelled', current_reference_id = NULL, updated_at = ? WHERE id = ?",
    )
      .bind(Date.now(), jobId)
      .run();
  } else if (body.action === 'resume') {
    if (!(await hasActiveAccess(user.userId)))
      return Response.json(
        {
          error: 'An active plan or trial is required to resume AI screening.',
        },
        { status: 402 },
      );
    if (job.status !== 'paused')
      return Response.json(
        { error: 'Only a paused batch can be resumed.' },
        { status: 409 },
      );
    await env.DB.prepare(
      "UPDATE screening_jobs SET status = 'running', updated_at = ? WHERE id = ?",
    )
      .bind(Date.now(), jobId)
      .run();
  } else {
    return Response.json(
      { error: 'Choose resume or cancel.' },
      { status: 400 },
    );
  }
  return Response.json({
    job: await env.DB.prepare(`${jobSelect} WHERE id = ?`).bind(jobId).first(),
  });
}
