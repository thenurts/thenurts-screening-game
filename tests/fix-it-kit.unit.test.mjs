// Mia's Fix-It Kit: reference stress + self-test, content sync, JS ↔ Python parity (lookup, play_problem, metrics). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTENT, KIT, PROBLEMS, lookup, playProblem, metrics, problemsOf, explorerChoice, newProblem, tryFix, TRIES } from '../src/modules/fix-it-kit/rules.js';

const py = (t, args) => { try { return execFileSync('python3', args, { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') { t.skip('python3 not installed'); return null; } throw e; } };

test('reference: STRESS PASS + SELF-TEST PASS', (t) => {
  const out = py(t, ['tests/fixit-reference.py']); if (out == null) return;
  assert.match(out, /STRESS: PASS/); assert.match(out, /SELF-TEST: PASS/);
});
test('content.json is exactly what the reference generates', (t) => {
  const dest = join(mkdtempSync(join(tmpdir(), 'fx-')), 'c.json');
  if (py(t, ['tools/fx_build_content.py', dest]) == null) return;
  assert.deepEqual(JSON.parse(readFileSync(dest, 'utf8')), CONTENT);
});
test('JS play_problem + metrics match the reference for every bot × form (126 runs)', () => {
  const runs = JSON.parse(readFileSync('tests/fixtures/fixit-parity.json', 'utf8'));
  for (const r of runs) {
    const q = {}; for (const [pid, list] of Object.entries(r.choices)) q[pid] = [...list];
    const res = problemsOf(r.form).map((pid) => playProblem(pid, () => { const c = (q[pid] || []).shift(); return c ?? null; }));
    res.forEach((x, i) => {
      assert.deepEqual(x.log, r.results[i].log, `${r.form} ${r.bot} ${x.pid} log`);
      assert.deepEqual(x.found, r.results[i].found); assert.equal(x.blockAt, r.results[i].blockAt);
    });
    assert.deepEqual(metrics(res), r.metrics, `${r.form} ${r.bot} metrics`);
  }
});
test('explorer bot (JS) = 83.6 / 80.0; chips offered = the kit list; block only after the first new idea on problem 2', () => {
  const sc = { A: 83.6, B: 80.0 };
  for (const f of ['A', 'B']) assert.equal(metrics(problemsOf(f).map((pid) => playProblem(pid, explorerChoice))).creativeScore, sc[f]);
  assert.deepEqual(KIT.U.chips, ['keeps you dry', 'long', 'hooked handle', 'opens wide']);
  const ps = newProblem('A2');
  tryFix(ps, { W: 'for drinking' }); assert.ok(!ps.blocked, 'a failed try never triggers the block');
  tryFix(ps, { W: 'heavy when full' }); assert.ok(ps.blocked && !ps.avail.includes('U'));
  assert.equal(lookup(PROBLEMS.A2.fixes, { U: 'long' })?.mechanism, 'poke it down');
  const p3 = newProblem('A3'); for (let i = 0; i < TRIES; i++) tryFix(p3, { U: 'long' }); assert.ok(p3.over);
});
