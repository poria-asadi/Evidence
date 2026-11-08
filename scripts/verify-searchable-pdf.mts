import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
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

// A large, losslessly embedded color image exercises the compression path
// that structural PDF rewriting alone cannot reduce.
const imageDocument = await PDFDocument.create();
const image = await imageDocument.embedPng(noisyPng(768));
const imagePage = imageDocument.addPage([612, 792]);
imagePage.drawImage(image, { x: 40, y: 120, width: 532, height: 532 });
imagePage.drawText(sourcePages[0], { x: 40, y: 700, size: 10, font: await imageDocument.embedFont(StandardFonts.Helvetica) });
const imageOriginal = new Uint8Array(await imageDocument.save({ useObjectStreams: false }));
fs.writeFile('/image-input.pdf', imageOriginal);
assert.equal(qpdf.callMain([
  '--object-streams=generate', '--recompress-flate', '--compression-level=9',
  '--optimize-images', '--jpeg-quality=90', '--oi-min-width=512',
  '--oi-min-height=512', '/image-input.pdf', '/image-output.pdf',
]), 0);
const imageOptimized = fs.readFile('/image-output.pdf');
const imageOptimizedBytes = imageOptimized.byteLength;
assert.ok(imageOptimizedBytes < imageOriginal.byteLength * 0.8);
const imageTask = pdfjs.getDocument({ data: imageOptimized, verbosity: 0 });
try {
  const page = await (await imageTask.promise).getPage(1);
  const text = (await page.getTextContent()).items.map((item) => ('str' in item ? item.str : '')).join(' ');
  assert.ok(retainsReadablePdfText([sourcePages[0]], [text]));
} finally {
  await imageTask.destroy();
}
console.log(JSON.stringify({ imageOriginalBytes: imageOriginal.byteLength, imageOptimizedBytes, readable: true }));

function noisyPng(size: number) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  let state = 123456789;
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    for (let x = 0; x < size; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const offset = row + 1 + x * 3;
      raw[offset] = (x + (state & 31)) & 255;
      raw[offset + 1] = (y + ((state >>> 8) & 31)) & 255;
      raw[offset + 2] = ((x + y) / 2 + ((state >>> 16) & 31)) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const chunk = (name: string, data: Buffer) => {
    const nameBytes = Buffer.from(name);
    const body = Buffer.concat([nameBytes, data]);
    const output = Buffer.alloc(body.length + 8);
    output.writeUInt32BE(data.length, 0);
    body.copy(output, 4);
    output.writeUInt32BE(crc32(body), body.length + 4);
    return output;
  };
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
