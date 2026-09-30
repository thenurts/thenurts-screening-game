// "Free Fix": the autonomy finale (request #33; 11-game-concepts.md SUITE autonomy v1). A port of Part B of
// tests/autonomy-reference.py: parity is tested against tests/fixtures/autonomy-parity.json. Pure: no Phaser.
// Up to 6 tries after the 3 scored problems. 5 little problems, objects are used up, Done stops early (keeping kit is fine).
// Three equal aims, no total: kids helped · problems fixed · kit left for tomorrow. It never changes the creative score.

// id: [kids helped, fixes (object ids used up), title]. Object ids are the scored round's kit ids (U, R, RB, C, B, S, H, W).
export const PROBLEMS = {
  p1: [3, [['U'], ['R', 'H']], 'Shade the waiting bench'],
  p2: [3, [['R'], ['RB', 'C']], 'Mark the long-jump line'],
  p3: [1, [['S'], ['C']], 'Scoreboard keeps tipping'],
  p4: [2, [['W'], ['B']], 'Cones keep blowing over'],
  p5: [1, [['RB'], ['H']], 'A loose flag'],
};
export const PIDS = Object.keys(PROBLEMS);
export const TRIES = 6;
export const KIT_SIZE = 8;
export const AIMS = ['kids', 'fixed', 'kitLeft'];
export const AIM_LABEL = { kids: 'Kids helped', fixed: 'Problems fixed', kitLeft: 'Kit left for tomorrow' };
export const TAU = 0.38 + 0.25 * (0.60 - 0.38); // b_obvious (max kids helped) 0.38 · b_best 0.60

import { argmax, argmin } from '../../scoring/util.js';
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// best achievable per aim, by exhaustive search (as the reference)
const BEST = (() => {
  let kids = 0, fixed = 0;
  const rec = (fx, used, depth) => {
    kids = Math.max(kids, [...fx].reduce((a, p) => a + PROBLEMS[p][0], 0)); fixed = Math.max(fixed, fx.size);
    if (depth === TRIES) return;
    for (const p of PIDS) { if (fx.has(p)) continue; for (const f of PROBLEMS[p][1]) if (!f.some((o) => used.has(o))) rec(new Set([...fx, p]), new Set([...used, ...f]), depth + 1); }
  };
  rec(new Set(), new Set(), 0);
  return { kids, fixed, kitLeft: KIT_SIZE };
})();
export const bestOf = () => ({ ...BEST });

export function newFreeFix() { return { fixed: new Set(), used: new Set(), log: [], over: false, fixes: [] }; }
export const keyOf = (p, i) => `${p}:${i}`;
export function measures(st) {
  const kids = [...st.fixed].reduce((a, p) => a + PROBLEMS[p][0], 0);
  return { kids: kids / BEST.kids, fixed: st.fixed.size / BEST.fixed, kitLeft: (KIT_SIZE - st.used.size) / KIT_SIZE };
}
/** The fixes still possible, in reference order: "p:i" → what each aim gains. */
export function options(st) {
  const o = {};
  for (const p of PIDS) { if (st.fixed.has(p)) continue; PROBLEMS[p][1].forEach((f, i) => { if (!f.some((x) => st.used.has(x))) o[keyOf(p, i)] = { kids: PROBLEMS[p][0] / 3, fixed: 1, kitLeft: 1 - f.length / 2 }; }); }
  return o;
}
const balancer = (opts, m) => { const weak = argmin(AIMS, (a) => m[a]); return argmax(Object.keys(opts), (k) => [opts[k][weak], opts[k].kids]); };

/** One try: apply fix "p:i", or null = Done (stop early). */
export function apply(st, choice, tipBefore = false) {
  if (st.over) return st;
  const opts = options(st), m = measures(st);
  if (!Object.keys(opts).length) { st.over = true; return st; }
  st.log.push({ options: opts, choice, tipBefore: !!tipBefore, balancerBest: balancer(opts, m), m });
  if (choice == null) { st.over = true; return st; }
  if (!(choice in opts)) throw new Error(`not a possible fix: ${choice}`);
  const [p, i] = choice.split(':'); st.fixed.add(p); for (const x of PROBLEMS[p][1][Number(i)]) st.used.add(x); st.fixes.push(choice);
  if (st.log.length >= TRIES || !Object.keys(options(st)).length) st.over = true;
  return st;
}
export const triesLeft = (st) => TRIES - st.log.filter((e) => e.choice != null).length;

/** The free Tip (k = tips so far): one fix that serves ONE aim (the aims take turns). */
export function tip(st, k = 0) {
  const opts = options(st), keys = Object.keys(opts); if (!keys.length) return null;
  const aim = AIMS[k % AIMS.length]; return { choice: argmax(keys, (x) => opts[x][aim]), aim };
}
/** The purpose-setter bot (test hook; the reference P_bal without noise): stop while things are in balance, else help the weakest aim. */
export function balancerMove(st) {
  const opts = options(st), m = measures(st); if (!Object.keys(opts).length) return undefined;
  if (Math.min(...Object.values(m)) >= 0.6 && m.kitLeft < 0.75) return null;
  return balancer(opts, m);
}

export const encodeLog = (st) => st.log.map((e) => `${e.choice ?? 'done'}:${e.tipBefore ? 1 : 0}`).join(';');
export function replay(logStr) {
  const st = newFreeFix();
  for (const s of String(logStr || '').split(';').filter(Boolean)) { if (st.over) break; const j = s.lastIndexOf(':'); const c = s.slice(0, j); apply(st, c === 'done' ? null : c, s.slice(j + 1) === '1'); }
  return st;
}

/** The facts the level rules read (read() in the reference; not rounded there). */
export function readFacts(st) {
  const m = measures(st), log = st.log;
  const dec = log.filter((e) => e.choice != null && Object.keys(e.options).length > 1);
  const fits = [];
  if (dec.length) {
    const W = [0, 0.5, 1, 2];
    for (const a of W) for (const b of W) for (const c of W) {
      if (!a && !b && !c) continue; const w = { kids: a, fixed: b, kitLeft: c };
      fits.push(mean(dec.map((e) => (e.choice === argmax(Object.keys(e.options), (k) => AIMS.reduce((s, x) => s + e.options[k][x] * w[x], 0)) ? 1 : 0))));
    }
    fits.push(mean(dec.map((e) => (e.choice === e.balancerBest ? 1 : 0))));
  }
  return { coherence: fits.length ? Math.max(...fits) : 0, tipBefore: log.length ? mean(log.map((e) => (e.tipBefore ? 1 : 0))) : 0, balance: Math.min(...Object.values(m)), outcome: mean(Object.values(m)), tau: TAU, decisions: dec.length, measures: m };
}
