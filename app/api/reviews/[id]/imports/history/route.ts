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
  const review = await env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(id, user.userId)
    .first();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });
  const uploads = await env.DB.prepare(`SELECT id, file_name AS fileName,
    CASE WHEN source_database != 'Unknown' THEN source_database
      WHEN lower(file_name) LIKE '%.nbib' OR lower(file_name) LIKE '%pubmed%' THEN 'PubMed'
      WHEN lower(file_name) LIKE '%scopus%' THEN 'Scopus'
      ELSE source_database END AS sourceDatabase,
    size, record_count AS recordCount, status, created_at AS createdAt
    FROM uploads WHERE review_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 30`)
    .bind(id, user.userId)
    .all();
  const summary = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM uploads WHERE review_id = ? AND owner_id = ?) AS fileCount,
    (SELECT COALESCE(SUM(record_count), 0) FROM uploads WHERE review_id = ? AND owner_id = ?) AS totalRecords,
    (SELECT COUNT(*) FROM "references" r WHERE r.review_id = ?
      AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id
        AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')) AS uniqueRecords`)
    .bind(id, user.userId, id, user.userId, id)
    .first();
  return Response.json({ uploads: uploads.results, summary });
}
