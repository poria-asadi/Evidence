import assert from 'node:assert/strict';
import {
  estimateRun,
  FIVE_PAPER_BENCHMARK,
  formatRunDuration,
  PLANNING_SECONDS_PER_ITEM,
} from '../lib/run-estimates.ts';

const planning = estimateRun(
  {
    secondsPerItem: PLANNING_SECONDS_PER_ITEM.titleAbstract,
    timeSamples: 0,
    costUsdPerItem: null,
    costSamples: 0,
  },
  2000,
);
assert.equal(planning.seconds, 10_800);
assert.equal(formatRunDuration(planning.seconds), '~3 h');
assert.equal(planning.costUsd, null);

const observed = estimateRun(
  {
    secondsPerItem: 30,
    timeSamples: 12,
    costUsdPerItem: 0.015,
    costSamples: 5,
    setupCostUsd: 0.01,
  },
  10,
  2,
);
assert.equal(observed.seconds, 300);
assert.ok(Math.abs(observed.costUsd! - 0.17) < 1e-10);

const missingSetupPrice = estimateRun(
  {
    secondsPerItem: 120,
    timeSamples: 0,
    costUsdPerItem: 0.02,
    costSamples: 4,
  },
  3,
  1,
);
assert.equal(missingSetupPrice.costUsd, null);
assert.equal(formatRunDuration(0), '—');

const sixColumns = estimateRun({
  ...FIVE_PAPER_BENCHMARK.extraction,
  timeSamples: 5,
  costSamples: 5,
}, 5, 1, 6);
const twelveColumns = estimateRun({
  ...FIVE_PAPER_BENCHMARK.extraction,
  timeSamples: 5,
  costSamples: 5,
}, 5, 1, 12);
assert.ok(sixColumns.costUsd !== null && twelveColumns.costUsd !== null);
assert.ok(twelveColumns.costUsd > sixColumns.costUsd);
assert.ok(twelveColumns.seconds > sixColumns.seconds);
assert.ok(Math.abs(sixColumns.costUsd - (5 * 0.014490047 + 0.0003957)) < 1e-10);
assert.ok(Math.abs(twelveColumns.costUsd - (5 * (0.014490047 + 6 * 0.0015021495833333336) + 0.000696)) < 1e-10);

console.log('Run estimate calculations passed.');
