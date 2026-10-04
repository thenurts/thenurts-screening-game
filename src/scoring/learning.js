// L3 learning composite v2 (Game Ideas SUITE learning v2 + Framework v0.4–v0.5, request #28). Pure.
// entries: [{ module, facts (learnFacts contract) | null, priorCasualPlay }] from one candidate's official rounds.
// Rules: weights firstUse 30 · pickup 20 · noRepeat 20 · trapPairs 15 · adaptation 15 (off until item norms); n/a parts drop
// and the rest rescale; a module played for fun first contributes nothing; ≥ 2 parts from ≥ 2 games, else not enough
// evidence; shown as a band (Low / Typical / High), never a precise number to the candidate.
import { DEFAULTS } from './config.js';
import { learningFactsFromV1 } from './learnFacts.js';

export function learningComposite(entries, cfg = DEFAULTS, norms = null) {
  const acc = { firstUse: [0, 0], pickup: [0, 0], noRepeat: [0, 0], trapPairs: [0, 0] };
  const games = { firstUse: new Set(), pickup: new Set(), noRepeat: new Set(), trapPairs: new Set() };
  const practised = [];
  for (const e of entries) {
    if (e.priorCasualPlay) { practised.push(e.module); continue; }
    const f = e.facts; if (!f) continue;
    if (f.firstUse?.length) { acc.firstUse[0] += f.firstUse.filter((p) => p.pass).length; acc.firstUse[1] += f.firstUse.length; games.firstUse.add(e.module); }
    if (f.pickup && f.pickup.max > 0) { acc.pickup[0] += f.pickup.extra; acc.pickup[1] += f.pickup.max; games.pickup.add(e.module); }
    if (f.repeats && f.repeats.opportunities > 0) { acc.noRepeat[0] += f.repeats.repeated; acc.noRepeat[1] += f.repeats.opportunities; games.noRepeat.add(e.module); }
    const tp = (f.trapPairs || []).filter((p) => p.firstFailed);
    if (tp.length) { acc.trapPairs[0] += tp.filter((p) => p.secondPassed).length; acc.trapPairs[1] += tp.length; games.trapPairs.add(e.module); }
  }
  const parts = {};
  if (acc.firstUse[1]) parts.firstUse = acc.firstUse[0] / acc.firstUse[1];
  if (acc.pickup[1]) parts.pickup = 1 - acc.pickup[0] / acc.pickup[1];
  if (acc.noRepeat[1]) parts.noRepeat = 1 - acc.noRepeat[0] / acc.noRepeat[1];
  if (acc.trapPairs[1]) parts.trapPairs = acc.trapPairs[0] / acc.trapPairs[1];
  const keys = Object.keys(parts), used = new Set(keys.flatMap((k) => [...games[k]]));
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const base = { parts: Object.fromEntries(keys.map((k) => [k, round3(parts[k])])), nParts: keys.length, games: [...used], practised, noErrors: !acc.noRepeat[1] };
  // FW-11 (Adrian, 2026-10-04): first-use probes from ≥ learn.firstUseOnlyGames games are enough on their own, so a perfect player who
  // skipped the tutorials (pickup n/a) and made no mistakes (noRepeat / trapPairs n/a) isn't left without a learning read
  const probesOnly = keys.length === 1 && keys[0] === 'firstUse' && games.firstUse.size >= (cfg['learn.firstUseOnlyGames'] ?? 3);
  if (!probesOnly && (keys.length < cfg['learn.minParts'] || used.size < cfg['learn.minGames'])) return { ...base, score: null, band: 'Not enough evidence' };
  const w = cfg['learn.weights'], tw = keys.reduce((a, k) => a + w[k], 0);
  const score = Math.round((100 * keys.reduce((a, k) => a + w[k] * parts[k], 0)) / tw);
  let band;
  if (norms && norms.n >= cfg['norms.minBands']) band = norms.pct >= 100 * (1 - cfg['bands.strongTop']) ? 'High' : norms.pct <= 100 * cfg['bands.probeBottom'] ? 'Low' : 'Typical';
  else { const b = cfg['learn.provisionalBands']; band = score >= b.high ? 'High' : score < b.low ? 'Low' : 'Typical'; }
  return { ...base, score, band };
}

/** From raw per-module metrics (the candidate's report, and older rounds): { moduleId: metrics }. */
export function learningFromMetrics(results, adapters = null, cfg = DEFAULTS) {
  return learningComposite(Object.entries(results || {}).map(([module, m]) => ({
    module, priorCasualPlay: !!m?.priorCasualPlay, facts: adapters?.[module]?.learningFacts ? adapters[module].learningFacts(m) : learningFactsFromV1(m),
  })), cfg);
}
