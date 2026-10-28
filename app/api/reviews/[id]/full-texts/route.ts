import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import { PROMPT_VERSION } from '@/lib/llm-providers';
import { normalizedPdfText } from '@/lib/searchable-pdf';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_AI_BYTES = 8 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const owned = await env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(id, user.userId)
    .first();
  if (!owned)
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const files = await env.DB.prepare(`SELECT reference_id AS referenceId,
    file_name AS fileName, content_type AS contentType, size,
    ai_size AS aiSize,
    CASE WHEN ai_r2_key LIKE '%-ai-lossless-v3.pdf' OR ai_r2_key LIKE '%.pdf.txt' THEN 3
      WHEN ai_r2_key LIKE '%-ai-searchable-v2.pdf' THEN 2 ELSE 1 END AS aiVersion,
    status,
    created_at AS createdAt
    FROM full_text_files WHERE review_id = ? AND owner_id = ?
    ORDER BY created_at DESC`)
    .bind(id, user.userId)
    .all();
  return Response.json({ files: files.results });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!(await hasActiveAccess(user.userId)))
    return Response.json(
      { error: 'Charge your account before adding full-text files.' },
      { status: 402 },
    );

  const { id: reviewId } = await params;
  const form = await request.formData();
  const referenceId = form.get('referenceId');
  const file = form.get('file');
  const aiFile = form.get('aiFile');
  const articleText = form.get('articleText');
  if (typeof referenceId !== 'string' || !referenceId)
    return Response.json(
      { error: 'Choose an included article.' },
      { status: 400 },
    );
  if (!(file instanceof File))
    return Response.json({ error: 'Choose a PDF full text.' }, { status: 400 });
  if (!file.name.toLowerCase().endsWith('.pdf'))
    return Response.json(
      { error: 'Full-text files must be PDFs.' },
      { status: 415 },
    );
  if (file.size > MAX_BYTES)
    return Response.json(
      { error: 'Full-text PDFs must be 25 MB or smaller.' },
      { status: 413 },
    );
  if (
    typeof articleText !== 'string' ||
    normalizedPdfText(articleText).length < 200 ||
    articleText.length > 300_000
  )
    return Response.json(
      { error: 'A complete, readable article text is required for AI screening.' },
      { status: 422 },
    );
  if (aiFile !== null && !(aiFile instanceof File))
    return Response.json(
      { error: 'The optimized AI copy is invalid.' },
      { status: 400 },
    );
  if (
    aiFile instanceof File &&
    (!aiFile.name.toLowerCase().endsWith('.pdf') ||
      aiFile.type !== 'application/pdf')
  )
    return Response.json(
      { error: 'The optimized AI copy must be a PDF.' },
      { status: 415 },
    );
  if (aiFile instanceof File && aiFile.size > MAX_AI_BYTES)
    return Response.json(
      { error: 'The optimized AI copy must be 8 MB or smaller.' },
      { status: 413 },
    );

  const included = await env.DB.prepare(`SELECT r.id FROM "references" r
    JOIN reviews v ON v.id = r.review_id
    LEFT JOIN screening_decisions s ON s.review_id = r.review_id AND s.reference_id = r.id
    LEFT JOIN screening_assessments ga ON ga.review_id = r.review_id AND ga.reference_id = r.id AND ga.provider = 'gemini' AND ga.prompt_version = ? AND ga.status = 'complete'
    LEFT JOIN screening_assessments oa ON oa.review_id = r.review_id AND oa.reference_id = r.id AND oa.provider = 'openai' AND oa.prompt_version = ? AND oa.status = 'complete'
    LEFT JOIN screening_assessments za ON za.review_id = r.review_id AND za.reference_id = r.id AND za.provider = 'zeous' AND za.prompt_version = ? AND za.status = 'complete'
    WHERE r.id = ? AND r.review_id = ? AND v.owner_id = ?
    AND (s.decision = 'include' OR (s.decision IS NULL AND ((CASE WHEN ga.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN oa.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN za.decision = 'include' THEN 1 ELSE 0 END)) >= 2))
    AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')`)
    .bind(
      PROMPT_VERSION,
      PROMPT_VERSION,
      PROMPT_VERSION,
      referenceId,
      reviewId,
      user.userId,
    )
    .first();
  if (!included)
    return Response.json(
      { error: 'Only included articles can receive a full-text file.' },
      { status: 409 },
    );

  const existing = await env.DB.prepare(
    'SELECT r2_key AS r2Key, ai_r2_key AS aiR2Key FROM full_text_files WHERE review_id = ? AND reference_id = ? AND owner_id = ?',
  )
    .bind(reviewId, referenceId, user.userId)
    .first<{ r2Key: string; aiR2Key: string | null }>();
  const id = crypto.randomUUID();
  const now = Date.now();
  const r2Key = `${safePart(user.userId)}/${reviewId}/full-text/${referenceId}/${id}-${safeName(file.name)}`;
  const textR2Key = `${r2Key}.txt`;
  const textSize = new TextEncoder().encode(articleText).length;
  const aiR2Key =
    aiFile instanceof File
      ? `${safePart(user.userId)}/${reviewId}/full-text/${referenceId}/${id}-ai-${safeName(aiFile.name)}`
      : file.size > MAX_AI_BYTES ? textR2Key : null;

  try {
    await env.FILES.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: 'application/pdf' },
    });
    await env.FILES.put(textR2Key, articleText, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
    if (aiFile instanceof File && aiR2Key)
      await env.FILES.put(aiR2Key, await aiFile.arrayBuffer(), {
        httpMetadata: { contentType: 'application/pdf' },
      });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO full_text_files
        (id, review_id, reference_id, owner_id, file_name, r2_key, ai_r2_key, ai_size, content_type, size, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, 'uploaded', ?)
        ON CONFLICT(review_id, reference_id) DO UPDATE SET
          id=excluded.id, owner_id=excluded.owner_id, file_name=excluded.file_name,
          r2_key=excluded.r2_key, ai_r2_key=excluded.ai_r2_key,
          ai_size=excluded.ai_size, content_type=excluded.content_type,
          size=excluded.size, status=excluded.status, created_at=excluded.created_at`).bind(
        id,
        reviewId,
        referenceId,
        user.userId,
        file.name.slice(-180),
        r2Key,
        aiR2Key,
        aiFile instanceof File ? aiFile.size : aiR2Key ? textSize : null,
        file.size,
        now,
      ),
      env.DB.prepare(
        'DELETE FROM full_text_assessments WHERE review_id = ? AND reference_id = ?',
      ).bind(reviewId, referenceId),
      env.DB.prepare(`UPDATE "references" SET full_text_lookup_status = 'found',
        full_text_lookup_at = ? WHERE id = ? AND review_id = ?`).bind(
        now,
        referenceId,
        reviewId,
      ),
      env.DB.prepare(
        "UPDATE reviews SET stage = 'fulltext', updated_at = ? WHERE id = ? AND owner_id = ?",
      ).bind(now, reviewId, user.userId),
    ]);
  } catch (error) {
    console.error('Full-text upload failed', error);
    await env.FILES.delete(r2Key);
    await env.FILES.delete(textR2Key);
    if (aiR2Key && aiR2Key !== textR2Key) await env.FILES.delete(aiR2Key);
    return Response.json(
      { error: 'The full text could not be saved. Please retry the PDF.' },
      { status: 500 },
    );
  }
  if (existing?.r2Key && existing.r2Key !== r2Key) {
    try {
      await env.FILES.delete(existing.r2Key);
      await env.FILES.delete(`${existing.r2Key}.txt`);
    } catch (error) {
      console.error('Previous full-text cleanup failed', error);
    }
  }
  if (existing?.aiR2Key && existing.aiR2Key !== aiR2Key) {
    try {
      if (existing.aiR2Key !== `${existing.r2Key}.txt`)
        await env.FILES.delete(existing.aiR2Key);
    } catch (error) {
      console.error('Previous optimized full-text cleanup failed', error);
    }
  }

  return Response.json(
    {
      referenceId,
      fileName: file.name,
      size: file.size,
      aiSize: aiFile instanceof File ? aiFile.size : aiR2Key ? textSize : null,
      status: 'uploaded',
      createdAt: now,
    },
    { status: 201 },
  );
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'user';
}
