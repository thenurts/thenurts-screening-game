// The Nurts Mamak rules: a line-by-line port of tests/mamak-reference.py (build pack O1 v1.2). act(), metrics() and
// orgScore() must match the reference exactly (tests/fixtures/mamak-parity.json, exported by tools/mk_parity_fixture.py).
// Time is a wall clock that moves one minute per action (tick n = 7:(n-1) pm). There is no real-time timer anywhere.

export const STATIONS = ['urn', 'griddle', 'rice', 'counter'];
export const MENU = { // item: [label, stars, steps]
  teh: ['Teh tarik', 1, ['urn', 'urn']],
  kopi: ['Kopi ais', 1, ['urn', 'counter']],
  roti: ['Roti canai', 2, ['griddle', 'griddle', 'counter']],
  mee: ['Mee goreng', 2, ['griddle', 'counter']],
  nasi: ['Nasi lemak', 3, ['rice', 'rice', 'counter']],
  murtabak: ['Murtabak', 3, ['griddle', 'griddle', 'counter']],
};
/** What Liam does at each step (shown on the step dots). */
export const STEP_NAMES = {
  teh: ['brew', 'pull'], kopi: ['brew', 'add ice'], roti: ['flip', 'cook', 'plate + dhal'], mee: ['fry', 'plate'],
  nasi: ['scoop', 'sambal + egg', 'wrap'], murtabak: ['fill', 'fry', 'cut'],
};
// [arrive tick, id, item, due in ticks, customer]
const STREAM_A = [
  [1, 'o1', 'teh', 5, 'mia'], [2, 'o2', 'roti', 7, 'noah'],
  [6, 'o3', 'kopi', 8, 'zoey'], [6, 'o4', 'teh', 8, 'raj'], [7, 'o5', 'nasi', 5, 'amira'],
  [10, 'o6', 'mee', 6, 'mia'],
  [13, 'o7', 'murtabak', 6, 'noah'], [14, 'o8', 'teh', 3, 'zoey'], [14, 'o9', 'kopi', 4, 'raj'],
  [16, 'o10', 'roti', 8, 'mia'],
  [21, 'o11', 'kopi', 8, 'amira'], [21, 'o12', 'teh', 8, 'noah'], [22, 'o13', 'nasi', 5, 'zoey'],
  [25, 'o14', 'mee', 6, 'raj'],
  [28, 'o15', 'nasi', 6, 'mia'], [29, 'o16', 'kopi', 3, 'amira'], [29, 'o17', 'teh', 4, 'noah'],
  [31, 'o18', 'roti', 5, 'zoey'],
];
const STREAM_B = [
  [1, 'o1', 'kopi', 5, 'zoey'], [2, 'o2', 'roti', 8, 'amira'], [6, 'o3', 'teh', 7, 'raj'], [6, 'o4', 'kopi', 8, 'noah'],
  [7, 'o5', 'nasi', 6, 'amira'], [10, 'o6', 'mee', 7, 'raj'], [13, 'o7', 'murtabak', 6, 'noah'], [14, 'o8', 'teh', 4, 'mia'],
  [14, 'o9', 'kopi', 3, 'noah'], [16, 'o10', 'roti', 7, 'zoey'], [21, 'o11', 'kopi', 8, 'raj'], [21, 'o12', 'teh', 9, 'raj'],
  [22, 'o13', 'murtabak', 6, 'noah'], [25, 'o14', 'mee', 5, 'mia'], [28, 'o15', 'murtabak', 6, 'zoey'], [29, 'o16', 'kopi', 4, 'zoey'],
  [29, 'o17', 'kopi', 5, 'amira'], [31, 'o18', 'roti', 6, 'amira'],
];
const PARKED = { id: 'tapau', item: 'roti', announce: 10, arrive: 21, waits: 3, customer: 'amira' }; // back at 7:20 (tick 21), collects automatically, waits to 7:23
const SETBACK = { tick: 18, station: 'griddle', ticks: 3, noticeFrom: 13 }; // announced from 7:12: griddle off 7:17–7:19
export const W = { valueDone: 0.30, expiredHigh: 0.20, halfDone: 0.20, parkedReturn: 0.15, errorsUnderLoad: 0.15 };
export const BEST_STARS = { A: 28, B: 28 }; // o1.bestStars: the TRUE maximum per form (exact search, reference v1.3; was 27). Demand 33 ★ > capacity

export const FORMS = {
  A: { stream: STREAM_A, parked: PARKED, setback: SETBACK, ticks: 36, bestStars: BEST_STARS.A },
  B: { stream: STREAM_B, parked: PARKED, setback: SETBACK, ticks: 36, bestStars: BEST_STARS.B },
};

/** Python's round(x, n) (halves to even on exact ties), so metrics match the reference exactly. */
export function pyRound(x, n = 0) {
  // toFixed rounds the exact binary value like Python, except on exact ties (it rounds those up). An exact tie at n
  // decimals exists only when x × 2^(n+1) is an odd integer (multiplying by a power of two is exact).
  const d = x * 2 ** (n + 1);
  if (Number.isInteger(d) && Math.abs(d % 2) === 1) { const k = 10 ** n, f = Math.floor(x * k); return (f % 2 === 0 ? f : f + 1) / k; }
  return Number(x.toFixed(n));
}

export const clock = (tick) => `7:${String(tick - 1).padStart(2, '0')}`; // tick 1 = 7:00 pm

export function newState(cfg = FORMS.A) {
  const st = { cfg, tick: 1, orders: new Map(), done: [], expired: [], started: new Set(), errors: [], log: [], tapau: { steps: 0, handed: null } };
  arrive(st);
  return st;
}
export const active = (st) => [...st.orders.values()].filter((o) => o.status === 'open');
function arrive(st) {
  for (const [t, id, item, due, cust] of st.cfg.stream) if (t === st.tick) st.orders.set(id, { id, item, due: t + due, step: 0, status: 'open', cust, stars: MENU[item][1], arrived: t });
}
function expire(st) {
  for (const o of active(st)) if (st.tick > o.due) { o.status = 'expired'; st.expired.push(o.id); }
}
export function blocked(st, station) {
  const s = st.cfg.setback; return !!s && station === s.station && s.tick <= st.tick && st.tick < s.tick + s.ticks;
}
export function nextStation(st, id) {
  if (id === 'tapau') { const P = st.cfg.parked; return st.tapau.steps < MENU[P.item][2].length ? MENU[P.item][2][st.tapau.steps] : null; }
  const o = st.orders.get(id); return MENU[o.item][2][o.step];
}
/** One action = one minute. target: an order id, 'tapau' (cook a step of the parked order), or null (Wait). Returns the log entry. */
export function act(st, target, station) {
  const load = active(st).length, P = st.cfg.parked;
  let ok = false;
  if (target === 'tapau') {
    const steps = MENU[P.item][2], need = st.tapau.steps < steps.length ? steps[st.tapau.steps] : null;
    if (need && station === need && !blocked(st, station) && st.tick >= P.announce) { st.tapau.steps++; ok = true; }
    else if (need && station !== need) st.errors.push([st.tick, load]);
  } else if (target && st.orders.has(target) && st.orders.get(target).status === 'open') {
    const o = st.orders.get(target), need = MENU[o.item][2][o.step];
    if (station === need && !blocked(st, station)) {
      o.step++; st.started.add(o.id); ok = true;
      if (o.step === MENU[o.item][2].length) { o.status = 'done'; st.done.push(o.id); }
    } else if (station !== need) st.errors.push([st.tick, load]);
  }
  const entry = [st.tick, target ?? null, station ?? null, ok, load];
  st.log.push(entry);
  st.tick++; expire(st); arrive(st); collect(st);
  return entry;
}
/** The customer collects the tapau herself: at `arrive` if it's ready, or the moment it's finished while she waits. */
function collect(st) {
  const P = st.cfg.parked, t = st.tapau;
  if (P && t.handed === null && t.steps >= MENU[P.item][2].length && P.arrive <= st.tick && st.tick <= P.arrive + P.waits) t.handed = st.tick;
}
export const shiftOver = (st) => st.tick > st.cfg.ticks;

export function metrics(st) {
  const P = st.cfg.parked, pStars = P ? MENU[P.item][1] : 0;
  const val = st.done.reduce((a, id) => a + st.orders.get(id).stars, 0) + (st.tapau.handed ? pStars : 0);
  const best = st.cfg.bestStars;
  const orders = [...st.orders.values()];
  const threes = orders.filter((o) => o.stars === 3);
  const expHi = threes.filter((o) => o.status === 'expired').length / Math.max(1, threes.length);
  const started = orders.filter((o) => st.started.has(o.id));
  const half = started.filter((o) => o.status !== 'done').length / Math.max(1, started.length);
  const h = st.tapau.handed;
  const parked = P && h === P.arrive ? 1.0 : h ? 0.5 : 0.0; // ready when she arrived / finished while she waited / she left
  const hi = st.log.filter((e) => e[4] >= 3), errHi = st.errors.filter((e) => e[1] >= 3).length / Math.max(1, hi.length);
  return { starsServed: val, bestPossible: best, valueShare: pyRound(Math.min(1.0, val / best), 3), expiredHigh: pyRound(expHi, 3), halfDone: pyRound(half, 3), parkedReturn: parked, errorsUnderLoad: pyRound(errHi, 3) };
}
export function orgScore(m) {
  return pyRound(100 * (W.valueDone * m.valueShare + W.expiredHigh * (1 - m.expiredHigh) +
    W.halfDone * (1 - m.halfDone) + W.parkedReturn * m.parkedReturn + W.errorsUnderLoad * (1 - Math.min(1, m.errorsUnderLoad * 4))), 1);
}
/** Facet sub-scores (0–100): planning = the first three terms re-weighted; under pressure = the last two. */
export function facets(m) {
  const plan = (W.valueDone * m.valueShare + W.expiredHigh * (1 - m.expiredHigh) + W.halfDone * (1 - m.halfDone)) / (W.valueDone + W.expiredHigh + W.halfDone);
  const press = (W.parkedReturn * m.parkedReturn + W.errorsUnderLoad * (1 - Math.min(1, m.errorsUnderLoad * 4))) / (W.parkedReturn + W.errorsUnderLoad);
  return { planScore: pyRound(100 * plan, 1), pressureScore: pyRound(100 * press, 1) };
}

/** The reference's "careful" bot (for tests and automated play): finish started work, then value per step, then deadline. */
export function careful(st) {
  const t = st.tick, P = st.cfg.parked, pSteps = P ? MENU[P.item][2].length : 0;
  let cands = active(st).filter((o) => !blocked(st, nextStation(st, o.id)));
  const tapLeft = P ? pSteps - st.tapau.steps : 0;
  if (P && t >= P.announce && tapLeft && P.arrive - t <= tapLeft + 2 && !blocked(st, nextStation(st, 'tapau'))) return ['tapau', nextStation(st, 'tapau')];
  cands = cands.filter((o) => o.due - t + 1 >= MENU[o.item][2].length - o.step);
  if (!cands.length) {
    if (tapLeft && t >= P.announce && !blocked(st, nextStation(st, 'tapau'))) return ['tapau', nextStation(st, 'tapau')];
    return [null, null];
  }
  const key = (o) => { const left = MENU[o.item][2].length - o.step; return [-(o.step > 0 ? 1 : 0), -o.stars / left, o.due]; };
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const o = cands.reduce((best, c) => (cmp(c, best) < 0 ? c : best));
  return [o.id, nextStation(st, o.id)];
}
