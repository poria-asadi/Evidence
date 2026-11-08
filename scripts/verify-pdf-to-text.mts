import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText, pageTextFromItems } from '../lib/pdf-to-text.ts';

assert.equal(pageTextFromItems([
  { str: 'Table 1', width: 35, transform: [1, 0, 0, 1, 30, 400], hasEOL: true },
  { str: 'Group', width: 30, transform: [1, 0, 0, 1, 30, 380] },
  { str: 'N', width: 10, transform: [1, 0, 0, 1, 110, 380], hasEOL: true },
  { str: 'Control', width: 35, transform: [1, 0, 0, 1, 30, 360] },
  { str: '25', width: 10, transform: [1, 0, 0, 1, 110, 360] },
]), 'Table 1\nGroup\tN\nControl\t25');

async function makePdf(readablePages: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
    const page = pdf.addPage();
    if (pageNumber >= readablePages) continue;
    page.drawText(`Journal heading 2026 - page ${pageNumber + 1}`, { x: 30, y: 770, font, size: 9 });
    for (let line = 0; line < 12; line += 1)
      page.drawText(`Article page ${pageNumber + 1} line ${line}: Study methods and results remain readable.`, {
        x: 30, y: 700 - line * 20, font, size: 10,
      });
    page.drawText(`Table ${pageNumber + 1}: Treatment results`, { x: 30, y: 410, font, size: 10 });
    page.drawText(`Group A | 18 patients | 72 percent recovered`, { x: 30, y: 390, font, size: 10 });
    page.drawText(`Figure ${pageNumber + 1}: Regenerated nerve fibers after surgery`, { x: 30, y: 370, font, size: 10 });
    page.drawText(`Footer DOI 10.1234/test-${pageNumber + 1}`, { x: 30, y: 25, font, size: 9 });
  }
  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const originalPdf = await makePdf(3);
const originalSize = originalPdf.byteLength;
const complete = await extractPdfText(originalPdf);
assert.match(complete, /PAGE 3/);
for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
  assert.match(complete, new RegExp(`Journal heading 2026 - page ${pageNumber}`));
  assert.match(complete, new RegExp(`Table ${pageNumber}: Treatment results`));
  assert.match(complete, /Group A \| 18 patients \| 72 percent recovered/);
  assert.match(complete, new RegExp(`Figure ${pageNumber}: Regenerated nerve fibers after surgery`));
  assert.match(complete, new RegExp(`Footer DOI 10\\.1234/test-${pageNumber}`));
}
assert.equal(originalPdf.byteLength, originalSize, 'PDF extraction must not consume the PDF stored in R2');
assert.equal(new TextDecoder().decode(originalPdf.slice(0, 5)), '%PDF-');
await assert.rejects(extractPdfText(await makePdf(1)), /no readable text on page\(s\) 2, 3/);
console.log('PDF worker and whole-document text coverage verified.');
