// Lucky Dip v1.1: balance, order rules, generator and scoring acceptance tests (build pack v1.1 §9, §11). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SEQUENCES, simulate, generate, orderOk, adaptiveGap, perfectMax, code } from '../src/modules/lucky-dip/rules.js';
import { score, intendedStop } from '../src/modules/lucky-dip/scoring.js';

const scoredOnly = (seq) => seq.filter((b) => b.type !== 'free');
const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const bagsOf = (seq) => scoredOnly(seq).map((b) => b.type[0] + (b.j - 1)).sort().join();

test('sequence A: the build-pack order, 15 scored + 2 free, passes every order rule', () => {
  assert.equal(code(SEQUENCES.A), 'G2 N5 G5 N1 N5 F G4 G3 N2 N2 N3 F N4 G1 N3 N4 N1');
  assert.equal(SEQUENCES.A.length, 17);
  assert.ok(orderOk(scoredOnly(SEQUENCES.A)));
  assert.ok(adaptiveGap(scoredOnly(SEQUENCES.A)) < 0.07); // pack: 6.7%
});

test('balance: max 685 and every fixed stop = 300, for A and 1,000 generated orders', () => {
  const r = rng(11);
  const seqs = [SEQUENCES.A, ...Array.from({ length: 1000 }, () => generate(r))];
  const want = bagsOf(SEQUENCES.A);
  for (const seq of seqs) {
    const sc = scoredOnly(seq);
    assert.equal(bagsOf(seq), want, 'same 15 bags');
    assert.equal(perfectMax(seq), 685);
    assert.deepEqual([0, 1, 2, 3, 4].map((t) => simulate(sc, (k) => k < t).points), [300, 300, 300, 300, 300]);
    assert.ok(orderOk(sc));
    assert.deepEqual(seq.map((b, i) => (b.type === 'free' ? i : -1)).filter((i) => i >= 0), [5, 11], 'free bags after scored 5 and 10');
  }
});

test('the chilli is never the starter draw (A, practice and 1,000 generated orders)', () => {
  const r = rng(5);
  for (const seq of [SEQUENCES.A, SEQUENCES.P, ...Array.from({ length: 1000 }, () => generate(r))]) {
    for (const b of scoredOnly(seq)) assert.ok(b.j >= 2 && b.j <= 6, `draw ${b.j}`);
  }
  assert.equal(code(SEQUENCES.P), 'N4 G2 N5 F');
});

test('order rules reject what the pack forbids', () => {
  const A = scoredOnly(SEQUENCES.A);
  const swap = (s, i, k) => { const c = s.map((x) => ({ ...x })); [c[i], c[k]] = [c[k], c[i]]; return c; };
  const g1 = A.findIndex((b) => b.type === 'gold' && b.j === 2);
  assert.ok(!orderOk(swap(A, 0, A.findIndex((b) => b.type === 'normal' && b.j === 2))), 'first-dip chilli in bag 1');
  assert.ok(!orderOk(swap(A, g1, 2)), 'gold first-dip chilli in the first half');
});

test('bots: always-Keep → 1 / 0; always-Dip → 5 / 100; threshold-2 → 3 / 50', () => {
  const seq = SEQUENCES.A;
  for (const [fn, stop, sc] of [[() => false, 1, 0], [() => true, 5, 100], [(k) => k < 2, 3, 50]]) {
    const r = simulate(seq, fn);
    assert.equal(intendedStop(r.decisions.filter((d) => d.stake !== 'free')), stop);
    assert.equal(score(r).riskScore, sc);
  }
});

test('calibration comes from the player’s own chillies', () => {
  const never = score(simulate(SEQUENCES.A, () => false)); // always Keep: never meets a chilli
  assert.equal(never.riskCalibration, 'n/a-low');
  assert.match(never.flags, /frozen/);
  const pullBack = score(simulate(SEQUENCES.A, (k, l) => k < (l ? 1 : 4)));
  assert.equal(pullBack.riskCalibration, 'yes');
  assert.doesNotMatch(pullBack.flags, /reckless/);
  const chase = score(simulate(SEQUENCES.A, (k, l) => k < (l ? 4 : 3)));
  assert.equal(chase.riskCalibration, 'no');
  // v1 logs said 'pepper': the scoring layer treats it the same
  const r = simulate(SEQUENCES.A, (k, l) => k < (l ? 1 : 4));
  const old = score({ ...r, bags: r.bags.map((b) => ({ ...b, endedBy: b.endedBy === 'chilli' ? 'pepper' : b.endedBy })) });
  assert.equal(old.riskCalibration, pullBack.riskCalibration);
});

test('band and precision are coherent', () => {
  const s = score(simulate(SEQUENCES.A, (k) => k < 2));
  assert.ok(s.riskPrecisionLo <= s.riskScore && s.riskScore <= s.riskPrecisionHi);
  assert.ok(['C', 'B', 'Bo'].includes(s.riskBand) || /borderline/.test(s.riskBand));
});

test('nothing player-facing says "pepper"', () => {
  const dir = 'src/modules/lucky-dip/';
  for (const f of readdirSync(dir).filter((x) => /\.(js|json)$/.test(x))) {
    const hits = readFileSync(dir + f, 'utf8').split('\n').filter((l) => /pepper/i.test(l) && !/v1/.test(l));
    assert.deepEqual(hits, [], f);
  }
  assert.ok(readdirSync(dir + 'assets').includes('chilli.webp'));
});
