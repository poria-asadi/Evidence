import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { FULL_TEXT_PROMPT_VERSION } from '@/lib/llm-providers';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { sourceCategory?: string; decision?: string };
  if (!['include', 'exclude'].includes(body.sourceCategory || '') || body.decision !== body.sourceCategory)
    return Response.json({ error: 'Choose Include all or Exclude all.' }, { status: 400 });
  const owned = await env.DB.prepare('SELECT id FROM reviews WHERE id = ? AND owner_id = ?')
    .bind(id, user.userId).first();
  if (!owned) return Response.json({ error: 'Review not found.' }, { status: 404 });

  const result = await env.DB.prepare(`SELECT f.reference_id AS referenceId,
    d.decision AS researcherDecision,
    ga.decision AS geminiDecision, oa.decision AS openaiDecision, za.decision AS zeousDecision,
    ga.status AS geminiStatus, oa.status AS openaiStatus, za.status AS zeousStatus
    FROM full_text_files f
    LEFT JOIN full_text_decisions d ON d.review_id = f.review_id AND d.reference_id = f.reference_id
    LEFT JOIN full_text_assessments ga ON ga.review_id = f.review_id AND ga.reference_id = f.reference_id AND ga.provider = 'gemini' AND ga.prompt_version = ?
    LEFT JOIN full_text_assessments oa ON oa.review_id = f.review_id AND oa.reference_id = f.reference_id AND oa.provider = 'openai' AND oa.prompt_version = ?
    LEFT JOIN full_text_assessments za ON za.review_id = f.review_id AND za.reference_id = f.reference_id AND za.provider = 'zeous' AND za.prompt_version = ?
    WHERE f.review_id = ? AND f.owner_id = ? AND f.status = 'uploaded'`)
    .bind(FULL_TEXT_PROMPT_VERSION, FULL_TEXT_PROMPT_VERSION, FULL_TEXT_PROMPT_VERSION,
      id, user.userId).all<{
      referenceId: string; researcherDecision: string | null;
      geminiDecision: string | null; openaiDecision: string | null; zeousDecision: string | null;
      geminiStatus: string | null; openaiStatus: string | null; zeousStatus: string | null;
    }>();
  const matches = result.results.filter((item) => {
    if (item.researcherDecision) return item.researcherDecision === body.sourceCategory;
    if ([item.geminiStatus, item.openaiStatus, item.zeousStatus].some((status) => status !== 'complete')) return false;
    const votes = [item.geminiDecision, item.openaiDecision, item.zeousDecision];
    return votes.filter((vote) => vote === body.sourceCategory).length >= 2;
  }).filter((item) => item.researcherDecision !== body.decision);
  const now = Date.now();
  for (let index = 0; index < matches.length; index += 100) {
    await env.DB.batch(matches.slice(index, index + 100).map((item) =>
      env.DB.prepare(`INSERT INTO full_text_decisions
        (id, review_id, reference_id, decision, notes, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?)
        ON CONFLICT(review_id, reference_id) DO UPDATE SET
        decision=excluded.decision, notes=NULL, updated_at=excluded.updated_at`)
        .bind(crypto.randomUUID(), id, item.referenceId, body.decision, now)));
  }
  return Response.json({ updated: matches.length });
}
