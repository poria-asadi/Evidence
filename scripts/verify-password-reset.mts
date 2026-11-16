import assert from 'node:assert/strict';
import {
  newResetToken,
  resetTokenDigest,
  validResetToken,
} from '../lib/password-reset.ts';

const first = newResetToken();
const second = newResetToken();
assert.ok(validResetToken(first));
assert.ok(validResetToken(second));
assert.notEqual(first, second);
assert.equal(validResetToken(first.toUpperCase()), false);
assert.equal(validResetToken('not-a-token'), false);

const firstDigest = await resetTokenDigest(first);
assert.match(firstDigest, /^[0-9a-f]{64}$/);
assert.equal(firstDigest, await resetTokenDigest(first));
assert.notEqual(firstDigest, await resetTokenDigest(second));
assert.notEqual(firstDigest, first);

console.log('Password reset token checks passed.');
