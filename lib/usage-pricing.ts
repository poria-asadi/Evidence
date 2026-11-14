export const MARKUP_BASIS_POINTS = 2_000;
const USD_NANOS = BigInt(1_000_000_000);
const BASIS_POINTS = BigInt(10_000);

/** Round the final per-request charge up to a whole toman. */
export function usageChargeIrt(costUsdNanos: number, rateIrtPerUsd: number): number {
  if (!Number.isSafeInteger(rateIrtPerUsd) || rateIrtPerUsd <= 0)
    throw new Error('Invalid usage cost or USD/IRT rate.');
  return usageChargeIrtFromMilliRate(costUsdNanos, rateIrtPerUsd * 1_000);
}

/** The FX snapshot keeps three decimal places, including half-toman quotes. */
export function usageChargeIrtFromMilliRate(costUsdNanos: number, rateIrtMilli: number): number {
  if (!Number.isSafeInteger(costUsdNanos) || costUsdNanos < 0 ||
      !Number.isSafeInteger(rateIrtMilli) || rateIrtMilli <= 0)
    throw new Error('Invalid usage cost or USD/IRT rate.');
  const numerator = BigInt(costUsdNanos) *
    (BASIS_POINTS + BigInt(MARKUP_BASIS_POINTS)) * BigInt(rateIrtMilli);
  const denominator = BASIS_POINTS * USD_NANOS * BigInt(1_000);
  const charge = (numerator + denominator - BigInt(1)) / denominator;
  if (charge > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Usage charge is too large.');
  return Number(charge);
}
