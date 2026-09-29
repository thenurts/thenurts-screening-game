// Zoey's Big Calls: reference stress + self-test, content sync, JS ↔ Python parity (voi, run, metrics). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTENT, BOTS, run, metrics, voi, callsOf, newCall, check, decide, stateOf, MAX_CHECKS } from '../src/modules/big-calls/rules.js';

const py = (t, args) => { try { return execFileSync('python3', args, { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') { t.skip('python3 not installed'); return null; } throw e; } };
const FX = JSON.parse(readFileSync('tests/fixtures/judgement-parity.json', 'utf8'));

test('reference: STRESS PASS + SELF-TEST PASS', (t) => {
  const out = py(t, ['tests/judgement-reference.py']); if (out == null) return;
  assert.match(out, /STRESS: PASS/); assert.match(out, /SELF-TEST: PASS/);
});
test('content.json is exactly what the reference generates, and converts back to the reference CALLS', (t) => {
  const dest = join(mkdtempSync(join(tmpdir(), 'jd-')), 'c.json');
  if (py(t, ['tools/jd_build_content.py', dest]) != null) assert.deepEqual(JSON.parse(readFileSync(dest, 'utf8')), CONTENT);
  for (const f of ['A', 'B']) for (const c of callsOf(f)) {
    const r = FX.calls[c.id];
    assert.deepEqual({ worth: c.worth, urgent: c.urgent, first: c.first, clues: c.clues, truth: c.truth }, r, c.id);
  }
});
test('JS voi matches the reference on a 108-point grid', () => {
  for (const [w, n, s, u, v] of FX.voi) assert.ok(Math.abs(voi(w, n, s, u) - v) < 1e-9, `voi(${w},${n},${s},${u})`);
});
test('JS run + metrics match the reference for all 12 bots × both forms', () => {
  assert.equal(FX.runs.length, 24);
  for (const r of FX.runs) {
    const log = run(BOTS[r.bot], r.form);
    assert.deepEqual(log, r.log, `${r.form} ${r.bot} log`);
    assert.deepEqual(metrics(log), r.metrics, `${r.form} ${r.bot} metrics`);
  }
  for (const f of ['A', 'B']) assert.equal(metrics(run(BOTS.wise, f)).judgementScore, 100);
});
test('practice calls teach what they say; the Check button hides after 3; the Smart-call verdict ignores luck', () => {
  const [p1, p2] = callsOf('P');
  const a = newCall(p1); assert.equal(check(a).verdict, true, 'P1: the first (strong) check is good');
  assert.equal(check(a).verdict, false, 'P1: a second (weak) check is wasted');
  const b = newCall(p2); assert.equal(check(b).verdict, false, 'P2: an urgent weak check is wasted');
  const c = newCall(callsOf('A')[0]); for (let i = 0; i < MAX_CHECKS; i++) check(c);
  assert.equal(stateOf(c).left, 0); assert.equal(check(c), null);
  // A04: the tally favours Cookies (R) but the outcome is Cupcakes (L): following the tally is unlucky but correct ex ante
  const d = newCall(callsOf('A')[3]); const e = decide(d, -1);
  assert.equal(e.correctExAnte, true); assert.equal(e.won, false); assert.equal(e.points, 0);
  const f = newCall(callsOf('A')[3]); check(f); const g = decide(f, 1);
  assert.equal(g.won, true); assert.equal(g.points, 24, 'worth 30 − an urgent check (6)'); assert.equal(g.correctExAnte, true, 'the tally is a tie after the check');
});
