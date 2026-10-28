export type CanonicalReference = {
  title: string | null;
  abstract: string | null;
  authors: string | null;
  year: string | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  rawSource: string;
};

export type ImportDiagnostics = {
  sourceDatabase: 'PubMed' | 'Scopus' | 'Web of Science' | 'Embase' | 'Unknown';
  coverage: {
    title: number;
    abstract: number;
    authors: number;
    year: number;
    identifier: number;
  };
  warnings: string[];
};

export function parseReferenceFile(
  name: string,
  text: string,
): CanonicalReference[] {
  const lower = name.toLowerCase();
  const normalizedText = normalizeText(text);
  const records = lower.endsWith('.csv')
    ? parseCsv(normalizedText)
    : lower.endsWith('.nbib') || /^PMID\s*-\s*/m.test(normalizedText)
      ? parseNbib(normalizedText)
      : parseRis(normalizedText);
  if (!records.length)
    throw new Error(
      'No references were recognized. Use an RIS, PubMed NBIB, CSV, or bibliographic TXT export and try again.',
    );
  if (records.length > 25000)
    throw new Error('Each file can contain up to 25,000 records.');
  return records;
}

export function diagnoseReferenceFile(
  name: string,
  text: string,
  records: CanonicalReference[],
): ImportDiagnostics {
  const sample = normalizeText(text).slice(0, 12000).toLowerCase();
  const lowerName = name.toLowerCase();
  const sourceDatabase = /pubmed|pmid\s*-|dp\s{0,2}-\s*nlm/.test(
    `${lowerName}\n${sample}`,
  )
    ? 'PubMed'
    : /scopus|eid,|source title/.test(`${lowerName}\n${sample}`)
      ? 'Scopus'
      : /web of science|wos|ut\s{0,2}-\s*wos:/.test(`${lowerName}\n${sample}`)
        ? 'Web of Science'
        : /embase|embase accession|an\s{0,2}-\s*\d{8,}/.test(
              `${lowerName}\n${sample}`,
            )
          ? 'Embase'
          : 'Unknown';
  const percent = (count: number) =>
    records.length ? Math.round((count / records.length) * 100) : 0;
  const coverage = {
    title: percent(records.filter((record) => record.title).length),
    abstract: percent(records.filter((record) => record.abstract).length),
    authors: percent(records.filter((record) => record.authors).length),
    year: percent(records.filter((record) => record.year).length),
    identifier: percent(
      records.filter((record) => record.doi || record.pmid).length,
    ),
  };
  const warnings: string[] = [];
  if (coverage.title < 95)
    warnings.push(
      `${100 - coverage.title}% of records have no recognized title.`,
    );
  if (coverage.abstract < 70)
    warnings.push(
      `${100 - coverage.abstract}% of records have no abstract; they will require careful screening.`,
    );
  if (coverage.identifier < 60)
    warnings.push(
      'Many records lack DOI or PMID identifiers, so title-based duplicate checks are important.',
    );
  if (sourceDatabase === 'Unknown')
    warnings.push(
      'The source database was not identified automatically. Verify the mapped fields before screening.',
    );
  return { sourceDatabase, coverage, warnings };
}

function normalizeText(text: string) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function parseCsv(text: string): CanonicalReference[] {
  const rows = csvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => normalizeHeader(value));
  const find = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header));
  const columns = {
    title: find('title', 'article title', 'document title'),
    abstract: find('abstract', 'summary'),
    authors: find('authors', 'author full names', 'author(s)', 'author'),
    year: find('year', 'publication year', 'cover date', 'publication date'),
    journal: find('source title', 'journal', 'publication name', 'source'),
    doi: find('doi', 'digital object identifier'),
    pmid: find('pmid', 'pubmed id', 'pubmedid'),
  };
  const cell = (row: string[], index: number) =>
    index >= 0 && row[index]?.trim() ? row[index].trim() : null;
  return rows
    .slice(1)
    .map((row) => ({
      title: cell(row, columns.title),
      abstract: cell(row, columns.abstract),
      authors: cell(row, columns.authors),
      year: yearOf(cell(row, columns.year)),
      journal: cell(row, columns.journal),
      doi: normalizeDoi(cell(row, columns.doi)),
      pmid: digits(cell(row, columns.pmid)),
      rawSource: JSON.stringify(
        Object.fromEntries(
          headers.map((header, index) => [
            header || `column_${index + 1}`,
            row[index] ?? '',
          ]),
        ),
      ),
    }))
    .filter((record) => record.title || record.doi || record.pmid);
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      cell += '"';
      index++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function parseRis(text: string): CanonicalReference[] {
  const blocks = text
    .split(/^ER\s{0,2}-\s*$/m)
    .map((value) => value.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const values = new Map<string, string[]>();
      for (const line of block.split('\n')) {
        const match = line.match(/^([A-Z0-9]{2})\s{0,2}-\s?(.*)$/);
        if (match)
          values.set(match[1], [
            ...(values.get(match[1]) ?? []),
            match[2].trim(),
          ]);
        else if (line.trim()) {
          const last = [...values.keys()].at(-1);
          if (last)
            values.get(last)![values.get(last)!.length - 1] +=
              ` ${line.trim()}`;
        }
      }
      const doi = normalizeDoi(
        first(values, 'DO') ?? findDoi(first(values, 'UR')),
      );
      return {
        title: first(values, 'TI') ?? first(values, 'T1'),
        abstract: first(values, 'AB') ?? first(values, 'N2'),
        authors: join(values, 'AU') ?? join(values, 'A1'),
        year: yearOf(first(values, 'PY') ?? first(values, 'Y1')),
        journal:
          first(values, 'JO') ?? first(values, 'JF') ?? first(values, 'T2'),
        doi,
        pmid: digits(first(values, 'AN')),
        rawSource: block,
      };
    })
    .filter((record) => record.title || record.doi || record.pmid);
}

function parseNbib(text: string): CanonicalReference[] {
  const blocks = text
    .split(/\n\s*\n(?=PMID\s*-)/)
    .map((value) => value.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      const values = new Map<string, string[]>();
      let current = '';
      for (const line of block.split('\n')) {
        const match = line.match(/^([A-Z0-9]{2,5})\s*-\s?(.*)$/);
        if (match) {
          current = match[1];
          values.set(current, [
            ...(values.get(current) ?? []),
            match[2].trim(),
          ]);
        } else if (current && line.trim())
          values.get(current)![values.get(current)!.length - 1] +=
            ` ${line.trim()}`;
      }
      const aids = values.get('AID') ?? [];
      return {
        title: first(values, 'TI'),
        abstract: first(values, 'AB'),
        authors: join(values, 'FAU') ?? join(values, 'AU'),
        year: yearOf(first(values, 'DP')),
        journal: first(values, 'JT') ?? first(values, 'TA'),
        doi: normalizeDoi(
          aids.find((value) => /\[doi\]/i.test(value)) ??
            aids.find((value) => /10\.\d{4,9}\//.test(value)),
        ),
        pmid: digits(first(values, 'PMID')),
        rawSource: block,
      };
    })
    .filter((record) => record.title || record.doi || record.pmid);
}

function first(map: Map<string, string[]>, key: string) {
  return map.get(key)?.[0]?.trim() || null;
}
function join(map: Map<string, string[]>, key: string) {
  const value = map.get(key)?.filter(Boolean).join('; ');
  return value || null;
}
function yearOf(value: string | null | undefined) {
  return value?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
}
function digits(value: string | null | undefined) {
  return value?.match(/\d{5,10}/)?.[0] ?? null;
}
function findDoi(value: string | null | undefined) {
  return value?.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0] ?? null;
}
function normalizeDoi(value: string | null | undefined) {
  if (!value) return null;
  const found = findDoi(value.replace(/\[doi\]/gi, '')) ?? value;
  return (
    found
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .trim()
      .toLowerCase() || null
  );
}
