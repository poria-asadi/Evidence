export function normalizedPdfText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function retainsReadablePdfText(
  sourcePages: string[],
  candidatePages: string[],
) {
  if (sourcePages.length !== candidatePages.length) return false;
  return sourcePages.every((source, index) => {
    const expected = normalizedPdfText(source);
    const actual = normalizedPdfText(candidatePages[index] || '');
    if (expected.length < 80) return actual === expected;
    if (actual.length < expected.length * 0.9) return false;
    const words = expected.split(' ').filter((word) => word.length >= 4);
    const sampleStep = Math.max(1, Math.floor(words.length / 40));
    const sample = words.filter((_, wordIndex) => wordIndex % sampleStep === 0);
    return sample.every((word) => actual.includes(word));
  });
}

export function articleTextFromPages(pages: string[]) {
  return pages
    .map((page, index) => `PAGE ${index + 1}\n${page.trim()}`)
    .join('\n\n');
}
