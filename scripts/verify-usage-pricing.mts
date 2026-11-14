import assert from 'node:assert/strict';
import { MARKUP_BASIS_POINTS, usageChargeIrt, usageChargeIrtFromMilliRate } from '../lib/usage-pricing.ts';

assert.equal(MARKUP_BASIS_POINTS, 2_000);
assert.equal(usageChargeIrt(10_000_000_000, 270_000), 3_240_000);
assert.equal(usageChargeIrtFromMilliRate(10_000_000_000, 270_452_500), 3_245_430);
assert.equal(usageChargeIrt(0, 270_000), 0);
assert.equal(usageChargeIrt(1_000, 270_000), 1);
assert.throws(() => usageChargeIrt(-1, 270_000));
assert.throws(() => usageChargeIrt(1_000, 0));
console.log('Usage pricing checks passed.');
