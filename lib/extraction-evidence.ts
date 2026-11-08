function normalized(value: string) {
  return value.normalize('NFKC')
    .replace(/(?:^|\n)[ \t]*PAGE[ \t]+\d+[ \t]*\n/gi, ' ')
    .replace(/\u00ad/g, '')
    .replace(/([\p{L}])-\s+([\p{L}])/gu, '$1$2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type EvidenceTrace = {
  source: 'article' | 'citation';
  page: number | null;
  start: number;
  end: number;
  excerpt: string;
};

type SearchIndex = { text: string; offsets: number[]; original: string; source: EvidenceTrace['source'] };

function searchIndex(original: string, source: EvidenceTrace['source']): SearchIndex {
  const flattened: { char: string; offset: number }[] = [];
  for (let index = 0; index < original.length;) {
    const page = (index === 0 || original[index - 1] === '\n')
      ? original.slice(index).match(/^\s*PAGE\s+\d+\s*\n/i) : null;
    if (page) { index += page[0].length; continue; }
    const char = String.fromCodePoint(original.codePointAt(index)!);
    if (char !== '\u00ad') flattened.push({ char, offset: index });
    index += char.length;
  }
  const joined: typeof flattened = [];
  for (let index = 0; index < flattened.length; index++) {
    if (flattened[index].char === '-' && /\p{L}/u.test(flattened[index - 1]?.char || '')) {
      let next = index + 1;
      while (next < flattened.length && /\s/u.test(flattened[next].char)) next++;
      if (next > index + 1 && /\p{L}/u.test(flattened[next]?.char || '')) {
        index = next - 1;
        continue;
      }
    }
    joined.push(flattened[index]);
  }
  let text = '';
  const offsets: number[] = [];
  for (const { char, offset } of joined) {
    for (const normalizedChar of char.normalize('NFKC').toLowerCase()) {
      const part = /[\p{L}\p{N}]/u.test(normalizedChar) ? normalizedChar : ' ';
      if (part === ' ' && (!text || text.endsWith(' '))) continue;
      text += part;
      offsets.push(offset);
    }
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); offsets.pop(); }
  return { text, offsets, original, source };
}

export function createEvidenceLocator(articleText: string, citationText: string) {
  const indexes = [searchIndex(articleText, 'article'), searchIndex(citationText, 'citation')];
  const pages = [...articleText.matchAll(/(?:^|\n)PAGE\s+(\d+)\s*\n/g)]
    .map((match) => ({ offset: match.index + (match[0].startsWith('\n') ? 1 : 0), number: Number(match[1]) }));
  return (evidence: string): EvidenceTrace | null => {
    const quote = normalized(evidence);
    if (!quote) return null;
    for (const index of indexes) {
      const found = index.text.indexOf(quote);
      if (found < 0) continue;
      const start = index.offsets[found];
      const end = index.offsets[found + quote.length - 1] + 1;
      const page = index.source === 'article'
        ? pages.filter((item) => item.offset <= start).at(-1)?.number ?? null : null;
      return { source: index.source, page, start, end,
        excerpt: index.original.slice(Math.max(0, start - 220), Math.min(index.original.length, end + 220)) };
    }
    return null;
  };
}

export function evidenceAppearsInArticle(articleText: string, evidence: string) {
  const quote = normalized(evidence);
  return Boolean(quote && normalized(articleText).includes(quote));
}
