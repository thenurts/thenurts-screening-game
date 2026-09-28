// The Nurts Mamak: reference self-test, JS ↔ Python parity (act, metrics, org_score), clock and setback rules. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FORMS, newState, act, metrics, orgScore, careful, blocked, clock, shiftOver, facets, MENU } from '../src/modules/mamak-rush/rules.js';

test('reference simulator self-test passes (both forms)', (t) => {
  let out;
  try { out = execFileSync('python3', ['tests/mamak-reference.py'], { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') return t.skip('python3 not installed'); throw e; }
  assert.match(out.trim(), /PASS$/);
});

const runs = JSON.parse(readFileSync('tests/fixtures/mamak-parity.json', 'utf8'));
test('JS act/metrics/orgScore match the Python reference on every fixture run (130 runs × 36 minutes)', () => {
  assert.ok(runs.length >= 130);
  for (const r of runs) {
    const st = newState(FORMS[r.form]);
    const ok = r.actions.map(([tg, sta]) => (act(st, tg, sta)[3] ? 1 : 0));
    assert.deepEqual(ok, r.ok, `${r.form} ${r.bot}: ok flags`);
    assert.ok(shiftOver(st));
    assert.deepEqual(metrics(st), r.metrics, `${r.form} ${r.bot}: metrics`);
    assert.equal(orgScore(metrics(st)), r.org, `${r.form} ${r.bot}: org`);
  }
});

test('the JS careful bot plays exactly the reference careful plan (org 98.4 on both forms)', () => {
  for (const f of ['A', 'B']) {
    const st = newState(FORMS[f]); const acts = [];
    while (!shiftOver(st)) { const [tg, sta] = careful(st); acts.push([tg, sta]); act(st, tg, sta); }
    assert.deepEqual(acts, runs.find((r) => r.form === f && r.bot === 'careful').actions);
    assert.equal(orgScore(metrics(st)), 98.4);
    assert.deepEqual(facets(metrics(st)), { planScore: 97.8, pressureScore: 100 });
  }
});

test('clock, setback and parked order rules', () => {
  assert.equal(clock(1), '7:00'); assert.equal(clock(21), '7:20'); assert.equal(clock(37), '7:36');
  const st = newState(FORMS.A);
  const off = []; for (let t = 1; t <= 36; t++) { st.tick = t; if (blocked(st, 'griddle')) off.push(clock(t)); }
  assert.deepEqual(off, ['7:17', '7:18', '7:19']); // the gas runs out 7:17–7:19
  assert.ok(!blocked(st, 'urn'));
  const s2 = newState(FORMS.A);
  act(s2, 'tapau', 'griddle'); assert.equal(s2.tapau.steps, 0, 'the tapau can only be cooked from 7:09');
  assert.equal(Object.keys(MENU).length, 6);
  // every stream order is due after it arrives and every dish has its steps
  for (const f of ['A', 'B']) for (const [t, , item, due] of FORMS[f].stream) { assert.ok(due >= MENU[item][2].length && t >= 1 && t <= 36); }
});
