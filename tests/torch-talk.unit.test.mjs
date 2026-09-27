// Torch Talk: item validator, checker parity, spot checks, form logic, scoring and bots (build pack §13). Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { check, fixPasses, nicknames, points, pyRound } from '../src/modules/torch-talk/checker.js';
import { buildRound, trayOrder, ITEMS, TAGS, QUESTIONS } from '../src/modules/torch-talk/forms.js';
import { score, turnPoints, repairOf, REACTIONS } from '../src/modules/torch-talk/scoring.js';

const byId = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('item bank passes the Game Ideas validator (incl. 10,000 random rounds)', (t) => {
  let out;
  try { out = execFileSync('python3', ['tests/torch-talk-validate.py', 'src/modules/torch-talk/items.json'], { encoding: 'utf8' }); }
  catch (e) { if (e.code === 'ENOENT') return t.skip('python3 not installed'); throw e; }
  assert.equal(out.trim(), 'ALL CHECKS PASS');
});

test('JS checker and points match the Python reference on every fixture case', () => {
  const cases = JSON.parse(readFileSync('tests/fixtures/torch-talk-parity.json', 'utf8'));
  assert.ok(cases.length > 1000);
  for (const [id, msg, want, pts] of cases) {
    assert.equal(check(msg, byId[id]), want, `${id}: ${msg.join(' ')}`);
    assert.equal(points(msg, byId[id]), pts, `points ${id}: ${msg.join(' ')}`);
  }
});

test('spot checks from build pack v2.2 (meaning + clarifier points)', () => {
  const c = (id, m) => check(m.split(' '), byId[id]);
  const p = (id, m) => points(m.split(' '), byId[id]);
  assert.equal(c('A-03', 'take paint brushes den 2pm'), 'missing');      // fused nouns need "and"
  assert.equal(c('A-03', 'take paint and brushes den 2pm'), 'pass');
  assert.equal(c('A-03', 'and take paint brushes den 2pm'), 'between');
  assert.equal(c('A-03', 'paint and brushes den 2pm'), 'missing');       // a request says what to do
  assert.equal(c('A-06', 'back gate shut'), 'missing');
  assert.equal(c('A-06', 'keep back gate shut'), 'pass');
  assert.equal(c('A-04', 'sandpit after school sweep toys arrange chairs'), 'missing'); // "sweep" alone isn't the paraphrase
  assert.equal(c('A-04', 'sandpit after school tidy toys put out chairs'), 'pass');    // phrase tiles in a row
  assert.equal(c('A-07', 'bring glue string Mia\'s garage 11am'), 'breaker');
  assert.equal(c('A-07', 'bring glue string Mia\'s garage noon'), 'pass');
  assert.equal(c('A-07', 'bring glue string den noon'), 'missing');      // acquaintances don't know the den
  assert.equal(c('C-04', 'fetch cake Nana\'s carefully'), 'missing');
  assert.equal(c('B-06', 'you bring cups Liam brings drinks'), 'pass');  // who-does-what (bind)
  assert.equal(c('B-06', 'Liam brings cups you bring drinks'), 'bind');
  assert.equal(c('A-01', 'bring tape Friday fixed'), 'breaker');
  assert.equal(c('A-01', 'bring tape Friday not fixed'), 'pass');
  assert.equal(c('B-10', 'today fill pots soil plant seeds water not please hose'), 'pass'); // "not" + one filler + breaker
  // clarifiers: A-10 build-pack examples 10 / 8 / 9
  assert.equal(p('A-10', 'fair you hoops Zoey tickets Mia face painting'), 10);
  assert.equal(p('A-10', 'you hoops Zoey tickets Mia face painting'), 8);
  assert.equal(p('A-10', 'fair you hoops Zoey tickets Mia face painting please'), 9);
  assert.equal(p('A-10', 'you hoops Mia face painting'), 0);             // meaning fails → 0
  assert.equal(pyRound(7.5), 8); assert.equal(pyRound(8.5), 8); assert.equal(pyRound(6.6), 7);
});

test('italics: every *word* in a note is exactly the item’s nickname / code-word tiles', () => {
  for (const it of ITEMS) {
    const ital = [...it.note.matchAll(/\*([^*]+)\*/g)].map((m) => m[1].toLowerCase()).sort();
    assert.deepEqual(ital, nicknames(it).sort(), it.id);
  }
});

test('recipients: slots 4, 7, 8 go to Raj or Amira (Casual Acquaintance); everyone else is a Close Friend', () => {
  for (const it of ITEMS.filter((x) => x.pool === 'real')) {
    assert.equal(['raj', 'amira'].includes(it.recipient), [4, 7, 8].includes(it.slot), it.id);
    assert.equal(it.tag, TAGS[it.recipient]);
  }
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
  const it = byId['A-06']; // echo "front", fix slot "which" (back)
  assert.ok(fixPasses(['back'], it));
  assert.ok(fixPasses(['not', 'front'], it));
  assert.ok(!fixPasses(['keep', 'gate'], it));
  assert.ok(fixPasses(['you', 'bring', 'cups'], byId['B-06']));
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
    assert.equal(p.items.length, 3); assert.equal(new Set(p.items.map((x) => x.id)).size, 3);
    assert.ok(p.items.every((x) => x.pool === 'practice'));
    assert.ok(!p.items[0].gap && !p.items[0].context, 'practice 1: normal');
    assert.ok(p.items[1].context && TAGS[p.items[1].recipient] === 'Casual Acquaintance', 'practice 2: acquaintance nickname');
    assert.ok(p.items[2].gap, 'practice 3: gap');
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
      shorthandTile: it.shorthand?.tile || '', contextTile: it.context?.tile || '', known: it.known || [], asks };
    t.points = turnPoints(t);
    if (it.mixup) t.fix = r.fix || { words: it.slots.find((s) => s.id === it.mixup.fixSlot).accept[0].split(' '), pass: true };
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
  const nosy = playBot((it) => ({ words: it.ideal, asks: [{ q: 'when', correct: it.gap?.question === 'when' }, { q: 'where', correct: it.gap?.question === 'where' }, { q: 'who', correct: it.gap?.question === 'who' }] }));
  assert.ok(nosy.askScore < best.askScore && nosy.messageScore < best.messageScore);
  // curse of knowledge: shorthand with Liam then again with Zoey → adaptation drops
  // curse of knowledge: the code word works with a Close Friend on T3, not with Amira on T7 → adaptation drops
  const cursed = playBot((it) => (it.id === 'A-07' ? { words: ['glue', 'string', 'den', 'noon'] } : ideal(it)));
  assert.equal(cursed.shorthandAdaptation, 0); assert.equal(cursed.adaptation, 0.6); assert.ok(cursed.commScore < best.commScore);
  // known fact: repeating what the friend already knows (T2 "as you know") passes but loses the knownSkip facet
  const told = playBot((it) => (it.id === 'A-02' ? { words: [...it.ideal, 'gate'] } : ideal(it)));
  assert.equal(told.knownSkip, 0); assert.equal(best.knownSkip, 1);
  assert.deepEqual(Object.keys(QUESTIONS), ['when', 'where', 'who', 'what', 'howmany']);
});
