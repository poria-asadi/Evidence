export type TableExcerpt = { label: string; page: number | null; text: string };

export function tableExcerptsFromTxt(articleText: string): TableExcerpt[] {
  const lines = articleText.split('\n');
  const excerpts: TableExcerpt[] = [];
  let page: number | null = null;
  let remaining = 18000;
  for (let index = 0; index < lines.length && excerpts.length < 12 && remaining > 0; index++) {
    const pageMarker = lines[index].match(/^PAGE\s+(\d+)\s*$/i);
    if (pageMarker) { page = Number(pageMarker[1]); continue; }
    const table = lines[index].match(/^\s*(Table\s+\d+[a-z]?)\s*[.:–-]/i);
    if (!table) continue;
    const next = Math.min(lines.length, index + 36);
    const contents: string[] = [];
    for (let line = index; line < next; line++) {
      if (line > index && /^\s*Table\s+\d+[a-z]?\s*[.:–-]/i.test(lines[line])) break;
      contents.push(lines[line]);
    }
    const text = contents.join('\n').slice(0, Math.min(4500, remaining));
    remaining -= text.length;
    excerpts.push({ label: table[1], page, text });
  }
  return excerpts;
}
