// Zoey's Big Calls rule engine: a port of tests/judgement-reference.py v1.1 (build pack JD1 v1.1). voi(), run() and metrics()
// must match the reference exactly (tests/fixtures/judgement-parity.json, from tools/jd_parity_fixture.py).
// Sides: +1 = the left option (L), −1 = the right option (R). net = the live tally (sum of arrows, L positive).
import CONTENT from './content.json' with { type: 'json' };

export { CONTENT };
export const W1 = Math.log(0.62 / 0.38);
export const COST = { false: CONTENT.model.checkCost.normal, true: CONTENT.model.checkCost.urgent };
export const MARGIN = CONTENT.model.neutralMargin;
export const MAX_CHECKS = 3;
export const WD = 0.5; // jd.weights: decisionAccuracy 0.5 · infoValue 0.5

const dir = (p) => (p === 'L' ? 1 : -1);
/** A content card → the reference's call shape. */
export function toCall(c) {
  return { id: c.id, worth: c.worth, urgent: !!c.urgent, first: c.firstClue ? c.firstClue.arrows * dir(c.firstClue.points) : 0,
    clues: c.clues.map((k) => [k.label, k.strength, dir(k.points)]), truth: dir(c.outcome), card: c };
}
export const callsOf = (form) => (form === 'P' ? CONTENT.practice : CONTENT.forms[form]).map(toCall);

/** Python's round(x, n) (exact halves go to even), so metrics match the reference. */
export function pyRound(x, n = 0) {
  const d = x * 2 ** (n + 1);
  if (Number.isInteger(d) && Math.abs(d % 2) === 1) { const k = 10 ** n, f = Math.floor(x * k); return (f % 2 === 0 ? f : f + 1) / k; }
  return Number(x.toFixed(n));
}
const post = (a) => 1 / (1 + Math.exp(-W1 * a));
/** Value of the next check (its strength s is shown on the button) minus its cost, in points. */
export function voi(worth, net, s, urgent) {
  const acc = post(s), pL = post(net), pd = pL * acc + (1 - pL) * (1 - acc);
  const after = pd * Math.max(post(net + s), 1 - post(net + s)) + (1 - pd) * Math.max(post(net - s), 1 - post(net - s));
  return worth * (after - Math.max(post(net), 1 - post(net))) - COST[!!urgent];
}
/** good (true) · wasted (false) · neutral (null) */
export const verdictOf = (v) => (v > MARGIN ? true : v < -MARGIN ? false : null);
export const bestSide = (net) => (net === 0 ? 0 : net > 0 ? 1 : -1);

/** Live state for one call (the scene drives it one tap at a time; the same code replays the reference bots). */
export function newCall(call) { return { call, net: call.first, next: 0, checks: [], checkLog: [], decided: false }; }
export function stateOf(cs) {
  const c = cs.call, s = cs.next < MAX_CHECKS ? c.clues[cs.next][1] : null;
  return { worth: c.worth, urgent: c.urgent, net: cs.net, nextStrength: s, left: MAX_CHECKS - cs.next };
}
/** One Check. Returns { clue, voi, verdict, cost } or null when no clue is left. */
export function check(cs) {
  if (cs.decided || cs.next >= MAX_CHECKS) return null;
  const c = cs.call, [label, s, d] = c.clues[cs.next];
  const v = voi(c.worth, cs.net, s, c.urgent), verdict = verdictOf(v);
  cs.checks.push(verdict); cs.net += s * d; cs.next++;
  const r = { n: cs.next, label, strength: s, points: d, voi: v, verdict, cost: COST[c.urgent] };
  cs.checkLog.push(r); return r;
}
/** Decide a side (+1 / −1). Returns the log entry (the reference's shape plus the facts the scene shows). */
export function decide(cs, choice) {
  const c = cs.call; cs.decided = true;
  const best = bestSide(cs.net);
  const missed = cs.next < MAX_CHECKS && voi(c.worth, cs.net, c.clues[cs.next][1], c.urgent) > MARGIN;
  const cost = cs.next * COST[c.urgent], won = choice === c.truth;
  return cs.entry = { worth: c.worth, correctExAnte: best === 0 || choice === best, checks: [...cs.checks], missed,
    id: c.id, choice, tally: cs.net, best, won, points: won ? Math.max(0, c.worth - cost) : 0, cost };
}

/** Reference run(policy, form): policy(state) → ['check'] | ['decide', side]. */
export function run(policy, form = 'A') {
  const log = [];
  for (const call of callsOf(form)) {
    const cs = newCall(call);
    for (;;) {
      const act = policy(stateOf(cs));
      if (act[0] === 'check' && cs.next < MAX_CHECKS) { check(cs); continue; }
      const e = decide(cs, act[1]); log.push({ worth: e.worth, correctExAnte: e.correctExAnte, checks: e.checks, missed: e.missed }); break;
    }
  }
  return log;
}
export function metrics(log, wD = WD) {
  const tw = log.reduce((a, e) => a + e.worth, 0), acc = log.filter((e) => e.correctExAnte).reduce((a, e) => a + e.worth, 0) / tw;
  const all = log.flatMap((e) => e.checks);
  const g = all.filter((c) => c === true).length, b = all.filter((c) => c === false).length, m = log.filter((e) => e.missed).length;
  const info = g + b + m ? g / (g + b + m) : 1.0;
  return { decisionAccuracy: pyRound(acc, 3), infoValue: pyRound(info, 3), good: g, wasted: b, missed: m, judgementScore: pyRound(100 * (wD * acc + (1 - wD) * info), 1) };
}

// ---- the reference's bots (tests + automated play)
const side = (s) => (s.net > 0 ? 1 : s.net < 0 ? -1 : 1);
const ok = (s) => s.left > 0;
const rule = (f) => (s) => (f(s) ? ['check'] : ['decide', side(s)]);
export const BOTS = {
  wise: rule((s) => ok(s) && voi(s.worth, s.net, s.nextStrength, s.urgent) > MARGIN),
  'never check': rule(() => false),
  'check everything': rule(ok),
  'check every call once': rule((s) => s.left === 3),
  'check 30s once': rule((s) => s.worth === 30 && s.left === 3),
  'check 30s fully': rule((s) => s.worth === 30 && ok(s)),
  'check if tied': rule((s) => s.net === 0 && ok(s)),
  'check big ties': rule((s) => s.net === 0 && s.worth >= 20 && ok(s)),
  'check non-urgent once': rule((s) => !s.urgent && s.left === 3),
  'check strong clues only': rule((s) => s.nextStrength === 2 && ok(s)),
  'check strong clues on 20+/30': rule((s) => s.nextStrength === 2 && s.worth >= 20 && ok(s)),
  'check close non-urgent calls': rule((s) => Math.abs(s.net) <= 1 && !s.urgent && ok(s)),
};
