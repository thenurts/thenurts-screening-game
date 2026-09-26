// Lucky Dip scoring (build pack v1 §6). Pure functions over the RAW decision list, so the Sheet-side
// scoring layer can recompute later with a new config. Thresholds = the future ScoringConfig keys.
export const SCORING = {
  version: 'ld-1',
  bands: [35, 65],           // risk.bands: C < 35 ≤ B < 65 ≤ Bo
  calibrationBand: 0.35,     // risk.calibrationBand
  calibNaBelow: 1.3,         // risk.calibNaBelow
  recklessScore: 85,         // risk.recklessScore
  frozenScore: 10,           // risk.frozenScore
  disengagedMedianMs: 350,   // risk.disengagedMedianMs
  consistencyLow: 0.6,       // risk.consistencyLow
  consistencyNote: 0.75,     // risk.consistencyNote
  idleNudges: 3,             // risk.idleNudges
  bootstrapN: 200,           // risk.bootstrapN
  precisionPct: 80,          // risk.precisionPct
};

/**
 * decisions: [{ bag, stake: 'normal'|'gold'|'free', k, choice: 'keep'|'dip', ms }]
 * bags:      [{ bag, stake, j, dips, endedBy: 'keep'|'pepper'|'auto', points }]  (dips = player dips, excl. Mia's)
 */
export function intendedStop(decisions) {
  const p = [];
  for (let k = 1; k <= 4; k++) {
    const at = decisions.filter((d) => d.k === k);
    p[k] = at.length ? at.filter((d) => d.choice === 'dip').length / at.length : k > 1 ? p[k - 1] : 0;
  }
  return 1 + p[1] + p[1] * p[2] + p[1] * p[2] * p[3] + p[1] * p[2] * p[3] * p[4];
}
export const riskFromStop = (s) => Math.round(1000 * (100 * (s - 1)) / 4) / 1000;

const band = (score, cfg) => (score < cfg.bands[0] ? 'C' : score < cfg.bands[1] ? 'B' : 'Bo');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

export function score({ decisions, bags, idleNudges = 0, timedOut = false, repeatAttempt = false }, cfg = SCORING) {
  const scored = decisions.filter((d) => d.stake !== 'free');
  const scoredBags = bags.filter((b) => b.stake !== 'free');
  const stop = intendedStop(scored);
  const riskScore = riskFromStop(stop);

  // bootstrap over bags that had at least one decision
  const byBag = {};
  scored.forEach((d) => { (byBag[d.bag] ||= []).push(d); });
  const groups = Object.values(byBag);
  const rand = rng(12345);
  const sims = [];
  for (let i = 0; i < cfg.bootstrapN && groups.length; i++) {
    const sample = [];
    for (let g = 0; g < groups.length; g++) sample.push(...groups[Math.floor(rand() * groups.length)]);
    sims.push(riskFromStop(intendedStop(sample)));
  }
  sims.sort((a, b) => a - b);
  const tail = (100 - cfg.precisionPct) / 200;
  const lo = sims.length ? sims[Math.floor(tail * (sims.length - 1))] : riskScore;
  const hi = sims.length ? sims[Math.ceil((1 - tail) * (sims.length - 1))] : riskScore;
  const bLo = band(lo, cfg), bHi = band(hi, cfg);
  const riskBand = bLo === bHi ? band(riskScore, cfg) : `${bLo}/${bHi} borderline`;

  // consistency: share of decisions matching the best single stop threshold t (dip while k < t)
  let consistency = null;
  if (scored.length) {
    consistency = 0;
    for (let t = 1; t <= 5; t++) consistency = Math.max(consistency, scored.filter((d) => (d.k < t) === (d.choice === 'dip')).length / scored.length);
  }
  const stakeShift = r2(intendedStop(scored.filter((d) => d.stake === 'normal')) - intendedStop(scored.filter((d) => d.stake === 'gold')));

  // calibration: depth on the next scored bag after each loss vs all other decision bags
  const depth = (b) => b.dips; // dips the player chose before the bag ended
  const decided = scoredBags.filter((b) => b.j !== 1);
  const afterLoss = new Set();
  scoredBags.forEach((b, i) => { if (b.endedBy === 'pepper') { const nxt = scoredBags.slice(i + 1).find((x) => x.j !== 1); if (nxt) afterLoss.add(nxt.bag); } });
  const post = decided.filter((b) => afterLoss.has(b.bag)).map(depth);
  const other = decided.filter((b) => !afterLoss.has(b.bag)).map(depth);
  const calDelta = post.length && other.length ? mean(post) - mean(other) : null;
  let riskCalibration = calDelta == null ? 'n/a' : calDelta <= -cfg.calibrationBand ? 'yes' : calDelta >= cfg.calibrationBand ? 'no' : 'partly';
  if (stop <= cfg.calibNaBelow) riskCalibration = 'n/a-low';
  const d17 = (from, to) => mean(scoredBags.filter((b) => b.bag >= from && b.bag <= to && b.j !== 1).map(depth));
  const postSetbackDelta = r2(d17(5, 7) != null && d17(1, 3) != null ? d17(5, 7) - d17(1, 3) : null);

  const msMed = median(scored.map((d) => d.ms));
  const allSame = scored.length > 0 && new Set(scored.map((d) => d.choice)).size === 1;
  const disengaged = (msMed != null && msMed < cfg.disengagedMedianMs && ((consistency >= 0.95 && allSame) || consistency < cfg.consistencyLow)) || idleNudges >= cfg.idleNudges;
  const freeDips = bags.filter((b) => b.stake === 'free').map((b) => b.dips);
  const flags = [];
  if (disengaged) flags.push('disengaged');
  else {
    if (riskScore >= cfg.recklessScore && riskCalibration === 'no') flags.push('reckless');
    if (riskScore <= cfg.frozenScore && freeDips.some((n) => n === 0)) flags.push('frozen');
  }
  if (timedOut) flags.push('idle');
  if (repeatAttempt) flags.push('repeatAttempt');
  if (consistency != null && consistency < cfg.consistencyNote) flags.push('inconsistent');

  return {
    intendedStop: r2(stop), riskScore: Math.round(riskScore), riskBand, riskPrecisionLo: Math.round(lo), riskPrecisionHi: Math.round(hi),
    consistency: r2(consistency), stakeShift, riskCalibration, calibrationDelta: r2(calDelta), postSetbackDelta,
    medianDecisionMs: msMed, flags: flags.join(' ') || 'none', scoringVersion: cfg.version,
  };
}
