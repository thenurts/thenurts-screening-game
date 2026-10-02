// Player flow controller (spec §2): Home → Register/Login → [PreGame → Round → PostGame]* → Report.
import { api } from './api.js';
import { session } from './session.js';
import { log, claimAnonymous, flush, openTrace, trace, takeTrace, resolveRound, queueEnd } from './logger.js';
import { modules, nextModule, runOrder } from './registry.js';
import { hideUi, show, h, toast, button } from './ui/dom.js';
import { friendly } from './errors.js';
import { MOCK } from './config.js';
import { homeScreen, applicantScreen, registerScreen, loginScreen } from './screens/entry.js';
import { preGameScreen, howToModal, postGameScreen, reportScreen, debriefScreen } from './screens/game.js';
import { resetEthics } from './ethics.js';

// Casual-play safeguard C (request #26): a non-personal note on this device of which games were completed in play-for-fun
// mode. Best-effort (a private window clears it); content separation is the main defence. Read when a candidate signs in.
const PKEY = 'nurts.practisedModules';
const practisedThisVisit = new Set();
const readPractised = () => { try { const v = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
function markPractised(id) {
  practisedThisVisit.add(id);
  try { localStorage.setItem(PKEY, JSON.stringify([...new Set([...readPractised(), id])])); } catch { /* storage blocked */ }
}

let game = null;
const backdrop = () => game.scene.getScene('backdrop');

export function startFlow(g) {
  game = g;
  if (!modules.length) { show(h('div', { class: 'tn-screen' }, h('p', {}, 'No games are enabled yet.'))); return; }
  home();
}

function home() {
  homeScreen({ onApply: applicant, onCasual: casual });
}

function applicant() {
  applicantScreen({ onNew: register, onReturning: () => login(), onBack: home });
}

// "Just play for fun": straight to the games. No PII; recorded as "Casual User" per session.
async function casual() {
  // No server round trip needed: the casual record is created on the first sync.
  await enter({ identity: { userId: session.CASUAL_ID, casual: true }, runNo: 1, completed: [] }, 'casual_start');
}

function register() {
  registerScreen({
    onBack: applicant,
    onSubmit: async (payload) => {
      let data;
      try { data = await api.register(payload); }
      catch (e) {
        log('core', 'register_error', { code: e.code, ref: e.ref || '' });
        if (e.code === 'already_registered') { toast(friendly(e)); login(payload.profile.email); }
        else toast(friendly(e, 'save your registration'), 'bad');
        return;
      }
      await enter(data, 'register');
      if (data.cvFailed) toast('You’re registered! Your CV couldn’t be uploaded, so please email it to hello@thenurts.com.', 'bad');
    },
  });
}

function login(email = '') {
  loginScreen({
    email,
    onBack: applicant,
    onSubmit: async (p) => {
      try { await enter(await api.login(p), 'login_ok'); }
      catch (e) { toast(friendly(e, 'log you in'), 'bad'); }
    },
  });
}

// Test hook (mock / localhost only): ?candidate=1 lets a casual session play like a candidate (official forms, wipeouts),
// so the scoring tests can use the quick casual entry. Never available against the real backend.
const TEST_CANDIDATE = (MOCK || location.hostname === 'localhost') && new URLSearchParams(location.search).get('candidate') === '1';
const playerKey = () => (session.casual ? session.sessionId : session.userId);
function setOrder() {
  session.order = runOrder(playerKey(), session.runNo);
  // Test hook (mock / localhost only): ?first=<module id> plays that game first
  const first = (MOCK || location.hostname === 'localhost') && new URLSearchParams(location.search).get('first');
  const m = first && session.order.find((x) => x.id === first);
  if (m) session.order = [m, ...session.order.filter((x) => x !== m)];
}

async function enter(data, how) {
  session.set(data);
  claimAnonymous();
  setOrder();
  session.priorCasual = session.playForFun ? [] : readPractised();
  const next = nextModule(session.completed, session.order);
  log('core', how, { runNo: session.runNo, completed: session.completed.length, resumeAt: next ? next.id : 'report', moduleOrder: session.order.map((m) => m.id).join('>') });
  log('core', 'session_start', { ua: navigator.userAgent.slice(0, 160), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints > 0,
    ...(session.priorCasual.length ? { priorCasualPlay: session.priorCasual, priorCasualSameVisit: session.priorCasual.filter((id) => practisedThisVisit.has(id)) } : {}) });
  if (how === 'casual_start') { next ? preGame(next) : report(); return; }
  next ? preGame(next) : report();
}

function preGame(manifest, practiceResult = null) {
  backdrop()?.setMood();
  const scr = preGameScreen({
    manifest, completed: session.completed, practiceResult, order: session.order,
    onHowTo: () => howToModal(manifest, scr),
    onPractice: () => play(manifest, 'practice'),
    onStart: () => play(manifest, 'real'),
  });
  // Prefetch the gameplay chunk while they read.
  manifest.load().catch(() => {});
}

const attempts = {}; // "<run>:<module>" → real attempts started on this device (repeat-attempt handling)
const seed32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

// The round starts instantly: the server is told in the background during the 3-2-1 countdown.
// The attempt is recorded even if that call is slow or fails (roundEnd, and the abandon beacon, create it too).
async function play(manifest, mode) {
  const roundUid = session.uuid();
  const seed = seed32();
  const ctx = { roundUid, moduleVersion: manifest.version };
  const base = { roundUid, module: manifest.id, mode, moduleVersion: manifest.version, seed,
    positionInRun: session.order.indexOf(manifest) + 1, moduleOrder: session.order.map((m) => m.id).join('>') };
  openTrace(roundUid, { module: manifest.id, moduleVersion: manifest.version, mode });
  trace(roundUid, [0, 'device', { deviceClass: deviceClass(), vw: innerWidth, vh: innerHeight }]); // also for rounds that end unfinished
  log(manifest.id, mode === 'practice' ? 'practice_start' : 'round_start', { seed }, ctx);
  const key = `mod:${manifest.id}`;
  let scene = null;
  (async () => {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await api.roundStart(base);
        resolveRound(roundUid, r.roundNo);
        if (scene && !scene.ended) scene.roundNo = r.roundNo;
        return;
      } catch { await new Promise((res) => setTimeout(res, 1500 * (i + 1))); }
    }
  })();
  const { default: SceneClass } = await manifest.load();
  hideUi();
  if (game.scene.getScene(key)) game.scene.remove(key);
  game.scene.sleep('backdrop'); // modules draw their own full-bleed world; skip the backdrop's overdraw
  const attemptKey = `${session.runNo}:${manifest.id}`;
  if (mode === 'real') attempts[attemptKey] = (attempts[attemptKey] || 0) + 1;
  game.scene.add(key, SceneClass, true, {
    manifest, mode, roundUid, roundNo: null, runNo: session.runNo, seed,
    playerKey: playerKey(), attemptNo: attempts[attemptKey] || 0, options: session.moduleOptions?.[manifest.id] || {}, casual: session.playForFun && !TEST_CANDIDATE,
    onDone: (res) => roundDone(manifest, mode, base, res, key),
  });
  scene = game.scene.getScene(key);
}

/** phone · tablet · desktop (alpha #36: logged on every round, so norms can be split by device later). */
export function deviceClass() {
  const coarse = matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0, short = Math.min(screen.width, screen.height);
  return coarse && short < 600 ? 'phone' : coarse && short < 1100 ? 'tablet' : 'desktop';
}

function roundDone(manifest, mode, base, res, key) {
  if (res.metrics) res.metrics.deviceClass = deviceClass();
  const ctx = { roundUid: base.roundUid, moduleVersion: manifest.version };
  const ev = mode === 'practice' ? (res.status === 'completed' ? 'practice_end' : 'practice_quit') : res.status === 'completed' ? 'round_complete' : 'round_quit';
  log(manifest.id, ev, res.status === 'completed' ? res.metrics : { elapsedMs: res.elapsedMs }, ctx);
  game.scene.remove(key);
  game.scene.wake('backdrop');
  if (mode === 'real' && res.status === 'completed' && res.metrics) {
    if (session.playForFun) markPractised(manifest.id);
    else if (session.priorCasual?.includes(manifest.id)) { // practised in play-for-fun first: learning's pickup / firstUse are n/a here
      const m = res.metrics; m.priorCasualPlay = true;
      if (m.learn) { const { pickup, firstUse, ...rest } = m.learn; m.learn = { ...rest, priorPractice: true }; }
      m.flags = [m.flags, 'priorCasualPlay'].filter(Boolean).join(',');
    }
  }
  const payload = { ...base, status: res.status, metrics: res.metrics || null, primary: res.metrics?.[manifest.metrics.find((m) => m.primary).key] ?? null, trace: takeTrace(base.roundUid) };
  // Staff-facing values for the Candidate Summary (manifest.summaryKeys), e.g. riskScore / riskBand / flags
  if (res.metrics && manifest.summaryKeys) payload.summary = Object.fromEntries(manifest.summaryKeys.map((k) => [k, res.metrics[k] ?? '']));
  const ended = api.roundEnd(payload).then((out) => { flush(); return out; }).catch(() => { queueEnd(payload); return null; });
  if (mode === 'practice' || res.status !== 'completed') return preGame(manifest, mode === 'practice' && res.status === 'completed' ? res.metrics : null);
  session.completed = [...new Set([...session.completed, manifest.id])];
  backdrop()?.celebrate();
  const scr = postGameScreen({
    manifest, metrics: res.metrics, benchmark: null, completed: session.completed, casual: session.casual, order: session.order,
    onContinue: () => {
      log(manifest.id, 'continue', '', ctx);
      const next = nextModule(session.completed, session.order);
      next ? preGame(next) : endOfSuite();
    },
  });
  // Results show immediately; the "vs median" comparison fills in when the server answers.
  ended.then((out) => scr.setBenchmark?.(out ? out.benchmark : {}));
}

/** After the last game: the high-level debrief (request #24; candidates only, since play-for-fun has no wipeouts), then the report. */
function endOfSuite() {
  // Only after the deliberately frustrating game (playLast) was actually played, so a partial dev test run skips it.
  if (session.playForFun || !session.order.some((m) => m.playLast && session.completed.includes(m.id))) return report();
  debriefScreen({ onContinue: () => report() });
}

async function report() {
  show(h('div', { class: 'tn-screen' }, h('div', { class: 'tn-card' }, h('h2', {}, 'Putting your play profile together…'), h('p', { class: 'tn-muted' }, 'This takes a few seconds.'))));
  await flush();
  let data;
  try { data = await api.report(session.runNo); } catch (e) { // never leave the player stuck on the loading card (alpha #35 A5)
    toast(friendly(e, 'load your report'), 'bad');
    show(h('div', { class: 'tn-screen' }, h('div', { class: 'tn-card' }, h('h2', {}, 'Your results are saved'),
      h('p', { class: 'tn-muted' }, 'We couldn’t show your report just now. Every game you played is already stored.'),
      button('Try again', () => report(), { icon: '↻', id: 'btn-report-retry' }))));
    return;
  }
  backdrop()?.celebrate();
  reportScreen({
    report: data, runNo: session.runNo, casual: session.casual,
    onApply: () => { Object.assign(session, { userId: null, casual: false, completed: [] }); register(); },
    onRestart: async () => {
      log('core', 'run_restart', { fromRun: session.runNo });
      resetEthics();
      try {
        const d = await api.newRun();
        session.set(d);
        setOrder();
        log('core', 'run_start', { runNo: session.runNo, moduleOrder: session.order.map((m) => m.id).join('>') });
        preGame(session.order[0]);
      } catch (e) { toast(friendly(e, 'start a new run'), 'bad'); }
    },
  });
}

/**
 * Small API for extensions registered at boot (e.g. a test tool). Core never depends on any of them.
 * startCustom: sign in with identity data shaped like enter()'s, play the given modules in the given order (no
 * shuffle), starting in 'real', 'practice' or 'pregame' mode.
 */
export const app = {
  get game() { return game; },
  home: () => home(),
  report: () => report(),
  preGame: (m) => preGame(m),
  startCustom(data, order, mode = 'real') {
    session.set(data);
    session.order = order;
    if (mode === 'pregame') preGame(order[0]);
    else play(order[0], mode === 'practice' ? 'practice' : 'real');
  },
};
