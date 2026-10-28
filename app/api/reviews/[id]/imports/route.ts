import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import {
  createDuplicateMatcher,
  type MatchCandidate,
} from '@/lib/deduplication';
import {
  diagnoseReferenceFile,
  parseReferenceFile,
} from '@/lib/reference-parser';

const MAX_BYTES = 30 * 1024 * 1024;
const ACCEPTED = ['.ris', '.nbib', '.csv', '.txt'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id: reviewId } = await params;
  const review = await env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(reviewId, user.userId)
    .first();
  if (!review)
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File))
    return Response.json(
      { error: 'Choose an RIS, NBIB, CSV, or bibliographic TXT file.' },
      { status: 400 },
    );
  const extension = ACCEPTED.find((value) =>
    file.name.toLowerCase().endsWith(value),
  );
  if (!extension)
    return Response.json(
      {
        error:
          'This milestone accepts RIS, PubMed NBIB, CSV, and bibliographic TXT files.',
      },
      { status: 415 },
    );
  if (file.size > MAX_BYTES)
    return Response.json(
      { error: 'Each file must be 30 MB or smaller.' },
      { status: 413 },
    );

  let records;
  let diagnostics;
  const text = await file.text();
  try {
    records = parseReferenceFile(file.name, text);
    diagnostics = diagnoseReferenceFile(file.name, text, records);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The reference file could not be parsed.',
      },
      { status: 422 },
    );
  }

  const prior = await env.DB.prepare(
    'SELECT id, doi, pmid, title, authors, year FROM `references` WHERE review_id = ?',
  )
    .bind(reviewId)
    .all<MatchCandidate>();
  const candidates = [...prior.results];
  const duplicateMatcher = createDuplicateMatcher(candidates);
  const uploadId = crypto.randomUUID();
  const now = Date.now();
  const r2Key = `${safePathPart(user.userId)}/${reviewId}/${uploadId}/${safeName(file.name)}`;
  // Browser-provided MIME values vary for RIS/NBIB files and some values are
  // rejected by R2's HTTP metadata validator. Store a known-valid type and use
  // an ArrayBuffer so local and hosted Workers receive the same body shape.
  const contentType =
    extension === '.csv'
      ? 'text/csv; charset=utf-8'
      : 'text/plain; charset=utf-8';
  try {
    await env.FILES.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType },
    });
    await env.DB.prepare(`INSERT INTO uploads (id, review_id, owner_id, file_name, source_database, r2_key, content_type, size, record_count, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'parsed', ?)`)
      .bind(
        uploadId,
        reviewId,
        user.userId,
        file.name,
        diagnostics.sourceDatabase,
        r2Key,
        contentType,
        file.size,
        records.length,
        now,
      )
      .run();
  } catch (error) {
    console.error('Reference upload storage failed', error);
    return Response.json(
      {
        error:
          'The references were read, but the upload could not be saved. Please retry the file.',
      },
      { status: 500 },
    );
  }

  const inserts: D1PreparedStatement[] = [];
  const duplicates: Array<{
    title: string | null;
    matchType: string;
    confidence: number;
    status: 'confirmed_duplicate' | 'suggested';
  }> = [];
  for (const record of records) {
    const referenceId = crypto.randomUUID();
    inserts.push(
      env.DB.prepare(`INSERT INTO \`references\` (id, review_id, upload_id, title, abstract, authors, year, journal, doi, pmid, raw_source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        referenceId,
        reviewId,
        uploadId,
        record.title,
        record.abstract,
        record.authors,
        record.year,
        record.journal,
        record.doi,
        record.pmid,
        record.rawSource,
        now,
      ),
    );
    const match = duplicateMatcher.find(record);
    if (match) {
      const status =
        match.confidence > 90 ? 'confirmed_duplicate' : 'suggested';
      duplicates.push({
        title: record.title,
        matchType: match.matchType,
        confidence: match.confidence,
        status,
      });
      inserts.push(
        env.DB.prepare(`INSERT INTO duplicate_pairs (id, review_id, left_reference_id, right_reference_id, match_type, confidence, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          crypto.randomUUID(),
          reviewId,
          match.id,
          referenceId,
          match.matchType,
          match.confidence,
          status,
          now,
        ),
      );
    }
    const candidate = {
      id: referenceId,
      title: record.title,
      authors: record.authors,
      year: record.year,
      doi: record.doi,
      pmid: record.pmid,
    };
    candidates.push(candidate);
    duplicateMatcher.add(candidate);
  }
  try {
    for (let i = 0; i < inserts.length; i += 80)
      await env.DB.batch(inserts.slice(i, i + 80));
    await env.DB.prepare(
      "UPDATE reviews SET stage = 'import', updated_at = ? WHERE id = ? AND owner_id = ?",
    )
      .bind(Date.now(), reviewId, user.userId)
      .run();
  } catch (error) {
    console.error('Reference import database write failed', error);
    await env.FILES.delete(r2Key);
    return Response.json(
      {
        error:
          'The file was parsed, but its references could not be saved. Please retry the file.',
      },
      { status: 500 },
    );
  }
  return Response.json(
    {
      uploadId,
      fileName: file.name,
      recordCount: records.length,
      duplicateCount: duplicates.length,
      autoResolvedCount: duplicates.filter(
        (duplicate) => duplicate.status === 'confirmed_duplicate',
      ).length,
      reviewCount: duplicates.filter(
        (duplicate) => duplicate.status === 'suggested',
      ).length,
      duplicates,
      diagnostics,
      preview: records.slice(0, 8).map(({ rawSource: _, ...record }) => record),
    },
    { status: 201 },
  );
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}
function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'user';
}
