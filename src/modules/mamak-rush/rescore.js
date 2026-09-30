// Scoring-layer adapter (requests #28–29): replays the stored actionLog (one entry per in-game minute) through the rules.
import { FORMS, newState, act, metrics, orgScore, facets } from './rules.js';

export const primaryKey = 'orgScore';
export function rederive(m) {
  if (typeof m?.actionLog !== 'string' || !FORMS[m.form]) return null;
  const st = newState(FORMS[m.form]);
  for (const e of m.actionLog.split(';').filter(Boolean)) {
    const [, target, station] = e.split(' ');
    act(st, target === '-' ? null : target, station === '-' ? null : station);
  }
  const x = metrics(st);
  return { ...x, orgScore: orgScore(x), ...facets(x) };
}
export { learningFactsFromV1 as learningFacts } from '../../scoring/learnFacts.js';

// Autonomy (request #34): replays the "Closing Time" log with the finale's own rules → the facts the level rules read.
import { replay, readFacts } from './closing.js';
export function autonomyFacts(m) {
  const a = m?.autonomy; if (!a || typeof a.log !== 'string' || !a.done) return null;
  return { ...readFacts(replay(a.log)), tips: a.tips, firstActionMs: a.firstActionMs, medianActionMs: a.medianActionMs, idleMs: a.idleMs };
}
