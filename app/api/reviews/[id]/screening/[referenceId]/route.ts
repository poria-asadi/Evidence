import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; referenceId: string }> }) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id, referenceId } = await params; const body = await request.json() as { decision?: string; notes?: string };
  if (!['include', 'exclude', 'unclear'].includes(body.decision ?? '')) return Response.json({ error: 'Choose Include, Exclude, or Needs decision.' }, { status: 400 });
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;
  const owned = await env.DB.prepare(`SELECT r.id FROM "references" r JOIN reviews v ON v.id = r.review_id
    WHERE r.id = ? AND r.review_id = ? AND v.owner_id = ?`).bind(referenceId, id, user.userId).first();
  if (!owned) return Response.json({ error: 'Reference not found.' }, { status: 404 });
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO screening_decisions (id, review_id, reference_id, decision, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(review_id, reference_id) DO UPDATE SET decision = excluded.decision, notes = excluded.notes, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), id, referenceId, body.decision, notes, now).run();
  await env.DB.prepare("UPDATE reviews SET stage = 'screening', updated_at = ? WHERE id = ? AND owner_id = ?").bind(now, id, user.userId).run();
  return Response.json({ referenceId, decision: body.decision, notes, updatedAt: now });
}
