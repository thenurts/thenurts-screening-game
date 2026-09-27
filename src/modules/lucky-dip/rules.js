// Lucky Dip rules and sequences (build pack v1.1 §2–3). Pure data + helpers: no Phaser, so tests can import it.
// Internally a bag's `j` is the DRAW that holds the chilli, counting Mia's starter sweet as draw 1, so j is 2–6
// (6 = the chilli is last and the bag auto-banks at 60). The build pack writes the player dip, i.e. j − 1 (1–5).
export const SEQUENCE_VERSION = 2;
export const LADDER = [0, 12, 15, 20, 30, 60]; // tray value after draw d (normal bags): starter 12 … 4th dip 60; gold ×3
export const GOLD_X = 3;
export const FREE_STEP = 5;   // free bags: +5 per dip, 3 dips then auto-bank (no starter, no chilli)
export const FREE_DIPS = 3;
export const FREE_AFTER = [5, 10]; // free bags come after scored bags 5 and 10
export const CONFIG = { firstRunRandom: false }; // ld.firstRunRandom: false = everyone's official round uses sequence A

// Build-pack notation: "<N|G><player dip 1–5>"; "F" = free bag.
const A = 'G2 N5 G5 N1 N5 G4 G3 N2 N2 N3 N4 G1 N3 N4 N1';
const P = 'N4 G2 N5 F';
const bag = (t) => (t === 'F' ? { type: 'free' } : { type: t[0] === 'G' ? 'gold' : 'normal', j: Number(t[1]) + 1 });
const withFree = (scored) => { const out = []; scored.forEach((b, i) => { out.push(b); if (FREE_AFTER.includes(i + 1)) out.push({ type: 'free' }); }); return out; };
export const SEQUENCES = { A: withFree(A.split(' ').map(bag)), P: P.split(' ').map(bag) };
export const code = (seq) => seq.map((b) => (b.type === 'free' ? 'F' : (b.type === 'gold' ? 'G' : 'N') + (b.j - 1))).join(' ');

export const trayValue = (b, d) => (b.type === 'free' ? d * FREE_STEP : LADDER[d] * (b.type === 'gold' ? GOLD_X : 1));

/** Points for dipping to just before every chilli (the same 685 for every order, since every round has the same bags). */
export const perfectMax = (seq) => seq.filter((b) => b.type !== 'free').reduce((s, b) => s + trayValue(b, b.j - 1), 0);

/**
 * Plays scored bags with a bot. dip(k, lastChilli, bag) → boolean, where k = player dips made so far (0–3).
 * Returns { points, decisions:[{bag, stake, k, choice, ms}], bags:[{bag, stake, j, dips, endedBy, points}] }.
 */
export function simulate(seq, dip) {
  let points = 0, last = false; const decisions = [], bags = [];
  seq.forEach((b, i) => {
    const n = i + 1;
    if (b.type === 'free') {
      let k = 0; while (k < FREE_DIPS && dip(k, last, b)) k++;
      const p = trayValue(b, k); points += p; bags.push({ bag: n, stake: 'free', dips: k, endedBy: k === FREE_DIPS ? 'auto' : 'keep', points: p });
      return;
    }
    let d = 1; // the starter sweet is draw 1
    for (;;) {
      if (d === 5) { const p = trayValue(b, 5); points += p; last = false; bags.push({ bag: n, stake: b.type, j: b.j, dips: 4, endedBy: 'auto', points: p }); break; }
      const go = dip(d - 1, last, b);
      decisions.push({ bag: n, stake: b.type, k: d - 1, choice: go ? 'dip' : 'keep', ms: 900 });
      if (!go) { const p = trayValue(b, d); points += p; last = false; bags.push({ bag: n, stake: b.type, j: b.j, dips: d - 1, endedBy: 'keep', points: p }); break; }
      d++;
      if (d === b.j) { last = true; bags.push({ bag: n, stake: b.type, j: b.j, dips: d - 1, endedBy: 'chilli', points: 0 }); break; }
    }
  });
  return { points, decisions, bags };
}

/** Worst gap between "pull back after a chilli" and "chase after a chilli" bots (build pack: ≤ 15%). */
export function adaptiveGap(scored) {
  let worst = 0;
  for (let t = 1; t <= 4; t++) for (const st of [1, 2]) {
    const pb = simulate(scored, (k, l) => k < (l ? Math.max(0, t - st) : t)).points;
    const ch = simulate(scored, (k, l) => k < (l ? Math.min(4, t + st) : t)).points;
    worst = Math.max(worst, Math.abs(pb - ch) / Math.max(pb, ch));
  }
  return worst;
}

/** Order rules for generated rounds (build pack v1.1 §3), on the 15 scored bags. */
export function orderOk(scored) {
  const pd = scored.map((b) => b.j - 1); // player dip that finds the chilli, 1–5
  if (pd[0] === 1 || pd[1] === 1) return false;
  for (let i = 1; i < pd.length; i++) if (pd[i] === 1 && pd[i - 1] === 1) return false;
  const g1 = scored.findIndex((b) => b.type === 'gold' && b.j === 2);
  if (g1 >= 0 && g1 + 1 < 8) return false;
  for (let i = 2; i < pd.length; i++) if (pd[i] <= 2 && pd[i - 1] <= 2 && pd[i - 2] <= 2) return false;
  for (let t = 0; t < 3; t++) { const s = pd.slice(t * 5, t * 5 + 5); const m = s.reduce((a, b) => a + b, 0) / s.length; if (m < 2.4 || m > 3.6) return false; }
  let g = 0, nn = 0;
  for (const b of scored) { if (b.type === 'gold') { g++; nn = 0; } else { nn++; g = 0; } if (g >= 3 || nn >= 5) return false; }
  return adaptiveGap(scored) <= 0.15;
}

/** A fresh random order of the same 15 bags that passes the order rules (rejection sampling). */
export function generate(rand = Math.random, tries = 5000) {
  const pool = [];
  for (let j = 1; j <= 5; j++) { pool.push({ type: 'normal', j: j + 1 }, { type: 'normal', j: j + 1 }, { type: 'gold', j: j + 1 }); }
  for (let n = 0; n < tries; n++) {
    const s = pool.map((b) => ({ ...b }));
    for (let i = s.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [s[i], s[k]] = [s[k], s[i]]; }
    if (orderOk(s)) return withFree(s);
  }
  return SEQUENCES.A; // practically unreachable; A always passes
}
