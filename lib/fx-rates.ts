import { env } from 'cloudflare:workers';
import { parseNerkhAraRate, parseNetArzRate, type ParsedRate } from '@/lib/fx-rate-validation';

const CACHE_MS = 5 * 60_000;
const NERKHARA_URL = 'https://nerkhara.com/api/v1/latest/usd.json';
const NETARZ_URL = 'https://netarz.ir/api/fx/v1/rates/USD';

type Source = 'nerkhara' | 'netarz';
type StoredRate = ParsedRate & { source: Source; fetchedAt: number };

async function latest(source: Source): Promise<StoredRate | null> {
  const row = await env.DB.prepare(`SELECT rate_irt_milli AS rateIrtMilli,
    source_updated_at AS sourceUpdatedAt, fetched_at AS fetchedAt, method
    FROM fx_rate_snapshots WHERE source = ? ORDER BY fetched_at DESC LIMIT 1`)
    .bind(source).first<Omit<StoredRate, 'source'>>();
  return row ? { ...row, source } : null;
}

async function save(source: Source, rate: ParsedRate, fetchedAt: number): Promise<StoredRate> {
  await env.DB.prepare(`INSERT INTO fx_rate_snapshots
    (id, source, rate_irt_milli, source_updated_at, fetched_at, method)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_updated_at) DO UPDATE SET
      rate_irt_milli = excluded.rate_irt_milli, fetched_at = excluded.fetched_at,
      method = excluded.method`)
    .bind(crypto.randomUUID(), source, rate.rateIrtMilli, rate.sourceUpdatedAt,
      fetchedAt, rate.method).run();
  return { source, ...rate, fetchedAt };
}

async function request(source: Source, now: number): Promise<StoredRate> {
  const cached = await latest(source);
  const maxAge = source === 'nerkhara' ? 30 * 60_000 : 45 * 60_000;
  if (cached && now - cached.fetchedAt < CACHE_MS && now - cached.sourceUpdatedAt < maxAge)
    return cached;
  const response = await fetch(source === 'nerkhara' ? NERKHARA_URL : NETARZ_URL, {
    headers: source === 'netarz' ? { Authorization: `Bearer ${env.NETARZ_FX_API_KEY}` } : {},
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${source} returned ${response.status}.`);
  const value: unknown = await response.json();
  const parsed = source === 'nerkhara'
    ? parseNerkhAraRate(value, now) : parseNetArzRate(value, now);
  if (!parsed) throw new Error(`${source} returned an invalid or outdated USD/IRT rate.`);
  return save(source, parsed, now);
}

function publicRate(rate: StoredRate) {
  return {
    source: rate.source,
    rateIrtPerUsd: rate.rateIrtMilli / 1_000,
    unit: 'IRT',
    sourceUpdatedAt: new Date(rate.sourceUpdatedAt).toISOString(),
    fetchedAt: new Date(rate.fetchedAt).toISOString(),
    method: rate.method,
    attributionUrl: rate.source === 'nerkhara' ? 'https://nerkhara.com/en/dollar/' : 'https://netarz.ir/fx-api',
  };
}

export async function currentUsdIrtRate() {
  const now = Date.now();
  const primary = await request('nerkhara', now);
  if (!env.NETARZ_FX_API_KEY) return { primary: publicRate(primary),
    comparison: { status: 'not_configured' as const }, comparisonWarning: false };
  try {
    const comparison = await request('netarz', now);
    const differencePercent = Math.round(
      Math.abs(primary.rateIrtMilli - comparison.rateIrtMilli) / primary.rateIrtMilli * 10_000,
    ) / 100;
    return { primary: publicRate(primary),
      comparison: { status: 'available' as const, ...publicRate(comparison), differencePercent },
      comparisonWarning: differencePercent > 5 };
  } catch {
    return { primary: publicRate(primary), comparison: { status: 'unavailable' as const },
      comparisonWarning: true };
  }
}
