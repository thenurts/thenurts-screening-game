// Fair Board: stress test, content sync, form choice, evidence parsing, scoring and bots (build pack CT2 v1 §5, §10). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTENT, pickForm, parseEvidence, BUMP_ORDER } from '../src/modules/fair-board/forms.js';
import { score, isCorrect } from '../src/modules/fair-board/scoring.js';

const py = (t, args) => { try { return execFileSync('python3', args, { encoding: 'utf8' }); } catch (e) { if (e.code === 'ENOENT') { t.skip('python3 not installed'); return null; } throw e; } };

test('content passes the Game Ideas stress test (both forms)', (t) => {
  const out = py(t, ['tests/fair-board-stress-test.py']); if (out == null) return;
  assert.match(out, /ALL FORMS PASS/);
});

test('content.json is exactly what the stress-tested source generates', (t) => {
  const dest = join(mkdtempSync(join(tmpdir(), 'fb-')), 'c.json');
  if (py(t, ['tools/fb_build_content.py', dest]) == null) return;
  assert.deepEqual(JSON.parse(readFileSync(dest, 'utf8')), CONTENT);
});

test('each form: 24 claims in n order, 12 flawed / 12 sound, 4 of each per board, boards in order', () => {
  for (const f of ['A', 'B']) {
    const cl = CONTENT.forms[f].claims;
    assert.deepEqual(cl.map((c) => c.n), Array.from({ length: 24 }, (_, i) => i + 1));
    assert.equal(cl.filter((c) => c.truth === 'flawed').length, 12);
    for (const b of ['sales', 'times', 'map']) {
      const on = cl.filter((c) => c.board === b);
      assert.equal(on.length, 8); assert.equal(on.filter((c) => c.truth === 'flawed').length, 4, `${f} ${b}`);
    }
    assert.deepEqual([...new Set(cl.map((c) => c.board))], ['sales', 'times', 'map']);
    assert.equal(CONTENT.forms[f].setbackAfter, 12);
    for (const c of cl) assert.ok(c.text.split(' ').length <= 12, c.id);
  }
  assert.equal(CONTENT.practice.claims.length, 3);
});

test('every evidence cell names something drawn on its board', () => {
  for (const f of ['A', 'B']) {
    const B = CONTENT.forms[f].boards;
    const names = {
      sales: ['all', 'note', 'weather', ...Object.keys(B.sales.stalls), ...B.sales.days.map((d) => d.toLowerCase())],
      times: ['all', 'note', 'header', ...Object.keys(B.times.events)],
      map: ['all', 'key', ...B.map.grid.flat()],
    };
    for (const c of CONTENT.forms[f].claims) for (const p of parseEvidence(c.evidence)) for (const cell of p.cells) assert.ok(names[p.board].includes(cell), `${f} ${c.id}: ${p.board}:${cell}`);
  }
  assert.deepEqual(parseEvidence('time:magic show;map:hall,stage'), [{ board: 'times', cells: ['magic show'] }, { board: 'map', cells: ['hall', 'stage'] }]);
});

test('form choice: A for the first real attempt of run 1, B otherwise; dev override; practice board', () => {
  assert.equal(pickForm({ mode: 'real', runNo: 1, attemptNo: 1 }), 'A');
  assert.equal(pickForm({ mode: 'real', runNo: 1, attemptNo: 2 }), 'B');
  assert.equal(pickForm({ mode: 'real', runNo: 3, attemptNo: 1 }), 'B');
  assert.equal(pickForm({ mode: 'real', runNo: 3, attemptNo: 1, form: 'A' }), 'A');
  assert.equal(pickForm({ mode: 'practice', form: 'A' }), 'P');
  assert.deepEqual([...BUMP_ORDER].sort(), [0, 1, 2, 3, 4]);
  assert.ok(BUMP_ORDER.every((r, i) => r !== i), 'every timetable row moves');
});

// ---- bots
const play = (f, pick, checks = () => 0, ms = () => 3000) => score(CONTENT.forms[f].claims.map((c) => ({ ...c, response: pick(c), checks: checks(c), ms: ms(c) })));
test('bots: perfect = 24 / 100-ish; always-agree and always-doubt ≈ 0 accuracy and flagged; checking only flawed raises the score', () => {
  for (const f of ['A', 'B']) {
    const perfect = play(f, (c) => (c.truth === 'sound' ? 'agree' : 'doubt'));
    assert.equal(perfect.correct, 24); assert.equal(perfect.claimAccuracy, 1); assert.equal(perfect.fbScore, 88); // 0.75 + 0.25 × 0.5 (no checks)
    const perfectCheck = play(f, (c) => (c.truth === 'sound' ? 'agree' : 'doubt'), (c) => (c.truth === 'flawed' ? 1 : 0));
    assert.equal(perfectCheck.fbScore, 100); assert.equal(perfectCheck.checkCalibration, 1);
    const agree = play(f, () => 'agree');
    assert.equal(agree.claimAccuracy, 0); assert.equal(agree.correct, 12); assert.match(agree.flags, /alwaysAgree/); assert.equal(agree.fbScore, 50);
    const doubt = play(f, () => 'doubt', () => 1);
    assert.match(doubt.flags, /alwaysDisagree/); assert.match(doubt.flags, /checkAll/); assert.equal(doubt.checkCalibration, 0);
    const fast = play(f, () => 'agree', () => 0, () => 400);
    assert.match(fast.flags, /disengaged/);
    const inverse = play(f, (c) => (c.truth === 'sound' ? 'doubt' : 'agree'));
    assert.equal(inverse.claimAccuracy, -1); assert.equal(inverse.correct, 0);
  }
});

test('cueSway and postBumpDelta', () => {
  // a bot that trusts every cued claim ("I'm sure", "Everyone says") and is otherwise perfect
  const sway = play('A', (c) => (c.cue ? 'agree' : c.truth === 'sound' ? 'agree' : 'doubt'));
  assert.ok(sway.cueSway > 0, String(sway.cueSway));
  // a bot that is perfect until the bump, then wrong on 13-17
  const shaken = play('A', (c) => ((c.n > 12 && c.n <= 17) !== (c.truth === 'sound') ? 'agree' : 'doubt'));
  assert.equal(shaken.postBumpDelta, -1);
  assert.equal(isCorrect({ truth: 'flawed', response: 'doubt' }), true);
  assert.deepEqual(Object.keys(play('A', () => 'agree').typeAccuracy).sort(), ['always', 'because', 'compare', 'cross', 'value']);
});
