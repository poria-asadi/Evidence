export function publicationYearHeader(header: string) {
  return /^(?:year|publication\s+year|publish(?:ed|ing)?\s+year|year\s+(?:of\s+publication|published)|سال\s+انتشار)(?:\s*\([^)]*\))?$/i.test(header.trim());
}

export function citationPublicationYear(value: string | null | undefined) {
  return value?.match(/\b(?:18|19|20)\d{2}\b/)?.[0] || null;
}

export function studyCountryHeader(header: string) {
  return /^(?:country|study country|country of (?:study|research)|study (?:location|setting(?:\s+country)?)|location of study|کشور|کشور مطالعه|محل انجام مطالعه)(?:\s*\([^)]*\))?$/i.test(header.trim());
}
