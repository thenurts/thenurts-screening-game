// Player flow controller (spec §2): Home → Register/Login → [PreGame → Round → PostGame]* → Report.
import { api } from './api.js';
import { session } from './session.js';
import { log, claimAnonymous, flush, openTrace, takeTrace, resolveRound, queueEnd } from './logger.js';
import { modules, nextModule } from './registry.js';
import { hideUi, show, h, toast } from './ui/dom.js';
import { friendly } from './errors.js';
import { homeScreen, applicantScreen, registerScreen, loginScreen } from './screens/entry.js';
import { preGameScreen, howToModal, postGameScreen, reportScreen } from './screens/game.js';

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

async function enter(data, how) {
  session.set(data);
  claimAnonymous();
  const next = nextModule(session.completed);
  log('core', how, { runNo: session.runNo, completed: session.completed.length, resumeAt: next ? next.id : 'report' });
  log('core', 'session_start', { ua: navigator.userAgent.slice(0, 160), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints > 0 });
  if (how === 'casual_start') { next ? preGame(next) : report(); return; }
  next ? preGame(next) : report();
}

function preGame(manifest, practiceResult = null) {
  backdrop()?.setMood();
  const scr = preGameScreen({
    manifest, completed: session.completed, practiceResult,
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
  const base = { roundUid, module: manifest.id, mode, moduleVersion: manifest.version, seed };
  openTrace(roundUid, { module: manifest.id, moduleVersion: manifest.version, mode });
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
    playerKey: session.casual ? session.sessionId : session.userId, attemptNo: attempts[attemptKey] || 0,
    onDone: (res) => roundDone(manifest, mode, base, res, key),
  });
  scene = game.scene.getScene(key);
}

function roundDone(manifest, mode, base, res, key) {
  const ctx = { roundUid: base.roundUid, moduleVersion: manifest.version };
  const ev = mode === 'practice' ? (res.status === 'completed' ? 'practice_end' : 'practice_quit') : res.status === 'completed' ? 'round_complete' : 'round_quit';
  log(manifest.id, ev, res.status === 'completed' ? res.metrics : { elapsedMs: res.elapsedMs }, ctx);
  game.scene.remove(key);
  game.scene.wake('backdrop');
  const payload = { ...base, status: res.status, metrics: res.metrics || null, primary: res.metrics?.[manifest.metrics.find((m) => m.primary).key] ?? null, trace: takeTrace(base.roundUid) };
  // Staff-facing values for the Candidate Summary (manifest.summaryKeys), e.g. riskScore / riskBand / flags
  if (res.metrics && manifest.summaryKeys) payload.summary = Object.fromEntries(manifest.summaryKeys.map((k) => [k, res.metrics[k] ?? '']));
  const ended = api.roundEnd(payload).then((out) => { flush(); return out; }).catch(() => { queueEnd(payload); return null; });
  if (mode === 'practice' || res.status !== 'completed') return preGame(manifest, mode === 'practice' && res.status === 'completed' ? res.metrics : null);
  session.completed = [...new Set([...session.completed, manifest.id])];
  backdrop()?.celebrate();
  const scr = postGameScreen({
    manifest, metrics: res.metrics, benchmark: null, completed: session.completed, casual: session.casual,
    onContinue: () => {
      log(manifest.id, 'continue', '', ctx);
      const next = nextModule(session.completed);
      next ? preGame(next) : report();
    },
  });
  // Results show immediately; the "vs median" comparison fills in when the server answers.
  ended.then((out) => scr.setBenchmark?.(out ? out.benchmark : {}));
}

async function report() {
  show(h('div', { class: 'tn-screen' }, h('div', { class: 'tn-card' }, h('h2', {}, 'Putting your play profile together…'), h('p', { class: 'tn-muted' }, 'This takes a few seconds.'))));
  await flush();
  let data;
  try { data = await api.report(session.runNo); } catch (e) { toast(friendly(e, 'load your report'), 'bad'); return; }
  backdrop()?.celebrate();
  reportScreen({
    report: data, runNo: session.runNo, casual: session.casual,
    onApply: () => { Object.assign(session, { userId: null, casual: false, completed: [] }); register(); },
    onRestart: async () => {
      log('core', 'run_restart', { fromRun: session.runNo });
      try {
        const d = await api.newRun();
        session.set(d);
        log('core', 'run_start', { runNo: session.runNo });
        preGame(modules[0]);
      } catch (e) { toast(friendly(e, 'start a new run'), 'bad'); }
    },
  });
}
