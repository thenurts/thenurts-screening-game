// Scoring-layer adapter (request #29, L1): re-scores Sunny Tap from the stored tapLog / fadeLog and the schedule's seed.
import { schedule, scoreRound } from './rules.js';

export const primaryKey = 'resilienceScore';
export function rederive(m, version) {
  if (version != null && Number(version) < 3) return null; // v1.1 rounds (module v2) used the old schedule and points: keep their stored scores
  if (typeof m?.tapLog !== 'string' || !m.seed) return null;
  const taps = m.tapLog.split(' ').filter(Boolean).map((s) => { const x = /^([\d.]+)(?:h([\d.]+)|m)$/.exec(s); return x ? [Number(x[1]), x[2] != null ? 'hit' : 'miss', x[2] != null ? Number(x[2]) : null] : null; }).filter(Boolean);
  const fades = String(m.fadeLog || '').split(' ').filter(Boolean).map(Number);
  const sched = m.calm ? schedule(m.seed, null, true) : schedule(m.seed, m.f1HitRate === '' ? null : m.f1HitRate);
  return scoreRound(taps, fades, sched);
}
export const learningFacts = () => null; // measures composure, not learning (learning v2 map)
