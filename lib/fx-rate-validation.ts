export type ParsedRate = {
  rateIrtMilli: number;
  sourceUpdatedAt: number;
  method: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function rateMilli(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1_000 || value > 100_000_000)
    return null;
  const milli = Math.round(value * 1_000);
  return Number.isSafeInteger(milli) ? milli : null;
}

function timestamp(value: unknown, now: number, maxAgeMs: number): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 2 * 60_000 && now - time <= maxAgeMs
    ? time : null;
}

export function parseNerkhAraRate(value: unknown, now = Date.now()): ParsedRate | null {
  const root = record(value);
  const item = record(root?.item);
  if (root?.api !== 'nerkhara/v1' || item?.id !== 'usd' || item?.unit !== 'IRT' ||
      item?.stale !== false || typeof item?.sources !== 'number' || item.sources < 1)
    return null;
  const rate = rateMilli(item.price);
  const updatedAt = timestamp(item.updated_utc, now, 30 * 60_000);
  if (rate === null || updatedAt === null) return null;
  return { rateIrtMilli: rate, sourceUpdatedAt: updatedAt,
    method: typeof item.method === 'string' ? item.method.slice(0, 40) : 'unknown' };
}

export function parseNetArzRate(value: unknown, now = Date.now()): ParsedRate | null {
  const root = record(value);
  const data = record(root?.data);
  const meta = record(root?.meta);
  const metaCurrency = meta?.quote_currency;
  if (data?.code !== 'USD' || data?.quote_currency !== 'IRT' || data?.unit !== 1 ||
      (metaCurrency !== undefined && metaCurrency !== 'IRT')) return null;
  const rate = rateMilli(data.mid);
  const updatedAt = timestamp(meta?.as_of, now, 45 * 60_000);
  if (rate === null || updatedAt === null) return null;
  return { rateIrtMilli: rate, sourceUpdatedAt: updatedAt, method: 'market-mid' };
}
