import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { ensureFullTextPrepared } from '@/lib/full-text-preparation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; referenceId: string }> },
) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id, referenceId } = await params;
  const file = await env.DB.prepare(`SELECT f.r2_key AS r2Key, f.content_type AS contentType
    FROM full_text_files f JOIN reviews r ON r.id = f.review_id
    WHERE f.review_id = ? AND f.reference_id = ? AND f.owner_id = ? AND r.owner_id = ? AND f.status = 'uploaded'`)
    .bind(id, referenceId, user.userId, user.userId)
    .first<{ r2Key: string; contentType: string }>();
  if (!file) return Response.json({ error: 'Full text not found.' }, { status: 404 });
  try {
    const text = await ensureFullTextPrepared(file.r2Key, file.contentType);
    return new Response(text, { headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The article TXT could not be prepared.' }, { status: 409 });
  }
}
