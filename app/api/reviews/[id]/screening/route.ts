import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import {
  ADJUDICATOR_PROMPT_VERSION,
  PROMPT_VERSION,
} from '@/lib/llm-providers';

const aiCategoryCase = `CASE
  WHEN ((CASE WHEN ga.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN oa.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN za.decision = 'include' THEN 1 ELSE 0 END)) >= 2 THEN 'include'
  WHEN ((CASE WHEN ga.decision = 'exclude' THEN 1 ELSE 0 END) + (CASE WHEN oa.decision = 'exclude' THEN 1 ELSE 0 END) + (CASE WHEN za.decision = 'exclude' THEN 1 ELSE 0 END)) >= 2 THEN 'exclude'
  ELSE 'conflict' END`;

const finalCategoryCase = `CASE
  WHEN s.decision = 'include' THEN 'include'
  WHEN s.decision = 'exclude' THEN 'exclude'
  WHEN s.decision = 'unclear' THEN 'conflict'
  ELSE ${aiCategoryCase} END`;

export async function GET(
  request: Request,
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

  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get('filter') || 'all';
  const filter = requestedFilter in filters ? requestedFilter : 'all';
  const page = Math.max(
    1,
    Math.min(
      10000,
      Number.parseInt(url.searchParams.get('page') || '1', 10) || 1,
    ),
  );
  const pageSize = 200;
  const offset = (page - 1) * pageSize;
  const condition = filters[filter as keyof typeof filters];

  const [queue, summary, filtered, duplicates, categorized] =
    await env.DB.batch([
      env.DB.prepare(`SELECT r.id, r.title, r.abstract, r.authors, r.year, r.journal, r.doi, r.pmid,
        s.decision AS researcherDecision, s.notes AS researcherNotes, s.updated_at AS decisionUpdatedAt,
        ga.status AS geminiStatus, ga.decision AS geminiDecision, ga.confidence AS geminiConfidence, ga.reason AS geminiReason, ga.error_code AS geminiError,
        oa.status AS openaiStatus, oa.decision AS openaiDecision, oa.confidence AS openaiConfidence, oa.reason AS openaiReason, oa.error_code AS openaiError,
        za.status AS zeousStatus, za.decision AS zeousDecision, za.confidence AS zeousConfidence, za.reason AS zeousReason, za.error_code AS zeousError,
        ja.status AS adjudicatorStatus, ja.decision AS adjudicatorDecision, ja.confidence AS adjudicatorConfidence, ja.reason AS adjudicatorReason, ja.error_code AS adjudicatorError
        FROM "references" r LEFT JOIN screening_decisions s ON s.reference_id = r.id AND s.review_id = r.review_id
        LEFT JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ?
        LEFT JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ?
        LEFT JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ?
        LEFT JOIN screening_assessments ja ON ja.reference_id = r.id AND ja.review_id = r.review_id AND ja.provider = 'adjudicator' AND ja.prompt_version = ?
        WHERE r.review_id = ? AND (${condition}) AND NOT EXISTS (
          SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate'
        ) ORDER BY CASE WHEN ga.status IS NULL OR oa.status IS NULL OR za.status IS NULL OR ga.status = 'failed' OR oa.status = 'failed' OR za.status = 'failed' THEN 0 ELSE 1 END, CASE WHEN s.decision IS NULL THEN 0 ELSE 1 END, r.created_at ASC LIMIT ? OFFSET ?`).bind(
        PROMPT_VERSION,
        PROMPT_VERSION,
        PROMPT_VERSION,
        ADJUDICATOR_PROMPT_VERSION,
        id,
        pageSize,
        offset,
      ),
      env.DB.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN s.decision = 'include' THEN 1 ELSE 0 END) AS included,
        SUM(CASE WHEN s.decision = 'exclude' THEN 1 ELSE 0 END) AS excluded,
        SUM(CASE WHEN s.decision = 'unclear' THEN 1 ELSE 0 END) AS unclear,
        SUM(CASE WHEN s.decision IS NULL THEN 1 ELSE 0 END) AS unreviewed,
        SUM(CASE WHEN ga.status = 'complete' AND oa.status = 'complete' AND za.status = 'complete' THEN 1 ELSE 0 END) AS aiAssessed,
        SUM(CASE WHEN ga.status = 'complete' AND oa.status = 'complete' AND za.status = 'complete' AND ${finalCategoryCase} = 'conflict' THEN 1 ELSE 0 END) AS conflicts,
        SUM(CASE WHEN ga.status = 'complete' AND oa.status = 'complete' AND za.status = 'complete' AND ${finalCategoryCase} = 'conflict' AND (ja.status IS NULL OR ja.status != 'complete') THEN 1 ELSE 0 END) AS unresolvedConflicts
        FROM "references" r LEFT JOIN screening_decisions s ON s.reference_id = r.id AND s.review_id = r.review_id
        LEFT JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ?
        LEFT JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ?
        LEFT JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ?
        LEFT JOIN screening_assessments ja ON ja.reference_id = r.id AND ja.review_id = r.review_id AND ja.provider = 'adjudicator' AND ja.prompt_version = ?
        WHERE r.review_id = ? AND NOT EXISTS (
          SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate'
        )`).bind(
        PROMPT_VERSION,
        PROMPT_VERSION,
        PROMPT_VERSION,
        ADJUDICATOR_PROMPT_VERSION,
        id,
      ),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM "references" r
        LEFT JOIN screening_decisions s ON s.reference_id = r.id AND s.review_id = r.review_id
        LEFT JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ?
        LEFT JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ?
        LEFT JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ?
        LEFT JOIN screening_assessments ja ON ja.reference_id = r.id AND ja.review_id = r.review_id AND ja.provider = 'adjudicator' AND ja.prompt_version = ?
        WHERE r.review_id = ? AND (${condition}) AND NOT EXISTS (
          SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate'
        )`).bind(
        PROMPT_VERSION,
        PROMPT_VERSION,
        PROMPT_VERSION,
        ADJUDICATOR_PROMPT_VERSION,
        id,
      ),
      env.DB.prepare(
        "SELECT COUNT(*) AS unresolved FROM duplicate_pairs WHERE review_id = ? AND status = 'suggested'",
      ).bind(id),
      env.DB.prepare(`SELECT r.id, r.title, r.abstract, r.authors, r.doi,
        s.decision AS researcherDecision,
        ga.decision AS geminiDecision, ga.reason AS geminiReason,
        oa.decision AS openaiDecision, oa.reason AS openaiReason,
        za.decision AS zeousDecision, za.reason AS zeousReason,
        ja.status AS adjudicatorStatus, ja.decision AS adjudicatorDecision, ja.reason AS adjudicatorReason,
        ${finalCategoryCase} AS category
        FROM "references" r
        LEFT JOIN screening_decisions s ON s.reference_id = r.id AND s.review_id = r.review_id
        JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ? AND ga.status = 'complete'
        JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ? AND oa.status = 'complete'
        JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ? AND za.status = 'complete'
        LEFT JOIN screening_assessments ja ON ja.reference_id = r.id AND ja.review_id = r.review_id AND ja.provider = 'adjudicator' AND ja.prompt_version = ?
        WHERE r.review_id = ? AND NOT EXISTS (
          SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate'
        ) ORDER BY CASE (${finalCategoryCase})
          WHEN 'include' THEN 1 WHEN 'conflict' THEN 2 ELSE 3 END,
          r.created_at ASC`).bind(
        PROMPT_VERSION,
        PROMPT_VERSION,
        PROMPT_VERSION,
        ADJUDICATOR_PROMPT_VERSION,
        id,
      ),
    ]);

  const duplicateSummary = duplicates.results[0] as
    | { unresolved?: unknown }
    | undefined;
  const filteredSummary = filtered.results[0] as
    | { count?: unknown }
    | undefined;
  const total = Number(filteredSummary?.count ?? 0);
  return Response.json({
    references: queue.results,
    categorizedResults: categorized.results,
    summary: summary.results[0],
    unresolvedDuplicates: Number(duplicateSummary?.unresolved ?? 0),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    filter,
  });
}

const filters = {
  all: '1=1',
  unreviewed: 's.decision IS NULL',
  needs_ai:
    "ga.status IS NULL OR oa.status IS NULL OR za.status IS NULL OR ga.status = 'failed' OR oa.status = 'failed' OR za.status = 'failed'",
  agreement:
    "ga.status = 'complete' AND oa.status = 'complete' AND za.status = 'complete' AND ga.decision = oa.decision AND oa.decision = za.decision",
  disagreement:
    "ga.status = 'complete' AND oa.status = 'complete' AND za.status = 'complete' AND (ga.decision != oa.decision OR ga.decision != za.decision)",
  include: "s.decision = 'include'",
  unclear: "s.decision = 'unclear'",
  exclude: "s.decision = 'exclude'",
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as {
    sourceCategory?: string;
    decision?: string;
  };
  if (
    !['include', 'exclude'].includes(body.sourceCategory || '') ||
    body.decision !== body.sourceCategory
  )
    return Response.json(
      { error: 'Choose Include all or Exclude all for its matching section.' },
      { status: 400 },
    );

  const review = await env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(id, user.userId)
    .first();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const categoryCondition =
    body.sourceCategory === 'include'
      ? `(s.decision = 'include' OR (s.decision IS NULL AND ${aiCategoryCase} = 'include'))`
      : `(s.decision = 'exclude' OR (s.decision IS NULL AND ${aiCategoryCase} = 'exclude'))`;
  const rows = await env.DB.prepare(`SELECT r.id
    FROM "references" r
    LEFT JOIN screening_decisions s ON s.reference_id = r.id AND s.review_id = r.review_id
    JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ? AND ga.status = 'complete'
    JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ? AND oa.status = 'complete'
    JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ? AND za.status = 'complete'
    WHERE r.review_id = ? AND ${categoryCondition}
    AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')`)
    .bind(PROMPT_VERSION, PROMPT_VERSION, PROMPT_VERSION, id)
    .all<{ id: string }>();

  const now = Date.now();
  for (let index = 0; index < rows.results.length; index += 100) {
    await env.DB.batch(
      rows.results.slice(index, index + 100).map((row) =>
        env.DB.prepare(`INSERT INTO screening_decisions (id, review_id, reference_id, decision, notes, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?)
          ON CONFLICT(review_id, reference_id) DO UPDATE SET decision = excluded.decision, notes = NULL, updated_at = excluded.updated_at`).bind(
          crypto.randomUUID(),
          id,
          row.id,
          body.decision,
          now,
        ),
      ),
    );
  }
  await env.DB.prepare(
    "UPDATE reviews SET stage = 'screening', updated_at = ? WHERE id = ? AND owner_id = ?",
  )
    .bind(now, id, user.userId)
    .run();
  return Response.json({ updated: rows.results.length });
}
