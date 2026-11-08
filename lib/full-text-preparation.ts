import { env } from 'cloudflare:workers';
import { extractPdfText } from './pdf-to-text';

export const FULL_TEXT_PIPELINE_VERSION = '6';

export async function readPreparedFullText(r2Key: string, contentType?: string) {
  const stored = await env.FILES.get(`${r2Key}.txt`);
  if ((!stored || stored.size === 0 || stored.customMetadata?.pipelineVersion !== FULL_TEXT_PIPELINE_VERSION) &&
    contentType === 'application/pdf') return ensureFullTextPrepared(r2Key, contentType);
  if (!stored || stored.size === 0 || stored.customMetadata?.pipelineVersion !== FULL_TEXT_PIPELINE_VERSION)
    throw new Error('The complete article TXT from full-text screening is missing or outdated. Prepare the full text in step 4 again.');
  return stored.text();
}

export async function ensureFullTextPrepared(r2Key: string, contentType: string) {
  if (contentType !== 'application/pdf') throw new Error('Upload a PDF full text before screening.');
  const original = await env.FILES.get(r2Key);
  if (!original || original.size === 0) throw new Error('The uploaded PDF is missing or empty. Upload it again.');
  const textKey = `${r2Key}.txt`;
  const stored = await env.FILES.get(textKey);
  if (stored?.customMetadata?.pipelineVersion === FULL_TEXT_PIPELINE_VERSION)
    return stored.text();

  const text = await extractPdfText(await original.arrayBuffer());
  if (text.length < 200) throw new Error('The article has no readable full text.');
  await env.FILES.put(textKey, text, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    customMetadata: { pipelineVersion: FULL_TEXT_PIPELINE_VERSION },
  });
  await deleteLegacyFullTextSections(r2Key);
  return text;
}

export async function deleteLegacyFullTextSections(r2Key: string) {
  const names = ['title-page', 'abstract', 'introduction', 'methods', 'results',
    'discussion-and-remainder', 'tables', 'heading-footer'];
  await Promise.allSettled([
    env.FILES.delete(`${r2Key}.sections.json`),
    ...names.map((name, index) => env.FILES.delete(
      `${r2Key}.section-${String(index + 1).padStart(2, '0')}-${name}.txt`,
    )),
  ]);
}
