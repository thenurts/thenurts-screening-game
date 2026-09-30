// Scoring-layer adapter (requests #28–29): replays the stored tryLog through the rule engine; learning facts incl. repeats.
import { problemsOf, newProblem, tryFix, result, metrics } from './rules.js';
import { learningFactsFromV1 } from '../../scoring/learnFacts.js';

export const primaryKey = 'creativeScore';
/** "A1.1 W:heavy when full+S:clangs new" → { pid, choice, outcome } */
export function parseTries(tryLog) {
  return String(tryLog || '').split(';').filter(Boolean).map((s) => {
    const sp = s.indexOf(' '), lp = s.lastIndexOf(' ');
    const pid = s.slice(0, sp).split('.')[0];
    const choice = Object.fromEntries(s.slice(sp + 1, lp).split('+').map((kc) => { const i = kc.indexOf(':'); return [kc.slice(0, i), kc.slice(i + 1)]; }));
    return { pid, choice, outcome: s.slice(lp + 1) };
  });
}
export function rederive(m) {
  if (typeof m?.tryLog !== 'string' || !problemsOf(m.form).length) return null;
  const tries = parseTries(m.tryLog);
  const res = problemsOf(m.form).map((pid) => { const ps = newProblem(pid); tries.filter((t) => t.pid === pid).forEach((t) => tryFix(ps, t.choice)); return result(ps); });
  return metrics(res);
}
/** noRepeat (learning v2 map): the exact same failed try again · a "same idea" try again right after "same idea" feedback.
 * Returns [repeated, opportunities] (the metrics.learn shape) or null when there was nothing to repeat. */
export function repeatsOf(tryLog) {
  const tries = parseTries(tryLog);
  const key = (t) => `${t.pid}|${Object.entries(t.choice).sort().map((e) => e.join(':')).join('+')}`;
  let opp = 0, rep = 0;
  tries.forEach((t, i) => {
    const later = tries.slice(i + 1).filter((u) => u.pid === t.pid);
    if (t.outcome === 'no' && later.length) { opp++; if (later.some((u) => key(u) === key(t))) rep++; }
    if (t.outcome === 'same' && later.length) { opp++; if (later[0].outcome === 'same') rep++; }
  });
  return opp ? [rep, opp] : null;
}
export { learningFactsFromV1 as learningFacts };
