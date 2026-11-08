import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/current-user';
import { includedFullTexts } from '@/lib/extraction-data';
import { completeExtractionSheet, type ExtractionTemplate } from '@/lib/extraction-sheet';
import { EXTRACTION_PROVIDER_LABELS, isExtractionProvider } from '@/lib/extraction-providers';
import { normalizeExtractionValue } from '@/lib/extraction-resilience';
import { isExtractionAudit } from '@/lib/extraction-reconciliation';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const provider = new URL(request.url).searchParams.get('provider') || 'watson';
  if (!isExtractionProvider(provider)) return Response.json({ error: 'Choose a valid detective.' }, { status: 400 });
  const { id } = await params;
  const template = await env.DB.prepare(`SELECT t.file_name AS fileName, t.r2_key AS r2Key,
    t.format, t.headers_json AS headersJson, t.preview_json AS previewJson,
    t.worksheet_path AS worksheetPath, t.header_row AS headerRow, t.updated_at AS updatedAt
    FROM extraction_templates t JOIN reviews v ON v.id = t.review_id
    WHERE t.review_id = ? AND t.owner_id = ? AND v.owner_id = ?`)
    .bind(id, user.userId, user.userId).first<{
      fileName: string; r2Key: string; format: 'csv' | 'xlsx'; headersJson: string;
      previewJson: string; worksheetPath: string | null; headerRow: number; updatedAt: number;
    }>();
  if (!template) return Response.json({ error: 'Upload an extraction sheet first.' }, { status: 404 });
  const [source, articles, records] = await Promise.all([
    env.FILES.get(template.r2Key), includedFullTexts(id, user.userId),
    env.DB.prepare(`SELECT reference_id AS referenceId, values_json AS valuesJson, evidence_json AS evidenceJson
      FROM extraction_records WHERE review_id = ? AND template_updated_at = ? AND provider = ?`)
      .bind(id, template.updatedAt, provider).all<{ referenceId: string; valuesJson: string; evidenceJson: string }>(),
  ]);
  if (!source) return Response.json({ error: 'The original extraction sheet is missing.' }, { status: 404 });
  const values = new Map(records.results.flatMap((record) => {
    const audit = JSON.parse(record.evidenceJson) as unknown;
    return isExtractionAudit(audit) ? [[record.referenceId, {
      values: (JSON.parse(record.valuesJson) as string[]).map(normalizeExtractionValue),
      conflicts: audit.cells.map((cell) => cell.conflict),
    }] as const] : [];
  }));
  const completedArticles = articles.flatMap((article) => values.has(article.id) ? [values.get(article.id)!] : []);
  const rows = completedArticles.map((article) => article.values);
  if (!rows.length) return Response.json({ error: 'No article has been extracted yet.' }, { status: 409 });
  const completed = completeExtractionSheet(new Uint8Array(await source.arrayBuffer()), {
    format: template.format, headers: JSON.parse(template.headersJson) as string[],
    preview: JSON.parse(template.previewJson) as string[][],
    worksheetPath: template.worksheetPath, headerRow: template.headerRow,
  } satisfies ExtractionTemplate, rows, completedArticles.map((article) => article.conflicts));
  const baseName = template.fileName.replace(/\.(csv|xlsx)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const fileName = `${baseName || 'extraction'}-${EXTRACTION_PROVIDER_LABELS[provider].toLowerCase()}-completed.${template.format}`;
  return new Response(completed as BodyInit, {
    headers: {
      'content-type': template.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'private, no-store',
    },
  });
}
