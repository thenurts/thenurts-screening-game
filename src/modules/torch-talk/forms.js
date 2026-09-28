// Round composition (build pack §4). Pure: the scene passes its seeded rand().
import DATA from './items.json' with { type: 'json' };
import TUT from './tutorial.json' with { type: 'json' };

export const CONFIG = { firstRunForm: 'A', restartForm: 'B' }; // tt.firstRunForm (keep on A until the 30+ play review)
export const ITEMS = DATA.items;
export const QUESTIONS = DATA.questions;
export const TAGS = DATA.recipients; // liam/mia/zoey → Close Friend · raj/amira → Casual Acquaintance
export const ITEM_BANK_VERSION = 3; // bank v2.2 (v2.1 rounds = 2, v1 rounds = 1 / absent)
/** How-to v3 (request #17): the try-it steps G1–G5 replace the practice turns (P-01…P-08 stay in items.json, unused). */
export const TUTORIAL = TUT.steps;
export const TUTORIAL_VERSION = TUT.version;
/** The latest tutorial on this page, so the real round can carry the tutorialStruggle caveat (≥ 3 fail-safes). */
export const tutorialMemo = { done: false, failSafes: 0 };
const REAL = ITEMS.filter((x) => x.pool === 'real');
const PRACTICE = ITEMS.filter((x) => x.pool === 'practice');
const bySlot = (form, slot) => REAL.find((x) => x.form === form && x.slot === slot);

/**
 * mode 'practice' → the 6 try-it steps of how-to v3 (G1, G2, G3, G4a, G4b, G5), the same for everyone.
 * real, first run, first attempt → Form A (identical for everyone: the official score).
 * real, first run, a restart after leaving the round → Form B, flagged restartedAfterSetback.
 * real, later runs → slot-wise random (T3 and T7 from the same form), from forms other than the first-run form.
 */
export function buildRound({ mode, runNo = 1, attemptNo = 1, rand = Math.random, cfg = CONFIG, form = null }) {
  if (mode === 'practice') return { form: 'T', restartedAfterSetback: false, items: TUTORIAL };
  if (mode === 'practice-v2') { // the v2.1 practice turns, kept for reference only
    const pickOf = (list) => list[Math.floor(rand() * list.length)];
    const normal = PRACTICE.filter((x) => !x.gap && !x.context), nick = PRACTICE.filter((x) => x.context), gap = PRACTICE.filter((x) => x.gap);
    return { form: 'P', restartedAfterSetback: false, items: [pickOf(normal), pickOf(nick), pickOf(gap)] };
  }
  if (['A', 'B', 'C'].includes(form)) return fixed(form, false); // developer-mode override (manifest.devOptions)
  const first = form === 'random' ? false : Number(runNo) <= 1;
  if (first && attemptNo <= 1) return fixed(cfg.firstRunForm, false);
  if (first) return fixed(cfg.restartForm, true);
  const pool = ['A', 'B', 'C'].filter((f) => f !== cfg.firstRunForm); // everyone saw the first-run form in run 1
  for (let tries = 0; tries < 20; tries++) {
    const pick = {}; for (let s = 1; s <= 10; s++) pick[s] = pool[Math.floor(rand() * pool.length)];
    pick[7] = pick[3]; // they share one shorthand
    const items = Array.from({ length: 10 }, (_, i) => bySlot(pick[i + 1], i + 1));
    if (new Set(items.map((x) => x.id)).size === 10 && new Set(items.map((x) => x.topic)).size === 10) return { form: 'R', restartedAfterSetback: false, items };
  }
  return fixed(pool[0], false);
}
const fixed = (f, flag) => ({ form: f, restartedAfterSetback: flag, items: Array.from({ length: 10 }, (_, i) => bySlot(f, i + 1)) });

/** Tray display order: fixed per item (identical for everyone), gap items get an empty spot for the answer tile. */
export function trayOrder(it) {
  const list = [...it.tiles]; if (it.gap) list.push(null);
  let a = 0; for (const ch of it.id) a = Math.imul(a ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}
