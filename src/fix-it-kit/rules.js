// Mia's Fix-It Kit rule engine: a port of tests/fixit-reference.py (build pack CR1 v1). lookup(), playProblem() and
// metrics() must match the reference exactly (tests/fixtures/fixit-parity.json, from tools/fx_parity_fixture.py).
import CONTENT from './content.json' with { type: 'json' };

export { CONTENT };
export const KIT = CONTENT.kit;
export const KIT_IDS = Object.keys(KIT);
export const TRIES = CONTENT.tries, COUNT_MAX = CONTENT.countMax;
export const PROBLEMS = CONTENT.problems;
export const W = { fluency: 0.30, originality: 0.25, flexibility: 0.20, hitRate: 0.15, blockedRecovery: 0.10 }; // cr.* weights
export const problemsOf = (form) => Object.keys(PROBLEMS).filter((id) => PROBLEMS[id].form === form);

/** Python's round(x, n) (exact halves go to even), so metrics match the reference. */
export function pyRound(x, n = 0) {
  const d = x * 2 ** (n + 1);
  if (Number.isInteger(d) && Math.abs(d % 2) === 1) { const k = 10 ** n, f = Math.floor(x * k); return (f % 2 === 0 ? f : f + 1) / k; }
  return Number(x.toFixed(n));
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sameKeys = (a, b) => { const x = Object.keys(a).sort(), y = Object.keys(b).sort(); return x.length === y.length && x.every((k, i) => k === y[i]); };

/** choice: {obj: chip}. Valid only if the objects match a fix exactly and each chip is one that fix accepts. */
export function lookup(fixes, choice) {
  for (const f of fixes) if (sameKeys(f.objects, choice) && Object.keys(f.objects).every((o) => f.objects[o].includes(choice[o]))) return f;
  return null;
}

/** Live state for one problem (the scene drives it one try at a time; the same code replays the reference bots). */
export function newProblem(pid, cfg = PROBLEMS[pid], kitIds = KIT_IDS) {
  return { pid, cfg, avail: [...kitIds], found: {}, log: [], blocked: false, blockAt: null, over: false };
}
/** One try. Returns the log entry [n, objs, valid, new, mechanism, tier, afterBlock] plus the matching fix. */
export function tryFix(ps, choice) {
  const n = ps.log.length + 1, objs = Object.keys(choice).sort();
  const f = objs.every((o) => ps.avail.includes(o)) ? lookup(ps.cfg.fixes, choice) : null;
  const isNew = !!f && !(f.mechanism in ps.found);
  const e = [n, objs, !!f, isNew, f ? f.mechanism : null, f ? f.tier : null, ps.blocked];
  ps.log.push(e);
  if (isNew) ps.found[f.mechanism] = f.tier;
  let justBlocked = null;
  if (ps.cfg.block && !ps.blocked && Object.keys(ps.found).length) {
    ps.blocked = true; ps.blockAt = n; ps.avail = ps.avail.filter((a) => a !== ps.cfg.block); justBlocked = ps.cfg.block;
  }
  if (ps.log.length >= TRIES) ps.over = true;
  return { entry: e, fix: f, justBlocked, choice };
}
export const available = (cfg) => new Set(cfg.fixes.map((f) => f.mechanism)).size;

/** Reference play_problem with a chooser(pid, avail, foundSet, triesLeft) → choice | null. */
export function playProblem(pid, chooser) {
  const ps = newProblem(pid);
  for (let t = 0; t < TRIES; t++) {
    const c = chooser(pid, ps.avail, new Set(Object.keys(ps.found)), TRIES - t);
    if (c == null) break;
    tryFix(ps, c);
  }
  return result(ps);
}
export const result = (ps) => ({ pid: ps.pid, found: ps.found, log: ps.log, available: available(ps.cfg), block: ps.cfg.block || null, blockAt: ps.blockAt,
  chips: ps.chips || null });

/** results[] from result(); every log entry's chips come from ps.chipLog (kept by the scene) or the replay. */
export function metrics(results) {
  const flu = mean(results.map((r) => Math.min(COUNT_MAX, Object.keys(r.found).length) / Math.min(COUNT_MAX, r.available)));
  const tiers = results.flatMap((r) => Object.values(r.found));
  const orig = tiers.length ? mean(tiers) : 0.0;
  const used = new Set(results.flatMap((r) => r.log.filter((e) => e[3]).flatMap((e) => e[1])));
  const flex = used.size / KIT_IDS.length;
  const tries = results.reduce((a, r) => a + r.log.length, 0), hits = results.reduce((a, r) => a + r.log.filter((e) => e[3]).length, 0);
  const hit = tries ? hits / tries : 0.0;
  const br = results.filter((r) => r.block && r.blockAt);
  const rec = br.length ? mean(br.map((r) => (r.log.some((e) => e[3] && e[6]) ? 1.0 : 0.0))) : null;
  const m = { fluency: pyRound(flu, 3), originality: pyRound(orig, 3), flexibility: pyRound(flex, 3), hitRate: pyRound(hit, 3), blockedRecovery: rec };
  const ks = Object.keys(W).filter((k) => m[k] !== null);
  m.creativeScore = pyRound((100 * ks.reduce((a, k) => a + W[k] * m[k], 0)) / ks.reduce((a, k) => a + W[k], 0), 1);
  return m;
}

/** The reference "explorer" bot (tests / automated play): an untried idea, rarest first, fewer objects first. */
export function explorerChoice(pid, avail, found, _triesLeft, fixes = PROBLEMS[pid].fixes) {
  const opts = fixes.filter((f) => Object.keys(f.objects).every((o) => avail.includes(o)) && !found.has(f.mechanism));
  if (!opts.length) return null;
  let best = opts[0];
  for (const f of opts) { const a = [f.tier, -Object.keys(f.objects).length], b = [best.tier, -Object.keys(best.objects).length]; if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) best = f; }
  return Object.fromEntries(Object.entries(best.objects).map(([o, ch]) => [o, [...ch].sort()[0]]));
}
