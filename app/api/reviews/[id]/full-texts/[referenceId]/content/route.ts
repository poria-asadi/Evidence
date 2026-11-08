import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; referenceId: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id: reviewId, referenceId } = await params;
  const file = await env.DB.prepare(`SELECT f.r2_key AS r2Key,
    f.file_name AS fileName, f.size
    FROM full_text_files f
    JOIN reviews v ON v.id = f.review_id
    WHERE f.review_id = ? AND f.reference_id = ? AND f.owner_id = ? AND v.owner_id = ?
      AND f.status = 'uploaded' AND f.content_type = 'application/pdf'`)
    .bind(reviewId, referenceId, user.userId, user.userId)
    .first<{
      r2Key: string;
      fileName: string;
      size: number;
    }>();
  if (!file)
    return Response.json(
      { error: 'Full-text article not found.' },
      { status: 404 },
    );

  return pdfResponse(request, file);
}

async function pdfResponse(
  request: Request,
  file: {
    r2Key: string;
    fileName: string;
    size: number;
  },
) {
  const range = parseRange(request.headers.get('range'), file.size);
  const object = await env.FILES.get(
    file.r2Key,
    range
      ? { range: { offset: range.start, length: range.length } }
      : undefined,
  );
  if (!object || object.size === 0)
    return Response.json(
      { error: 'Stored full text could not be found.' },
      { status: 404 },
    );
  const headers: Record<string, string> = {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${safeHeader(file.fileName)}"`,
    'cache-control': 'private, no-store',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
  };
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${file.size}`;
    headers['content-length'] = String(range.length);
  } else {
    headers['content-length'] = String(file.size);
  }
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

function parseRange(value: string | null, size: number) {
  const match = value?.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  const end = Math.min(requestedEnd, size - 1);
  if (!Number.isSafeInteger(end) || end < start) return null;
  return { start, end, length: end - start + 1 };
}

function safeHeader(value: string) {
  return value.replace(/["\r\n]/g, '_').slice(-180);
}
