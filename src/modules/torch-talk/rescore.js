// Scoring-layer adapter (requests #28–29): re-derives Torch Talk's metrics from the stored turnLog by re-running the meaning
// checker on each message, and exposes its learning facts (learning v2 contract).
import { score } from './scoring.js';
import { check, ratio, points, fixPasses } from './checker.js';
import { ITEMS } from './forms.js';

export const primaryKey = 'commScore';
const byId = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
export function rederive(m) {
  if (!Array.isArray(m?.turnLog)) return null;
  const turns = [];
  for (const [turn, itemId, msg, , , asks, , fix] of m.turnLog) {
    const it = byId[itemId]; if (!it) return null;
    const words = msg ? String(msg).split(' ') : [];
    const res = check(words, it);
    const t = { turn, itemId, words, ideal: it.ideal.length, used: words.length, pass: res === 'pass', failReason: res === 'pass' ? '' : res, known: it.known || [], gap: !!it.gap,
      shorthandTile: it.shorthand?.tile || '', contextTile: it.context?.tile || '', tag: it.tag,
      asks: String(asks || '').split(',').filter(Boolean).map((a) => ({ q: a.slice(0, -1), correct: a.endsWith('+') })) };
    t.base = points(words, it); t.ratio = ratio(words, it);
    if (fix) { const fw = String(fix).replace(/ [+-]$/, '').split(' ').filter(Boolean); t.fix = { words: fw, pass: fixPasses(fw, it) }; }
    turns.push(t);
  }
  return score({ turns, idleNudges: m.idleNudges || 0, restartedAfterSetback: /restartedAfterSetback/.test(m.flags || ''), nTurns: String(m.itemIds || '').split(' ').filter(Boolean).length || 10 });
}
export { learningFactsFromV1 as learningFacts } from '../../scoring/learnFacts.js';
