import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const review = await env.DB.prepare(`SELECT
    full_text_use_tiab_criteria AS useTiabCriteria,
    full_text_inclusion AS inclusion,
    full_text_exclusion AS exclusion,
    full_text_criteria_updated_at AS updatedAt
    FROM reviews WHERE id = ? AND owner_id = ?`)
    .bind(id, user.userId)
    .first<{
      useTiabCriteria: number | null;
      inclusion: string | null;
      exclusion: string | null;
      updatedAt: number | null;
    }>();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });
  return Response.json({
    useTiabCriteria: review.useTiabCriteria === 1,
    inclusion: review.inclusion || '',
    exclusion: review.exclusion || '',
    declared: Boolean(review.updatedAt),
    updatedAt: review.updatedAt,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as {
    useTiabCriteria?: unknown;
    inclusion?: unknown;
    exclusion?: unknown;
  };
  if (typeof body.useTiabCriteria !== 'boolean')
    return Response.json(
      { error: 'Choose how the full-text criteria should be defined.' },
      { status: 400 },
    );
  const inclusion = clean(body.inclusion);
  const exclusion = clean(body.exclusion);
  if (!body.useTiabCriteria && (!inclusion || !exclusion))
    return Response.json(
      {
        error:
          'Full-text inclusion and exclusion criteria are both required unless you investigate with Ti/Ab criteria.',
      },
      { status: 400 },
    );
  const current = await env.DB.prepare(`SELECT
    full_text_use_tiab_criteria AS useTiabCriteria,
    full_text_inclusion AS inclusion,
    full_text_exclusion AS exclusion,
    full_text_criteria_updated_at AS updatedAt
    FROM reviews WHERE id = ? AND owner_id = ?`)
    .bind(id, user.userId)
    .first<{
      useTiabCriteria: number | null;
      inclusion: string | null;
      exclusion: string | null;
      updatedAt: number | null;
    }>();
  if (!current)
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const nextInclusion = body.useTiabCriteria ? null : inclusion;
  const nextExclusion = body.useTiabCriteria ? null : exclusion;
  const changed =
    current.useTiabCriteria !== Number(body.useTiabCriteria) ||
    current.inclusion !== nextInclusion ||
    current.exclusion !== nextExclusion;
  const now = Date.now();
  const statements = [
    env.DB.prepare(`UPDATE reviews SET
      full_text_use_tiab_criteria = ?, full_text_inclusion = ?,
      full_text_exclusion = ?, full_text_criteria_updated_at = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?`).bind(
      Number(body.useTiabCriteria),
      nextInclusion,
      nextExclusion,
      now,
      now,
      id,
      user.userId,
    ),
  ];
  if (changed && current.updatedAt)
    statements.push(
      env.DB.prepare(
        'DELETE FROM full_text_assessments WHERE review_id = ?',
      ).bind(id),
    );
  await env.DB.batch(statements);
  return Response.json({
    useTiabCriteria: body.useTiabCriteria,
    inclusion: nextInclusion || '',
    exclusion: nextExclusion || '',
    declared: true,
    updatedAt: now,
    assessmentsReset: changed && Boolean(current.updatedAt),
  });
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 20_000)
    : null;
}
