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
    f.file_name AS fileName, f.content_type AS contentType, f.size, r.title
    FROM full_text_files f
    JOIN reviews v ON v.id = f.review_id
    JOIN "references" r ON r.id = f.reference_id AND r.review_id = f.review_id
    WHERE f.review_id = ? AND f.reference_id = ? AND f.owner_id = ? AND v.owner_id = ?`)
    .bind(reviewId, referenceId, user.userId, user.userId)
    .first<{
      r2Key: string;
      fileName: string;
      contentType: string;
      size: number;
      title: string | null;
    }>();
  if (!file)
    return Response.json(
      { error: 'Full-text article not found.' },
      { status: 404 },
    );

  if (file.contentType === 'application/pdf') return pdfResponse(request, file);

  const object = await env.FILES.get(file.r2Key);
  if (!object)
    return Response.json(
      { error: 'Stored full text could not be found.' },
      { status: 404 },
    );
  const html = readerHtml(await object.text(), file.title || 'Full text');
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
    },
  });
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
  if (!object)
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

function readerHtml(xml: string, fallbackTitle: string) {
  const withoutReferences = xml.replace(
    /<ref-list\b[^>]*>[\s\S]*?<\/ref-list>/gi,
    '',
  );
  const title =
    textOf(firstMatch(withoutReferences, 'article-title')) || fallbackTitle;
  const abstract = firstMatch(withoutReferences, 'abstract');
  const body = firstMatch(withoutReferences, 'body') || withoutReferences;
  const parts: string[] = [];
  if (abstract) {
    parts.push('<section><h2>Abstract</h2>');
    for (const paragraph of matches(abstract, 'p'))
      parts.push(`<p>${escapeHtml(textOf(paragraph))}</p>`);
    parts.push('</section>');
  }
  const blockPattern = /<(title|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of body.matchAll(blockPattern)) {
    const text = textOf(match[2]);
    if (!text || text === title) continue;
    parts.push(
      match[1].toLowerCase() === 'title'
        ? `<h2>${escapeHtml(text)}</h2>`
        : `<p>${escapeHtml(text)}</p>`,
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;color:#172033;background:#f4f5fb}body{margin:0}.paper{box-sizing:border-box;max-width:920px;min-height:100vh;margin:0 auto;padding:54px 64px 96px;background:white;box-shadow:0 0 45px rgba(43,35,92,.08)}h1{font-size:2rem;line-height:1.25;margin:0 0 2rem;color:#28205d}h2{font-size:1.15rem;line-height:1.4;margin:2rem 0 .75rem;color:#4b36a8}p{font-family:Georgia,"Times New Roman",serif;font-size:1.03rem;line-height:1.75;margin:.75rem 0;color:#293246}@media(max-width:700px){.paper{padding:28px 22px 80px}h1{font-size:1.5rem}}
  </style></head><body><main class="paper"><h1>${escapeHtml(title)}</h1>${parts.join('')}</main></body></html>`;
}

function firstMatch(value: string, tag: string) {
  return value.match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  )?.[1];
}

function matches(value: string, tag: string) {
  return Array.from(
    value.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')),
    (match) => match[1],
  );
}

function textOf(value: string | undefined) {
  return decodeEntities((value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : '';
    });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHeader(value: string) {
  return value.replace(/["\r\n]/g, '_').slice(-180);
}
