// Small pure helpers for the scoring layer (runs in the browser, in node tests and in Apps Script).
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r1 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);
export const r3 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 1000) / 1000);
export const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
/** Percentile rank (0–100) of x in pool: the share below plus half the ties. */
export function percentile(x, pool) {
  if (x == null || !pool.length) return null;
  const below = pool.filter((v) => v < x).length, same = pool.filter((v) => v === x).length;
  return r1((100 * (below + same / 2)) / pool.length);
}
/** The value at quantile q (0–1), linear between order statistics. */
export function quantile(pool, q) {
  if (!pool.length) return null; const s = [...pool].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i);
  return r1(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo));
}
/** AUC: the chance a random "Y" person scores higher than a random "N" person (ties count half). */
export function auc(yes, no) {
  if (!yes.length || !no.length) return null;
  let w = 0; for (const a of yes) for (const b of no) w += a > b ? 1 : a === b ? 0.5 : 0;
  return r3(w / (yes.length * no.length));
}
export const flagsOf = (m) => String(m?.flags || '').split(/[ ,]+/).filter((f) => f && f !== 'none');
/** Python-style max(): the FIRST key with the largest f(k); arrays compare element by element (like tuples). */
export function argmax(keys, f) {
  let best = null, bv = null;
  for (const k of keys) { const v = [].concat(f(k)); if (bv === null || cmpTuple(v, bv) > 0) { best = k; bv = v; } }
  return best;
}
const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] > b[i]) return 1; if (a[i] < b[i]) return -1; } return 0; };
export const argmin = (keys, f) => argmax(keys, (k) => -f(k));
