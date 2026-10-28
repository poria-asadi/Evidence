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
    'SELECT id, title FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(id, user.userId)
    .first<{ id: string; title: string | null }>();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });
  const rows =
    await env.DB.prepare(`SELECT d.id AS pair_id, d.match_type, d.confidence, d.status,
    CASE WHEN lu.source_database != 'Unknown' THEN lu.source_database
      WHEN lower(lu.file_name) LIKE '%.nbib' OR lower(lu.file_name) LIKE '%pubmed%' THEN 'PubMed'
      WHEN lower(lu.file_name) LIKE '%scopus%' THEN 'Scopus'
      ELSE lu.source_database END AS record_a_source, lu.file_name AS record_a_file,
    l.title AS record_a_title, l.authors AS record_a_authors, l.year AS record_a_year, l.doi AS record_a_doi, l.pmid AS record_a_pmid,
    CASE WHEN ru.source_database != 'Unknown' THEN ru.source_database
      WHEN lower(ru.file_name) LIKE '%.nbib' OR lower(ru.file_name) LIKE '%pubmed%' THEN 'PubMed'
      WHEN lower(ru.file_name) LIKE '%scopus%' THEN 'Scopus'
      ELSE ru.source_database END AS record_b_source, ru.file_name AS record_b_file,
    r.title AS record_b_title, r.authors AS record_b_authors, r.year AS record_b_year, r.doi AS record_b_doi, r.pmid AS record_b_pmid
    FROM duplicate_pairs d
    JOIN "references" l ON l.id = d.left_reference_id
    JOIN uploads lu ON lu.id = l.upload_id
    JOIN "references" r ON r.id = d.right_reference_id
    JOIN uploads ru ON ru.id = r.upload_id
    WHERE d.review_id = ? ORDER BY d.created_at ASC`)
      .bind(id)
      .all<Record<string, unknown>>();
  const headers = [
    'pair_id',
    'match_type',
    'confidence',
    'status',
    'record_a_source',
    'record_a_file',
    'record_a_title',
    'record_a_authors',
    'record_a_year',
    'record_a_doi',
    'record_a_pmid',
    'record_b_source',
    'record_b_file',
    'record_b_title',
    'record_b_authors',
    'record_b_year',
    'record_b_doi',
    'record_b_pmid',
  ];
  const csv = [
    headers.join(','),
    ...rows.results.map((row) =>
      headers.map((header) => quote(row[header])).join(','),
    ),
  ].join('\r\n');
  const name =
    (review.title || 'systematic-review')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'systematic-review';
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}-deduplication-audit.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}

function quote(value: unknown) {
  const raw =
    value == null
      ? ''
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}
