// Player flow controller (spec §2): Home → Register/Login → [PreGame → Round → PostGame]* → Report.
import { api } from './api.js';
import { session } from './session.js';
import { log, claimAnonymous, flush } from './logger.js';
import { modules, nextModule } from './registry.js';
import { hideUi, show, h, toast } from './ui/dom.js';
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
  session.userId = session.CASUAL_ID; session.casual = true; // provisional so the request carries casual auth
  try { await enter(await api.casualStart(), 'casual_start'); }
  catch { session.userId = null; session.casual = false; toast('Connection problem. Please try again.', 'bad'); }
}

function register() {
  registerScreen({
    onBack: applicant,
    onSubmit: async (payload) => {
      try {
        const data = await api.register(payload);
        await enter(data, 'register');
      } catch (e) {
        if (e.code === 'already_registered') { toast('That email or mobile number is already registered. Please continue as a returning candidate.'); login(payload.profile.email); }
        else toast(e.code === 'network' ? 'Connection problem. Please try again.' : 'Something went wrong. Please check your details.', 'bad');
      }
    },
  });
}

function login(email = '') {
  loginScreen({
    email,
    onBack: applicant,
    onSubmit: async (p) => {
      try { await enter(await api.login(p), 'login_ok'); }
      catch (e) { toast(e.code === 'network' ? 'Connection problem. Please try again.' : 'We couldn’t find a match for those details.', 'bad'); }
    },
  });
}

async function enter(data, how) {
  session.set(data);
  claimAnonymous();
  log('core', how, { runNo: session.runNo, completed: session.completed.length });
  log('core', 'session_start', { ua: navigator.userAgent.slice(0, 160), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio });
  const next = nextModule(session.completed);
  if (how === 'login_ok') log('core', 'resume', next ? next.id : 'report');
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

async function play(manifest, mode) {
  let start;
  try {
    start = await api.roundStart({ module: manifest.id, mode, moduleVersion: manifest.version });
  } catch { toast('Connection problem. Please try again.', 'bad'); return; }
  const ctx = { roundNo: start.roundNo, moduleVersion: manifest.version };
  log(manifest.id, mode === 'practice' ? 'practice_start' : 'round_start', { seed: start.seed }, ctx);
  flush();
  const { default: SceneClass } = await manifest.load();
  hideUi();
  const key = `mod:${manifest.id}`;
  if (game.scene.getScene(key)) game.scene.remove(key);
  game.scene.sleep('backdrop'); // modules draw their own full-bleed world; skip the backdrop's overdraw
  game.scene.add(key, SceneClass, true, {
    manifest, mode, roundNo: start.roundNo, runNo: session.runNo, seed: start.seed,
    onDone: (res) => roundDone(manifest, mode, start.roundNo, res, key),
  });
}

async function roundDone(manifest, mode, roundNo, res, key) {
  const ctx = { roundNo, moduleVersion: manifest.version };
  const ev = mode === 'practice' ? (res.status === 'completed' ? 'practice_end' : 'practice_quit') : res.status === 'completed' ? 'round_complete' : 'round_quit';
  log(manifest.id, ev, res.status === 'completed' ? res.metrics : { elapsedMs: res.elapsedMs }, ctx);
  game.scene.remove(key);
  game.scene.wake('backdrop');
  let out = { benchmark: {} };
  try { out = await api.roundEnd({ module: manifest.id, roundNo, status: res.status, metrics: res.metrics || null, primary: res.metrics?.[manifest.metrics.find((m) => m.primary).key] ?? null }); }
  catch { toast('Saved offline – we’ll sync when you’re back online.'); }
  flush();
  if (mode === 'practice' || res.status !== 'completed') return preGame(manifest, mode === 'practice' && res.status === 'completed' ? res.metrics : null);
  session.completed = [...new Set([...session.completed, manifest.id])];
  backdrop()?.celebrate();
  postGameScreen({
    manifest, metrics: res.metrics, benchmark: out.benchmark, completed: session.completed, casual: session.casual,
    onContinue: () => {
      log(manifest.id, 'continue', '', ctx);
      const next = nextModule(session.completed);
      next ? preGame(next) : report();
    },
  });
}

async function report() {
  let data;
  try { data = await api.report(session.runNo); } catch { toast('Couldn’t load your report. Please refresh.', 'bad'); return; }
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
      } catch { toast('Connection problem. Please try again.', 'bad'); }
    },
  });
}
