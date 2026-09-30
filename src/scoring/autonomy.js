// Autonomy (request #34; Framework v0.7 "Autonomy level"; 11-game-concepts.md SUITE autonomy v1; tests/autonomy-reference.py).
// Two open-brief finales (Mamak "Closing Time", Fix-It "Free Fix") → a level per finale → one combined read → autonomyFactor.
// Read from self-direction behaviour, not skill: tips asked before trying, coherence of self-chosen priorities, balance, and an
// outcome floor. Tips are free and never lower any score; only a PATTERN of asking before trying feeds L1.
import { DEFAULTS } from './config.js';
import { flagsOf } from './util.js';

export const FINALES = { 'mamak-rush': 'Closing Time', 'fix-it-kit': 'Free Fix' };

/** One finale's level from its facts (the reference rules; thresholds in ScoringConfig `autonomy.rules`). */
export function levelOf(f, cfg = DEFAULTS) {
  const R = cfg['autonomy.rules'];
  if (f.tipBefore >= R.tipBeforeL1 || f.coherence < R.coherenceL1) return 1;
  if (f.coherence >= R.coherenceL3 && f.balance >= f.tau && f.outcome >= R.outcomeL3) return 3;
  return 2;
}

/** A freeze: the first move took ≥ 3× the player's own median move and ≥ 10 s (the clock starts after the brief card).
 * Framework v0.7: a freeze counts toward L1 only alongside another L1 signal, so on its own it is a note. */
export function isFreeze(f, cfg = DEFAULTS) {
  const R = cfg['autonomy.rules'];
  return f.firstActionMs != null && f.medianActionMs != null && f.medianActionMs > 0 && f.firstActionMs >= R.freezeRatio * f.medianActionMs && f.firstActionMs >= R.freezeMinMs;
}

/** metrics (a completed official round of mamak-rush or fix-it-kit) → { game, status, level, facts, freeze, provisional, why } */
export function finaleRead(module, metrics, adapter, cfg = DEFAULTS) {
  const game = FINALES[module];
  if (!metrics?.autonomy) return { game, status: 'not played' };
  let f = null; try { f = adapter?.autonomyFacts ? adapter.autonomyFacts(metrics) : null; } catch { f = null; }
  if (!f) return { game, status: 'not played' };
  const fl = flagsOf(metrics);
  if (fl.includes('disengaged') || fl.includes('idle') || (f.idleMs || 0) >= cfg['autonomy.rules'].idleNaMs) return { game, status: 'n/a', facts: f, why: 'disengaged or idle' };
  return { game, status: 'ok', level: levelOf(f, cfg), facts: f, freeze: isFreeze(f, cfg), provisional: !!metrics.priorCasualPlay };
}

/** The two finales → one read (the reference combine(), plus provisional and n/a). factorLevel = null → autonomyFactor 1. */
export function combineAutonomy(reads, cfg = DEFAULTS) {
  const ok = reads.filter((r) => r.status === 'ok'), na = reads.filter((r) => r.status === 'n/a');
  const detail = reads.filter((r) => r.status !== 'not played').map((r) => (r.status === 'ok'
    ? `${r.game} L${r.level} (coherence ${r.facts.coherence.toFixed(2)} · balance ${r.facts.balance.toFixed(2)} · outcome ${r.facts.outcome.toFixed(2)} · tips before ${Math.round(r.facts.tipBefore * 100)}%${r.freeze ? ' · froze at the start' : ''}${r.provisional ? ' · practised before' : ''})`
    : `${r.game} n/a (${r.why})`)).join(' · ');
  const notes = ok.filter((r) => r.freeze).map((r) => `autonomy: slow first move in ${r.game} (a freeze on its own is a note)`);
  const base = { detail, notes, red: false, kind: '' };
  if (!ok.length) return { ...base, level: null, factorLevel: null, label: na.length ? 'not enough evidence (disengaged or idle in the finale)' : 'not measured (no finale played)', kind: na.length ? 'na' : 'none' };
  if (ok.length === 1) return { ...base, level: ok[0].level, factorLevel: null, label: `L${ok[0].level} (provisional: one finale)`, kind: 'provisional' };
  const [a, b] = ok.map((r) => r.level), practised = ok.some((r) => r.provisional);
  let c;
  if (a === b) c = { level: a, label: `L${a}`, kind: 'agree' };
  else if (Math.abs(a - b) === 1) c = { level: Math.min(a, b), label: `L${Math.min(a, b)}–L${Math.max(a, b)} (mixed)`, kind: 'range' };
  else c = { level: 2, label: 'L2 (inconsistent between games)', kind: 'inconsistent' };
  if (c.kind === 'inconsistent') notes.push('autonomy: the two finales disagree by two levels (discuss)');
  if (practised) return { ...base, ...c, factorLevel: null, label: `${c.label} (provisional: practised before)`, kind: 'provisional' };
  return { ...base, ...c, factorLevel: c.level, red: a === 1 && b === 1 };
}

/** The autonomy target for a level and employment type (Framework: Junior L1 · Mid L2 · Lead L3; Intern L1; Freelance ≥ L2). */
export function targetOf(level, type, cfg = DEFAULTS) {
  let t = cfg['autonomy.targets'][level] ?? 1;
  const mx = cfg['autonomy.typeMax'][type], mn = cfg['autonomy.typeMin'][type];
  if (mx != null) t = Math.min(t, mx); if (mn != null) t = Math.max(t, mn);
  return t;
}
/** meets the target 1.0 · one level short 0.8 · two short 0.6 (a range already uses its lower level). */
export function autonomyFactor(autoLevel, level, type, cfg = DEFAULTS) {
  if (!cfg['autonomy.enabled'] || autoLevel == null) return 1;
  const short = Math.max(0, targetOf(level, type, cfg) - autoLevel);
  return cfg['autonomy.shortFactor'][Math.min(short, cfg['autonomy.shortFactor'].length - 1)];
}

export const AUTONOMY_PROBES = {
  Junior: 'Tell me about a task you were given clear steps for. What did you do when a step didn’t work?',
  Mid: 'Tell me about a time you were given only a goal. How did you work out the how?',
  Lead: 'Tell me about a time you were given only a broad aim. How did you decide what the goals should be?',
};
