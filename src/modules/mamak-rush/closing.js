// "Closing Time": the autonomy finale (request #32; 11-game-concepts.md SUITE autonomy v1). A port of Part A of
// tests/autonomy-reference.py: parity is tested against tests/fixtures/autonomy-parity.json. Pure: no Phaser.
// 12 actions after the scored shift. Four equal aims, no total: ★ earned · happy customers · regulars served · nothing wasted.
// It never changes the organisation score; the scoring layer reads autonomy from the log (guidance, coherence, balance).

// [id, arrive, steps, stars, dueIn, regular] + what the player sees (dish, customer). Demand is 23 steps vs 12 actions, by design.
export const ORDERS = [
  ['c1', 1, 2, 1, 3, false, 'teh', 'zoey'], ['c2', 1, 3, 2, 9, true, 'roti', 'noah'], ['c3', 1, 3, 3, 7, false, 'nasi', 'raj'],
  ['c4', 3, 2, 1, 3, false, 'kopi', 'amira'], ['c5', 4, 3, 3, 6, false, 'murtabak', 'mia'], ['c6', 5, 2, 1, 7, true, 'teh', 'liam'],
  ['c7', 7, 2, 1, 3, false, 'kopi', 'zoey'], ['c8', 9, 3, 3, 5, false, 'nasi', 'amira'], ['c9', 10, 3, 2, 5, false, 'roti', 'raj'],
];
export const TICKS = 12;
export const AIMS = ['stars', 'happy', 'regulars', 'noWaste'];
export const AIM_LABEL = { stars: '★ earned', happy: 'Happy customers', regulars: 'Regulars served', noWaste: 'Nothing wasted' };
const BEST = { stars: 11, walkouts: 2, regulars: 2, waste: 0 }, WORST = { walkouts: 7, waste: 9 }; // exhaustive search, 8,234 closes
export const TAU = 0.50 + 0.25 * (0.80 - 0.50); // b_obvious (max ★) 0.50 · b_best 0.80
import { argmax, argmin } from '../../scoring/util.js';
const O = Object.fromEntries(ORDERS.map((o) => [o[0], o]));
export const orderOf = (id) => O[id];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function newClosing() { return { t: 1, prog: {}, done: {}, left: {}, log: [], over: false }; }

export function measures(st) {
  const done = ORDERS.filter((o) => st.done[o[0]]);
  const walk = ORDERS.filter((o) => st.left[o[0]]).length, waste = ORDERS.filter((o) => (st.prog[o[0]] || 0) > 0 && (st.prog[o[0]] || 0) < o[2]).length;
  return {
    stars: Math.min(1, done.reduce((a, o) => a + o[3], 0) / BEST.stars),
    happy: Math.max(0, Math.min(1, (WORST.walkouts - walk) / (WORST.walkouts - BEST.walkouts))),
    regulars: done.filter((o) => o[5]).length / BEST.regulars,
    noWaste: Math.max(0, Math.min(1, (WORST.waste - waste) / (WORST.waste - BEST.waste))),
  };
}

export function value(o, st, t) {
  const rem = o[2] - (st.prog[o[0]] || 0), slack = o[1] + o[4] - t - rem + 1, can = t + rem - 1 <= TICKS;
  return { stars: can ? o[3] / rem : 0, happy: can ? (slack <= 1 ? 1 : 0.3) : 0, regulars: can ? (o[5] ? 1 : 0) : 0, noWaste: can ? ((st.prog[o[0]] || 0) > 0 ? 1 : 0.2) : -1 };
}
export function balancerPick(opts, st) {
  const m = measures(st), weak = argmin(AIMS, (a) => m[a]);
  return argmax(Object.keys(opts), (k) => [opts[k][weak], opts[k].stars]);
}

/** Start of minute t: customers whose time ran out leave. Returns the orders on the counter now (reference order). */
export function openOrders(st) {
  const t = st.t;
  for (const o of ORDERS) if (o[1] + o[4] < t && !st.done[o[0]] && !st.left[o[0]] && o[1] <= t) st.left[o[0]] = true;
  return ORDERS.filter((o) => o[1] <= t && !st.done[o[0]] && !st.left[o[0]]);
}
export const minutesLeft = (o, t) => o[1] + o[4] - t + 1;

/** One minute: work one step on order `id` (or nothing when the counter is empty). Logs what the scoring layer needs. */
export function step(st, id, tipBefore = false) {
  if (st.over) return st;
  const avail = openOrders(st);
  if (!avail.length) st.log.push({ t: st.t, choice: null });
  else {
    const vals = Object.fromEntries(avail.map((o) => [o[0], value(o, st, st.t)]));
    st.log.push({ t: st.t, options: vals, choice: id, tipBefore: !!tipBefore, balancerBest: balancerPick(vals, st), m: measures(st) });
    if (id) { st.prog[id] = (st.prog[id] || 0) + 1; if (st.prog[id] >= O[id][2]) st.done[id] = true; }
  }
  st.t++;
  if (st.t > TICKS) { for (const o of ORDERS) if (o[1] + o[4] <= TICKS && !st.done[o[0]] && !st.left[o[0]]) st.left[o[0]] = true; st.over = true; }
  return st;
}

/** The free Tip (k = how many tips so far): one move that serves ONE aim (the aims take turns), never "the answer". */
export function tip(st, k = 0) {
  const avail = openOrders(st); if (!avail.length) return null;
  const aim = AIMS[k % AIMS.length], vals = Object.fromEntries(avail.map((o) => [o[0], value(o, st, st.t)]));
  return { id: argmax(Object.keys(vals), (x) => vals[x][aim]), aim };
}

/** The purpose-setter bot (test hook): helps whichever aim is weakest. */
export function balancerMove(st) { const avail = openOrders(st); if (!avail.length) return null; return balancerPick(Object.fromEntries(avail.map((o) => [o[0], value(o, st, st.t)])), st); }

/** Stored log "t:choice:tip;…" → the state and the full decision log (the scoring layer's L1 replay). */
export const encodeLog = (st) => st.log.map((e) => `${e.t}:${e.choice ?? '-'}:${e.tipBefore ? 1 : 0}`).join(';');
export function replay(logStr) {
  const st = newClosing(), by = {};
  for (const s of String(logStr || '').split(';').filter(Boolean)) { const [t, c, tp] = s.split(':'); by[t] = { c: c === '-' ? null : c, tip: tp === '1' }; }
  while (!st.over) { const e = by[st.t] || { c: null, tip: false }; step(st, e.c, e.tip); }
  return st;
}

const py2 = (x) => { const r = x * 100, f = Math.floor(r), d = r - f; const n = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(r); return n / 100; }; // Python round(x, 2)

/** The facts the level rules read (autonomy_read in the reference): coherence of any consistent priority, tips before trying,
 * balance (the weakest aim) and outcome (the mean). Rounded to 2 places, as the reference compares them. */
export function readFacts(st) {
  const m = measures(st), log = st.log;
  const dec = log.filter((e) => e.choice && new Set(AIMS.map((x) => argmax(Object.keys(e.options), (k) => e.options[k][x]))).size > 1);
  const fits = [];
  if (dec.length) {
    const W = [0, 0.5, 1, 2];
    for (const a of W) for (const b of W) for (const c of W) for (const d of W) {
      if (!a && !b && !c && !d) continue;
      const w = { stars: a, happy: b, regulars: c, noWaste: d };
      fits.push(mean(dec.map((e) => (e.choice === argmax(Object.keys(e.options), (k) => AIMS.reduce((s, x) => s + e.options[k][x] * w[x], 0)) ? 1 : 0))));
    }
    fits.push(mean(dec.map((e) => (e.choice === e.balancerBest ? 1 : 0))));
    for (const aim of AIMS) for (const fl of [0.35, 0.5]) fits.push(mean(dec.map((e) => (e.choice === (Math.min(...Object.values(e.m)) < fl ? e.balancerBest : argmax(Object.keys(e.options), (k) => [e.options[k][aim], e.options[k].stars])) ? 1 : 0))));
  }
  const chosen = log.filter((e) => e.choice);
  return {
    coherence: py2(fits.length ? Math.max(...fits) : 0), tipBefore: py2(chosen.length ? mean(chosen.map((e) => (e.tipBefore ? 1 : 0))) : 0),
    balance: py2(Math.min(...Object.values(m))), outcome: py2(mean(Object.values(m))), tau: TAU, decisions: dec.length, measures: m,
  };
}
