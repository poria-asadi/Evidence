import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  articleTextFromPages,
  retainsReadablePdfText,
} from '../lib/searchable-pdf.ts';

const sourcePages = [
  'Methods: Participants received a documented intervention. The study reports original methods and eligibility criteria.',
  'Results: Outcomes were measured and reported with comparison data. The findings are available for full-text screening.',
];
const document = await PDFDocument.create();
const font = await document.embedFont(StandardFonts.Helvetica);
for (const text of sourcePages) {
  const page = document.addPage([612, 792]);
  page.drawText(text, { x: 40, y: 740, size: 10, font });
}
const original = new Uint8Array(await document.save({ useObjectStreams: false }));
const { default: createQpdf } = await import('@neslinesli93/qpdf-wasm');
const qpdf = await createQpdf({
  locateFile: () =>
    new URL('../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', import.meta.url).pathname,
});
const fs = qpdf.FS as typeof qpdf.FS & { writeFile(path: string, data: Uint8Array): void };
fs.writeFile('/input.pdf', original);
assert.equal(qpdf.callMain([
  '--object-streams=generate',
  '--recompress-flate',
  '--compression-level=9',
  '/input.pdf',
  '/output.pdf',
]), 0);
const optimized = fs.readFile('/output.pdf');
const optimizedBytes = optimized.byteLength;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const task = pdfjs.getDocument({ data: optimized, verbosity: 0 });
const candidatePages: string[] = [];
try {
  const result = await task.promise;
  for (let pageNumber = 1; pageNumber <= result.numPages; pageNumber += 1) {
    const page = await result.getPage(pageNumber);
    candidatePages.push((await page.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' '));
    page.cleanup();
  }
} finally {
  await task.destroy();
}
assert.ok(retainsReadablePdfText(sourcePages, candidatePages));
assert.equal(retainsReadablePdfText(sourcePages, ['Page header', '']), false);
assert.match(articleTextFromPages(candidatePages), /PAGE 2\nResults/);
assert.ok(optimizedBytes < original.byteLength);
const wasm = await readFile(new URL('../public/qpdf.wasm', import.meta.url));
assert.ok(wasm.byteLength > 1_000_000);
console.log(JSON.stringify({ originalBytes: original.length, optimizedBytes, pages: candidatePages.length, readable: true }));
