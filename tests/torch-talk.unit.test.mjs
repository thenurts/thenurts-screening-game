// Torch Talk: item validator, checker parity, spot checks, form logic, scoring and bots (build pack §13). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { check, fixPasses } from '../src/modules/torch-talk/checker.js';
import { buildRound, trayOrder, ITEMS } from '../src/modules/torch-talk/forms.js';
import { score, turnPoints, repairOf, REACTIONS } from '../src/modules/torch-talk/scoring.js';

const byId = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('item bank passes the Game Ideas validator (incl. 10,000 random rounds)', (t) => {
  let out;
  try { out = execFileSync('python3', ['tests/torch-talk-validate.py', 'src/modules/torch-talk/items.json'], { encoding: 'utf8' }); }
  catch (e) { if (e.code === 'ENOENT') return t.skip('python3 not installed'); throw e; }
  assert.equal(out.trim(), 'ALL CHECKS PASS');
});

test('JS checker matches the Python reference on every fixture case', () => {
  const cases = JSON.parse(readFileSync('tests/fixtures/torch-talk-parity.json', 'utf8'));
  assert.ok(cases.length > 1000);
  for (const [id, msg, want] of cases) assert.equal(check(msg, byId[id]), want, `${id}: ${msg.join(' ')}`);
});

test('spot checks from the build pack', () => {
  assert.equal(check(['football', 'Saturday', 'usual', 'water'], byId['A-03']), 'pass'); // shorthand works for Liam
  assert.equal(check(['kite', 'Sunday', 'usual', 'paper', 'tape'], byId['A-07']), 'missing'); // …but not for Zoey
  assert.equal(check(['bike', 'Saturday', 'helmet', 'forget'], byId['A-01']), 'breaker');
  assert.equal(check(['bike', 'Saturday', 'helmet', 'not', 'forget'], byId['A-01']), 'pass');
  assert.equal(check(["Zoey's", 'party', 'Sunday', '1pm', 'swimsuit'], byId['B-06']), 'breaker');
  assert.equal(check(['beach', 'Saturday', '9am', 'wash', 'car'], byId['A-10']), 'order');
});

test('gap turns: the answer tile is not in the tray until asked', () => {
  for (const it of ITEMS.filter((x) => x.gap)) {
    const tray = trayOrder(it);
    assert.ok(!tray.includes(it.gap.answerTile) && tray.includes(null), it.id);
    assert.equal(tray.length, 18);
    const slot = it.slots.find((s) => s.id === it.gap.slot);
    assert.ok(!it.tiles.some((w) => slot.accept.includes(w)), `${it.id} guessable`);
  }
  // the tray order is fixed per item (identical for everyone)
  assert.deepEqual(trayOrder(byId['A-01']), trayOrder(byId['A-01']));
});

test('T6 fix rule', () => {
  const it = byId['A-06']; // echo 8pm, fix slot time (7pm)
  assert.ok(fixPasses(['7pm'], it));
  assert.ok(fixPasses(['not', '8pm'], it));
  assert.ok(!fixPasses(['movie', 'Friday'], it));
  assert.equal(repairOf(['movie', 'Friday', '7pm', 'blanket', 'pillow'], { words: ['7pm'], pass: true }), 1);
  assert.equal(repairOf(['movie', 'Friday', '7pm', 'blanket', 'pillow'], { words: ['movie', 'Friday', '7pm', 'blanket', 'pillow'], pass: true }), 0.25);
  assert.equal(repairOf(['movie', 'Friday', '7pm', 'blanket', 'pillow'], { words: ['movie', 'at', '7pm'], pass: true }), 0.5);
  assert.equal(repairOf(['a'], { words: ['movie'], pass: false }), 0);
});

test('form logic: first run = A, restart = B (flagged), later runs = slot-random without A, practice pool only', () => {
  const a = buildRound({ mode: 'real', runNo: 1, attemptNo: 1 });
  assert.equal(a.form, 'A'); assert.deepEqual(a.items.map((x) => x.id), Array.from({ length: 10 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`));
  const b = buildRound({ mode: 'real', runNo: 1, attemptNo: 2 });
  assert.equal(b.form, 'B'); assert.ok(b.restartedAfterSetback);
  const rnd = mulberry(7);
  for (let k = 0; k < 2000; k++) {
    const r = buildRound({ mode: 'real', runNo: 2, attemptNo: 1, rand: rnd });
    assert.equal(new Set(r.items.map((x) => x.id)).size, 10);
    r.items.forEach((x, i) => assert.equal(x.slot, i + 1));
    assert.equal(r.items[2].form, r.items[6].form, 'T3/T7 paired');
    assert.ok(r.items.every((x) => x.form !== 'A'));
    const p = buildRound({ mode: 'practice', rand: rnd });
    assert.equal(p.items.length, 2); assert.notEqual(p.items[0].id, p.items[1].id);
    assert.ok(p.items.every((x) => x.pool === 'practice'));
  }
});

test('reactions depend only on the outcome', () => {
  assert.deepEqual(Object.keys(REACTIONS).sort(), ['echo', 'end', 'fail', 'pass']);
  assert.equal(REACTIONS.pass.friend, 'happy'); assert.equal(REACTIONS.fail.friend, 'worried');
});

// ---- bots (play Form A turn by turn through the real checker + scoring)
function playBot(strategy) {
  const { items } = buildRound({ mode: 'real', runNo: 1, attemptNo: 1 });
  const turns = items.map((it, i) => {
    const r = strategy(it);
    const words = r.words, asks = r.asks || [];
    const res = check(words, it);
    const t = { turn: i + 1, itemId: it.id, gap: !!it.gap, words, ideal: it.ideal.length, used: words.length, pass: res === 'pass', failReason: res,
      shorthandTile: it.shorthand?.tile || '', contextTile: it.context?.tile || '', asks };
    t.points = turnPoints(t);
    if (it.mixup) t.fix = r.fix || { words: [it.slots.find((s) => s.id === it.mixup.fixSlot).accept[0]], pass: true };
    return t;
  });
  return score({ turns });
}
const ideal = (it) => ({ words: it.ideal, asks: it.gap ? [{ q: it.gap.question, correct: true }] : [] });

test('bots: ideal ≈ 100; always-cap scores less; 2-word messages score ≈ 0 on meaning', () => {
  const best = playBot(ideal);
  assert.equal(best.meaningRate, 1); assert.equal(best.efficiency, 1); assert.equal(best.commScore, 100);
  assert.equal(best.messageScore, 100 - 2); // two necessary asks cost 1 point each
  const cap = playBot((it) => { const extra = it.fillers.filter((f) => f !== 'not').slice(0, it.cap - it.ideal.length); return { words: [...it.ideal, ...extra], asks: ideal(it).asks }; });
  assert.equal(cap.meaningRate, 1);
  assert.ok(cap.commScore < best.commScore && cap.messageScore < best.messageScore, `${cap.commScore} vs ${best.commScore}`);
  const two = playBot((it) => ({ words: it.ideal.slice(0, 2) }));
  assert.equal(two.meaningRate, 0); assert.ok(two.commScore <= 25, String(two.commScore));
  // Asking on every turn costs points and askScore
  const nosy = playBot((it) => ({ words: it.ideal, asks: [{ q: 'when', correct: it.gap?.question === 'when' }, { q: 'where', correct: it.gap?.question === 'where' }, { q: 'bring', correct: it.gap?.question === 'bring' }] }));
  assert.ok(nosy.askScore < best.askScore && nosy.messageScore < best.messageScore);
  // curse of knowledge: shorthand with Liam then again with Zoey → adaptation drops
  const cursed = playBot((it) => (it.id === 'A-07' ? { words: ['kite', 'Sunday', 'usual', 'paper', 'tape'] } : ideal(it)));
  assert.equal(cursed.shorthandAdaptation, 0); assert.equal(cursed.adaptation, 0.5); assert.ok(cursed.commScore < best.commScore);
});
