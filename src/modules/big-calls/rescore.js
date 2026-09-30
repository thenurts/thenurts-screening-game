// Scoring-layer adapter (requests #28–29): replays the stored callLog (checks made + the side chosen) through the rules.
import { callsOf, newCall, check, decide, metrics } from './rules.js';

export const primaryKey = 'judgementScore';
export function rederive(m) {
  if (typeof m?.callLog !== 'string' || !['A', 'B'].includes(m.form)) return null;
  const calls = Object.fromEntries(callsOf(m.form).map((c) => [c.id, c]));
  const log = [];
  for (const s of m.callLog.split(';').filter(Boolean)) {
    const [id, c, side] = s.split(' '); const call = calls[id]; if (!call) return null;
    const cs = newCall(call); for (let i = 0; i < Number(c.slice(1)); i++) check(cs);
    const e = decide(cs, side === 'L' ? 1 : -1);
    log.push({ worth: e.worth, correctExAnte: e.correctExAnte, checks: e.checks, missed: e.missed });
  }
  return log.length ? { ...metrics(log), smartCalls: log.filter((e) => e.correctExAnte).length } : null;
}
export { learningFactsFromV1 as learningFacts } from '../../scoring/learnFacts.js';
