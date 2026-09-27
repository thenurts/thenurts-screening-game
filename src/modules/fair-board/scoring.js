// Fair Board scoring (build pack CT2 v1 §5). Pure functions over the raw claim log, so the Sheet-side scoring layer can reuse them.
// A claim entry: { n, id, board, type, truth: 'sound'|'flawed', cue: null|'sure'|'crowd', response: 'agree'|'doubt', checks: count, ms }

export const SCORING = { sameFlag: 22, disengagedMedianMs: 1000, disengagedSame: 20, checkAllFlag: 22, bumpAfter: 12 };

export const isCorrect = (c) => (c.truth === 'sound') === (c.response === 'agree');
const rate = (list, f) => (list.length ? list.filter(f).length / list.length : 0);
const r3 = (x) => Math.round(x * 1000) / 1000;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

export function score(claims, cfg = SCORING) {
  const flawed = claims.filter((c) => c.truth === 'flawed'), sound = claims.filter((c) => c.truth === 'sound');
  const hitRate = rate(flawed, (c) => c.response === 'doubt');
  const falseAlarm = rate(sound, (c) => c.response === 'doubt');
  const claimAccuracy = hitRate - falseAlarm;
  const checkCalibration = rate(flawed, (c) => c.checks > 0) - rate(sound, (c) => c.checks > 0);
  const fbScore = Math.round(100 * (0.75 * (claimAccuracy + 1) / 2 + 0.25 * (checkCalibration + 1) / 2));
  const cued = claims.filter((c) => c.cue), plain = claims.filter((c) => !c.cue);
  const cueSway = rate(cued, (c) => !isCorrect(c)) - rate(plain, (c) => !isCorrect(c)); // + = more errors when the claim sounds sure / popular
  const typeAccuracy = {};
  for (const t of [...new Set(claims.map((c) => c.type))]) typeAccuracy[t] = r3(rate(claims.filter((c) => c.type === t), isCorrect));
  const b = cfg.bumpAfter;
  const before = claims.filter((c) => c.n >= b - 4 && c.n <= b), after = claims.filter((c) => c.n > b && c.n <= b + 5);
  const postBumpDelta = before.length && after.length ? r3(rate(after, isCorrect) - rate(before, isCorrect)) : '';
  const agrees = claims.filter((c) => c.response === 'agree').length, doubts = claims.length - agrees;
  const flags = [];
  if (agrees >= cfg.sameFlag) flags.push('alwaysAgree');
  if (doubts >= cfg.sameFlag) flags.push('alwaysDoubt');
  if (claims.length && median(claims.map((c) => c.ms)) < cfg.disengagedMedianMs && Math.max(agrees, doubts) >= cfg.disengagedSame) flags.push('disengaged');
  if (claims.filter((c) => c.checks > 0).length >= cfg.checkAllFlag) flags.push('checkAll');
  return {
    correct: claims.filter(isCorrect).length, claims: claims.length,
    hitRate: r3(hitRate), falseAlarm: r3(falseAlarm), claimAccuracy: r3(claimAccuracy), checkCalibration: r3(checkCalibration), fbScore,
    cueSway: r3(cueSway), typeAccuracy, postBumpDelta,
    checks: claims.reduce((s, c) => s + (c.checks || 0), 0), checkedClaims: claims.filter((c) => c.checks > 0).length,
    medianMs: Math.round(median(claims.map((c) => c.ms))),
    flags: flags.join(','),
  };
}
