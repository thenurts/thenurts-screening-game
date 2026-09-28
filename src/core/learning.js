// Suite learning score (Game Ideas "SUITE · Learning" v1.1, request #20). No dedicated game and no replays: each module
// that has learning evidence puts counts in metrics.learn = { firstUse: [passed, probes], pickup: [extraTries, maxExtra],
// noRepeat: [repeats, couldRepeat], trapPairs: [saved, failedFirst] } (null / zero totals = no evidence for that part).
// Pure, so the Sheet-side scoring layer can reuse the same formulas (ScoringConfig learn.*).
export const LEARN = {
  weights: { firstUse: 0.25, pickup: 0.25, noRepeat: 0.20, trapPairs: 0.15, adaptation: 0.15 },
  itemNormsReady: false, // adaptation (item-adjusted within-round slope) stays off until 30+ plays
  minParts: 2, minGames: 2,
  bands: [[70, 'quick'], [40, 'steady'], [0, 'slow']],
};

/** results: { moduleId: metrics }. Returns { score|null, band, parts, games, reason }. */
export function learningScore(results, cfg = LEARN) {
  const sum = { firstUse: [0, 0], pickup: [0, 0], noRepeat: [0, 0], trapPairs: [0, 0] };
  const gamesPer = { firstUse: new Set(), pickup: new Set(), noRepeat: new Set(), trapPairs: new Set() };
  for (const [id, m] of Object.entries(results || {})) {
    const L = m && m.learn; if (!L) continue;
    for (const k of Object.keys(sum)) {
      const v = L[k]; if (!Array.isArray(v) || !(v[1] > 0)) continue;
      sum[k][0] += Number(v[0]) || 0; sum[k][1] += Number(v[1]); gamesPer[k].add(id);
    }
  }
  const parts = {};
  if (sum.firstUse[1]) parts.firstUse = sum.firstUse[0] / sum.firstUse[1];
  if (sum.pickup[1]) parts.pickup = 1 - sum.pickup[0] / sum.pickup[1];
  if (sum.noRepeat[1]) parts.noRepeat = 1 - sum.noRepeat[0] / sum.noRepeat[1]; // no errors to learn from → n/a
  if (sum.trapPairs[1]) parts.trapPairs = sum.trapPairs[0] / sum.trapPairs[1];
  const games = new Set(Object.keys(parts).flatMap((k) => [...gamesPer[k]]));
  const keys = Object.keys(parts);
  if (keys.length < cfg.minParts || games.size < cfg.minGames) return { score: null, band: 'none', parts, games: [...games], reason: 'Not enough evidence' };
  const w = keys.reduce((a, k) => a + cfg.weights[k], 0);
  const score = Math.round((100 * keys.reduce((a, k) => a + cfg.weights[k] * parts[k], 0)) / w);
  const band = cfg.bands.find(([min]) => score >= min)[1];
  return { score, band, parts: Object.fromEntries(keys.map((k) => [k, Math.round(parts[k] * 1000) / 1000])), games: [...games], noErrors: !sum.noRepeat[1] };
}
