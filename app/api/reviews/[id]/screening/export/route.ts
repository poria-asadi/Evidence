import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { PROMPT_VERSION } from '@/lib/llm-providers';
import { createScreeningWorkbook } from '@/lib/screening-workbook';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const review = await env.DB.prepare(
    `SELECT id, title, purpose, inclusion, exclusion, population, intervention, comparison, outcomes FROM reviews WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, user.userId)
    .first<Record<string, string | null>>();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });
  const records = await env.DB.prepare(`SELECT r.title, r.authors, r.doi,
    ga.decision AS gemini_decision, ga.reason AS gemini_reason,
    oa.decision AS openai_decision, oa.reason AS openai_reason,
    za.decision AS zeous_decision, za.reason AS zeous_reason
    FROM "references" r
    LEFT JOIN screening_assessments ga ON ga.reference_id = r.id AND ga.review_id = r.review_id AND ga.provider = 'gemini' AND ga.prompt_version = ?
    LEFT JOIN screening_assessments oa ON oa.reference_id = r.id AND oa.review_id = r.review_id AND oa.provider = 'openai' AND oa.prompt_version = ?
    LEFT JOIN screening_assessments za ON za.reference_id = r.id AND za.review_id = r.review_id AND za.provider = 'zeous' AND za.prompt_version = ?
    WHERE r.review_id = ? AND ga.status = 'complete' AND oa.status = 'complete' AND za.status = 'complete'
    AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate') ORDER BY r.created_at ASC`)
    .bind(PROMPT_VERSION, PROMPT_VERSION, PROMPT_VERSION, id)
    .all<Record<string, string | number | null>>();
  if (!records.results.length)
    return Response.json(
      { error: 'Complete AI screening before exporting results.' },
      { status: 409 },
    );
  const rows = records.results.map((record) => ({
    title: record.title,
    first_author: firstAuthor(record.authors),
    doi: record.doi,
    gemini_decision: decisionLabel(record.gemini_decision),
    openai_decision: decisionLabel(record.openai_decision),
    zeous_decision: decisionLabel(record.zeous_decision),
    reasoning: combinedReasoning(record),
  }));
  const bytes = createScreeningWorkbook(rows, {
    'Review title': review.title,
    'Main purpose': review.purpose,
    'Inclusion criteria': review.inclusion,
    'Exclusion criteria': review.exclusion,
    'P · Population': review.population,
    'I · Intervention': review.intervention,
    'C · Comparison': review.comparison,
    'O · Outcomes': review.outcomes,
    'Prompt version': PROMPT_VERSION,
    'Exported at': new Date().toISOString(),
  });
  const name =
    (review.title || 'systematic-review')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'systematic-review';
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${name}-title-abstract-screening.xlsx"`,
      'cache-control': 'private, no-store',
    },
  });
}

function firstAuthor(value: string | number | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.split(';')[0]?.trim() || value.trim();
}

function combinedReasoning(record: Record<string, string | number | null>) {
  const items = [
    ['Miss Marple', record.gemini_reason],
    ['Poirot', record.openai_reason],
    ['Zeous', record.zeous_reason],
  ]
    .filter(([, reason]) => typeof reason === 'string' && reason)
    .map(([label, reason]) => `${label}: ${reason}`);
  return items.join('\n') || null;
}

function decisionLabel(value: string | number | null) {
  return value === 'include'
    ? 'Include'
    : value === 'exclude'
      ? 'Exclude'
      : value === 'unclear'
        ? 'Needs decision'
        : null;
}
