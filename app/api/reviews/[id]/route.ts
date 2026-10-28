import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  for (const key of ['title', 'purpose', 'inclusion', 'exclusion'])
    if (typeof body[key] !== 'string' || !body[key].trim())
      return Response.json({ error: `${key} is required.` }, { status: 400 });
  const now = Date.now();
  const stage = body.stage === 'fulltext' ? 'fulltext' : null;
  const result = await env.DB.prepare(
    `UPDATE reviews SET title=?, purpose=?, inclusion=?, exclusion=?, population=?, intervention=?, comparison=?, outcomes=?, stage=COALESCE(?, stage), updated_at=? WHERE id=? AND owner_id=?`,
  )
    .bind(
      body.title,
      body.purpose,
      body.inclusion,
      body.exclusion,
      opt(body.population),
      opt(body.intervention),
      opt(body.comparison),
      opt(body.outcomes),
      stage,
      now,
      id,
      user.userId,
    )
    .run();
  if (!result.meta.changes)
    return Response.json({ error: 'Review not found.' }, { status: 404 });
  return Response.json({ id, updatedAt: now });
}
function opt(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
