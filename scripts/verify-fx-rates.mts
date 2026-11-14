import assert from 'node:assert/strict';
import { parseNerkhAraRate, parseNetArzRate } from '../lib/fx-rate-validation.ts';

const now = Date.parse('2026-11-14T13:00:00Z');
const nerkhara = { api: 'nerkhara/v1', item: {
  id: 'usd', unit: 'IRT', price: 270_452.5, stale: false, sources: 2,
  method: 'average', updated_utc: '2026-11-14T12:54:43Z',
} };
assert.equal(parseNerkhAraRate(nerkhara, now)?.rateIrtMilli, 270_452_500);
assert.equal(parseNerkhAraRate({ ...nerkhara, item: { ...nerkhara.item, stale: true } }, now), null);
assert.equal(parseNerkhAraRate({ ...nerkhara, item: { ...nerkhara.item, unit: 'IRR' } }, now), null);
assert.equal(parseNerkhAraRate({ ...nerkhara, item: { ...nerkhara.item,
  updated_utc: '2026-11-14T12:00:00Z' } }, now), null);

const netarz = { data: { code: 'USD', unit: 1, quote_currency: 'IRT', mid: 272_200 },
  meta: { quote_currency: 'IRT', as_of: '2026-11-14T12:45:00Z' } };
assert.equal(parseNetArzRate(netarz, now)?.rateIrtMilli, 272_200_000);
assert.equal(parseNetArzRate({ ...netarz, data: { ...netarz.data, unit: 100 } }, now), null);
console.log('FX rate validation checks passed.');
