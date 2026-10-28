import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; referenceId: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id: reviewId, referenceId } = await params;
  const body = (await request.json()) as {
    decision?: unknown;
    notes?: unknown;
  };
  if (!['include', 'exclude', 'unclear'].includes(String(body.decision)))
    return Response.json(
      { error: 'Choose Include, Exclude, or Needs decision.' },
      { status: 400 },
    );
  const article =
    await env.DB.prepare(`SELECT f.reference_id FROM full_text_files f
    JOIN reviews v ON v.id = f.review_id
    WHERE f.review_id = ? AND f.reference_id = ? AND f.owner_id = ? AND v.owner_id = ?`)
      .bind(reviewId, referenceId, user.userId, user.userId)
      .first();
  if (!article)
    return Response.json(
      { error: 'Full-text article not found.' },
      { status: 404 },
    );

  const decision = String(body.decision);
  const notes =
    typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim().slice(0, 4_000)
      : null;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO full_text_decisions
      (id, review_id, reference_id, decision, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id, reference_id) DO UPDATE SET
        decision = excluded.decision, notes = excluded.notes,
        updated_at = excluded.updated_at`).bind(
      crypto.randomUUID(),
      reviewId,
      referenceId,
      decision,
      notes,
      now,
    ),
    env.DB.prepare(
      "UPDATE reviews SET stage = 'fulltext', updated_at = ? WHERE id = ? AND owner_id = ?",
    ).bind(now, reviewId, user.userId),
  ]);
  return Response.json({ referenceId, decision, notes, updatedAt: now });
}
