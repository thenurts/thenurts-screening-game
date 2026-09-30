// Learning v2 (request #28; Framework v0.4–v0.5): weights 30/20/20/15/15, n/a parts drop and the rest rescale, prior casual
// play removes a module, ≥ 2 parts from ≥ 2 games, bands Low / Typical / High. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learningComposite, learningFromMetrics } from '../src/scoring/learning.js';
import { learningFactsFromV1 } from '../src/scoring/learnFacts.js';
import { DEFAULTS } from '../src/scoring/config.js';

const R = {
  'torch-talk': { learn: { firstUse: [2, 3], noRepeat: [1, 2], pickup: [2, 12] } },
  'mamak-rush': { learn: { firstUse: [4, 4], noRepeat: [0, 3], trapPairs: [1, 1], pickup: [0, 6], probes: 'valueFirst+ tapauReady+ gasPlanned+ steps:teh+' } },
};
test('weights 30/20/20/15/15 over the parts that exist', () => {
  const r = learningFromMetrics(R);
  const parts = { firstUse: 6 / 7, pickup: 1 - 2 / 18, noRepeat: 1 - 1 / 5, trapPairs: 1 };
  const w = DEFAULTS['learn.weights'];
  const want = Math.round((100 * Object.entries(parts).reduce((a, [k, v]) => a + w[k] * v, 0)) / (0.3 + 0.2 + 0.2 + 0.15));
  assert.equal(r.score, want); assert.equal(r.nParts, 4); assert.deepEqual(r.games.sort(), ['mamak-rush', 'torch-talk']);
  assert.equal(r.band, want >= 70 ? 'High' : want < 40 ? 'Low' : 'Typical');
});
test('minimum data: ≥ 2 parts from ≥ 2 games; otherwise Not enough evidence', () => {
  assert.equal(learningFromMetrics({ 'torch-talk': R['torch-talk'] }).band, 'Not enough evidence');
  assert.equal(learningFromMetrics({ 'lucky-dip': { points: 5 } }).score, null);
});
test('a module played for fun first contributes nothing (priorCasualPlay)', () => {
  const r = learningFromMetrics({ ...R, 'mamak-rush': { ...R['mamak-rush'], priorCasualPlay: true } });
  assert.equal(r.band, 'Not enough evidence'); assert.deepEqual(r.practised, ['mamak-rush']);
});
test('a skipped tutorial means pickup is n/a (never 0), so skipping costs nothing', () => {
  const noTut = { 'torch-talk': { learn: { firstUse: [3, 3], noRepeat: [0, 1] } }, 'mamak-rush': { learn: { firstUse: [4, 4], trapPairs: [1, 1] } } };
  const r = learningFromMetrics(noTut);
  assert.ok(!('pickup' in r.parts)); assert.equal(r.score, 100);
});
test('v1 counts convert to the learning v2 contract; named Mamak probes are kept', () => {
  const f = learningFactsFromV1(R['mamak-rush']);
  assert.deepEqual(f.firstUse.map((p) => p.probe), ['valueFirst', 'tapauReady', 'gasPlanned', 'steps:teh']);
  assert.deepEqual(f.repeats, { opportunities: 3, repeated: 0 }); assert.equal(f.trapPairs.length, 1);
  assert.equal(learningComposite([], DEFAULTS).band, 'Not enough evidence');
});
