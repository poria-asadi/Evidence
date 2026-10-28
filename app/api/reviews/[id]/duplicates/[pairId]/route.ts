import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; pairId: string }> }) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id, pairId } = await params; const body = await request.json() as { decision?: string };
  if (!['confirmed_duplicate', 'keep_both'].includes(body.decision ?? '')) return Response.json({ error: 'Choose duplicate or keep both.' }, { status: 400 });
  const result = await env.DB.prepare(`UPDATE duplicate_pairs SET status = ? WHERE id = ? AND review_id = ?
    AND EXISTS (SELECT 1 FROM reviews WHERE reviews.id = duplicate_pairs.review_id AND reviews.owner_id = ?)`)
    .bind(body.decision, pairId, id, user.userId).run();
  if (!result.meta.changes) return Response.json({ error: 'Duplicate pair not found.' }, { status: 404 });
  return Response.json({ id: pairId, status: body.decision });
}
