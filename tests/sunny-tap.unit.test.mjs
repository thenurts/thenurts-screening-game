// Sunny Tap: reference self-test, JS ↔ Python parity (Python's RNG, schedule, score_round). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PyRandom, schedule, wipeoutEvents, scoreRound, roundReport, PHASES, OFFICIAL_SEED, CASUAL_SEED } from '../src/modules/sunny-tap/rules.js';

const py = (t, args) => { try { return execFileSync('python3', args, { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') { t.skip('python3 not installed'); return null; } throw e; } };
const FX = JSON.parse(readFileSync('tests/fixtures/sunny-tap-parity.json', 'utf8'));
const tuples = (xs) => xs.map((x) => [...x]);

test('reference: SELF-TEST PASS', (t) => {
  const out = py(t, ['tests/sunny-tap-reference.py']); if (out == null) return;
  assert.match(out, /SELF-TEST: PASS/);
});
test('PyRandom reproduces Python random.Random', (t) => {
  const out = py(t, ['-c', 'import random\nfor s in (0, 1, 20260, 4294967295):\n r = random.Random(s); print(" ".join(repr(r.random()) for _ in range(5)), repr(r.uniform(0.1, 0.9)))']); if (out == null) return;
  const got = [0, 1, 20260, 4294967295].map((s) => { const r = new PyRandom(s); return [...Array(5)].map(() => String(r.random())).join(' ') + ' ' + String(r.uniform(0.1, 0.9)); });
  assert.deepEqual(got, out.trim().split('\n'));
});
test('schedule matches the reference (both seeds × 5 Fair-1 hit rates)', () => {
  for (const s of FX.schedules) assert.deepEqual(schedule(s.seed, s.f1), s.events, `seed ${s.seed} f1 ${s.f1}`);
});
test('scoreRound + roundReport match the reference for 53 simulated players (incl. quits)', () => {
  for (const p of FX.players) {
    const sched = schedule(OFFICIAL_SEED, p.f1);
    assert.deepEqual(scoreRound(tuples(p.taps), p.fades, sched, p.quitAt), p.metrics);
    for (const r of p.reports) assert.deepEqual(roundReport(tuples(p.taps), p.fades, r.round), r); // the mini-reports (v1.2)
  }
});
test('fair phases never depend on the wipeout speed; wipeouts scale; calm casual mode has no wipeouts; 8 phases = 4 rounds of 30 s', () => {
  const fair = (ev) => ev.filter((e) => e.phase[0] === 'F');
  assert.deepEqual(fair(schedule(OFFICIAL_SEED, 1)), fair(schedule(OFFICIAL_SEED, 3)));
  const w = (f) => wipeoutEvents(OFFICIAL_SEED, f).filter((e) => e.phase === 'W1').length;
  assert.ok(w(3) > w(1));
  assert.deepEqual(wipeoutEvents(OFFICIAL_SEED, 1.4), schedule(OFFICIAL_SEED, 1.4).filter((e) => e.phase[0] === 'W'));
  const calm = schedule(CASUAL_SEED, null, true);
  assert.ok(calm.every((e) => e.life === 1.6), 'casual wipeouts are fair-paced');
  assert.notDeepEqual(fair(calm).slice(0, 5), fair(schedule(OFFICIAL_SEED)).slice(0, 5), 'casual never sees the official schedule');
  assert.equal(PHASES.length, 8); assert.equal(PHASES.at(-1)[2], 120);
});
