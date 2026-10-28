import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { normalizedPdfText } from '@/lib/searchable-pdf';

const MAX_AI_BYTES = 8 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; referenceId: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });

  const { id: reviewId, referenceId } = await params;
  const form = await request.formData();
  const file = form.get('file');
  const articleText = form.get('articleText');
  if (
    typeof articleText !== 'string' ||
    normalizedPdfText(articleText).length < 200 ||
    articleText.length > 300_000
  )
    return Response.json(
      { error: 'A complete, readable article text is required for AI screening.' },
      { status: 422 },
    );
  if (file !== null && !(file instanceof File))
    return Response.json({ error: 'The optimized AI copy is invalid.' }, { status: 400 });
  if (file instanceof File && (
    !file.name.toLowerCase().endsWith('.pdf') ||
    file.type !== 'application/pdf'
  ))
    return Response.json(
      { error: 'The optimized AI copy must be a PDF.' },
      { status: 415 },
    );
  if (file instanceof File && file.size > MAX_AI_BYTES)
    return Response.json(
      { error: 'This PDF could not be reduced enough for AI screening.' },
      { status: 413 },
    );

  const existing = await env.DB.prepare(`SELECT f.ai_r2_key AS aiR2Key, f.r2_key AS r2Key
      FROM full_text_files f
      JOIN reviews r ON r.id = f.review_id
      WHERE f.review_id = ? AND f.reference_id = ?
      AND f.owner_id = ? AND r.owner_id = ?`)
    .bind(reviewId, referenceId, user.userId, user.userId)
    .first<{ aiR2Key: string | null; r2Key: string }>();
  if (!existing)
    return Response.json({ error: 'Full text not found.' }, { status: 404 });

  const textR2Key = `${existing.r2Key}.txt`;
  const aiR2Key = file instanceof File
    ? `${safePart(user.userId)}/${reviewId}/full-text/${referenceId}/${crypto.randomUUID()}-ai-lossless-v3.pdf`
    : textR2Key;
  const textSize = new TextEncoder().encode(articleText).length;
  try {
    await env.FILES.put(textR2Key, articleText, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
    if (file instanceof File)
      await env.FILES.put(aiR2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType: 'application/pdf' },
      });
    await env.DB.batch([
      env.DB.prepare(`UPDATE full_text_files
        SET ai_r2_key = ?, ai_size = ?
        WHERE review_id = ? AND reference_id = ? AND owner_id = ?`).bind(
        aiR2Key,
        file instanceof File ? file.size : textSize,
        reviewId,
        referenceId,
        user.userId,
      ),
      env.DB.prepare(
        'DELETE FROM full_text_assessments WHERE review_id = ? AND reference_id = ?',
      ).bind(reviewId, referenceId),
    ]);
  } catch (error) {
    console.error('Optimized full-text save failed', error);
    if (aiR2Key !== textR2Key) await env.FILES.delete(aiR2Key);
    return Response.json(
      { error: 'The optimized AI copy could not be saved.' },
      { status: 500 },
    );
  }

  if (existing.aiR2Key && existing.aiR2Key !== aiR2Key) {
    try {
      if (existing.aiR2Key !== textR2Key)
        await env.FILES.delete(existing.aiR2Key);
    } catch (error) {
      console.error('Previous optimized full-text cleanup failed', error);
    }
  }

  return Response.json({ referenceId, aiSize: file instanceof File ? file.size : textSize });
}

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'user';
}
