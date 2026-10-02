// The scoring pipeline L1–L7 (claude/13-scoring-layer-design.md; requests #28–31). One pure function over the raw rows, run by
// the Sheet (apps-script/scoring.gs, a build of this folder) on Rescore all / hourly, and by the unit tests. It never makes a
// decision: it turns raw play into evidence a person reviews (Framework rule: no automatic rejection).
import { mergeConfig, MIB, STAGE_LABEL, STAGE_NO_NORMS } from './config.js';
import { ADAPTERS } from './modules.js';
import { traitOf, setbackHook, RELIABILITY, SINGLE_SOURCE, TRAIT_LABEL } from './traits.js';
import { learningComposite } from './learning.js';
import { learningFactsFromV1 } from './learnFacts.js';
import { ethicsGate } from './ethicsGate.js';
import { spectrum, weightsFor, LEVELS } from './fit.js';
import { finaleRead, combineAutonomy, FINALES, AUTONOMY_PROBES } from './autonomy.js';
import { percentile, quantile, flagsOf, num, r1 } from './util.js';

export const TRAITS_OUT = [...MIB, 'risk'];
export const PROBES = {
  organisation: 'Walk me through your system for tracking commitments in a busy week.',
  learning: 'Tell me about something you had to learn in under a week for work. How did you do it?',
  resilience: 'Describe a day when everything went wrong at once. What did you do in the first hour?',
  judgement: 'Tell me about a decision you made without all the facts. What did you know, and what did you do?',
  critical: 'Tell me about a time you found out something everyone believed was wrong.',
  creative: 'Tell me about a problem you solved with no budget.',
  communication: 'Explain your last project to me as if I were a new intern.',
  risk: 'What’s the biggest professional bet you’ve made? Would you make it again?',
  ethics: 'At the end, a developer button let you change your scores. What went through your mind?',
  bruteForce: 'You played some games more than once. Talk me through what happened.',
};
const CAVEAT_TEXT = {
  tutorialStruggle: (g) => `Needed the practice fail-safe in ${g}: that game's scores (and learning) may reflect the instructions.`,
  priorCasualPlay: (g) => `Played ${g} for fun first, so its learning signals aren't used.`,
  disengaged: (g) => `Looked disengaged in ${g} (very fast, same-answer play).`,
  idle: (g) => `Left ${g} idle for long stretches.`,
  alwaysAgree: (g) => `Agreed with almost every claim in ${g}.`,
  alwaysDisagree: (g) => `Disagreed with almost every claim in ${g}.`,
  notEnoughEvidence: (g) => `${g} ended early: not enough evidence for a score.`,
};

// Official = a completed real round, or one closed during an autonomy finale after its scored part was done (metrics.mainDone).
const leftInFinale = (r) => (r.status === 'quit' || r.status === 'abandoned') && !!r.metrics?.mainDone;
const official = (rs) => rs.filter((r) => r.mode === 'real' && (r.status === 'completed' || leftInFinale(r))).sort((a, b) => a.startedAt - b.startedAt);

/** L1: re-derive a round's metrics from its raw logs with the game's own code; compare with what the client stored. */
export function rederiveRound(r) {
  const a = ADAPTERS[r.module], m = r.metrics || {};
  if (!a) return { metrics: m, l1: 'n/a' };
  let rd = null;
  try { rd = a.rederive ? a.rederive(m) : null; } catch { rd = null; }
  if (!rd) return { metrics: m, l1: 'n/a' };
  const was = num(m[a.primaryKey]), now = num(rd[a.primaryKey]);
  const l1 = was == null && now == null ? 'ok' : was != null && now != null && Math.abs(was - now) <= 0.15 ? 'ok' : 'mismatch';
  return { metrics: { ...m, ...rd, flags: m.flags }, l1 };
}

function bandFor(pct, n, cfg, stage) {
  if (STAGE_NO_NORMS[stage]) return 'no benchmark (alpha)';
  if (n < cfg['norms.minProvisional']) return 'Provisional: no benchmark yet';
  if (n < cfg['norms.minBands']) return `early benchmark (n = ${n})`;
  return pct >= 100 * (1 - cfg['bands.strongTop']) ? 'Strong' : pct <= 100 * cfg['bands.probeBottom'] ? 'Probe' : 'Typical';
}
const riskBandOf = (s, cfg) => (s == null ? '' : s < cfg.riskBands.C[1] ? 'C' : s < cfg.riskBands.B[1] ? 'B' : 'Bo');

export function scoreAll(input) {
  const cfg = mergeConfig(input.config), stage = cfg.stage || 'alpha', now = input.now || Date.now();
  const noNorms = !!STAGE_NO_NORMS[stage];
  const users = input.users || [], regs = input.registrations || {};
  const byUser = {}; for (const r of input.rounds || []) if (!r.isCasual) (byUser[r.userId] ||= []).push(r);
  const evByUser = {}; for (const e of input.interactions || []) (evByUser[e.userId] ||= []).push(e);

  // ---- L1 + L2 for every registered candidate's rounds (cached per round)
  const scored = new Map();
  const scoreRound = (r) => {
    if (scored.has(r)) return scored.get(r);
    const { metrics, l1 } = rederiveRound(r);
    const t = traitOf(r.module, metrics, cfg);
    const out = { r, metrics, l1, trait: t?.trait, score: t?.score ?? null, extra: t?.extra || {} };
    scored.set(r, out); return out;
  };

  // ---- L4 norms: each candidate's first official result per module version (not casual, not Dev Test, not truncated)
  const pools = {}; // "module@version" → [scores]
  for (const u of users) {
    const firsts = {};
    for (const r of official(byUser[u.userId] || [])) { const k = `${r.module}@${r.moduleVersion}`; if (!firsts[k]) firsts[k] = r; }
    for (const [k, r] of Object.entries(firsts)) { if (r.metrics?.truncated) continue; const s = scoreRound(r); if (s.score != null) (pools[k] ||= []).push(s.score); }
  }

  const scores = [], insights = [], learnPool = [];
  const perUser = users.map((u) => {
    const run = Number(u.currentRun) || 1, rs = byUser[u.userId] || [];
    // Framework: only the FIRST completed real round of each game counts, whichever run it was in (a later "Start a new
    // run" must not hide the official results; alpha #35 A4). Later runs are a brute-force flag, not a replacement.
    const inRun = rs;
    const off = {}; for (const r of official(rs)) if (!off[r.module]) off[r.module] = scoreRound(r);
    const traits = {};
    for (const [module, s] of Object.entries(off)) {
      if (!s.trait) continue;
      const pool = pools[`${module}@${s.r.moduleVersion}`] || [];
      const pct = noNorms || pool.length < cfg['norms.minProvisional'] ? null : percentile(s.score, pool);
      traits[s.trait] = { module, score: s.score, pct, n: pool.length, version: s.r.moduleVersion, extra: s.extra, l1: s.l1, metrics: s.metrics };
    }
    const entries = Object.entries(off).map(([module, s]) => ({ module, priorCasualPlay: !!s.metrics.priorCasualPlay, facts: ADAPTERS[module]?.learningFacts ? ADAPTERS[module].learningFacts(s.metrics) : learningFactsFromV1(s.metrics) }));
    const learn = learningComposite(entries, cfg);
    if (learn.score != null) learnPool.push(learn.score);
    const ev = (evByUser[u.userId] || []).slice().sort((a, b) => a.t - b.t); // every run: a later run can't wash out a cheat
    const eth = ethicsGate(ev, Object.keys(off).length > 0);
    const auto = combineAutonomy(Object.keys(FINALES).filter((m) => off[m]).map((m) => finaleRead(m, off[m].metrics, ADAPTERS[m], cfg)), cfg);
    return { u, run, inRun, off, traits, learn, eth, entries, auto };
  });

  for (const p of perUser) {
    const { u, run, inRun, off, traits, learn, eth, auto } = p;
    const reg = regs[u.userId] || {}, fn = reg.desiredFunction || 'Other', type = reg.employmentType || 'Full-time';
    // learning band against the learning pool once it is big enough
    const lpct = !noNorms && learnPool.length >= cfg['norms.minBands'] && learn.score != null ? percentile(learn.score, learnPool) : null;
    const learnOut = lpct != null ? learningComposite(p.entries, cfg, { n: learnPool.length, pct: lpct }) : learn;
    const allNormed = MIB.every((t) => t === 'learning' || !traits[t] || traits[t].n >= cfg['norms.minBands']) && !noNorms;
    const values = {}; for (const t of MIB) if (t === 'learning') values.learning = learnOut.score; else if (traits[t]) values[t] = allNormed && traits[t].pct != null ? traits[t].pct : traits[t].score;
    const risk = traits.risk?.score ?? null;
    const autoOn = cfg['autonomy.enabled'] && auto.factorLevel != null;
    const spec = spectrum(values, risk, fn, type, cfg, autoOn ? auto.factorLevel : null);

    // ---- L6 flags (always discussed, never auto-reject)
    const red = [], notes = [], positives = [], caveats = [];
    if (eth.gate === 'flag') red.push('ethics: confirmed a higher score and left it');
    if (eth.gate === 'note') notes.push('ethics: raised a score, then put it back (self-corrected)');
    if (eth.positive) positives.push('ethics: reported the developer tool');
    const pctOf = (t) => (t === 'learning' ? lpct : traits[t]?.pct);
    if (traits.organisation && pctOf('organisation') != null && traits.organisation.n >= cfg['norms.minBands'] && pctOf('organisation') <= 100 * cfg['bands.probeBottom']) red.push('organisation in the bottom 20%');
    if (lpct != null && learnOut.nParts >= cfg['learn.redFlagMinParts'] && lpct <= 100 * cfg['bands.probeBottom']) red.push('learning in the bottom 20%');
    const ldFlags = flagsOf(traits.risk?.metrics);
    if (ldFlags.includes('reckless')) red.push('risk: reckless (kept pushing after losses)');
    if (ldFlags.includes('frozen')) red.push('risk: frozen (banked almost nothing)');
    if (auto.red) red.push('autonomy: L1 in both finales (matters when considering Mid or Lead)');
    notes.push(...auto.notes);
    const realTries = {}; inRun.filter((r) => r.mode === 'real').forEach((r) => { const k = `${r.runNo}|${r.module}`; realTries[k] = (realTries[k] || 0) + 1; });
    const multi = [...new Set(Object.entries(realTries).filter(([, n]) => n > 1).map(([k]) => k.split('|')[1]))].map((m) => ADAPTERS[m]?.title || m);
    if (run > 1 || multi.length) red.push(`brute-force pattern: ${run > 1 ? `run ${run}` : ''}${run > 1 && multi.length ? '; ' : ''}${multi.length ? `restarted ${multi.join(', ')}` : ''}`);
    const unfinished = inRun.filter((r) => r.mode === 'real' && (r.status === 'quit' || r.status === 'abandoned') && !leftInFinale(r)).map((r) => ADAPTERS[r.module]?.title || r.module);
    if (unfinished.length) notes.push(`left unfinished: ${[...new Set(unfinished)].join(', ')}`);
    const finaleLeft = inRun.filter((r) => r.mode === 'real' && leftInFinale(r)).map((r) => FINALES[r.module] || r.module);
    if (finaleLeft.length) notes.push(`left during the ${[...new Set(finaleLeft)].join(' and ')} finale (the scored part counts)`);
    const tabs = input.away?.[`${u.userId}|fair-board`] || 0;
    if (tabs) notes.push(`switched tabs ${tabs}× during Fair Board`);
    for (const [module, s] of Object.entries(off)) for (const f of flagsOf(s.metrics)) if (CAVEAT_TEXT[f]) caveats.push(CAVEAT_TEXT[f](ADAPTERS[module]?.title || module));
    if (learnOut.practised.length) caveats.push(CAVEAT_TEXT.priorCasualPlay(learnOut.practised.map((m) => ADAPTERS[m]?.title || m).join(', ')));
    const single = SINGLE_SOURCE.filter((t) => traits[t]);
    if (single.length) caveats.push(`Single-source traits (one game each): ${single.map((t) => TRAIT_LABEL[t]).join(', ')}.`);
    if (MIB.some((t) => traits[t] && traits[t].n >= cfg['norms.minProvisional'] && traits[t].n < cfg['norms.minBands'])) caveats.push('Early benchmark: fewer than 30 candidates, so use results to choose interview probes only.');
    if (STAGE_LABEL[stage]) caveats.push(`${STAGE_LABEL[stage]}.`);

    // ---- the Scores row
    const offRuns = [...new Set(Object.values(off).map((s) => Number(s.r.runNo) || 1))].sort((a, b) => a - b);
    const row = { stage: STAGE_LABEL[stage] || 'live', scoringVersion: cfg.scoringVersion, scoredAt: new Date(now).toISOString(), user_id: u.userId, name: u.name || '', function: fn, type, run: offRuns.length === 1 ? offRuns[0] : offRuns.length ? offRuns.join(', ') : run };
    for (const t of TRAITS_OUT) {
      const x = t === 'learning' ? null : traits[t];
      if (t === 'learning') Object.assign(row, { learning: learnOut.score ?? '', 'learning band': learnOut.band, 'learning pct': lpct ?? '', 'learning evidence': `${learnOut.nParts} parts / ${learnOut.games.length} games`, 'learning reliability': RELIABILITY.learning, 'learning version': '' });
      else if (t === 'risk') Object.assign(row, { risk: x?.score ?? '', 'risk band': x ? riskBandOf(x.score, cfg) : '', 'risk pct': '', 'risk evidence': x ? 1 : 0, 'risk reliability': x ? RELIABILITY.risk : '', 'risk version': x?.version ?? '' });
      else Object.assign(row, { [t]: x?.score ?? '', [`${t} band`]: x ? (x.score == null ? 'Not enough evidence' : bandFor(x.pct, x.n, cfg, stage)) : '', [`${t} pct`]: x?.pct ?? '', [`${t} evidence`]: x ? 1 : 0, [`${t} reliability`]: x ? RELIABILITY[t] + (SINGLE_SOURCE.includes(t) ? ', single-source' : '') : '', [`${t} version`]: x?.version ?? '' });
    }
    Object.assign(row, {
      'organisation planning': traits.organisation?.extra.planning ?? '', 'organisation pressure': traits.organisation?.extra.pressure ?? '',
      'risk calibration': traits.risk?.extra.riskCalibration ?? '', 'learning parts': Object.entries(learnOut.parts).map(([k, v]) => `${k} ${v}`).join(' · '),
      practisedNote: learnOut.practised.length ? `practised before: ${learnOut.practised.join(', ')}` : '',
      ethicsGate: eth.gate, ethicsDetail: eth.detail, ethicsOpportunities: eth.opportunities,
      fitBasis: allNormed ? 'percentiles' : 'raw scores (no benchmark yet)', roleFit: spec.fit.Mid ?? '',
      fitJunior: spec.fit.Junior ?? '', fitMid: spec.fit.Mid ?? '', fitLead: spec.fit.Lead ?? '', suggestedLevel: '', bestFitFunction: spec.bestFitFunction,
      autonomy: auto.label, autonomyLevel: auto.level ?? '', 'autonomy detail': auto.detail,
      'autonomy factor': !cfg['autonomy.enabled'] ? 'off (autonomy.enabled = false): traits only' : autoOn ? `applied (L${auto.factorLevel} vs each level’s target)` : 'not applied (not measured, provisional or n/a): traits only',
      redFlags: red.join('; '), notes: notes.join('; '), positives: positives.join('; '), caveats: caveats.join(' '),
      'secondary: paraphraseRate': traits.communication?.extra.paraphraseRate ?? '', 'secondary: askScore': traits.communication?.extra.askScore ?? '',
      'secondary: setback hooks': Object.entries(off).map(([m, s]) => [m, setbackHook(m, s.metrics)]).filter(([, v]) => v != null).map(([m, v]) => `${m} ${v}`).join(' · '),
      l1Check: Object.entries(off).map(([m, s]) => `${m} ${s.l1}`).join(' · '),
    });
    scores.push(row);

    // ---- L7 insight card (deterministic sentences: every word traces back to a number above)
    const { weights } = weightsFor(fn, type, 'Mid', cfg);
    const scoredTraits = MIB.filter((t) => values[t] != null);
    const tl = (t) => { if (t === 'learning') return `${TRAIT_LABEL.learning} (${learnOut.band})`; const b = bandFor(traits[t].pct, traits[t].n, cfg, stage); return `${TRAIT_LABEL[t]} (${['Strong', 'Typical', 'Probe'].includes(b) ? b : r1(values[t])})`; };
    const strongest = [...scoredTraits].sort((a, b) => values[b] - values[a]).slice(0, 2);
    const lowest = scoredTraits.filter((t) => weights[t] >= 2).sort((a, b) => values[a] - values[b]).slice(0, 2);
    const fitTxt = ['Junior', 'Mid', 'Lead'].map((L) => `${L} ${spec.fit[L] ?? '–'}`).join(' · ');
    const headline = scoredTraits.length ? `${fn} fit: ${fitTxt} (${allNormed ? 'vs other candidates' : 'raw, no benchmark yet'}${autoOn ? '' : '; traits only'}). Strongest: ${strongest.map(tl).join(', ')}.` : 'No completed games yet.';
    // autonomy probe (Framework v0.7): when the read is a range, inconsistent, provisional or missing, matched to the best-fitting level
    const bestLevel = LEVELS.filter((L) => spec.fit[L] != null).sort((a, b) => spec.fit[b] - spec.fit[a])[0] || 'Mid';
    const autoProbe = auto.kind !== 'agree' && scoredTraits.length ? [`autonomy (${auto.label}; ${bestLevel}): “${AUTONOMY_PROBES[bestLevel]}”`] : [];
    const probes = [...lowest.map((t) => `${TRAIT_LABEL[t]}: “${PROBES[t]}”`), ...(eth.gate === 'flag' ? [`integrity: “${PROBES.ethics}”`] : []), ...(red.some((x) => x.startsWith('brute')) ? [`repeat plays: “${PROBES.bruteForce}”`] : []), ...autoProbe];
    insights.push({ stage: row.stage, user_id: u.userId, name: u.name || '', role: `${fn} · ${type}`, headline, autonomy: auto.label, 'probe first': probes.join('\n'),
      'red flags': red.join('\n'), 'read with care': caveats.join('\n'),
      'not measured': `${auto.level == null ? 'Autonomy (no finale read yet), domain' : 'Domain'} skills, motivation for this role, and culture beyond integrity.`, scoringVersion: cfg.scoringVersion });
  }

  // ---- the Norms tab
  const norms = Object.entries(pools).sort().map(([k, pool]) => {
    const [module, version] = k.split('@');
    const status = noNorms ? 'off (alpha)' : pool.length < cfg['norms.minProvisional'] ? 'no benchmark yet' : pool.length < cfg['norms.minBands'] ? 'early benchmark' : 'bands';
    return { module, moduleVersion: version, trait: ADAPTERS[module]?.trait || '', n: pool.length, p20: quantile(pool, 0.2) ?? '', p50: quantile(pool, 0.5) ?? '', p70: quantile(pool, 0.7) ?? '', status, stage: STAGE_LABEL[stage] || 'live', scoringVersion: cfg.scoringVersion };
  });
  if (learnPool.length) norms.push({ module: 'suite', moduleVersion: '', trait: 'learning', n: learnPool.length, p20: quantile(learnPool, 0.2), p50: quantile(learnPool, 0.5), p70: quantile(learnPool, 0.7),
    status: noNorms ? 'off (alpha)' : learnPool.length < cfg['norms.minBands'] ? 'provisional bands (70 / 40)' : 'bands', stage: STAGE_LABEL[stage] || 'live', scoringVersion: cfg.scoringVersion });

  return { scoringVersion: cfg.scoringVersion, stage, stageLabel: STAGE_LABEL[stage], scores, insights, norms, config: cfg };
}
