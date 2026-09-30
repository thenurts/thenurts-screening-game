// Scoring-layer adapter (request #29, L1): re-derives Fair Board's metrics from the stored claimLog + the content file.
import { score } from './scoring.js';
import { CONTENT } from './forms.js';

export const primaryKey = 'fbScore';
export function rederive(m) {
  if (!Array.isArray(m?.claimLog) || !CONTENT.forms[m.form]) return null;
  const byId = Object.fromEntries(CONTENT.forms[m.form].claims.map((c) => [c.id, c]));
  const claims = m.claimLog.map(([n, id, r, checks, ms]) => { const c = byId[id] || {}; return { n, id, board: c.board, type: c.type, truth: c.truth, cue: c.cue || null, response: r === 'A' ? 'agree' : 'doubt', checks, ms }; });
  return score(claims);
}
export const learningFacts = () => null; // its accuracy IS the critical-thinking score (no double counting)
