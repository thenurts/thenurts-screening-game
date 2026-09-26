// Lucky Dip: balance (ported from lucky-dip-balance-check.py) + scoring acceptance tests. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEQUENCES, trayValue, SETBACK_BAG } from '../src/modules/lucky-dip/rules.js';
import { score, intendedStop } from '../src/modules/lucky-dip/scoring.js';

/** Simulate a round. dip(k, lastLoss, bag) → boolean. Returns { points, decisions, bags }. */
export function simulate(seq, dip) {
  let points = 0, last = false; const decisions = [], bags = [];
  seq.forEach((b, i) => {
    const bag = i + 1;
    if (b.type === 'free') {
      let k = 0;
      while (k < 3 && dip(k + 1, last, b)) k++;
      points += trayValue(b, k); bags.push({ bag, stake: 'free', dips: k, endedBy: k === 3 ? 'auto' : 'keep', points: trayValue(b, k) });
      return;
    }
    if (b.j === 1) { last = true; bags.push({ bag, stake: b.type, j: 1, dips: 0, endedBy: 'pepper', points: 0 }); return; }
    let k = 1;
    for (;;) {
      if (k === 5) { const p = trayValue(b, 5); points += p; last = false; bags.push({ bag, stake: b.type, j: b.j, dips: 4, endedBy: 'auto', points: p }); break; }
      const d = dip(k, last, b);
      decisions.push({ bag, stake: b.type, k, choice: d ? 'dip' : 'keep', ms: 900 });
      if (!d) { const p = trayValue(b, k); points += p; last = false; bags.push({ bag, stake: b.type, j: b.j, dips: k - 1, endedBy: 'keep', points: p }); break; }
      k++;
      if (k === b.j) { last = true; bags.push({ bag, stake: b.type, j: b.j, dips: k - 1, endedBy: 'pepper', points: 0 }); break; }
    }
  });
  return { points, decisions, bags };
}
const scoredOnly = (seq) => seq.filter((b) => b.type !== 'free');

for (const id of ['A', 'B']) {
  test(`balance ${id}: every fixed stop ties; pull-back vs chase within 10%`, () => {
    const seq = scoredOnly(SEQUENCES[id]);
    for (const s of ['normal', 'gold']) assert.deepEqual(seq.filter((b) => b.type === s).map((b) => b.j).sort(), [1, 2, 3, 4, 5, 6].flatMap((j) => Array(s === 'normal' ? 2 : 1).fill(j)).sort());
    const fixed = [1, 2, 3, 4, 5].map((t) => simulate(seq, (k) => k < t).points);
    assert.equal(new Set(fixed).size, 1, `fixed bots ${fixed}`);
    assert.equal(fixed[0], 300);
    let worst = 0;
    for (let b = 1; b <= 5; b++) for (const st of [1, 2]) {
      const pb = simulate(seq, (k, l) => k < (l ? Math.max(1, b - st) : b)).points;
      const ch = simulate(seq, (k, l) => k < (l ? Math.min(5, b + st) : b)).points;
      worst = Math.max(worst, Math.abs(pb - ch) / Math.max(pb, ch));
    }
    assert.ok(worst <= 0.1, `worst gap ${worst}`);
  });
}

test('setback: bag 4 is a gold bag lost on Mia\'s dip in A and B', () => {
  for (const id of ['A', 'B']) { const b = SEQUENCES[id][SETBACK_BAG - 1]; assert.equal(b.type, 'gold'); assert.equal(b.j, 1); }
});

test('bots: always-Keep → stop 1 / score 0; always-Dip → 5 / 100; threshold-3 → 3 / 50', () => {
  const seq = SEQUENCES.A;
  const cases = [[() => false, 1, 0], [() => true, 5, 100], [(k) => k < 3, 3, 50]];
  for (const [fn, stop, sc] of cases) {
    const r = simulate(seq, fn);
    const s = score(r);
    assert.equal(intendedStop(r.decisions.filter((d) => d.stake !== 'free')), stop);
    assert.equal(s.riskScore, sc);
  }
});

test('flags: frozen when always-Keep incl. free bags; not reckless when pulling back', () => {
  const frozen = score(simulate(SEQUENCES.A, () => false));
  assert.match(frozen.flags, /frozen/);
  assert.equal(frozen.riskCalibration, 'n/a-low');
  const pullBack = score(simulate(SEQUENCES.A, (k, l) => k < (l ? 2 : 5)));
  assert.equal(pullBack.riskCalibration, 'yes');
  assert.doesNotMatch(pullBack.flags, /reckless/);
  const chase = score(simulate(SEQUENCES.A, (k, l) => k < (l ? 5 : 4)));
  assert.equal(chase.riskCalibration, 'no');
});

test('band and precision are coherent', () => {
  const s = score(simulate(SEQUENCES.A, (k) => k < 3));
  assert.ok(s.riskPrecisionLo <= s.riskScore && s.riskScore <= s.riskPrecisionHi);
  assert.ok(['C', 'B', 'Bo'].includes(s.riskBand) || /borderline/.test(s.riskBand));
});
