// Scoring-layer adapter (Game Ideas request #29, L1): re-derives this game's metrics from the raw decisions stored in
// metrics_json, with the game's own scoring code. Pure (no Phaser), so the Sheet can run it too (apps-script/scoring.gs).
import { score } from './scoring.js';

const STAKE = { N: 'normal', G: 'gold', F: 'free' }, END = { k: 'keep', c: 'chilli', a: 'auto', p: 'pepper' }; // p = the v1 log alias
export const primaryKey = 'riskScore';
export function rederive(m) {
  if (!Array.isArray(m?.decisions) || !Array.isArray(m?.bagLog)) return null;
  const decisions = m.decisions.map(([bag, s, k, dip, ms]) => ({ bag, stake: s === 'G' ? 'gold' : 'normal', k, choice: dip ? 'dip' : 'keep', ms }));
  const bags = m.bagLog.map(([bag, s, dips, e, points]) => ({ bag, stake: STAKE[s] || 'normal', dips, endedBy: END[e] || e, points }));
  return score({ decisions, bags, idleNudges: m.idleNudges || 0, repeatAttempt: /repeatAttempt/.test(m.flags || '') });
}
export const learningFacts = () => null; // a style trait: nothing "right" to learn (learning v2 map)
