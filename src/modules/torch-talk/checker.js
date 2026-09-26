// Meaning checker (build pack §5.2). Must return exactly what tests/torch-talk-validate.py's check() returns
// for every case: 'pass' | 'negated' | 'breaker' | 'missing' | 'order'. Parity is tested in tests/torch-talk.unit.test.mjs.
export function check(msg, it) {
  const used = new Set();
  const accepted = (w) => it.slots.some((s) => s.accept.includes(w));
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] !== 'not') continue;
    const n = i + 1 < msg.length ? msg[i + 1] : null;
    if (n !== null && it.breakers.includes(n)) { used.add(i); used.add(i + 1); continue; } // "not 4pm" is true
    if (n && accepted(n)) return 'negated'; // "not Sunday" when Sunday is the answer
    used.add(i); // stray "not" = filler
  }
  // NB: the Python loop's `continue` skips nothing extra, so "not not X" behaves the same here
  for (let i = 0; i < msg.length; i++) if (!used.has(i) && it.breakers.includes(msg[i])) return 'breaker';
  const pos = {};
  for (const s of it.slots) {
    const p = msg.findIndex((w) => s.accept.includes(w));
    if (p < 0) return 'missing';
    pos[s.id] = p;
  }
  for (const [a, b] of it.order || []) if (pos[a] > pos[b]) return 'order';
  return 'pass';
}

/** T6 fix (build pack §7): passes if it names the right value for the mixed-up slot, or says "not <echo>". */
export function fixPasses(fix, it) {
  const slot = it.slots.find((s) => s.id === it.mixup.fixSlot);
  if (fix.some((w) => slot.accept.includes(w))) return true;
  return fix.some((w, i) => w === 'not' && fix[i + 1] === it.mixup.echo);
}

/** Which note words to highlight for an Ask chip ("It's in the note!"). */
const KIND = { when: ['time', 'day'], where: ['place'], bring: ['item'] };
export function slotsFor(question, it) {
  return it.slots.filter((s) => KIND[question].some((k) => s.id.startsWith(k)) && !(it.gap && it.gap.slot === s.id));
}
