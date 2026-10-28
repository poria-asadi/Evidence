import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { PROMPT_VERSION } from '@/lib/llm-providers';

const EUROPE_PMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const BATCH_SIZE = 8;
const MAX_XML_BYTES = 25 * 1024 * 1024;

type Candidate = {
  id: string;
  doi: string | null;
  pmid: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (!user)
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id: reviewId } = await params;
  const owned = await env.DB.prepare(
    'SELECT id FROM reviews WHERE id = ? AND owner_id = ?',
  )
    .bind(reviewId, user.userId)
    .first();
  if (!owned)
    return Response.json({ error: 'Review not found.' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    retryErrors?: boolean;
  };
  const lookupCondition = body.retryErrors
    ? "r.full_text_lookup_status = 'error'"
    : 'r.full_text_lookup_status IS NULL';
  const candidates = await env.DB.prepare(
    `${includedReferenceSql(lookupCondition)} LIMIT ?`,
  )
    .bind(
      PROMPT_VERSION,
      PROMPT_VERSION,
      PROMPT_VERSION,
      reviewId,
      user.userId,
      BATCH_SIZE,
    )
    .all<Candidate>();

  const outcomes = await Promise.all(
    candidates.results.map((candidate) =>
      retrieveOpenAccessFullText(reviewId, user.userId, candidate),
    ),
  );
  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM (${includedReferenceSql(lookupCondition)})`,
  )
    .bind(PROMPT_VERSION, PROMPT_VERSION, PROMPT_VERSION, reviewId, user.userId)
    .first<{ count: number }>();

  return Response.json({
    checked: outcomes.length,
    added: outcomes.filter((outcome) => outcome === 'found').length,
    unavailable: outcomes.filter((outcome) => outcome === 'unavailable').length,
    errors: outcomes.filter((outcome) => outcome === 'error').length,
    remaining: Number(remaining?.count || 0),
  });
}

function includedReferenceSql(lookupCondition: string) {
  return `SELECT r.id, r.doi, r.pmid FROM "references" r
    JOIN reviews v ON v.id = r.review_id
    LEFT JOIN screening_decisions s ON s.review_id = r.review_id AND s.reference_id = r.id
    LEFT JOIN screening_assessments ga ON ga.review_id = r.review_id AND ga.reference_id = r.id AND ga.provider = 'gemini' AND ga.prompt_version = ? AND ga.status = 'complete'
    LEFT JOIN screening_assessments oa ON oa.review_id = r.review_id AND oa.reference_id = r.id AND oa.provider = 'openai' AND oa.prompt_version = ? AND oa.status = 'complete'
    LEFT JOIN screening_assessments za ON za.review_id = r.review_id AND za.reference_id = r.id AND za.provider = 'zeous' AND za.prompt_version = ? AND za.status = 'complete'
    WHERE r.review_id = ? AND v.owner_id = ?
    AND ${lookupCondition}
    AND (r.doi IS NOT NULL OR r.pmid IS NOT NULL)
    AND (s.decision = 'include' OR (s.decision IS NULL AND ((CASE WHEN ga.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN oa.decision = 'include' THEN 1 ELSE 0 END) + (CASE WHEN za.decision = 'include' THEN 1 ELSE 0 END)) >= 2))
    AND NOT EXISTS (SELECT 1 FROM duplicate_pairs d WHERE d.review_id = r.review_id AND d.right_reference_id = r.id AND d.status = 'confirmed_duplicate')
    AND NOT EXISTS (SELECT 1 FROM full_text_files f WHERE f.review_id = r.review_id AND f.reference_id = r.id)`;
}

async function retrieveOpenAccessFullText(
  reviewId: string,
  userId: string,
  candidate: Candidate,
): Promise<'found' | 'unavailable' | 'error'> {
  const now = Date.now();
  try {
    const query = candidate.doi
      ? `DOI:"${candidate.doi.replace(/"/g, '')}"`
      : `EXT_ID:${candidate.pmid} AND SRC:MED`;
    const searchUrl = `${EUROPE_PMC}/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=1`;
    const search = await fetchWithRetry(searchUrl);
    if (!search.ok) throw new Error(`Europe PMC search ${search.status}`);
    const data = (await search.json()) as {
      resultList?: {
        result?: Array<{
          pmcid?: string;
          isOpenAccess?: string;
          inEPMC?: string;
        }>;
      };
    };
    const match = data.resultList?.result?.[0];
    if (!match?.pmcid || match.isOpenAccess !== 'Y' || match.inEPMC !== 'Y') {
      await markLookup(candidate.id, 'unavailable', now);
      return 'unavailable';
    }
    const article = await fetchWithRetry(
      `${EUROPE_PMC}/${encodeURIComponent(match.pmcid)}/fullTextXML`,
    );
    if (!article.ok) {
      if (article.status === 404) {
        await markLookup(candidate.id, 'unavailable', now);
        return 'unavailable';
      }
      throw new Error(`Europe PMC full text ${article.status}`);
    }
    const xml = await article.arrayBuffer();
    if (!xml.byteLength || xml.byteLength > MAX_XML_BYTES)
      throw new Error('Open-access XML size is unsupported');
    const fileId = crypto.randomUUID();
    const fileName = `${match.pmcid}-full-text.xml`;
    const r2Key = `${safePart(userId)}/${reviewId}/full-text/${candidate.id}/${fileId}-${fileName}`;
    await env.FILES.put(r2Key, xml, {
      httpMetadata: { contentType: 'application/xml' },
    });
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO full_text_files
          (id, review_id, reference_id, owner_id, file_name, r2_key, content_type, size, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'application/xml', ?, 'open_access', ?)
          ON CONFLICT(review_id, reference_id) DO NOTHING`).bind(
          fileId,
          reviewId,
          candidate.id,
          userId,
          fileName,
          r2Key,
          xml.byteLength,
          now,
        ),
        env.DB.prepare(`UPDATE "references" SET
          full_text_lookup_status = 'found', full_text_lookup_at = ? WHERE id = ?`).bind(
          now,
          candidate.id,
        ),
        env.DB.prepare(
          "UPDATE reviews SET stage = 'fulltext', updated_at = ? WHERE id = ? AND owner_id = ?",
        ).bind(now, reviewId, userId),
      ]);
    } catch (error) {
      await env.FILES.delete(r2Key);
      throw error;
    }
    return 'found';
  } catch (error) {
    console.error('Open-access full-text lookup failed', candidate.id, error);
    await markLookup(candidate.id, 'error', now);
    return 'error';
  }
}

async function fetchWithRetry(url: string) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json, application/xml;q=0.9' },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || response.status < 500) return response;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  if (!response) throw new Error('Open-access service unavailable');
  return response;
}

function markLookup(referenceId: string, status: string, now: number) {
  return env.DB.prepare(`UPDATE "references" SET
    full_text_lookup_status = ?, full_text_lookup_at = ? WHERE id = ?`)
    .bind(status, now, referenceId)
    .run();
}

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'user';
}
