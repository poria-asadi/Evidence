export const EXTRACTION_PROVIDERS = ['watson'] as const;
export type ExtractionProvider = typeof EXTRACTION_PROVIDERS[number];

export const EXTRACTION_PROVIDER_LABELS: Record<ExtractionProvider, string> = {
  watson: 'Sherlock',
};

export function isExtractionProvider(value: unknown): value is ExtractionProvider {
  return typeof value === 'string' && EXTRACTION_PROVIDERS.includes(value as ExtractionProvider);
}
