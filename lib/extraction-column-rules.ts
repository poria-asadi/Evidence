import type { ColumnPlan } from './extraction-resilience.ts';
import { publicationYearHeader, studyCountryHeader } from './extraction-year.ts';

const MEAN = /\b(?:mean|average)\b|میانگین/i;
const MEDIAN = /\bmedian\b|میانه/i;
const SD = /\b(?:sd|s\.d\.|standard deviation|std\.? dev\.?|standard dev\.)\b|انحراف معیار/i;
const NUMERIC_HEADER = /\b(?:age|year|n|number|count|sample size|percentage|percent|rate|score|length|duration|follow.?up|time|bmi|rom|p.?value|volume|weight|height)\b|سن|تعداد|درصد|نمره|طول|مدت/i;
const CENTRAL_HEADER = /\b(?:age|bmi|follow.?up(?:\s+(?:time|duration))?|graft length)\b|سن|مدت پیگیری/i;
const STUDY_DESIGN = /\b(?:study\s+(?:design|type)|design\s+of\s+(?:the\s+)?study|type\s+of\s+study)\b|طراحی مطالعه|نوع مطالعه/i;

export function studyDesignHeader(header: string) { return STUDY_DESIGN.test(header.trim()); }

export function statisticForHeader(header: string): NonNullable<ColumnPlan['statistic']> {
  const mean = MEAN.test(header);
  const median = MEDIAN.test(header);
  const sd = SD.test(header);
  if (mean && median) return 'central';
  if (mean) return 'mean';
  if (median) return 'median';
  if (sd && !mean) return 'sd';
  if (CENTRAL_HEADER.test(header)) return 'central';
  return 'none';
}

export function specializeExtractionColumn(column: ColumnPlan): ColumnPlan {
  if (publicationYearHeader(column.header)) return {
    ...column, kind: 'metadata', valueFormat: 'numeric', statistic: 'none',
    instruction: 'Publication year of this article. Prefer the year of the cited journal publication or citation metadata; if online-first and print years differ, use the citation year and explain the discrepancy in note. Never use study-period, submission, acceptance, or reference-list years. Return only the four-digit year.',
  };
  if (studyCountryHeader(column.header)) return { ...column, kind: 'article', valueFormat: 'text', statistic: 'none' };
  if (studyDesignHeader(column.header)) return {
    ...column, kind: 'article', valueFormat: 'text', statistic: 'none',
    instruction: 'Report the study design as explicitly described by the authors in the abstract or Methods. Quote the exact design statement. Distinguish retrospective analysis from prospective follow-up, cohort studies from randomized trials, and assignment by schedule from true randomization. Do not call a study randomized or prospective from a procedure alone. If no study-design statement can be verified, use NR rather than inventing a label.',
  };
  const statistic = statisticForHeader(column.header) !== 'none'
    ? statisticForHeader(column.header) : column.statistic || 'none';
  const valueFormat = statistic !== 'none' || NUMERIC_HEADER.test(column.header)
    ? 'numeric' : column.valueFormat || 'text';
  let instruction = column.instruction;
  if ((statistic === 'mean' || statistic === 'median') && !instruction.includes('Mean and median are not statistically equivalent.'))
    instruction += ` Extract the reported ${statistic} as the central value. If no ${statistic} is reported for this datum but the other central-tendency statistic is, use that number as a flagged fallback, identify its actual type in sourceStatistic, and explain in note. Mean and median are not statistically equivalent.`;
  if (statistic === 'central' && !instruction.includes('Do not claim they are statistically equivalent.'))
    instruction += ' Accept either a reported mean or median. Identify which was actually reported in sourceStatistic and explain in note. Do not claim they are statistically equivalent.';
  if (statistic === 'sd' && !instruction.includes('Extract standard deviation only.'))
    instruction += ' Extract standard deviation only. Do not put a mean, median, standard error, confidence interval, or IQR in this SD cell; use NR if SD is absent.';
  if (valueFormat === 'numeric' && !instruction.includes('The cell value must contain only'))
    instruction += ' The cell value must contain only the reported number or numbers, with decimal punctuation and optional ± or semicolon separators. Put units, group names, timepoints, and explanations in note, never in the cell value. If multiple groups or timepoints fit an ambiguous header, list numbers in source order separated by semicolons and explain that order in note for researcher review.';
  return { ...column, valueFormat, statistic, instruction };
}

function metricKey(column: ColumnPlan) {
  if (column.measureKey?.trim()) return column.measureKey.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  return column.header.toLowerCase()
    .replace(/\b(?:mean|median|average|sd|s\.?d\.?|standard\s+deviation|std\.?\s*dev\.?)\b/gi, ' ')
    .replace(/\bpre[\s-]?(?:op|operative)\b/g, 'preoperative')
    .replace(/\bpost[\s-]?(?:op|operative)\b/g, 'postoperative')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function specializeExtractionColumns(input: ColumnPlan[]): ColumnPlan[] {
  const columns = input.map(specializeExtractionColumn);
  const sdColumns = columns.filter((column) => column.statistic === 'sd');
  const centralColumns = columns.filter((column) =>
    column.statistic === 'mean' || column.statistic === 'median' || column.statistic === 'central');
  return columns.map((column) => {
    if (!centralColumns.includes(column)) return column;
    const explicitCombined = MEAN.test(column.header) && SD.test(column.header) ||
      MEDIAN.test(column.header) && SD.test(column.header);
    const key = metricKey(column);
    const companion = !explicitCombined && (sdColumns.find((candidate) =>
      key && metricKey(candidate) === key) ||
      (centralColumns.length === 1 && sdColumns.length === 1 && !metricKey(sdColumns[0])
        ? sdColumns[0] : undefined));
    const includeSdWithCentral = explicitCombined || !companion;
    const directive = includeSdWithCentral
      ? ' If an SD is reported for this same measure, group, and timepoint, return central value ± SD in this one cell (for example, 30.1±4.1), because this sheet has no matching separate SD column. If SD is absent, return only the central value. Never substitute SE, IQR, CI, or range for SD.'
      : ` The sheet has a matching separate SD column (${companion?.header}); return only the central value here and put SD in its own column.`;
    return { ...column, includeSdWithCentral,
      instruction: column.instruction.includes('If an SD is reported for this same measure') ||
        column.instruction.includes('The sheet has a matching separate SD column')
        ? column.instruction : column.instruction + directive };
  });
}
