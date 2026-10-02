// Sunny Tap rule engine: a port of tests/sunny-tap-reference.py (build pack RS1 v1.2). schedule() and scoreRound() must match
// the reference exactly (tests/fixtures/sunny-tap-parity.json, from tools/st_parity_fixture.py), so Python's random.Random
// (MT19937 + init_by_array, random(), uniform()) is reproduced bit for bit.
// v1.2: 4 rounds of Fair 20 s + Wipeout 10 s = 2:00 of play; a mini-report after each round (the game clock stops).
export const PHASES = [['F1', 0, 20], ['W1', 20, 30], ['F2', 30, 50], ['W2', 50, 60], ['F3', 60, 80], ['W3', 80, 90], ['F4', 90, 110], ['W4', 110, 120]];
export const ROUND_S = 120, WARMUP_S = 10, ROUNDS = 4, ROUND_LEN = 30;
export const POST = PHASES.filter(([n]) => n[0] === 'F' && n !== 'F1').map(([n]) => n);
export const FAIR = { sun_every: 0.5, sun_life: 1.6, cloud_every: 4.0, cloud_life: 1.6 };
export const WIPE = { min_rate: 7.0, adapt: 4.5, sun_life: 0.6, cloud_share: 0.25 }; // v1.2: every skill level nets ~0 or less per round
export const PTS = { hit: 10, fade: -10, miss: -15 }; // v1.2: a faded sun costs as much as a caught one earns
export const EARLY = 8.0;
export const OFFICIAL_SEED = 2026, CASUAL_SEED = 2027; // casual runs never see the official fair schedule (request #26)

/** Python's random.Random(n) for a non-negative integer n < 2^32. */
export class PyRandom {
  constructor(seed) {
    this.mt = new Uint32Array(624); this.i = 625;
    this.initGenrand(19650218);
    const key = [seed >>> 0], mt = this.mt; let i = 1, j = 0;
    for (let k = Math.max(624, key.length); k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
      i++; j++; if (i >= 624) { mt[0] = mt[623]; i = 1; } if (j >= key.length) j = 0;
    }
    for (let k = 623; k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
      i++; if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000; this.i = 624;
  }
  initGenrand(s) {
    const mt = this.mt; mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) { const p = mt[i - 1] ^ (mt[i - 1] >>> 30); mt[i] = (Math.imul(1812433253, p) + i) >>> 0; }
    this.i = 624;
  }
  u32() {
    const mt = this.mt;
    if (this.i >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.i = 0;
    }
    let y = mt[this.i++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  random() { const a = this.u32() >>> 5, b = this.u32() >>> 6; return (a * 67108864 + b) / 9007199254740992; }
  uniform(a, b) { return a + (b - a) * this.random(); }
}

/** Python's round(x, n) (exact halves go to even). */
export function pyRound(x, n = 0) {
  const d = x * 2 ** (n + 1);
  if (Number.isInteger(d) && Math.abs(d % 2) === 1) { const k = 10 ** n, f = Math.floor(x * k); return (f % 2 === 0 ? f : f + 1) / k; }
  return Number(x.toFixed(n));
}

/** Events for one phase (the reference's loop body). calm = casual play: wipeouts become fair-paced (request #26). */
function phaseEvents(i, seed, f1HitRate, calm) {
  const [name, a, b] = PHASES[i], rng = new PyRandom(seed * 10 + i), ev = [];
  if (name[0] === 'F' || calm) {
    for (let t = a + 0.3; t < b - 0.2; t += FAIR.sun_every) ev.push({ t: pyRound(t, 2), kind: 'sun', life: FAIR.sun_life, x: pyRound(rng.uniform(0.1, 0.9), 3), y: pyRound(rng.uniform(0.2, 0.75), 3), phase: name });
    for (let t = a + 1.7; t < b - 0.5; t += FAIR.cloud_every) ev.push({ t: pyRound(t, 2), kind: 'cloud', life: FAIR.cloud_life, x: pyRound(rng.uniform(0.1, 0.9), 3), y: pyRound(rng.uniform(0.2, 0.75), 3), phase: name });
  } else {
    const rate = Math.max(WIPE.min_rate, WIPE.adapt * (f1HitRate || 0));
    for (let t = a + 0.1; t < b; t += 1 / rate) {
      const kind = rng.random() < WIPE.cloud_share ? 'cloud' : 'sun';
      ev.push({ t: pyRound(t, 2), kind, life: WIPE.sun_life, x: pyRound(rng.uniform(0.08, 0.92), 3), y: pyRound(rng.uniform(0.18, 0.78), 3), phase: name });
    }
  }
  return ev;
}
const byT = (ev) => ev.sort((p, q) => p.t - q.t); // stable, like Python's sorted(key=t)
export function schedule(seed = OFFICIAL_SEED, f1HitRate = null, calm = false) { return byT(PHASES.flatMap((_, i) => phaseEvents(i, seed, f1HitRate, calm))); }
/** Only the wipeout events (the scene builds them once F1 is over and the player's F1 hit rate is known). */
export const wipeoutEvents = (seed, f1HitRate) => byT(PHASES.flatMap((p, i) => (p[0][0] === 'W' ? phaseEvents(i, seed, f1HitRate, false) : [])));
/** The unscored 10 s warm-up: the fair pace, its own random stream (so it never shifts the scored schedule). */
export function warmupEvents(seed = OFFICIAL_SEED) {
  const rng = new PyRandom(seed * 10 + 9), ev = [];
  for (let t = 0.3; t < WARMUP_S - 0.2; t += FAIR.sun_every) ev.push({ t: pyRound(t, 2), kind: 'sun', life: FAIR.sun_life, x: pyRound(rng.uniform(0.1, 0.9), 3), y: pyRound(rng.uniform(0.2, 0.75), 3), phase: 'WU' });
  for (let t = 1.7; t < WARMUP_S - 0.5; t += FAIR.cloud_every) ev.push({ t: pyRound(t, 2), kind: 'cloud', life: FAIR.cloud_life, x: pyRound(rng.uniform(0.1, 0.9), 3), y: pyRound(rng.uniform(0.2, 0.75), 3), phase: 'WU' });
  return byT(ev);
}
export function phaseOf(t) { for (const [n, a, b] of PHASES) if (a <= t && t < b) return n; return null; }

/** The mini-report after round n (1–4): gained · lost to fades · lost to mis-taps · net (the reference's round_report). */
export function roundReport(taps, fades, n) {
  const a = (n - 1) * ROUND_LEN, b = n * ROUND_LEN;
  const g = taps.filter((tp) => tp[1] === 'hit' && a <= tp[0] && tp[0] < b).length * PTS.hit, m = taps.filter((tp) => tp[1] === 'miss' && a <= tp[0] && tp[0] < b).length * PTS.miss;
  const f = fades.filter((t) => a <= t && t < b).length * PTS.fade;
  return { round: n, gained: g + 0, lostFaded: f + 0, lostMisTaps: m + 0, net: g + f + m + 0 }; // + 0 turns -0 into 0
}

const median = (xs) => { const s = [...xs].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (xs) => xs.reduce((p, q) => p + q, 0);

/** taps: [[t, 'hit', spawnT] | [t, 'miss', null]] · fades: [t] · sched: the events that were played. */
export function scoreRound(taps, fades, sched, quitAt = null) {
  const evs = [...taps.map((tp) => [tp[0], tp[1]]), ...fades.map((t) => [t, 'fade'])].sort((p, q) => p[0] - q[0] || (p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
  let total = 0;
  for (const [t, k] of evs) { if (quitAt != null && t > quitAt) continue; if (phaseOf(t)) total = Math.max(0, total + PTS[k]); }
  const start = Object.fromEntries(PHASES.map(([n, a]) => [n, a]));
  const window = (n, part) => {
    const a = start[n]; let [lo, hi] = part === 'early' ? [a, a + EARLY] : part === 'late' ? [a + EARLY, a + 20] : [a, a + 20];
    if (quitAt != null) hi = Math.min(hi, quitAt);
    const suns = sched.filter((e) => e.kind === 'sun' && lo <= e.t && e.t < hi).length;
    const hits = taps.filter((tp) => tp[1] === 'hit' && lo <= tp[2] && tp[2] < hi).length, miss = taps.filter((tp) => tp[1] === 'miss' && lo <= tp[0] && tp[0] < hi).length;
    return [suns, hits, miss];
  };
  const rts = (n, part) => {
    const a = start[n], [lo, hi] = part === 'early' ? [a, a + EARLY] : [a + EARLY, a + 20];
    return taps.filter((tp) => tp[1] === 'hit' && lo <= tp[2] && tp[2] < hi && (quitAt == null || tp[0] <= quitAt)).map((tp) => tp[0] - tp[2]);
  };
  const acc = (n, part = 'all') => { const [su, hh] = window(n, part); return su ? hh / su : null; };
  const a1 = acc('F1'), ap = POST.map((n) => acc(n));
  const hold = a1 && !ap.includes(null) ? Math.min(1.5, (sum(ap) / ap.length) / a1) : null;
  const sh = POST.filter((n) => acc(n, 'late') && acc(n, 'early') != null).map((n) => acc(n, 'early') / acc(n, 'late'));
  const shock = sh.length === POST.length ? Math.min(1.5, sum(sh) / sh.length) : null;
  const rr = POST.filter((n) => rts(n, 'early').length && rts(n, 'late').length).map((n) => median(rts(n, 'late')) / median(rts(n, 'early')));
  const rtShock = rr.length === POST.length ? Math.min(1.5, sum(rr) / rr.length) : null;
  const err = (n) => { const [, hh, mm] = window(n, 'all'); return hh + mm ? mm / (hh + mm) : 0; };
  const errCarry = Math.max(0.0, sum(POST.map(err)) / POST.length - err('F1'));
  const m = { displayScore: total, accuracy: { F1: a1, ...Object.fromEntries(POST.map((n) => [n, acc(n)])) }, hold, accuracyShock: shock, speedShock: rtShock, errorCarryover: pyRound(errCarry, 3), quit: quitAt != null };
  m.panicCarry = errCarry >= 0.15;
  m.resilienceScore = [hold, shock, rtShock].includes(null) ? null : pyRound(100 * (0.25 * Math.min(1, shock) + 0.50 * Math.min(1, rtShock) + 0.25 * Math.min(1, hold)), 1);
  return m;
}
