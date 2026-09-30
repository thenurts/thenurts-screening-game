// L5 role fit and the suitability spectrum (Framework "Role profiles"; design §6). Pure.
import { DEFAULTS, MIB } from './config.js';
import { r1 } from './util.js';
import { autonomyFactor } from './autonomy.js';

/** Role weights for a function × employment type × level, with the caps, floors and the Intern caps applied. */
export function weightsFor(fn, type, level, cfg = DEFAULTS) {
  const role = cfg.roles[fn] || cfg.roles.Other, w = {};
  for (const t of MIB) w[t] = role[t] || 0;
  const ta = cfg.typeAdjust[type] || {}, la = cfg.levelAdjust[level] || {};
  for (const [t, d] of Object.entries(ta)) if (t !== 'cap' && t in w) w[t] += d;
  for (const [t, d] of Object.entries(la)) if (t in w) w[t] += d;
  for (const t of MIB) w[t] = Math.min(cfg['weights.cap'], w[t]);
  for (const [t, c] of Object.entries(ta.cap || {})) w[t] = Math.min(c, w[t]);
  for (const [t, f] of Object.entries(cfg['weights.floor'])) w[t] = Math.max(f, w[t]);
  return { weights: w, riskBand: role.risk };
}

/** 1.0 inside the role's risk band, falling linearly to 0.8 at 40 points outside it. */
export function riskFactor(risk, band, cfg = DEFAULTS) {
  if (risk == null || !band) return 1;
  const [lo, hi] = cfg.riskBands[band] || [0, 100];
  const out = risk < lo ? lo - risk : risk > hi ? risk - hi : 0;
  return 1 - (1 - cfg['risk.outsideFloor']) * Math.min(1, out / cfg['risk.outsideSpan']);
}

/** values: { trait: 0–100 } (percentiles once norms exist, raw before). Missing traits drop out and the rest rescale.
 * autoLevel: the combined autonomy level used for the factor (null = not measured / provisional → factor 1). */
export function roleFit(values, risk, fn, type, level, cfg = DEFAULTS, autoLevel = null) {
  const { weights, riskBand } = weightsFor(fn, type, level, cfg);
  let sw = 0, s = 0;
  for (const t of MIB) if (values[t] != null && weights[t] > 0) { sw += weights[t]; s += weights[t] * values[t]; }
  if (!sw) return null;
  return r1((s / sw) * riskFactor(risk, riskBand, cfg) * autonomyFactor(autoLevel, level, type, cfg));
}

export const LEVELS = ['Junior', 'Mid', 'Lead'];
export const FUNCTIONS = ['Events', 'Marketing', 'Sales', 'Product', 'Creative', 'Other'];

/** The suitability spectrum for the registered function and type, plus the best-fit function (at Mid). */
export function spectrum(values, risk, fn, type, cfg = DEFAULTS, autoLevel = null) {
  const fit = Object.fromEntries(LEVELS.map((L) => [L, roleFit(values, risk, fn, type, L, cfg, autoLevel)]));
  let best = null;
  for (const f of FUNCTIONS) { const v = roleFit(values, risk, f, type, 'Mid', cfg, autoLevel); if (v != null && (!best || v > best.fit)) best = { fn: f, fit: v }; }
  return { fit, bestFitFunction: best ? `${best.fn} (${best.fit})` : '' };
}
