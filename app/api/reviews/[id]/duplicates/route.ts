import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

async function ownedReview(id: string, ownerId: string) {
  return env.DB.prepare('SELECT id FROM reviews WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId)
    .first();
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  if (!(await ownedReview(id, user.userId)))
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const result = await env.DB.prepare(`UPDATE duplicate_pairs
    SET status = 'confirmed_duplicate'
    WHERE review_id = ? AND status = 'suggested' AND confidence > 90`)
    .bind(id)
    .run();
  return Response.json({ autoResolved: result.meta.changes ?? 0 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  if (!(await ownedReview(id, user.userId)))
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const requestedPage = Number(new URL(request.url).searchParams.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 100;

  const [pairs, summary] = await Promise.all([
    env.DB.prepare(`SELECT d.id, d.match_type AS matchType, d.confidence, d.status,
      l.title AS leftTitle, l.authors AS leftAuthors, l.year AS leftYear, l.doi AS leftDoi, l.pmid AS leftPmid,
      CASE WHEN lu.source_database != 'Unknown' THEN lu.source_database
        WHEN lower(lu.file_name) LIKE '%.nbib' OR lower(lu.file_name) LIKE '%pubmed%' THEN 'PubMed'
        WHEN lower(lu.file_name) LIKE '%scopus%' THEN 'Scopus'
        ELSE lu.source_database END AS leftSource,
      lu.file_name AS leftFileName,
      r.title AS rightTitle, r.authors AS rightAuthors, r.year AS rightYear, r.doi AS rightDoi, r.pmid AS rightPmid,
      CASE WHEN ru.source_database != 'Unknown' THEN ru.source_database
        WHEN lower(ru.file_name) LIKE '%.nbib' OR lower(ru.file_name) LIKE '%pubmed%' THEN 'PubMed'
        WHEN lower(ru.file_name) LIKE '%scopus%' THEN 'Scopus'
        ELSE ru.source_database END AS rightSource,
      ru.file_name AS rightFileName
      FROM duplicate_pairs d
      JOIN "references" l ON l.id = d.left_reference_id
      JOIN uploads lu ON lu.id = l.upload_id
      JOIN "references" r ON r.id = d.right_reference_id
      JOIN uploads ru ON ru.id = r.upload_id
      WHERE d.review_id = ?
      ORDER BY CASE WHEN d.status = 'suggested' THEN 0 ELSE 1 END,
        d.confidence DESC, d.created_at DESC LIMIT ? OFFSET ?`)
      .bind(id, pageSize, (page - 1) * pageSize)
      .all(),
    env.DB.prepare(`SELECT
      COUNT(*) AS totalCandidates,
      COALESCE(SUM(CASE WHEN status = 'confirmed_duplicate' AND confidence > 90 THEN 1 ELSE 0 END), 0) AS autoResolved,
      COALESCE(SUM(CASE WHEN status = 'suggested' THEN 1 ELSE 0 END), 0) AS needsReview,
      COALESCE(SUM(CASE WHEN status != 'suggested' AND confidence <= 90 THEN 1 ELSE 0 END), 0) AS researcherResolved
      FROM duplicate_pairs WHERE review_id = ?`)
      .bind(id)
      .first(),
  ]);
  const safeSummary = summary ?? {
    totalCandidates: 0,
    autoResolved: 0,
    needsReview: 0,
    researcherResolved: 0,
  };
  const totalCandidates = Number(safeSummary.totalCandidates ?? 0);
  return Response.json({
    pairs: pairs.results,
    summary: safeSummary,
    pagination: {
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCandidates / pageSize)),
      totalCandidates,
    },
  });
}
