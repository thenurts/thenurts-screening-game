// Boot: fonts → Phaser (DPR-aware canvas) → animated backdrop → shell flow.
import Phaser from 'phaser';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import './core/ui/styles.css';
import BackdropScene from './core/BackdropScene.js';
import { initUi, h } from './core/ui/dom.js';
import { startFlow } from './core/flow.js';
import { runOrder } from './core/registry.js';
import { C } from './core/theme.js';
import { DEBUG, MOCK } from './core/config.js';
import { onLog } from './core/logger.js';

const root = document.getElementById('nurts-game');
const stage = document.createElement('div'); stage.id = 'tn-stage'; root.append(stage);
initUi(root);

// Canvas at device pixels (capped at 2×) and displayed at CSS size, so art and text stay crisp.
const dpr = () => Math.min(2, window.devicePixelRatio || 1);
const size = () => ({ w: Math.max(320, root.clientWidth), h: Math.max(480, root.clientHeight) });

async function boot() {
  await Promise.race([Promise.all(['800 32px Montserrat', '600 32px Montserrat'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
  const { w, h: ht } = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    backgroundColor: C.cream,
    scale: { mode: Phaser.Scale.NONE, width: w * dpr(), height: ht * dpr(), zoom: 1 / dpr() },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 3 },
    scene: [BackdropScene],
    banner: false,
  });
  const resize = () => { const s = size(); game.scale.resize(s.w * dpr(), s.h * dpr()); game.scale.setZoom(1 / dpr()); };
  window.addEventListener('resize', resize);
  window.__tnGame = game;
  if (MOCK) window.__tnOrder = (key, run) => runOrder(key, run).map((m) => m.id); // test hook
  game.events.once('ready', () => startFlow(game));
  if (DEBUG) debugPanel();
  // Never let a test build pass as the real thing.
  if (MOCK) document.getElementById('tn-ui').append(h('div', { style: { position: 'absolute', top: 0, right: 0, background: '#ED5641', color: '#fff', font: '800 11px Montserrat, sans-serif', padding: '4px 10px', borderBottomLeftRadius: '10px', zIndex: 30, letterSpacing: '.08em' } }, 'TEST MODE · data stays on this device'));
}

function debugPanel() {
  const el = h('div', { class: 'tn-debug' }, h('b', {}, `debug · ${MOCK ? 'MOCK backend' : 'live backend'}`));
  document.getElementById('tn-ui').append(el);
  onLog((e) => { el.append(h('div', {}, `${e.module} ${e.round_no} ${e.interaction} ${e.value}`.slice(0, 120))); el.scrollTop = 1e9; });
}

boot();
