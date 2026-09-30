// Learning v2 module contract (Game Ideas SUITE learning v2, request #28): learningFacts(metrics) → facts, per round.
//   pickup    { extra, max, steps, failSafes } | null   (tutorial tries beyond the first; a fail-safe counts as the step's maximum)
//   firstUse  [{ probe, pass }]                          (a newly taught rule applied right the first time it matters)
//   repeats   { opportunities, repeated } | null         (a mistake, once shown, made again)
//   trapPairs [{ pair, firstFailed, secondPassed }]      (the same trap twice; only pairs whose first trap was failed count)
// Games store their counts in metrics.learn (v1 shape: firstUse [pass, n], pickup [extra, max], noRepeat [repeats, could],
// trapPairs [saved, failedFirst], probes "name+ name-"); this converts them, so old and new rounds read the same way.
export function learningFactsFromV1(m) {
  const L = m && m.learn; if (!L) return null;
  const f = { pickup: null, firstUse: [], repeats: null, trapPairs: [] };
  if (Array.isArray(L.pickup) && L.pickup[1] > 0) f.pickup = { extra: Number(L.pickup[0]) || 0, max: Number(L.pickup[1]), steps: L.pickup[1] / 2, failSafes: null };
  if (Array.isArray(L.firstUse) && L.firstUse[1] > 0) {
    const named = typeof L.probes === 'string' ? L.probes.split(' ').filter(Boolean).map((s) => ({ probe: s.slice(0, -1), pass: s.endsWith('+') })) : [];
    if (named.length === L.firstUse[1]) f.firstUse = named;
    else for (let i = 0; i < L.firstUse[1]; i++) f.firstUse.push({ probe: `probe${i + 1}`, pass: i < L.firstUse[0] });
  }
  if (Array.isArray(L.noRepeat) && L.noRepeat[1] > 0) f.repeats = { opportunities: Number(L.noRepeat[1]), repeated: Number(L.noRepeat[0]) || 0 };
  if (Array.isArray(L.trapPairs) && L.trapPairs[1] > 0) for (let i = 0; i < L.trapPairs[1]; i++) f.trapPairs.push({ pair: `pair${i + 1}`, firstFailed: true, secondPassed: i < L.trapPairs[0] });
  return f.pickup || f.firstUse.length || f.repeats || f.trapPairs.length ? f : null;
}
