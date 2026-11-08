import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { articleTextFromPages, normalizedPdfText } from './searchable-pdf.ts';

type PositionedText = { str: string; hasEOL?: boolean; width?: number; transform?: number[] };

// Keep the PDF text-stream order, while restoring row boundaries and wide table gaps.
// Sorting the entire page by y would interleave the columns of two-column articles.
export function pageTextFromItems(items: PositionedText[]) {
  let result = '';
  let previous: PositionedText | null = null;
  for (const item of items) {
    const part = item.str.replace(/\s+/g, ' ').trim();
    if (!part) {
      if (item.hasEOL && result && !result.endsWith('\n')) result += '\n';
      continue;
    }
    if (previous && result && !result.endsWith('\n')) {
      const x = item.transform?.[4];
      const y = item.transform?.[5];
      const oldX = previous.transform?.[4];
      const oldY = previous.transform?.[5];
      const lineBreak = previous.hasEOL || (y !== undefined && oldY !== undefined && Math.abs(y - oldY) > 3);
      const gap = x !== undefined && oldX !== undefined ? x - oldX - (previous.width || 0) : 0;
      result += lineBreak ? '\n' : gap > 18 ? '\t' : ' ';
    }
    result += part;
    if (item.hasEOL) result += '\n';
    previous = item;
  }
  return result.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfText(bytes: ArrayBuffer) {
  // Workers cannot resolve PDF.js's runtime `./pdf.worker.mjs` import after
  // Vite moves pdf.mjs into deps_rsc. Register the bundled handler directly.
  (globalThis as typeof globalThis & { pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler } }).pdfjsWorker = { WorkerMessageHandler };
  // PDF.js transfers its input buffer to its worker. Keep the original bytes
  // intact because callers store the PDF in R2 after extracting its text.
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)), useSystemFonts: true });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pageTextFromItems(content.items.filter((item) => 'str' in item) as PositionedText[]));
      page.cleanup();
    }
    const text = articleTextFromPages(pages);
    if (normalizedPdfText(text).length < 200)
      throw new Error('This PDF has no readable text layer. Upload a searchable PDF with OCR text.');
    const unreadablePages = pages.flatMap((pageText, index) =>
      normalizedPdfText(pageText).length < 10 ? [index + 1] : []);
    if (unreadablePages.length)
      throw new Error(`The PDF has no readable text on page(s) ${unreadablePages.join(', ')}. Upload a complete searchable PDF with OCR text.`);
    if (text.length > 300_000)
      throw new Error('The extracted article text exceeds 300,000 characters.');
    return text;
  } finally {
    await task.destroy();
  }
}
