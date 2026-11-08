import { env } from 'cloudflare:workers';
import { FULL_TEXT_PROMPT_VERSION } from '@/lib/llm-providers';

export type IncludedArticle = {
  id: string;
  title: string | null;
  authors: string | null;
  year: string | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  r2Key: string;
  contentType: string;
};

export async function includedFullTexts(reviewId: string, ownerId: string) {
  const result = await env.DB.prepare(`SELECT r.id, r.title, r.authors, r.year, r.journal, r.doi, r.pmid,
    f.r2_key AS r2Key, f.content_type AS contentType
    FROM full_text_files f
    JOIN reviews v ON v.id = f.review_id AND v.owner_id = ?
    JOIN "references" r ON r.id = f.reference_id AND r.review_id = f.review_id
    LEFT JOIN full_text_decisions d ON d.review_id = f.review_id AND d.reference_id = f.reference_id
    LEFT JOIN full_text_assessments ga ON ga.review_id = f.review_id AND ga.reference_id = f.reference_id AND ga.provider = 'gemini' AND ga.prompt_version = ? AND ga.status = 'complete'
    LEFT JOIN full_text_assessments oa ON oa.review_id = f.review_id AND oa.reference_id = f.reference_id AND oa.provider = 'openai' AND oa.prompt_version = ? AND oa.status = 'complete'
    LEFT JOIN full_text_assessments za ON za.review_id = f.review_id AND za.reference_id = f.reference_id AND za.provider = 'zeous' AND za.prompt_version = ? AND za.status = 'complete'
    WHERE f.review_id = ? AND f.owner_id = ? AND f.status = 'uploaded'
    AND (d.decision = 'include' OR (d.decision IS NULL AND
      ((CASE WHEN ga.decision = 'include' THEN 1 ELSE 0 END) +
       (CASE WHEN oa.decision = 'include' THEN 1 ELSE 0 END) +
       (CASE WHEN za.decision = 'include' THEN 1 ELSE 0 END)) >= 2))
    ORDER BY r.title COLLATE NOCASE, r.id`)
    .bind(ownerId, FULL_TEXT_PROMPT_VERSION, FULL_TEXT_PROMPT_VERSION,
      FULL_TEXT_PROMPT_VERSION, reviewId, ownerId)
    .all<IncludedArticle>();
  return result.results;
}

export function readableArticleText(value: string, contentType: string) {
  if (!contentType.includes('xml')) return value;
  return value.replace(/<ref-list\b[^>]*>[\s\S]*?<\/ref-list>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}
