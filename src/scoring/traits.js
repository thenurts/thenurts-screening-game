// L2 trait scores (design §4): one game's metrics → its trait value. Formulas follow the Framework (v0.5); weights come
// from ScoringConfig. The games' own metrics stay as logged (raw); only this layer is re-weighted.
import { num, r1 } from './util.js';
import { DEFAULTS } from './config.js';

export const RELIABILITY = { risk: 'good', communication: 'good', critical: 'indicative', organisation: 'good', creative: 'good', judgement: 'good', resilience: 'good', learning: 'indicative' };
export const SINGLE_SOURCE = ['risk', 'communication', 'critical', 'organisation', 'judgement'];
export const TRAIT_LABEL = { organisation: 'organisation', learning: 'learning', resilience: 'composure', judgement: 'judgement', critical: 'critical thinking', creative: 'creativity', communication: 'communication', risk: 'risk appetite', ethics: 'integrity' };

/** Organisation, Framework v0.4: planning 60 / pressure 40 (pressure = errorsUnderLoad 60 / parkedReturn 40). */
export function orgScoreV2(m, cfg = DEFAULTS) {
  const f = cfg['o1.facetWeights'], ps = cfg['o1.pressureSplit'], pl = cfg['o1.planningSplit'];
  const v = ['valueShare', 'expiredHigh', 'halfDone', 'errorsUnderLoad', 'parkedReturn'].map((k) => num(m[k]));
  if (v.some((x) => x == null)) return null;
  const [vs, eh, hd, eul, pr] = v, plT = pl.valueShare + pl.expiredHigh + pl.halfDone;
  const planning = (pl.valueShare * vs + pl.expiredHigh * (1 - eh) + pl.halfDone * (1 - hd)) / plT;
  const pressure = ps.errorsUnderLoad * (1 - Math.min(1, 4 * eul)) + ps.parkedReturn * pr;
  return { score: r1(100 * (f.planning * planning + f.pressure * pressure)), planning: r1(100 * planning), pressure: r1(100 * pressure) };
}

/** module id → { trait, score (0–100 | null), extra } */
export function traitOf(module, m, cfg = DEFAULTS) {
  if (!m) return null;
  switch (module) {
    case 'lucky-dip': return { trait: 'risk', score: num(m.riskScore), extra: { riskCalibration: m.riskCalibration ?? '', riskBand: m.riskBand ?? '' } };
    case 'torch-talk': return { trait: 'communication', score: num(m.commScore), extra: { paraphraseRate: m.paraphraseRate ?? '', askScore: m.askScore ?? '' } };
    case 'fair-board': return { trait: 'critical', score: num(m.fbScore), extra: {} };
    case 'mamak-rush': { const o = orgScoreV2(m, cfg); return { trait: 'organisation', score: o ? o.score : num(m.orgScore), extra: o ? { planning: o.planning, pressure: o.pressure } : {} }; }
    case 'fix-it-kit': return { trait: 'creative', score: num(m.creativeScore), extra: {} };
    case 'big-calls': return { trait: 'judgement', score: num(m.judgementScore), extra: {} };
    case 'sunny-tap': return { trait: 'resilience', score: num(m.resilienceScore), extra: {} };
    default: return null;
  }
}

/** Setback hooks (resilience secondary, logged only until validated): one number per game where it exists. */
export function setbackHook(module, m) {
  const k = { 'lucky-dip': 'postSetbackDelta', 'fair-board': 'postBumpDelta', 'mamak-rush': 'postSetbackDelta', 'fix-it-kit': 'blockedRecovery' }[module];
  if (k) return num(m?.[k]);
  if (module === 'big-calls') return m?.unluckyNext === 'followed' ? 1 : m?.unluckyNext === 'strayed' ? 0 : null;
  return null;
}
