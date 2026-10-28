import type { CanonicalReference } from '@/lib/reference-parser';

export type MatchCandidate = Pick<
  CanonicalReference,
  'title' | 'authors' | 'year' | 'doi' | 'pmid'
> & { id: string };
export type DuplicateMatch = {
  id: string;
  matchType: 'doi' | 'pmid' | 'normalized_title' | 'title_author_year';
  confidence: number;
};

export function createDuplicateMatcher(initial: MatchCandidate[]) {
  const byDoi = new Map<string, MatchCandidate>();
  const byPmid = new Map<string, MatchCandidate>();
  const byTitle = new Map<string, MatchCandidate>();
  const byAuthorYear = new Map<string, MatchCandidate[]>();

  function add(candidate: MatchCandidate) {
    if (candidate.doi && !byDoi.has(candidate.doi))
      byDoi.set(candidate.doi, candidate);
    if (candidate.pmid && !byPmid.has(candidate.pmid))
      byPmid.set(candidate.pmid, candidate);
    const title = normalizeTitle(candidate.title);
    if (title.length >= 24 && !byTitle.has(title))
      byTitle.set(title, candidate);
    const key = authorYearKey(candidate);
    if (key) {
      const bucket = byAuthorYear.get(key) ?? [];
      bucket.push(candidate);
      byAuthorYear.set(key, bucket);
    }
  }

  for (const candidate of initial) add(candidate);

  return {
    add,
    find(record: CanonicalReference): DuplicateMatch | null {
      const doi = record.doi ? byDoi.get(record.doi) : undefined;
      if (doi) return { id: doi.id, matchType: 'doi', confidence: 100 };
      const pmid = record.pmid ? byPmid.get(record.pmid) : undefined;
      if (pmid) return { id: pmid.id, matchType: 'pmid', confidence: 100 };
      const title = normalizeTitle(record.title);
      if (title.length < 24) return null;
      const exactTitle = byTitle.get(title);
      if (exactTitle)
        return {
          id: exactTitle.id,
          matchType: 'normalized_title',
          confidence: 96,
        };
      const key = authorYearKey(record);
      if (!key) return null;
      let best: { candidate: MatchCandidate; score: number } | null = null;
      for (const candidate of byAuthorYear.get(key) ?? []) {
        const candidateTitle = normalizeTitle(candidate.title);
        if (candidateTitle.length < 24) continue;
        const score = dice(title, candidateTitle);
        if (score >= 0.75 && (!best || score > best.score))
          best = { candidate, score };
      }
      return best
        ? {
            id: best.candidate.id,
            matchType: 'title_author_year',
            confidence: Math.round(best.score * 100),
          }
        : null;
    },
  };
}

export function findDuplicate(
  record: CanonicalReference,
  candidates: MatchCandidate[],
): DuplicateMatch | null {
  const doi =
    record.doi && candidates.find((candidate) => candidate.doi === record.doi);
  if (doi) return { id: doi.id, matchType: 'doi', confidence: 100 };
  const pmid =
    record.pmid &&
    candidates.find((candidate) => candidate.pmid === record.pmid);
  if (pmid) return { id: pmid.id, matchType: 'pmid', confidence: 100 };
  const title = normalizeTitle(record.title);
  if (title.length < 24) return null;
  const exactTitle = candidates.find(
    (candidate) => normalizeTitle(candidate.title) === title,
  );
  if (exactTitle)
    return { id: exactTitle.id, matchType: 'normalized_title', confidence: 96 };
  const author = firstAuthor(record.authors);
  if (!record.year || !author) return null;
  let best: { candidate: MatchCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    if (
      candidate.year !== record.year ||
      firstAuthor(candidate.authors) !== author
    )
      continue;
    const candidateTitle = normalizeTitle(candidate.title);
    if (candidateTitle.length < 24) continue;
    const score = dice(title, candidateTitle);
    // Surface plausible title matches from 75% upward. Import handling
    // automatically resolves only scores above 90; the remainder requires a
    // researcher decision.
    if (score >= 0.75 && (!best || score > best.score))
      best = { candidate, score };
  }
  return best
    ? {
        id: best.candidate.id,
        matchType: 'title_author_year',
        confidence: Math.round(best.score * 100),
      }
    : null;
}

function normalizeTitle(value: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function firstAuthor(value: string | null) {
  return (value ?? '')
    .split(';')[0]
    .trim()
    .split(/[\s,]+/)[0]
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 28);
}
function authorYearKey(
  value: Pick<CanonicalReference, 'authors' | 'year'>,
) {
  const author = firstAuthor(value.authors);
  return value.year && author ? `${value.year}:${author}` : null;
}
function dice(left: string, right: string) {
  if (left === right) return 1;
  const grams = (value: string) => {
    const result: string[] = [];
    for (let index = 0; index < value.length - 1; index++)
      result.push(value.slice(index, index + 2));
    return result;
  };
  const pool = grams(right);
  let overlap = 0;
  for (const gram of grams(left)) {
    const index = pool.indexOf(gram);
    if (index >= 0) {
      overlap++;
      pool.splice(index, 1);
    }
  }
  return (
    (2 * overlap) /
    (Math.max(1, left.length - 1) + Math.max(1, right.length - 1))
  );
}
