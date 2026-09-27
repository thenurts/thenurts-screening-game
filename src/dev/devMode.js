// Developer mode (request #14). Everything lives in src/dev/; core only exposes small generic hooks.
// Switch off: set DEV_MODE to false in src/dev.config.js. Remove: see ./README.md.
// Records are tagged "Dev Test" by the server (it checks a short-lived token from devAuth, which needs the PIN
// stored in the Script Property DEV_PIN), so they're excluded from benchmarks and the Candidate Summary.
import { api } from '../core/api.js';
import { session } from '../core/session.js';
import { app } from '../core/flow.js';
import { log } from '../core/logger.js';
import { allModules, modules } from '../core/registry.js';
import { homeExtras } from '../core/screens/entry.js';
import { h, show, button, card, toast, busy } from '../core/ui/dom.js';

const DEV_ID = 'Dev Test';
const CSS = `
.tn-dev-ribbon { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; gap: 4px; align-items: center;
  background: #ED5641; color: #fff; font: 800 12px Montserrat, system-ui, sans-serif; padding: 4px 6px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 0 #0B0B0B; }
.tn-dev-ribbon b { padding: 0 6px; letter-spacing: .08em; }
.tn-dev-ribbon button { font: 700 12px Montserrat, system-ui, sans-serif; border: 0; border-radius: 8px; padding: 6px 8px; min-height: 30px; white-space: nowrap; background: #fff; color: #0B0B0B; cursor: pointer; }
.tn-dev-list { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
.tn-dev-row { display: flex; align-items: center; gap: 8px; border: 2px solid #0B0B0B; border-radius: 14px; padding: 8px 10px; background: #fff; }
.tn-dev-row.is-on { background: #FED33C; }
.tn-dev-row button.tn-dev-pick { flex: 1; text-align: left; font: 700 15px Montserrat, system-ui, sans-serif; background: none; border: 0; cursor: pointer; min-height: 36px; }
.tn-dev-num { width: 26px; height: 26px; border-radius: 50%; background: #0B0B0B; color: #FED33C; display: grid; place-items: center; font: 800 13px Montserrat, sans-serif; }
.tn-dev-row select, .tn-dev-modes select { font: 600 14px Montserrat, system-ui, sans-serif; border: 2px solid #0B0B0B; border-radius: 10px; padding: 6px; background: #fff; }
.tn-dev-modes { display: flex; gap: 8px; align-items: center; margin: 6px 0 10px; font-weight: 700; }
.tn-dev-pin { font: 800 28px Montserrat, sans-serif; letter-spacing: .3em; text-align: center; }
`;

let installed = false;
let ribbon = null;
let picked = []; // module ids in the order they were tapped
let mode = 'real';
const opts = {}; // module id → { option: value }

export function install() {
  if (installed) return;
  installed = true;
  document.head.append(h('style', { id: 'tn-dev-css' }, CSS));
  homeExtras.push({ id: 'btn-dev', icon: '🔧', label: 'Developer mode', onClick: () => (isOn() ? picker() : pinScreen()) });
  if (document.getElementById('btn-apply')) app.home(); // Home was drawn before we registered: redraw it with the wrench
}

const isOn = () => !!session.authExtra?.dev && session.userId === DEV_ID;

function pinScreen() {
  const pin = h('input', { id: 'dev-pin', class: 'tn-input tn-dev-pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '12', autofocus: true, 'aria-label': 'Developer PIN' });
  const go = button('Unlock', () => unlock(pin.value, go), { id: 'btn-dev-unlock', type: 'submit' });
  show(h('div', { class: 'tn-screen' }, card(
    h('h2', {}, '🔧 Developer mode'),
    h('p', { class: 'tn-muted' }, 'For The Nurts team only. Everything you play is saved as “Dev Test” and left out of benchmarks and candidate summaries.'),
    h('form', { onsubmit: (e) => { e.preventDefault(); unlock(pin.value, go); } },
      h('div', { class: 'tn-field' }, h('label', { for: 'dev-pin' }, 'PIN'), pin),
      h('div', { class: 'tn-stack' }, go, button('Back', () => app.home(), { kind: 'ghost' }))),
  )));
}

async function unlock(pin, btn) {
  if (!pin) return;
  busy(btn, true);
  try {
    const { token } = await api.raw('devAuth', { pin });
    await signIn(token);
    picker();
  } catch (e) {
    toast(e.code === 'dev_pin' ? 'That PIN isn’t right.' : e.code === 'dev_locked' ? 'Too many tries. Wait 10 minutes.'
      : e.code === 'dev_refused' ? 'Developer mode is switched off on the server (no DEV_PIN).' : 'Couldn’t reach the server.', 'bad');
  } finally { busy(btn, false); }
}

async function signIn(token) {
  Object.assign(session, { userId: DEV_ID, casual: true, email: null, phone: null, name: null, completed: [] });
  session.authExtra = { dev: true, devToken: token };
  const d = await api.casualStart();
  session.set(d);
  session.userId = DEV_ID; // the server echoes it; keep it even if an old mock doesn't
  log('core', 'casual_start', { dev: true, runNo: session.runNo }); // the same sign-in rows as a casual player, under Dev Test
  log('core', 'session_start', { dev: true, ua: navigator.userAgent.slice(0, 160), vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints > 0 });
  showRibbon();
}

function picker() {
  const list = h('div', { class: 'tn-dev-list' });
  const draw = () => {
    list.replaceChildren(...allModules.map((m) => {
      const n = picked.indexOf(m.id);
      const sel = Object.entries(m.devOptions || {}).map(([k, vals]) => {
        const s = h('select', { 'aria-label': `${m.title} ${k}`, 'data-opt': `${m.id}.${k}`, onchange: (e) => { (opts[m.id] ||= {})[k] = e.target.value || undefined; } },
          h('option', { value: '' }, `${k}: normal`), ...vals.map((v) => h('option', { value: v, selected: opts[m.id]?.[k] === v }, `${k}: ${v}`)));
        return s;
      });
      return h('div', { class: `tn-dev-row${n >= 0 ? ' is-on' : ''}` },
        n >= 0 ? h('span', { class: 'tn-dev-num' }, n + 1) : null,
        h('button', { class: 'tn-dev-pick', 'data-module': m.id, onclick: () => { n >= 0 ? picked.splice(n, 1) : picked.push(m.id); draw(); } },
          m.title, modules.includes(m) ? '' : ' (off)'),
        ...sel);
    }));
  };
  draw();
  const modeSel = h('select', { id: 'dev-mode', onchange: (e) => { mode = e.target.value; } },
    ...[['real', 'Real round'], ['practice', 'Practice'], ['pregame', 'Game intro screen']].map(([v, l]) => h('option', { value: v, selected: mode === v }, l)));
  show(h('div', { class: 'tn-screen' }, card(
    h('h2', {}, '🔧 Pick games'),
    h('p', { class: 'tn-muted' }, 'Tap games in the order you want to play them. Games marked (off) aren’t switched on for candidates yet.'),
    list,
    h('div', { class: 'tn-dev-modes' }, h('label', { for: 'dev-mode' }, 'Start with'), modeSel),
    h('div', { class: 'tn-stack' },
      button('Start', start, { id: 'btn-dev-start', icon: '▶' }),
      button('Open report', () => app.report(), { kind: 'secondary', id: 'btn-dev-report' }),
      button('Reset my dev runs', reset, { kind: 'secondary', id: 'btn-dev-reset' }),
      button('Exit developer mode', exit, { kind: 'ghost', id: 'btn-dev-exit' })),
  )));
}

function start() {
  if (!picked.length) { toast('Tap at least one game first.'); return; }
  const order = picked.map((id) => allModules.find((m) => m.id === id));
  session.moduleOptions = Object.fromEntries(Object.entries(opts).map(([id, o]) => [id, Object.fromEntries(Object.entries(o).filter(([, v]) => v))]));
  app.startCustom({ identity: { userId: DEV_ID, casual: true }, runNo: session.runNo, completed: [] }, order, mode);
}

async function reset() {
  session.sessionId = session.uuid(); // a new dev session = a fresh run 1 (first-attempt forms again)
  try { await signIn(session.authExtra.devToken); toast('Fresh dev run started.'); }
  catch { toast('Your developer sign-in expired. Enter the PIN again.', 'bad'); exit(); }
}

function currentScene() {
  const g = app.game;
  return g?.scene.getScenes(true).find((s) => s.manifest && typeof s.finish === 'function') || null;
}

function showRibbon() {
  if (ribbon) return;
  ribbon = h('div', { class: 'tn-dev-ribbon', id: 'tn-dev-ribbon' },
    h('b', {}, 'DEV'),
    h('button', { id: 'dev-rb-picker', onclick: () => { const s = currentScene(); if (s && !s.ended) { toast('Finish or end the round first.'); return; } picker(); } }, 'Games'),
    h('button', { id: 'dev-rb-end', onclick: () => { const s = currentScene(); if (!s || s.ended || !s.running) { toast('No round is running.'); return; } s.finish(s.metrics()); } }, 'End round'),
    h('button', { id: 'dev-rb-exit', onclick: () => { if (currentScene()) { toast('Finish or end the round first.'); return; } exit(); } }, 'Exit'));
  document.body.append(ribbon);
}

function exit() {
  Object.assign(session, { userId: null, casual: false, email: null, phone: null, name: null, completed: [], authExtra: null, moduleOptions: {} });
  session.sessionId = session.uuid();
  ribbon?.remove(); ribbon = null;
  app.home();
}
