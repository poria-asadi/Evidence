import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';

type RisReference = {
  id: string;
  title: string | null;
  abstract: string | null;
  authors: string | null;
  year: string | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  sourceDatabase: string | null;
  fileName: string;
  rawSource: string;
  duplicateAbstract: string | null;
  duplicateRawSource: string | null;
};

const PAGE_SIZE = 250;

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

  const unresolved = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM duplicate_pairs WHERE review_id = ? AND status = 'suggested'",
  )
    .bind(id)
    .first<{ count: number }>();
  if (Number(unresolved?.count ?? 0) > 0)
    return Response.json(
      {
        error:
          'Resolve all possible duplicate pairs before exporting the retained library.',
      },
      { status: 409 },
    );

  const encoder = new TextEncoder();
  let offset = 0;
  let firstChunk = true;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const page = await env.DB.prepare(`SELECT r.id, r.title, r.abstract, r.authors, r.year, r.journal, r.doi, r.pmid,
          r.raw_source AS rawSource, u.source_database AS sourceDatabase, u.file_name AS fileName,
          (SELECT dr.abstract
            FROM duplicate_pairs d
            JOIN "references" dr ON dr.id = d.right_reference_id
            WHERE d.review_id = r.review_id
              AND d.left_reference_id = r.id
              AND d.status = 'confirmed_duplicate'
              AND dr.abstract IS NOT NULL
              AND TRIM(dr.abstract) <> ''
            ORDER BY LENGTH(dr.abstract) DESC
            LIMIT 1) AS duplicateAbstract,
          (SELECT dr.raw_source
            FROM duplicate_pairs d
            JOIN "references" dr ON dr.id = d.right_reference_id
            WHERE d.review_id = r.review_id
              AND d.left_reference_id = r.id
              AND d.status = 'confirmed_duplicate'
            ORDER BY LENGTH(dr.raw_source) DESC
            LIMIT 1) AS duplicateRawSource
          FROM "references" r
          JOIN uploads u ON u.id = r.upload_id
          WHERE r.review_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM duplicate_pairs d
            WHERE d.review_id = r.review_id
              AND d.right_reference_id = r.id
              AND d.status = 'confirmed_duplicate'
          )
          ORDER BY r.created_at ASC, r.id ASC
          LIMIT ? OFFSET ?`)
          .bind(id, PAGE_SIZE, offset)
          .all<RisReference>();

        if (!page.results.length) {
          controller.close();
          return;
        }
        offset += page.results.length;
        const prefix = firstChunk ? '\uFEFF' : '';
        firstChunk = false;
        controller.enqueue(
          encoder.encode(`${prefix}${page.results.map(toRis).join('\r\n')}`),
        );
      } catch (error) {
        controller.error(error);
      }
    },
  });

  const name = safeFileName(review.title || 'systematic-review');
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-research-info-systems; charset=utf-8',
      'content-disposition': `attachment; filename="${name}-deduplicated.ris"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function toRis(reference: RisReference) {
  const abstract =
    clean(reference.abstract) ??
    abstractFromRaw(reference.rawSource) ??
    clean(reference.duplicateAbstract) ??
    abstractFromRaw(reference.duplicateRawSource);

  const originalRis = originalRisLines(reference.rawSource);
  if (originalRis) {
    const lines = originalRis.filter((line) => !/^ER\s{0,2}-/.test(line));
    return finishPreservedRis(lines, reference, abstract);
  }

  const originalNbib = nbibRisLines(reference.rawSource);
  if (originalNbib)
    return finishPreservedRis(originalNbib, reference, abstract);

  const lines = ['TY  - JOUR'];
  add(lines, 'TI', reference.title);
  for (const author of splitAuthors(reference.authors)) add(lines, 'AU', author);
  add(lines, 'PY', reference.year);
  add(lines, 'JO', reference.journal);
  add(lines, 'AB', abstract);
  add(lines, 'N2', abstract);
  add(lines, 'DO', reference.doi);
  if (reference.doi)
    add(lines, 'UR', `https://doi.org/${reference.doi}`);
  if (reference.pmid) {
    add(lines, 'AN', reference.pmid);
    add(lines, 'UR', `https://pubmed.ncbi.nlm.nih.gov/${reference.pmid}/`);
    add(lines, 'N1', `PMID: ${reference.pmid}`);
  }
  for (const note of csvSourceNotes(reference.rawSource)) add(lines, 'N1', note);
  add(lines, 'DB', reference.sourceDatabase);
  add(lines, 'N1', `Original source file: ${reference.fileName}`);
  add(lines, 'ID', reference.id);
  lines.push('ER  - ', '');
  return lines.join('\r\n');
}

function finishPreservedRis(
  lines: string[],
  reference: RisReference,
  abstract: string | null,
) {
  addUnlessPresent(lines, ['TI', 'T1'], 'TI', reference.title);
  if (!hasTag(lines, 'AU') && !hasTag(lines, 'A1'))
    for (const author of splitAuthors(reference.authors)) add(lines, 'AU', author);
  addUnlessPresent(lines, ['PY', 'Y1'], 'PY', reference.year);
  addUnlessPresent(lines, ['JO', 'JF', 'T2'], 'JO', reference.journal);
  addUnlessPresent(lines, ['AB'], 'AB', abstract);
  // N2 is used as the abstract field by some RIS importers. Keeping both
  // tags makes the same abstract visible across EndNote and other tools.
  addUnlessPresent(lines, ['N2'], 'N2', abstract);
  addUnlessPresent(lines, ['DO'], 'DO', reference.doi);
  if (reference.doi && !hasValue(lines, 'UR', reference.doi))
    add(lines, 'UR', `https://doi.org/${reference.doi}`);
  addUnlessPresent(lines, ['AN'], 'AN', reference.pmid);
  if (reference.pmid && !hasValue(lines, 'UR', reference.pmid))
    add(lines, 'UR', `https://pubmed.ncbi.nlm.nih.gov/${reference.pmid}/`);
  addUnlessPresent(lines, ['DB'], 'DB', reference.sourceDatabase);
  add(lines, 'N1', `Original source file: ${reference.fileName}`);
  add(lines, 'ID', reference.id);
  lines.push('ER  - ', '');
  return lines.join('\r\n');
}

function originalRisLines(rawSource: string) {
  const normalized = rawSource.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^TY\s{0,2}-/m.test(normalized)) return null;
  return normalized
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter(Boolean);
}

function nbibRisLines(rawSource: string) {
  const normalized = rawSource.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^PMID\s*-\s*/m.test(normalized)) return null;

  const fields = new Map<string, string[]>();
  let currentTag = '';
  for (const line of normalized.split('\n')) {
    const match = line.match(/^([A-Z0-9]{2,5})\s*-\s?(.*)$/);
    if (match) {
      currentTag = match[1];
      fields.set(currentTag, [
        ...(fields.get(currentTag) ?? []),
        match[2].trim(),
      ]);
    } else if (currentTag && line.trim()) {
      const values = fields.get(currentTag)!;
      values[values.length - 1] += ` ${line.trim()}`;
    }
  }

  const lines = ['TY  - JOUR'];
  const mapped = new Set<string>();
  const copy = (source: string, target: string) => {
    const values = fields.get(source) ?? [];
    if (values.length) mapped.add(source);
    for (const value of values) add(lines, target, value);
  };
  copy('TI', 'TI');
  copy('BTI', 'T1');
  if (fields.get('FAU')?.length) copy('FAU', 'AU');
  else copy('AU', 'AU');
  mapped.add('AU');
  copy('AB', 'AB');
  copy('DP', 'PY');
  copy('JT', 'JF');
  copy('TA', 'JO');
  copy('VI', 'VL');
  copy('IP', 'IS');
  copy('PG', 'SP');
  copy('IS', 'SN');
  copy('PL', 'CY');
  copy('LA', 'LA');
  copy('PT', 'M3');
  copy('OT', 'KW');
  copy('MH', 'KW');
  copy('EDAT', 'Y2');
  copy('PMID', 'AN');

  for (const tag of ['AID', 'LID']) {
    for (const value of fields.get(tag) ?? []) {
      if (/\[doi\]/i.test(value))
        add(lines, 'DO', value.replace(/\s*\[doi\].*$/i, ''));
      else add(lines, 'N1', `${tag}: ${value}`);
    }
    mapped.add(tag);
  }

  // Retain every source field that has no direct RIS equivalent as a note,
  // instead of silently discarding data from the uploaded NBIB record.
  for (const [tag, values] of fields) {
    if (mapped.has(tag)) continue;
    for (const value of values) add(lines, 'N1', `${tag}: ${value}`);
  }
  return lines;
}

function hasTag(lines: string[], tag: string) {
  return lines.some((line) => line.startsWith(`${tag.padEnd(4)}-`));
}

function hasValue(lines: string[], tag: string, value: string) {
  const needle = value.toLowerCase();
  return lines.some(
    (line) =>
      line.startsWith(`${tag.padEnd(4)}-`) && line.toLowerCase().includes(needle),
  );
}

function addUnlessPresent(
  lines: string[],
  existingTags: string[],
  tag: string,
  value: string | null | undefined,
) {
  if (!existingTags.some((candidate) => hasTag(lines, candidate)))
    add(lines, tag, value);
}

function abstractFromRaw(rawSource: string | null) {
  if (!rawSource) return null;
  const normalized = rawSource.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  let collecting = false;
  const parts: string[] = [];
  for (const line of lines) {
    const tagged = line.match(/^([A-Z0-9]{2,5})\s{0,2}-\s?(.*)$/);
    if (tagged) {
      collecting = tagged[1] === 'AB' || tagged[1] === 'N2';
      if (collecting && tagged[2].trim()) parts.push(tagged[2].trim());
    } else if (collecting && line.trim()) parts.push(line.trim());
  }
  return clean(parts.join(' '));
}

function csvSourceNotes(rawSource: string) {
  try {
    const source = JSON.parse(rawSource) as Record<string, unknown>;
    if (!source || Array.isArray(source) || typeof source !== 'object') return [];
    return Object.entries(source)
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([field, value]) => `Original ${field}: ${(value as string).trim()}`);
  } catch {
    return [];
  }
}

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || null;
}

function add(lines: string[], tag: string, value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (normalized) lines.push(`${tag.padEnd(4)}- ${normalized}`);
}

function splitAuthors(value: string | null) {
  if (!value) return [];
  return value
    .split(/\s*;\s*/)
    .map((author) => author.trim())
    .filter(Boolean);
}

function safeFileName(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 100) || 'systematic-review'
  );
}
