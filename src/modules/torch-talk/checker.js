// Meaning checker v2.2 (build pack §5.2) + per-turn points. Must return exactly what tests/torch-talk-validate.py's
// check() and points() return
// for every case: 'pass' | 'negated' | 'breaker' | 'missing' | 'order' | 'bind' | 'between'.
// Parity is tested against a fixture generated from the Python reference (tests/fixtures/torch-talk-parity.json).

/** First index where any accepted entry occurs; an entry may be a phrase of consecutive tiles ("put out"). */
export function find(msg, accept) {
  let best = null;
  for (const a of accept) {
    const p = a.split(' ');
    for (let i = 0; i + p.length <= msg.length; i++) {
      if (p.every((w, k) => msg[i + k] === w)) { best = best === null ? i : Math.min(best, i); break; }
    }
  }
  return best;
}

export function check(msg, it) {
  const used = new Set();
  const inAccept = (w) => it.slots.some((s) => s.accept.some((a) => a.split(' ').includes(w)));
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] !== 'not') continue;
    const n = i + 1 < msg.length ? msg[i + 1] : null;
    if (n !== null && it.breakers.includes(n)) { used.add(i); used.add(i + 1); continue; } // "not X" is a true statement
    const n2 = i + 2 < msg.length ? msg[i + 2] : null; // "not use X" / "not bring X": one harmless word may sit between
    if (n !== null && it.fillers.includes(n) && n2 !== null && it.breakers.includes(n2)) { used.add(i); used.add(i + 1); used.add(i + 2); continue; }
    if (n && inAccept(n)) return 'negated';
    used.add(i); // stray "not" = filler
  }
  for (let i = 0; i < msg.length; i++) if (!used.has(i) && it.breakers.includes(msg[i])) return 'breaker';
  const pos = {};
  for (const s of it.slots) {
    const p = find(msg, s.accept);
    if (p === null) return 'missing';
    pos[s.id] = p;
  }
  for (const [a, b] of it.order || []) if (pos[a] > pos[b]) return 'order';
  const bind = it.bind || [];
  const heads = [...new Set(bind.map(([h]) => pos[h]))].sort((x, y) => x - y);
  for (const [h, d] of bind) { // the dependent comes after its head and before the next head
    const nxt = heads.filter((x) => x > pos[h]);
    if (!(pos[d] > pos[h] && (!nxt.length || pos[d] < nxt[0]))) return 'bind';
  }
  for (const [a, m, b] of it.between || []) { // m sits between a and b (either order)
    if (!(Math.min(pos[a], pos[b]) < pos[m] && pos[m] < Math.max(pos[a], pos[b]))) return 'between';
  }
  return 'pass';
}

/** Python's round(): halves go to the even neighbour (7.5 → 8, 8.5 → 8), so JS points match the reference exactly. */
export function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
}
export const CLARIFIER_WEIGHT = 2.5; // tt.clarifierWeight (ScoringConfig later)
const missingClarifiers = (msg, it) => (it.clarifiers || []).filter((c) => find(msg, c.accept) === null).length;
/** Unrounded ratio behind the points: idealLen ÷ (wordsUsed + weight × missing clarifiers), capped at 1 (= efficiency). */
export function ratio(msg, it, cw = CLARIFIER_WEIGHT) {
  if (check(msg, it) !== 'pass') return 0;
  return Math.min(1, it.ideal.length / (msg.length + cw * missingClarifiers(msg, it)));
}
/** Points for one message, before any Ask costs: 0 if the meaning fails, else min(10, round(10 × ideal ÷ (used + cw × missing))). */
export function points(msg, it, cw = CLARIFIER_WEIGHT) {
  if (check(msg, it) !== 'pass') return 0;
  return Math.min(10, pyRound((10 * it.ideal.length) / (msg.length + cw * missingClarifiers(msg, it))));
}

/** T6 fix (build pack §7): passes if it names the right value for the mixed-up slot, or says "not <echo>". */
export function fixPasses(fix, it) {
  const slot = it.slots.find((s) => s.id === it.mixup.fixSlot);
  if (find(fix, slot.accept) !== null) return true;
  return fix.some((w, i) => w === 'not' && fix[i + 1] === it.mixup.echo);
}

/** Nickname / code-word tiles (shown in italics in the note and the tray). */
export const nicknames = (it) => [it.shorthand?.tile, it.context?.tile].filter(Boolean).map((w) => w.toLowerCase());

/** Note words to highlight for an Ask chip ("It's in the note!"): best-effort by slot id. */
const KIND = { when: ['time', 'day', 'freq', 'per'], where: ['place', 'alt', 'near', 'stairs', 'under'], who: ['who', 'p1', 'p2', 'p3'], what: ['item', 'what', 'obj', 'task', 't1', 't2'], howmany: ['count'] };
export function slotsFor(question, it) {
  return it.slots.filter((s) => (KIND[question] || []).some((k) => s.id === k || s.id.startsWith(k)) && !(it.gap && it.gap.slot === s.id));
}
