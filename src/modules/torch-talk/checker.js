// Meaning checker v2.1 (build pack §5.2). Must return exactly what tests/torch-talk-validate.py's check() returns
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
