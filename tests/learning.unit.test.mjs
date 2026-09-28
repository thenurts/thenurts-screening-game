// Suite learning score (request #20): parts, weights, n/a rules and the minimum-data rule. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learningScore, LEARN } from '../src/core/learning.js';

test('weights are the v1.1 ones and adaptation stays off until item norms exist', () => {
  assert.deepEqual(LEARN.weights, { firstUse: 0.25, pickup: 0.25, noRepeat: 0.20, trapPairs: 0.15, adaptation: 0.15 });
  assert.equal(LEARN.itemNormsReady, false);
});
test('flawless first-time player: high learning; noRepeat is n/a (no errors to learn from)', () => {
  const r = learningScore({
    'torch-talk': { learn: { firstUse: [3, 3], noRepeat: [0, 0], pickup: [0, 12] } },
    'mamak-rush': { learn: { firstUse: [9, 9], noRepeat: [0, 0], trapPairs: [0, 0], pickup: [0, 6] } },
  });
  assert.equal(r.score, 100); assert.equal(r.band, 'quick'); assert.ok(r.noErrors); assert.ok(!('noRepeat' in r.parts));
});
test('weighted mean of the available parts', () => {
  const r = learningScore({
    'torch-talk': { learn: { firstUse: [1, 3], noRepeat: [2, 4], pickup: [6, 12] } },
    'mamak-rush': { learn: { firstUse: [3, 3], noRepeat: [0, 0], trapPairs: [1, 2], pickup: [0, 6] } },
  });
  // firstUse 4/6, pickup 1 − 6/18, noRepeat 1 − 2/4, trapPairs 1/2
  const want = Math.round(100 * (0.25 * (4 / 6) + 0.25 * (1 - 6 / 18) + 0.20 * 0.5 + 0.15 * 0.5) / 0.85);
  assert.equal(r.score, want); assert.equal(r.band, 'steady');
});
test('fewer than 2 parts, or parts from only 1 game → Not enough evidence', () => {
  assert.equal(learningScore({ 'torch-talk': { learn: { firstUse: [3, 3], pickup: [0, 12] } } }).reason, 'Not enough evidence');
  assert.equal(learningScore({ 'lucky-dip': { points: 5 } }).score, null);
  assert.equal(learningScore({ 'torch-talk': { learn: { firstUse: [3, 3] } }, 'fix-it-kit': { learn: { pickup: [1, 2] } } }).score, Math.round(100 * (0.25 * 1 + 0.25 * 0.5) / 0.5));
});
