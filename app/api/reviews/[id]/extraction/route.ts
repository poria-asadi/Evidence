import { env } from 'cloudflare:workers';
import { hasActiveAccess, requireApiUser } from '@/lib/current-user';
import { analyzeExtractionSheet, extractArticle, extractionProviderReady, type ColumnPlan, type ExtractedCell } from '@/lib/extraction-ai';
import { includedFullTexts } from '@/lib/extraction-data';
import { readPreparedFullText } from '@/lib/full-text-preparation';
import { createExtractionWorkbook, readExtractionTemplate, type ExtractionTemplate } from '@/lib/extraction-sheet';
import { EXTRACTION_PROVIDERS, EXTRACTION_PROVIDER_LABELS, isExtractionProvider, type ExtractionProvider } from '@/lib/extraction-providers';
import { normalizeExtractionValue } from '@/lib/extraction-resilience';
import { EXTRACTION_PIPELINE_VERSION, isExtractionAudit } from '@/lib/extraction-reconciliation';
import { normalizedPdfText } from '@/lib/searchable-pdf';

type StoredTemplate = {
  fileName: string;
  r2Key: string;
  format: 'csv' | 'xlsx';
  headersJson: string;
  previewJson: string;
  worksheetPath: string | null;
  headerRow: number;
  schemaJson: string | null;
  updatedAt: number;
};
type StoredRecord = {
  referenceId: string;
  provider: ExtractionProvider;
  templateUpdatedAt: number;
  valuesJson: string;
  evidenceJson: string;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { id } = await params;
  const review = await ownedReview(id, user.userId);
  if (!review) return Response.json({ error: 'Review not found.' }, { status: 404 });
  const [template, articles, records] = await Promise.all([
    getTemplate(id, user.userId), includedFullTexts(id, user.userId),
    env.DB.prepare(`SELECT reference_id AS referenceId, provider,
      template_updated_at AS templateUpdatedAt, values_json AS valuesJson,
      evidence_json AS evidenceJson FROM extraction_records WHERE review_id = ? AND provider = 'watson'`)
      .bind(id).all<StoredRecord>(),
  ]);
  const plans = readPlans(template?.schemaJson);
  const recordMap = new Map(records.results.map((record) => [`${record.referenceId}:${record.provider}`, record]));
  const articleStates = articles.map((article) => {
    return {
      id: article.id,
      title: article.title || 'Untitled article',
      results: Object.fromEntries(EXTRACTION_PROVIDERS.map((provider) => {
        const record = recordMap.get(`${article.id}:${provider}`);
        const audit = record ? JSON.parse(record.evidenceJson) as unknown : null;
        const extracted = Boolean(record && record.templateUpdatedAt === template?.updatedAt && isExtractionAudit(audit));
        const cells = extracted && isExtractionAudit(audit) ? audit.cells : [];
        return [provider, {
          extracted,
          values: extracted && record ? (JSON.parse(record.valuesJson) as string[]).map(normalizeExtractionValue) : null,
          reviewFields: cells.flatMap((cell, index) => cell.reviewReason
            ? [{ index, reason: cell.reviewReason }] : []),
        }];
      })),
    };
  });
  const providers = Object.fromEntries(EXTRACTION_PROVIDERS.map((provider) => {
    const results = articleStates.map((article) => article.results[provider]);
    return [provider, {
      label: EXTRACTION_PROVIDER_LABELS[provider],
      configured: extractionProviderReady(provider),
      prepared: Boolean(plans[provider]),
      extractedCount: results.filter((result) => result.extracted).length,
      reviewCount: results.filter((result) => result.reviewFields.length).length,
    }];
  }));
  return Response.json({
    template: template ? {
      fileName: template.fileName,
      format: template.format,
      headers: JSON.parse(template.headersJson),
      columnGuidance: readColumnGuidance(template.schemaJson),
      preview: JSON.parse(template.previewJson),
      updatedAt: template.updatedAt,
    } : null,
    includedCount: articles.length,
    providers,
    articles: articleStates,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!(await hasActiveAccess(user.userId)))
    return Response.json({ error: 'An active plan or trial is required for data extraction.' }, { status: 402 });
  const { id } = await params;
  const review = await ownedReview(id, user.userId);
  if (!review) return Response.json({ error: 'Review not found.' }, { status: 404 });

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !/\.(csv|xlsx)$/i.test(file.name))
      return Response.json({ error: 'Upload a CSV or XLSX extraction sheet.' }, { status: 415 });
    if (!file.size || file.size > 5 * 1024 * 1024)
      return Response.json({ error: 'The extraction sheet must be 5 MB or smaller.' }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let parsed;
    try { parsed = readExtractionTemplate(file.name, bytes); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'The sheet could not be read.' }, { status: 422 }); }
    const saved = await saveTemplate(id, user.userId, file.name, bytes, parsed);
    if (!saved) return Response.json({ error: 'The extraction sheet could not be saved.' }, { status: 500 });
    return Response.json({ uploaded: true, headers: parsed.headers });
  }

  const body = await request.json().catch(() => ({})) as { action?: string; referenceId?: string; provider?: unknown; headers?: unknown; guidance?: unknown };
  if (body.action === 'create') {
    if (!Array.isArray(body.headers) || body.headers.length < 1 || body.headers.length > 16384 ||
      body.headers.some((header) => typeof header !== 'string' || !header.trim() || header.trim().length > 180))
      return Response.json({ error: 'Add at least one named column. Each name must be 180 characters or shorter.' }, { status: 400 });
    const names = body.headers.map((header) => String(header).trim());
    if (body.guidance !== undefined && (!Array.isArray(body.guidance) || body.guidance.length !== names.length ||
      body.guidance.some((note) => typeof note !== 'string' || note.length > 1000)))
      return Response.json({ error: 'Each optional column note must be 1,000 characters or shorter.' }, { status: 400 });
    if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length)
      return Response.json({ error: 'Each column needs a unique name.' }, { status: 400 });
    const fileName = 'EvidenceFlow-Columns.xlsx';
    const bytes = createExtractionWorkbook(names);
    const parsed = readExtractionTemplate(fileName, bytes);
    const guidance = Object.fromEntries(names.map((name, index) =>
      [name, Array.isArray(body.guidance) ? String(body.guidance[index]).trim() : '']));
    const saved = await saveTemplate(id, user.userId, fileName, bytes, parsed, guidance);
    if (!saved) return Response.json({ error: 'The columns could not be saved.' }, { status: 500 });
    return Response.json({ created: true, headers: names });
  }
  const template = await getTemplate(id, user.userId);
  if (!template) return Response.json({ error: 'Upload an extraction sheet first.' }, { status: 409 });
  const headers = JSON.parse(template.headersJson) as string[];
  const pico = {
    purpose: review.purpose, population: review.population, intervention: review.intervention,
    comparison: review.comparison, outcomes: review.outcomes,
    inclusion: review.inclusion, exclusion: review.exclusion,
  };
  if (body.action === 'analyze') {
    if (body.provider !== undefined && !isExtractionProvider(body.provider))
      return Response.json({ error: 'Choose a valid detective.' }, { status: 400 });
    const plans = readPlans(template.schemaJson);
    const selected = body.provider === undefined
      ? EXTRACTION_PROVIDERS.filter((provider) => extractionProviderReady(provider) && !plans[provider])
      : isExtractionProvider(body.provider) ? [body.provider] : [];
    if (!selected.length) return Response.json({ prepared: EXTRACTION_PROVIDERS.filter((provider) => Boolean(plans[provider])), errors: [] });
    const errors: string[] = [];
    try {
      for (const provider of selected) {
        try {
          plans[provider] = await analyzeExtractionSheet({
            headers, preview: JSON.parse(template.previewJson) as string[][], pico,
            guidance: readColumnGuidance(template.schemaJson),
          }, provider);
        } catch (error) {
          errors.push(`${EXTRACTION_PROVIDER_LABELS[provider]}: ${error instanceof Error ? error.message : 'Could not prepare the sheet.'}`);
        }
      }
      await env.DB.prepare('UPDATE extraction_templates SET schema_json = ? WHERE review_id = ? AND owner_id = ? AND updated_at = ?')
        .bind(JSON.stringify(plans), id, user.userId, template.updatedAt).run();
      return Response.json({ prepared: selected.filter((provider) => Boolean(plans[provider])), errors });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'The sheet could not be analyzed.' }, { status: 502 });
    }
  }
  if ((body.action !== 'extract' && body.action !== 'reextract') || !body.referenceId)
    return Response.json({ error: 'Choose a valid extraction action and article.' }, { status: 400 });
  const provider = body.provider === undefined ? 'watson' : body.provider;
  if (!isExtractionProvider(provider)) return Response.json({ error: 'Choose a valid detective.' }, { status: 400 });
  if (!extractionProviderReady(provider)) return Response.json({ error: `${EXTRACTION_PROVIDER_LABELS[provider]} is not configured.` }, { status: 409 });
  const columns = readPlans(template.schemaJson)[provider];
  if (!columns) return Response.json({ error: `Prepare the sheet for ${EXTRACTION_PROVIDER_LABELS[provider]} first.` }, { status: 409 });
  const articles = await includedFullTexts(id, user.userId);
  const article = articles.find((item) => item.id === body.referenceId);
  if (!article) return Response.json({ error: 'This article is no longer included.' }, { status: 409 });
  const existing = await env.DB.prepare(`SELECT template_updated_at AS templateUpdatedAt, evidence_json AS evidenceJson
    FROM extraction_records WHERE review_id = ? AND reference_id = ? AND provider = ?`)
    .bind(id, article.id, provider).first<{ templateUpdatedAt: number; evidenceJson: string }>();
  if (body.action === 'extract' && existing?.templateUpdatedAt === template.updatedAt &&
    isExtractionAudit(JSON.parse(existing.evidenceJson)))
    return Response.json({ referenceId: article.id, provider, alreadyExtracted: true });
  let articleText: string;
  try {
    articleText = await readPreparedFullText(article.r2Key, article.contentType);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The article TXT could not be prepared.' }, { status: 409 });
  }
  if (normalizedPdfText(articleText).length < 200 || articleText.length > 300_000)
    return Response.json({ error: 'This article needs a readable full text of 200–300,000 characters.' }, { status: 422 });
  try {
    const cacheKey = (model: 'haiku' | 'luna') =>
      `${article.r2Key}.extraction-${template.updatedAt}-${EXTRACTION_PIPELINE_VERSION}-${model}.json`;
    const cells = await extractArticle({
      provider, columns, pico,
      citation: { title: article.title, authors: article.authors, year: article.year,
        journal: article.journal, doi: article.doi, pmid: article.pmid },
      articleText,
      cache: {
        read: async (model) => {
          if (body.action === 'reextract') return null;
          const object = await env.FILES.get(cacheKey(model));
          if (!object) return null;
          const value = await object.json().catch(() => null);
          return Array.isArray(value) && value.length === columns.length &&
            value.every((cell, index) => cell && typeof cell === 'object' &&
              cell.header === columns[index].header && typeof cell.value === 'string' &&
              typeof cell.evidence === 'string') ? value as ExtractedCell[] : null;
        },
        write: async (model, modelCells) => {
          await env.FILES.put(cacheKey(model), JSON.stringify(modelCells), {
            httpMetadata: { contentType: 'application/json' },
          });
        },
      },
    });
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO extraction_records
      (id, review_id, reference_id, provider, template_updated_at, values_json, evidence_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_id, reference_id, provider) DO UPDATE SET
      template_updated_at=excluded.template_updated_at, values_json=excluded.values_json,
      evidence_json=excluded.evidence_json, updated_at=excluded.updated_at`).bind(
      crypto.randomUUID(), id, article.id, provider, template.updatedAt,
      JSON.stringify(cells.map((cell) => cell.value)),
      JSON.stringify({ pipelineVersion: EXTRACTION_PIPELINE_VERSION, cells }), now,
    ).run();
    await env.FILES.delete(cacheKey('haiku')).catch(() => undefined);
    await env.FILES.delete(cacheKey('luna')).catch(() => undefined);
    return Response.json({ referenceId: article.id, provider, filled: cells.filter((cell) => cell.value !== 'NR').length,
      reviewFields: cells.filter((cell) => cell.reviewReason).length,
      conflicts: cells.filter((cell) => cell.conflict).length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : `${EXTRACTION_PROVIDER_LABELS[provider]} could not extract this article.` }, { status: 502 });
  }
}

async function ownedReview(reviewId: string, ownerId: string) {
  return env.DB.prepare(`SELECT purpose, inclusion, exclusion, population, intervention, comparison, outcomes
    FROM reviews WHERE id = ? AND owner_id = ?`).bind(reviewId, ownerId)
    .first<Record<string, string | null>>();
}
async function getTemplate(reviewId: string, ownerId: string) {
  return env.DB.prepare(`SELECT file_name AS fileName, r2_key AS r2Key, format,
    headers_json AS headersJson, preview_json AS previewJson,
    worksheet_path AS worksheetPath, header_row AS headerRow,
    schema_json AS schemaJson, updated_at AS updatedAt
    FROM extraction_templates WHERE review_id = ? AND owner_id = ?`)
    .bind(reviewId, ownerId).first<StoredTemplate>();
}
function readPlans(value: string | null | undefined): Partial<Record<ExtractionProvider, ColumnPlan[]>> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed)) return {};
  if (!parsed || typeof parsed !== 'object') return {};
  return Object.fromEntries(EXTRACTION_PROVIDERS.flatMap((provider) => {
    const plan = (parsed as Record<string, unknown>)[provider];
    return Array.isArray(plan) ? [[provider, plan as ColumnPlan[]]] : [];
  })) as Partial<Record<ExtractionProvider, ColumnPlan[]>>;
}
function readColumnGuidance(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const guidance = (parsed as Record<string, unknown>).columnGuidance;
  if (!guidance || typeof guidance !== 'object' || Array.isArray(guidance)) return {};
  return Object.fromEntries(Object.entries(guidance).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string').map(([header, note]) => [header, note.slice(0, 1000)]));
}
function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

async function saveTemplate(
  reviewId: string, ownerId: string, fileName: string,
  bytes: Uint8Array, parsed: ExtractionTemplate,
  guidance?: Record<string, string>,
) {
  const previous = await getTemplate(reviewId, ownerId);
  const key = `${safePart(ownerId)}/${reviewId}/extraction/${crypto.randomUUID()}-${safePart(fileName)}`;
  const now = Date.now();
  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: parsed.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv' } });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO extraction_templates
        (review_id, owner_id, file_name, r2_key, format, headers_json, preview_json, worksheet_path, header_row, schema_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(review_id) DO UPDATE SET owner_id=excluded.owner_id, file_name=excluded.file_name,
        r2_key=excluded.r2_key, format=excluded.format, headers_json=excluded.headers_json,
        preview_json=excluded.preview_json, worksheet_path=excluded.worksheet_path,
        header_row=excluded.header_row, schema_json=excluded.schema_json, updated_at=excluded.updated_at`).bind(
        reviewId, ownerId, fileName.slice(0, 180), key, parsed.format,
        JSON.stringify(parsed.headers), JSON.stringify(parsed.preview), parsed.worksheetPath,
        parsed.headerRow, guidance ? JSON.stringify({ columnGuidance: guidance }) : null, now,
      ),
      env.DB.prepare('DELETE FROM extraction_records WHERE review_id = ?').bind(reviewId),
      env.DB.prepare("UPDATE reviews SET stage = 'extraction', updated_at = ? WHERE id = ? AND owner_id = ?")
        .bind(now, reviewId, ownerId),
    ]);
  } catch (error) {
    await env.FILES.delete(key);
    console.error('Extraction template save failed', error);
    return false;
  }
  if (previous) await env.FILES.delete(previous.r2Key).catch(() => undefined);
  return true;
}
