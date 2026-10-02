// The Nurts Mamak gameplay (build pack O1 v1.2). Rules: ./rules.js (port of tests/mamak-reference.py) · practice: ./tutorial.js · brief: ./README.md
// The wall clock moves one minute per action and never on its own, so speed can't matter. Nothing here uses real time
// except the idle nudge (a hint only; idleMs is logged, never scored).
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { FORMS, MENU, STATIONS, newState, act, active, blocked, nextStation, metrics, orgScore, facets, clock, shiftOver, careful } from './rules.js';
import { TUTORIAL, tutorialMemo } from './tutorial.js';
import { LINES, pickLine } from './lines.js';
import * as CL from './closing.js';
import bgUrl from './assets/bg-mamak.webp';
import teh from './assets/teh.webp';
import kopi from './assets/kopi.webp';
import roti from './assets/roti.webp';
import mee from './assets/mee.webp';
import nasi from './assets/nasi.webp';
import murtabak from './assets/murtabak.webp';
import tapau from './assets/tapau.webp';
import gas from './assets/gas.webp';
import urn from './assets/urn.webp';
import griddle from './assets/griddle.webp';
import rice from './assets/rice.webp';
import counter from './assets/counter.webp';

const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const ms = (x) => x / SPEED;
const IDLE_MS = 20000;
const IMG = { teh, kopi, roti, mee, nasi, murtabak, tapau, gas, urn, griddle, rice, counter };
const STATION_LABEL = { urn: 'Urn', griddle: 'Griddle', rice: 'Rice pot', counter: 'Counter' };
const PEOPLE = ['liam', 'mia', 'noah', 'zoey', 'raj', 'amira'];
const NAMES = { liam: 'Liam', mia: 'Mia', noah: 'Noah', zoey: 'Zoey', raj: 'Raj', amira: 'Amira' };
const L0 = { helpY: 108, liamY: 232, qTop: 312, cardH: 112, cardGap: 8, maxCards: 5, rowY: 952, stY: 1122 };
let L = L0;
const HELP = '★ value · ⏳ minutes left · ✔ finish what you start';
const TRAPS = [['o5', 'o13'], ['o7', 'o15']]; // learning: the same trap twice (first-come, then jump-to-newest)

export default class GameScene extends ModuleScene {
  preload() {
    if (!this.textures.exists('mk-bg')) this.load.image('mk-bg', bgUrl);
    for (const [k, u] of Object.entries(IMG)) if (!this.textures.exists(`mk-${k}`)) this.load.image(`mk-${k}`, u);
    for (const p of PEOPLE) for (const pose of ['happy', 'worried', 'excited']) if (!this.textures.exists(`${p}-${pose}`)) this.load.image(`${p}-${pose}`, charImg(p, pose));
  }

  // ---------------------------------------------------------------- world
  build() {
    const { W, H } = this;
    this.add.rectangle(W / 2, H / 2, W * 4, H * 4, hex('#CFE3D3'));
    this.bg = this.add.image(W / 2, H / 2, 'mk-bg');
    const fit = () => { const z = Math.min(this.scale.width / W, this.scale.height / H) || 1; this.bg.setScale(Math.max(W / this.bg.width, Math.max(H, this.scale.height / z) / this.bg.height)); };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    this.add.rectangle(W / 2, H / 2 + 60, W - 20, 1000, hex(C.cream), 0.55);

    this.tut = this.mode === 'practice';
    L = this.tut ? { ...L0, helpY: 160, liamY: 282, qTop: 362, maxCards: 4 } : L0; // room for the PRACTICE badge
    this.form = this.tut ? 'T' : this.options.form === 'A' || this.options.form === 'B' ? this.options.form : !this.casual && Number(this.runNo || 1) <= 1 && this.attemptNo <= 1 ? 'A' : 'B'; // play-for-fun never sees Form A (request #26)
    this.repeatAttempt = !this.tut && Number(this.runNo || 1) <= 1 && this.attemptNo > 1;
    this.sel = null; this.pinned = []; this.scroll = 0; this.waits = 0; this.pins = 0; this.idleNudges = 0; this.idleMs = 0; this.acts = [];
    this.wrongKeys = []; this.firstDish = {}; this.wrongByOrder = {}; this.probes = [];

    this.clockPill = this.pill(300, 64, 340, '');
    this.strip = this.add.container(0, L.helpY).setDepth(20);
    this.liam = this.add.image(98, L.liamY + 6, 'liam-happy').setDepth(25); this.fitImg(this.liam, 140);
    this.bubble = this.add.container(0, 0).setDepth(26);
    this.starPill = this.pill(612, L.liamY - 26, 160, '★ 0'); this.starPill.setDepth(27);
    this.queue = this.add.container(0, 0).setDepth(30);
    this.row = this.add.container(0, 0).setDepth(30);
    this.stations = STATIONS.map((s, i) => this.stationBtn(105 + i * 170, L.stY, s));
    this.overlay = this.add.container(0, 0).setDepth(1200);
  }

  fitImg(img, box) { const k = Math.min(box / img.width, box / img.height); img.setScale(k); return img; }

  pill(x, y, w, label) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -36, w, 72, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -36, w, 72, 36));
    c.text = this.txt(0, 2, label, { fontSize: '30px' }); c.add(c.text);
    return c;
  }

  stationBtn(x, y, s) {
    const c = this.add.container(x, y).setDepth(40), w = 160, h = 188;
    const face = this.add.container(0, 0);
    const g = this.add.graphics();
    face.add([g, this.fitImg(this.add.image(0, -22, `mk-${s}`), 118), this.txt(0, 64, STATION_LABEL[s], { fontSize: '27px' })]);
    c.add([this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 26), face]);
    c.paint = (fill) => g.clear().fillStyle(hex(fill), 1).fillRoundedRect(-w / 2, -h / 2, w, h, 26).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
    c.paint(C.white);
    c.gasIcon = this.fitImg(this.add.image(46, -60, 'mk-gas'), 70).setVisible(false); c.add(c.gasIcon);
    c.badge = this.add.container(-44, -78).setVisible(false); c.add(c.badge); // countdown before the gas runs out
    c.setSize(w, h + 8).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { face.y = 6; sfx.play('click'); });
    c.on('pointerout', () => { face.y = 0; });
    c.on('pointerup', () => { face.y = 0; this.onStation(s); });
    c.station = s;
    return c;
  }

  // ---------------------------------------------------------------- start
  onStart() {
    if (this.tut) { this.tutIdx = -1; this.tutLog = []; this.nextStep(); return; }
    this.cfg = FORMS[this.form];
    this.st = newState(this.cfg);
    this.trace('round_setup', { form: this.form, attemptNo: this.attemptNo, runNo: this.runNo });
    this.say('liam', 'happy', 'Evening rush! Tap an order, then its station.');
    this.announceArrivals(1);
    this.afterAction();
  }

  nextStep() {
    this.tutIdx++;
    if (this.tutIdx >= TUTORIAL.length) {
      if (!tutorialMemo.done) Object.assign(tutorialMemo, { done: true, failSafes: this.tutLog.filter((x) => x.failSafe).length, steps: this.tutLog.map((x) => ({ tries: x.tries, failSafe: x.failSafe })) }); // only the first completed tutorial counts (Framework v0.5)
      return this.finish(this.metrics());
    }
    this.step = TUTORIAL[this.tutIdx]; this.tries = 0; this.failSafe = false;
    this.startScenario();
  }

  startScenario() {
    this.cfg = this.step.cfg; this.st = newState(this.cfg); this.sel = null; this.pinned = []; this.scroll = 0;
    const [who, text] = this.step.say; this.say(who, 'happy', text);
    if (this.failSafe) this.time.delayedCall(ms(400), () => this.hint());
    this.afterAction();
  }

  // ---------------------------------------------------------------- input
  selectTarget(id) {
    if (this.busy || this.ended) return;
    this.sel = this.sel === id ? null : id; sfx.play('click');
    this.armIdle(); this.render();
  }

  onStation(s) {
    if (this.busy || this.ended || !this.running) return;
    if (blocked(this.st, s)) { this.say('liam', 'worried', 'No gas for the griddle yet!'); return; }
    if (!this.sel) { this.say('liam', 'happy', 'Pick an order first, then its station.'); this.pulse(this.queue); return; } // no minute used
    if (this.sel === 'tapau' && this.tapauCooked()) { this.say('liam', 'happy', 'The tapau is ready. Amira will collect it.'); return; }
    const target = this.sel, need = nextStation(this.st, target), btn = this.stations.find((b) => b.station === s);
    const cardY = this.cardY(target);
    this.doAct(target, s);
    if (s !== need) { // wrong station: the minute is used; the right station is NOT revealed (errors under load are measured)
      sfx.play('bad'); this.shake(120, 0.004);
      this.floatText(btn.x, btn.y - 110, '−1 min', C.red);
      if (cardY != null) this.shakeCard(cardY);
      this.say('liam', 'worried', this.tut ? `Oops, that’s the ${STATION_LABEL[s].toLowerCase()}!` : pickLine('wrong', this.acts.length));
      if (this.tut) this.tutWrong();
    } else this.floatText(btn.x, btn.y - 110, '1 min', C.ink);
  }

  onWait() {
    if (this.busy || this.ended || !this.running) return;
    sfx.play('tick'); this.waits++;
    this.floatText(560, L.rowY - 70, '1 min', C.ink);
    this.doAct(null, null);
  }

  tapauCooked() { const P = this.cfg.parked; return !!P && this.st.tapau.steps >= MENU[P.item][2].length; }

  pinOrder(id) {
    if (this.busy || this.ended) return;
    this.pinned = this.pinned.includes(id) ? this.pinned.filter((x) => x !== id) : [id, ...this.pinned];
    this.pins++; this.trace('o1_plan', { action: 'pin', id }); sfx.play('click'); this.armIdle(); this.render();
  }

  /** Every action = one minute on the clock. */
  doAct(target, station) {
    const st = this.st, before = new Set(active(st).map((o) => o.id)), doneBefore = st.done.length, t = st.tick, handedBefore = st.tapau.handed;
    const o = target && target !== 'tapau' ? st.orders.get(target) : null;
    const item = o ? o.item : target === 'tapau' ? this.cfg.parked.item : null, stepIndex = o ? o.step : target === 'tapau' ? st.tapau.steps : null;
    if (o && !(o.item in this.firstDish)) this.firstDish[o.item] = o.id; // first cook of each dish (learning probe)
    const e = act(st, target, station);
    this.acts.push(e);
    const wrong = !!target && !e[3] && station !== null;
    if (wrong) { this.wrongKeys.push({ i: this.acts.length - 1, key: `${item}#${stepIndex}` }); if (o) this.wrongByOrder[o.id] = (this.wrongByOrder[o.id] || 0) + 1; }
    this.trace('o1_action', { tick: e[0], clock: clock(e[0]), target: e[1], station: e[2], ok: e[3], load: e[4], active: [...before], item, stepIndex, wrong });
    if (target) (this.stepLog ||= []).push({ i: this.acts.length - 1, key: `${item}#${stepIndex}` });
    // served / expired
    st.done.slice(doneBefore).forEach((id) => {
      const d = st.orders.get(id);
      this.trace('o1_order_end', { id, item: d.item, stars: d.stars, status: 'done', startedTick: d.arrived, endTick: t });
      sfx.play('coin'); this.flyStars(d.stars);
      this.say(d.cust, 'excited', pickLine('served', id));
      if (this.sel === id) this.sel = null;
    });
    [...before].filter((id) => st.orders.get(id).status === 'expired').forEach((id) => {
      const x = st.orders.get(id);
      this.trace('o1_order_end', { id, item: x.item, stars: x.stars, status: 'expired', startedTick: x.arrived, endTick: st.tick });
      this.floatText(360, L.qTop + 40, `−${'★'.repeat(x.stars)} missed`, C.red);
      this.say(x.cust, 'worried', pickLine('leaves', id));
      (this.missed ||= []).push(`${MENU[x.item][0]} (${'★'.repeat(x.stars)})`);
      if (this.sel === id) this.sel = null;
    });
    if (!handedBefore && st.tapau.handed) { // Amira collected her tapau (automatically)
      this.trace('o1_tapau', { cookedSteps: st.tapau.steps, readyTick: this.readyTick ?? st.tapau.handed, collectedTick: st.tapau.handed, clock: clock(st.tapau.handed) });
      sfx.play('coin'); this.flyStars(MENU[this.cfg.parked.item][1]);
      this.say(this.cfg.parked.customer, 'excited', this.tut ? 'Tapau collected! Thanks!' : LINES.tapauCollected);
      if (this.sel === 'tapau') this.sel = null;
    }
    if (target === 'tapau' && this.tapauCooked() && this.readyTick == null) this.readyTick = st.tick - 1;
    // resilience hook: actions from the gas running out until the next useful step
    const S = this.cfg.setback;
    if (S && t >= S.tick && this.recover == null) { this.sinceSetback = (this.sinceSetback || 0) + 1; if (e[3]) { this.recover = this.sinceSetback; this.trace('o1_setback_next', { actionsBeforeRecover: this.recover }); } }
    if (!this.tut) { this.announceArrivals(st.tick); this.probeCheck(); }
    this.armIdle();
    this.afterAction();
  }

  /** New customers say their order (seeded Manglish flavour lines; all information is also on the card). */
  announceArrivals(tick) {
    const fresh = this.cfg.stream.filter(([t]) => t === tick);
    if (fresh.length && !this.bubbleBusy) { const [, id, item, , cust] = fresh[fresh.length - 1]; this.say(cust, 'happy', pickLine(`order:${item}`, id)); }
  }

  /** Learning probes (request #20): newly taught rules applied correctly the first time they matter. */
  probeCheck() {
    const st = this.st, t = st.tick, P = this.cfg.parked, S = this.cfg.setback;
    const probe = (name, pass) => { if (this.probes.some((p) => p.probe === name)) return; this.probes.push({ probe: name, pass }); this.trace('learn_probe', { probe: name, pass, tick: t }); };
    const o5 = st.orders.get('o5'); if (o5 && o5.status !== 'open') probe('firstUse:valueFirst', o5.status === 'done');
    if (P && t === P.arrive) probe('firstUse:tapauReady', st.tapau.handed === P.arrive);
    if (S && t === S.tick + S.ticks + 3) probe('firstUse:gasPlanned', !(this.gasLost || 0));
    for (const [item, id] of Object.entries(this.firstDish)) { const o = st.orders.get(id); if (o.status !== 'open') probe(`firstUse:steps:${item}`, !this.wrongByOrder[id]); }
  }

  /** Arrivals, announcements, the setback and the end of the shift, after every minute. */
  afterAction() {
    const st = this.st, t = st.tick, P = this.cfg.parked, S = this.cfg.setback;
    if (P && !this.tut && t === P.announce && !this.announced) { this.announced = true; this.say(P.customer, 'happy', LINES.tapau); }
    if (P && t === P.arrive && !st.tapau.handed && !this.waitSaid) { this.waitSaid = true; this.say(P.customer, 'worried', this.tut ? 'I’m back! Is my tapau ready?' : LINES.tapauWaiting); }
    if (S && t === S.noticeFrom && !this.noticeSaid) { this.noticeSaid = true; this.say('liam', 'worried', LINES.gasNotice); sfx.play('clunk'); }
    if (S && t === S.tick && !this.gasSaid) { this.gasSaid = true; this.shake(300, 0.008); sfx.play('clunk'); }
    if (S && t >= S.tick && t < S.tick + S.ticks + 3) { // orders stuck on a griddle step that expire around the outage
      this.gasLost = (this.gasLost || 0) + st.expired.filter((id) => !(this.gasSeen ||= new Set()).has(id) && (this.gasSeen.add(id), MENU[st.orders.get(id).item][2][st.orders.get(id).step] === 'griddle')).length;
    }
    if (P && !st.tapau.handed && t === P.arrive + P.waits + 1 && !this.leftSaid) { this.leftSaid = true; this.floatText(210, L.rowY - 60, `−${'★'.repeat(MENU[P.item][1])} missed`, C.red); (this.missed ||= []).push('Amira’s tapau'); }
    this.render();
    if (this.tut) return this.checkStep();
    if (shiftOver(st)) this.endShift();
  }

  // ---------------------------------------------------------------- practice steps
  checkStep() {
    const s = this.step, st = this.st;
    if (s.goal(st)) {
      this.tutLog.push({ step: s.step, tries: this.tries + 1, failSafe: this.failSafe });
      this.trace('o1_tutorial', { step: s.step, tries: this.tries + 1, usedFailSafe: this.failSafe });
      this.busy = true; sfx.play('good'); this.burst(360, 600);
      this.say('liam', 'excited', s.step < 3 ? 'Nice! Next one.' : 'Perfect. You’re ready for the rush!');
      this.time.delayedCall(ms(1300), () => { this.busy = false; this.nextStep(); });
      return;
    }
    if ((s.lost && s.lost(st)) || shiftOver(st)) this.tutRetry(s.lostText || 'Out of time. Let’s try that again.');
  }

  tutWrong() { // step 1 counts each wrong station as a try
    if (this.step.step !== 1) return;
    this.tries++;
    if (this.tries >= 2 && !this.failSafe) { this.failSafe = true; this.hint(); }
  }

  tutRetry(text) {
    this.tries++; this.busy = true;
    if (this.tries >= 2) this.failSafe = true;
    this.say('liam', 'worried', `${text} Let’s try again.`);
    this.time.delayedCall(ms(1800), () => { this.busy = false; this.startScenario(); });
  }

  /** Fail-safe: show the right move (select the right order and pulse its station). */
  hint() {
    const s = this.step, st = this.st;
    const target = s.hintTarget || active(st)[0]?.id;
    if (!target) return;
    if (target === 'tapau') { this.sel = 'tapau'; this.render(); this.pulse(this.laterCard); this.say('liam', 'happy', 'Tip: tap Amira’s ticket, then the urn. Cook it before 7:05.'); return; }
    if (!st.orders.has(target)) return;
    this.sel = target; this.render();
    const need = nextStation(st, target);
    this.pulse(this.stations.find((b) => b.station === need));
    this.say('liam', 'happy', `Tip: ${MENU[st.orders.get(target).item][0]} first, then the ${STATION_LABEL[need].toLowerCase()}.`);
  }

  // ---------------------------------------------------------------- rendering
  starsNow() {
    const st = this.st, P = this.cfg.parked;
    return st.done.reduce((a, id) => a + st.orders.get(id).stars, 0) + (st.tapau.handed && P ? MENU[P.item][1] : 0);
  }

  render() {
    const st = this.st, t = st.tick;
    this.clockPill.text.setText(`${clock(Math.min(t, this.cfg.ticks + 1))} pm · ends ${clock(this.cfg.ticks + 1)}`);
    this.starPill.text.setText(`★ ${this.starsNow()}`); // no "out of 27" (alpha #36: a better shift can beat it; the true max will come from Game Ideas)
    this.renderStrip();
    this.renderQueue();
    this.renderRow();
    const S = this.cfg.setback;
    for (const b of this.stations) {
      const off = blocked(st, b.station);
      b.paint(off ? C.charcoal : C.white); b.gasIcon.setVisible(off); b.setAlpha(off ? 0.6 : 1);
      // countdown badge on the Griddle once the outage is announced
      const soon = S && b.station === S.station && t >= S.noticeFrom && t < S.tick;
      b.badge.removeAll(true).setVisible(!!soon);
      if (soon) b.badge.add([this.add.graphics().fillStyle(hex(C.amber), 1).fillRoundedRect(-44, -20, 88, 40, 20).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(-44, -20, 88, 40, 20), this.txt(0, 1, `⚠ ${S.tick - t}`, { fontSize: '24px' })]);
    }
  }

  renderStrip() {
    const c = this.strip; c.removeAll(true);
    const S = this.cfg.setback, t = this.st.tick;
    const notice = S && !this.tut && t >= S.noticeFrom && t < S.tick + S.ticks;
    c.add(this.add.graphics().fillStyle(hex(this.tut ? C.sun : notice ? C.peach : C.butter), 1).fillRoundedRect(30, 0, 660, 52, 26).lineStyle(notice ? 5 : 3, hex(notice ? C.red : C.ink), 1).strokeRoundedRect(30, 0, 660, 52, 26));
    const label = this.tut ? `Practice ${this.step.step} of 3 · ${this.step.headline}` : notice ? `⚠ Gas runs out ${clock(S.tick)}–${clock(S.tick + S.ticks - 1)} · griddle off` : HELP;
    const tx = this.txt(360, 27, label, { fontSize: this.tut || notice ? '28px' : '24px' }); if (tx.width > 620) tx.setScale(620 / tx.width);
    c.add(tx);
  }

  ordered() {
    const list = active(this.st);
    return [...this.pinned.map((id) => list.find((o) => o.id === id)).filter(Boolean), ...list.filter((o) => !this.pinned.includes(o.id))];
  }

  cardY(id) { const i = this.shown ? this.shown.indexOf(id) : -1; return i < 0 ? null : L.qTop + i * (L.cardH + L.cardGap); }

  renderQueue() {
    const c = this.queue; c.removeAll(true);
    const list = this.ordered(), n = list.length;
    this.scroll = Math.max(0, Math.min(this.scroll, n - L.maxCards));
    const shown = list.slice(this.scroll, this.scroll + L.maxCards);
    this.shown = shown.map((o) => o.id);
    if (!n) c.add(this.txt(360, L.qTop + 120, this.st.tick > this.cfg.ticks ? '' : 'No orders right now. Tap “Wait 1 min”.', { fontSize: '28px', fontStyle: '700', color: C.charcoal }));
    shown.forEach((o, i) => c.add(this.card(o, L.qTop + i * (L.cardH + L.cardGap))));
    if (n > L.maxCards) {
      const up = this.scroll > 0, down = this.scroll + L.maxCards < n;
      const y = L.qTop + L.maxCards * (L.cardH + L.cardGap) - 2;
      c.add(this.txt(360, y + 4, `${n} orders waiting`, { fontSize: '22px', fontStyle: '700', color: C.charcoal }));
      if (up) c.add(this.roundIcon(560, y, '▲', () => { this.scroll--; this.render(); }));
      if (down) c.add(this.roundIcon(650, y, '▼', () => { this.scroll++; this.render(); }));
    }
  }

  /** An order card (also used for the Later ticket). Selected = glow + lift; others dim a little. */
  card(o, y, { later = false } = {}) {
    const id = later ? 'tapau' : o.id, sel = this.sel === id, st = this.st;
    const c = this.add.container(0, sel ? y - 4 : y), w = later ? 360 : 660, h = L.cardH, x0 = 30;
    const left = later ? null : o.due - st.tick + 1, urgent = left != null && left <= 2;
    if (sel) c.add(this.add.graphics().fillStyle(hex(C.sun), 0.45).fillRoundedRect(x0 - 10, -10, w + 20, h + 26, 30)); // glow
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(x0, 6, w, h, 22).fillStyle(hex(sel ? C.sun : C.white), 1).fillRoundedRect(x0, 0, w, h, 22).lineStyle(sel ? 7 : 4, hex(C.ink), 1).strokeRoundedRect(x0, 0, w, h, 22));
    const cust = later ? this.cfg.parked.customer : o.cust, item = later ? this.cfg.parked.item : o.item, step = later ? st.tapau.steps : o.step;
    c.add(this.add.graphics().fillStyle(hex(C.butter), 1).fillCircle(x0 + 52, h / 2, 40).lineStyle(3, hex(C.ink), 1).strokeCircle(x0 + 52, h / 2, 40));
    c.add(this.fitImg(this.add.image(x0 + 52, h / 2 + 2, `${cust}-happy`), 76));
    if (later) {
      c.add(this.fitImg(this.add.image(x0 + 136, h / 2, 'mk-tapau'), 80));
      c.add(this.txt(x0 + 180, 30, `${NAMES[cust]} · back ${clock(this.cfg.parked.arrive)}`, { fontSize: '24px', align: 'left' }).setOrigin(0, 0.5));
    } else {
      c.add(this.fitImg(this.add.image(x0 + 148, h / 2, `mk-${o.item}`), 92));
      const nt = this.txt(x0 + 204, 30, MENU[o.item][0], { fontSize: '28px', align: 'left' }).setOrigin(0, 0.5);
      c.add([nt, this.txt(nt.x + nt.width + 12, 29, '★'.repeat(o.stars), { fontSize: '26px', color: C.amber, stroke: C.ink, strokeThickness: 3, align: 'left' }).setOrigin(0, 0.5)]);
    }
    const dx0 = later ? x0 + 196 : x0 + 226, gap = later ? 54 : 70, r = later ? 22 : 26;
    MENU[item][2].forEach((s, k) => {
      const x = dx0 + k * gap, yy = 80, done = k < step, next = k === step;
      c.add(this.add.graphics().fillStyle(hex(done ? C.mint : next ? C.butter : C.white), 1).fillCircle(x, yy, r).lineStyle(next ? 6 : 2, hex(next ? C.amber : C.ink), 1).strokeCircle(x, yy, r));
      c.add(this.fitImg(this.add.image(x, yy, `mk-${s}`), r * 1.4).setAlpha(done ? 0.45 : 1));
      if (done) c.add(this.txt(x + r * 0.55, yy - r * 0.55, '✓', { fontSize: '22px', color: C.green }));
    });
    if (!later) {
      const cw = 128, cx = x0 + w - cw - 66;
      const chip = this.add.container(cx + cw / 2, 79);
      chip.add([this.add.graphics().fillStyle(hex(urgent ? C.amber : C.mint), 1).fillRoundedRect(-cw / 2, -22, cw, 44, 22).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(-cw / 2, -22, cw, 44, 22),
        this.txt(0, 0, `⏳ ${left} min${urgent ? ' !' : ''}`, { fontSize: '22px' })]);
      c.add(chip);
      if (urgent) this.tweens.add({ targets: chip, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: 2, duration: 280 }); // gentle pulse (never colour alone)
      const pinned = this.pinned.includes(o.id);
      const pb = this.add.container(x0 + w - 36, 34);
      pb.add([this.add.graphics().fillStyle(hex(pinned ? C.sun : C.white), 1).fillCircle(0, 0, 24).lineStyle(3, hex(C.ink), 1).strokeCircle(0, 0, 24), this.txt(0, 1, pinned ? '★' : '☆', { fontSize: '26px' })]);
      pb.setSize(64, 64).setInteractive({ useHandCursor: true }).on('pointerup', () => this.pinOrder(o.id));
      c.add(pb);
    } else if (st.tick >= this.cfg.parked.arrive && !st.tapau.handed) { // she's here and waiting
      const leftW = this.cfg.parked.arrive + this.cfg.parked.waits - st.tick + 1;
      c.add([this.add.graphics().fillStyle(hex(C.amber), 1).fillRoundedRect(x0 + w - 110, 60, 96, 40, 20).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(x0 + w - 110, 60, 96, 40, 20),
        this.txt(x0 + w - 62, 80, `⏳ ${leftW} !`, { fontSize: '22px' })]);
    }
    const hit = this.add.rectangle(x0 + (w - (later ? 0 : 70)) / 2, h / 2, w - (later ? 0 : 70), h, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.selectTarget(id));
    c.addAt(hit, 0);
    if (this.sel && !sel) c.setAlpha(0.8);
    return c;
  }

  renderRow() {
    const c = this.row; c.removeAll(true);
    const st = this.st, P = this.cfg.parked, y = L.rowY;
    c.add(this.btn(565, y, '⏱ Wait 1 min', () => this.onWait(), { w: 250, h: 92, size: 28, fill: C.white }));
    this.laterCard = null;
    if (P && st.tick >= P.announce) { // the Later tray: the tapau ticket, cooked like any order, collected by the customer
      c.add(this.txt(46, y - L.cardH / 2 - 18, 'LATER', { fontSize: '20px', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5));
      const handed = !!st.tapau.handed, gone = !handed && st.tick > P.arrive + P.waits;
      if (handed || gone) c.add(this.txt(210, y, handed ? '✓ Tapau collected' : 'Amira has gone', { fontSize: '26px', color: handed ? C.green : C.charcoal }));
      else { this.laterCard = this.card(null, y - L.cardH / 2, { later: true }); c.add(this.laterCard); }
    }
  }

  shakeCard(y) { const g = this.add.graphics().setDepth(35).lineStyle(6, hex(C.red), 1).strokeRoundedRect(28, y - 2, 664, L.cardH + 4, 22); this.tweens.add({ targets: g, x: { from: -10, to: 10 }, yoyo: true, repeat: 2, duration: 60, onComplete: () => g.destroy() }); }

  flyStars(n) {
    const t = this.txt(360, L.qTop + 40, `+${'★'.repeat(n)}`, { fontSize: '44px', color: C.amber, stroke: C.ink, strokeThickness: 6 }).setDepth(90);
    this.tweens.add({ targets: t, x: this.starPill.x, y: this.starPill.y, scale: 0.6, duration: ms(700), ease: 'Cubic.easeIn', onComplete: () => { t.destroy(); this.pop(this.starPill); } });
  }

  /** Speech bubble next to Liam (or a customer, whose bust replaces Liam's for the moment). Flavour only. */
  say(who, pose, text) {
    this.lastSay = text; // test hook
    const b = this.bubble; b.removeAll(true);
    const tex = `${who}-${this.textures.exists(`${who}-${pose}`) ? pose : 'happy'}`;
    this.liam.setTexture(tex); this.fitImg(this.liam, 140);
    const t = this.txt(190, L.liamY, text, { fontSize: '26px', fontStyle: '700', align: 'left', wordWrap: { width: 300 } }).setOrigin(0, 0.5);
    const h = Math.max(88, t.height + 28);
    b.add([this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(172, L.liamY - h / 2, 340, h, 26).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(172, L.liamY - h / 2, 340, h, 26)
      .fillStyle(hex(C.white), 1).fillTriangle(174, L.liamY - 12, 152, L.liamY + 4, 174, L.liamY + 14), t]);
    this.tweens.killTweensOf(b); b.setAlpha(1).setScale(1);
  }

  pulse(obj) { if (obj) this.tweens.add({ targets: obj, scale: { from: 1, to: 1.06 }, yoyo: true, repeat: 3, duration: 220, onComplete: () => obj.setScale(1) }); }

  // ---------------------------------------------------------------- idle (hint only)
  armIdle() {
    const now = performance.now();
    if (this.lastInputAt) this.idleMs += Math.max(0, now - this.lastInputAt - IDLE_MS);
    this.lastInputAt = now;
    this.idleTimer?.remove();
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => { if (this.ended) return; this.idleNudges++; this.trace('idle', { n: this.idleNudges }); this.say('liam', 'happy', 'Take your time. Pick an order when you’re ready.'); });
  }

  /** Test hook: one move of the reference's careful plan, made through the same buttons a player taps. */
  botStep() {
    if (this.ended || !this.running) return false;
    if (this.closingDone) { this.closingDone(); return true; }
    if (this.clBriefGo) { this.clBriefGo(); return true; }
    if (this.cl && !this.cl.over) { const id = CL.balancerMove(this.cl); if (id) this.closingMove(id); return true; } // a purpose-setter close
    if (this.busy || !this.st) return false;
    const [tg, sta] = careful(this.st);
    if (tg === null) this.onWait();
    else { this.sel = tg; this.onStation(sta); }
    return true;
  }

  // ---------------------------------------------------------------- end
  endShift() {
    if (this.ending) return; this.ending = true; this.busy = true; this.idleTimer?.remove();
    const m = this.metrics();
    this.trace('o1_end', { starsServed: m.starsServed, orgScore: m.orgScore });
    const W = this.W, c = this.add.container(0, 0).setDepth(1100);
    c.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.5).setInteractive());
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(60, 330, 600, 600, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(60, 320, 600, 600, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(60, 320, 600, 600, 36));
    c.add(this.fitImg(this.add.image(W / 2, 420, 'liam-excited'), 140));
    c.add(this.txt(W / 2, 530, `${clock(this.cfg.ticks + 1)} pm · ${LINES.end}`, { fontSize: '36px' }));
    c.add(this.txt(W / 2, 600, `You served ${m.starsServed} ★`, { fontSize: '34px', fontStyle: '700' }));
    const miss = this.missed || [];
    c.add(this.txt(W / 2, 700, miss.length ? `Missed: ${miss.slice(0, 6).join(', ')}${miss.length > 6 ? '…' : ''}` : 'No customer left without their order!', { fontSize: '24px', fontStyle: '600', color: C.charcoal, wordWrap: { width: 520 } }));
    const done = () => { this.shiftDone = null; c.destroy(true); this.startClosing(); }; // then the autonomy finale (#32)
    c.add(this.btn(W / 2, 840, 'Done', done, { w: 300, h: 96, size: 36 }));
    this.shiftDone = done; // test hook
  }

  // ---------------------------------------------------------------- "Closing Time": the autonomy finale (request #32)
  // After the scored shift, so the organisation score is untouched. No points counter, four equal gauges, a free Tip.
  startClosing() {
    this.mainDone = true; this.snapshot(); // the scored shift is complete even if the page closes during the finale
    this.cl = CL.newClosing(); this.clTips = 0; this.clTipNow = null; this.clTipBefore = false; this.clTimes = []; this.clIdleMs = 0;
    this.queue.removeAll(true); this.row.removeAll(true);
    for (const o of [this.starPill, this.bubble, this.strip]) o.setVisible(false);
    for (const b of this.stations) { b.setVisible(false); b.disableInteractive(); }
    this.liam.setVisible(false); this.clockPill.text.setText('Closing · 12 min left');
    this.clC = this.add.container(0, 0).setDepth(40);
    const W = this.W, c = this.add.container(0, 0).setDepth(1100); this.clBriefOpen = true;
    c.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.5).setInteractive());
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(60, 300, 600, 640, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(60, 290, 600, 640, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(60, 290, 600, 640, 36));
    c.add(this.fitImg(this.add.image(W / 2, 400, 'liam-excited'), 150));
    c.add(this.txt(W / 2, 520, 'Closing time', { fontSize: '40px' }));
    c.add(this.txt(W / 2, 620, '“Boss has gone home. The last 12 minutes are yours. Make it a good close.”', { fontSize: '30px', fontStyle: '700', wordWrap: { width: 520 } }));
    c.add(this.txt(W / 2, 740, 'Tap an order to cook its next step (1 min).\nTips are free: use them whenever you like.', { fontSize: '24px', fontStyle: '600', color: C.charcoal, wordWrap: { width: 520 } }));
    const go = () => { this.clBriefGo = null; this.clBriefOpen = false; c.destroy(true); this.clT0 = performance.now(); this.clLast = this.clT0; this.trace('au_brief_start', { game: 'mamak-rush', t: 0 }); this.renderClosing(); this.clArmIdle(); };
    c.add(this.btn(W / 2, 860, 'Start', go, { w: 280, h: 92, size: 34 }));
    this.clBriefGo = go; // test hook
  }

  clArmIdle() {
    const now = performance.now(); if (this.clLastIn) this.clIdleMs += Math.max(0, now - this.clLastIn - IDLE_MS); this.clLastIn = now;
    this.clIdle?.remove(); this.clIdle = this.time.delayedCall(IDLE_MS, () => { if (!this.cl || this.cl.over) return; this.clNote('Take your time. It’s your call.'); });
  }

  clNote(text, color = C.ink) { this.clNoteText = text; this.clNoteColor = color; this.renderClosing(); }

  closingMove(id) {
    const st = this.cl; if (!st || st.over || this.clBriefOpen || this.clBusy) return;
    if (!CL.openOrders(st).some((o) => o[0] === id)) return;
    const now = performance.now(); this.clTimes.push(Math.round(now - this.clLast)); this.clLast = now;
    const doneBefore = { ...st.done }, leftBefore = { ...st.left }, t = st.t;
    CL.step(st, id, this.clTipBefore);
    const e = st.log[st.log.length - 1];
    this.trace('au_action', { game: 'mamak-rush', t, choice: id, options: Object.keys(e.options || {}), tipBefore: this.clTipBefore, gauges: CL.measures(st) });
    this.clTipBefore = false; this.clTipNow = null; sfx.play('click');
    const o = CL.orderOf(id);
    if (st.done[id] && !doneBefore[id]) { sfx.play('coin'); this.clNote(`${MENU[o[6]][0]} served! +${'★'.repeat(o[3])}`, C.green); } else this.clNote('1 min', C.ink);
    this.clAfter(leftBefore); this.clArmIdle();
  }

  clAfter(leftBefore) {
    const st = this.cl;
    while (!st.over && !CL.openOrders(st).length) CL.step(st, null); // a quiet minute passes by itself
    const gone = CL.ORDERS.filter((o) => st.left[o[0]] && !leftBefore[o[0]]);
    if (gone.length) this.clNote(`${gone.map((o) => NAMES[o[7]]).join(' and ')} left without their order`, C.red);
    this.renderClosing();
    if (st.over) this.endClosing();
  }

  closingTip() {
    const st = this.cl; if (!st || st.over || this.clBriefOpen) return;
    const tp = CL.tip(st, this.clTips); if (!tp) return;
    this.clTips++; this.clTipBefore = true; this.clTipNow = tp.id; sfx.play('pop');
    this.trace('au_tip', { game: 'mamak-rush', t: st.t, suggestion: tp.id, aim: tp.aim });
    const o = CL.orderOf(tp.id); this.clNote(`Tip: ${NAMES[o[7]]}’s ${MENU[o[6]][0]} helps “${CL.AIM_LABEL[tp.aim]}”.`, C.blue); this.clArmIdle();
  }

  renderClosing() {
    const c = this.clC; if (!c || !this.cl) return; c.removeAll(true);
    const st = this.cl, m = CL.measures(st);
    this.clockPill.text.setText(st.over ? 'Closed!' : `Closing · ${CL.TICKS - st.t + 1} min left`); this.clockPill.text.setScale(Math.min(1, 300 / this.clockPill.text.width));
    // four equal gauges, no total and no "score"
    CL.AIMS.forEach((a, i) => {
      const x = 30 + (i % 2) * 336, y = 118 + Math.floor(i / 2) * 84, w = 324;
      c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(x, y, w, 72, 18).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(x, y, w, 72, 18)
        .fillStyle(hex(C.butter), 1).fillRoundedRect(x + 14, y + 44, w - 28, 16, 8).fillStyle(hex(C.teal), 1).fillRoundedRect(x + 14, y + 44, Math.max(0, (w - 28) * m[a]), 16, 8).lineStyle(2, hex(C.ink), 1).strokeRoundedRect(x + 14, y + 44, w - 28, 16, 8));
      c.add(this.txt(x + w / 2, y + 22, CL.AIM_LABEL[a], { fontSize: '23px' }));
    });
    const note = this.clNoteText || 'Your call. Tap an order to cook its next step.';
    const nt = this.txt(360, 308, note, { fontSize: '25px', fontStyle: '700', color: this.clNoteColor || C.ink, wordWrap: { width: 640 } }); c.add(nt);
    CL.openOrders(st).forEach((o, i) => c.add(this.closingCard(o, 350 + i * 116)));
    if (!st.over) c.add(this.btn(360, 1170, '💡 Tip (free)', () => this.closingTip(), { w: 300, h: 84, size: 28, fill: C.white }));
  }

  closingCard(o, y) {
    const st = this.cl, id = o[0], x0 = 30, w = 660, h = 104, tipped = this.clTipNow === id;
    const c = this.add.container(0, y), left = CL.minutesLeft(o, st.t), urgent = left <= 2, prog = st.prog[id] || 0;
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(x0, 6, w, h, 22).fillStyle(hex(tipped ? C.sun : C.white), 1).fillRoundedRect(x0, 0, w, h, 22).lineStyle(tipped ? 7 : 4, hex(C.ink), 1).strokeRoundedRect(x0, 0, w, h, 22));
    c.add(this.add.graphics().fillStyle(hex(C.butter), 1).fillCircle(x0 + 50, h / 2, 38).lineStyle(3, hex(C.ink), 1).strokeCircle(x0 + 50, h / 2, 38));
    c.add(this.fitImg(this.add.image(x0 + 50, h / 2 + 2, `${o[7]}-happy`), 72));
    c.add(this.fitImg(this.add.image(x0 + 140, h / 2, `mk-${o[6]}`), 84));
    const nt = this.txt(x0 + 196, 30, MENU[o[6]][0], { fontSize: '27px', align: 'left' }).setOrigin(0, 0.5); c.add(nt);
    c.add(this.txt(nt.x + nt.width + 10, 29, '★'.repeat(o[3]), { fontSize: '25px', color: C.amber, stroke: C.ink, strokeThickness: 3, align: 'left' }).setOrigin(0, 0.5));
    if (o[5]) c.add([this.add.graphics().fillStyle(hex(C.peach), 1).fillRoundedRect(x0 + 196, 58, 118, 36, 18).lineStyle(2, hex(C.ink), 1).strokeRoundedRect(x0 + 196, 58, 118, 36, 18), this.txt(x0 + 255, 76, '♥ Regular', { fontSize: '20px' })]);
    for (let k = 0; k < o[2]; k++) { const x = x0 + (o[5] ? 346 : 214) + k * 40; c.add(this.add.graphics().fillStyle(hex(k < prog ? C.mint : C.white), 1).fillCircle(x, 76, 14).lineStyle(3, hex(C.ink), 1).strokeCircle(x, 76, 14)); }
    const cw = 128, cx = x0 + w - cw - 16;
    c.add([this.add.graphics().fillStyle(hex(urgent ? C.amber : C.mint), 1).fillRoundedRect(cx, 30, cw, 44, 22).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(cx, 30, cw, 44, 22), this.txt(cx + cw / 2, 52, `⏳ ${left} min${urgent ? ' !' : ''}`, { fontSize: '22px' })]);
    const hit = this.add.rectangle(x0 + w / 2, h / 2, w, h, 0, 0).setInteractive({ useHandCursor: true }); hit.on('pointerup', () => this.closingMove(id)); c.addAt(hit, 0);
    return c;
  }

  endClosing() {
    if (this.clEnding) return; this.clEnding = true; this.clIdle?.remove();
    const m = CL.measures(this.cl);
    this.trace('au_end', { game: 'mamak-rush', gauges: m, stoppedEarly: false, firstActionLatency: this.clTimes[0] ?? null });
    const W = this.W, c = this.add.container(0, 0).setDepth(1100);
    c.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.45).setInteractive());
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(80, 430, 560, 420, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(80, 420, 560, 420, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(80, 420, 560, 420, 36));
    c.add(this.fitImg(this.add.image(W / 2, 510, 'liam-happy'), 130));
    c.add(this.txt(W / 2, 630, 'Shutters down. Thanks for closing up!', { fontSize: '30px', wordWrap: { width: 480 } }));
    const fin = () => { this.closingDone = null; c.destroy(true); this.finish(this.metrics()); };
    c.add(this.btn(W / 2, 760, 'Done', fin, { w: 280, h: 92, size: 34 }));
    this.closingDone = fin; // test hook
  }

  closingMetrics() {
    if (!this.cl) return null;
    const gaps = this.clTimes.slice(1).sort((a, b) => a - b), med = gaps.length ? gaps[gaps.length >> 1] : null;
    return { game: 'closing-time', v: 1, log: CL.encodeLog(this.cl), done: this.cl.over, tips: this.clTips, firstActionMs: this.clTimes[0] ?? null, medianActionMs: med, idleMs: Math.round(this.clIdleMs), gauges: Object.fromEntries(Object.entries(CL.measures(this.cl)).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) };
  }

  learnParts() {
    const acts = this.stepLog || [];
    let could = 0, repeats = 0;
    for (const w of this.wrongKeys) { // the same wrong station for the same dish step again, when that step came up again
      const later = acts.filter((a) => a.i > w.i && a.key === w.key);
      if (!later.length) continue;
      could++; if (this.wrongKeys.some((x) => x.i > w.i && x.key === w.key)) repeats++;
    }
    const st = this.st;
    const pairs = TRAPS.map(([a, b]) => [st.orders.get(a), st.orders.get(b)]).filter(([a, b]) => a && b && a.status !== 'done');
    const steps = tutorialMemo.done ? tutorialMemo.steps || [] : [];
    // probes still open at the end (a first-cooked dish that never finished counts by its steps so far)
    const probes = [...this.probes];
    for (const [item, id] of Object.entries(this.firstDish)) if (!probes.some((p) => p.probe === `firstUse:steps:${item}`)) probes.push({ probe: `firstUse:steps:${item}`, pass: !this.wrongByOrder[id] });
    return {
      firstUse: [probes.filter((p) => p.pass).length, probes.length],
      noRepeat: [repeats, could],
      trapPairs: [pairs.filter(([, b]) => b.status === 'done').length, pairs.length],
      pickup: steps.length ? [steps.reduce((a, x) => a + (x.failSafe ? 2 : Math.min(2, x.tries - 1)), 0), steps.length * 2] : null,
      probes: probes.map((p) => `${p.probe.replace('firstUse:', '')}${p.pass ? '+' : '-'}`).join(' '),
    };
  }

  metrics() {
    if (this.tut) {
      const log = this.tutLog || [], failSafes = log.filter((x) => x.failSafe).length;
      return { starsServed: log.length, steps: log.length, failSafes, tries: log.map((x) => `${x.step}:${x.tries}${x.failSafe ? '!' : ''}`).join(' '), flags: failSafes >= 2 ? 'tutorialStruggle' : '' };
    }
    const st = this.st; if (!st) return {};
    const m = metrics(st), f = facets(m);
    const log = this.acts, S = this.cfg.setback;
    const okRate = (a, b) => { const xs = log.filter((e) => e[0] >= a && e[0] <= b); return xs.length ? xs.filter((e) => e[3]).length / xs.length : null; };
    const pre = S ? okRate(S.tick - 6, S.tick - 1) : null, post = S ? okRate(S.tick, S.tick + 5) : null;
    const wrong = st.errors.length;
    const flags = [];
    if (this.waits >= 20 || (log.length && wrong / log.length >= 0.5)) flags.push('disengaged');
    if (tutorialMemo.done && tutorialMemo.failSafes >= 2) flags.push('tutorialStruggle');
    if (this.repeatAttempt) flags.push('repeatAttempt');
    return {
      ...m, orgScore: orgScore(m), ...f,
      served: st.done.length, expired: st.expired.length, errors: wrong, waits: this.waits, planToolUse: this.pins,
      postSetbackDelta: pre != null && post != null ? Math.round((post - pre) * 1000) / 1000 : '', actionsBeforeRecover: this.recover ?? '',
      tapauCollected: st.tapau.handed ? clock(st.tapau.handed) : '', form: this.form, minutesPlayed: log.length,
      actionLog: log.map((e) => `${e[0]} ${e[1] ?? '-'} ${e[2] ?? '-'} ${e[3] ? 1 : 0} ${e[4]}`).join(';'),
      learn: this.learnParts(),
      tutorialDone: tutorialMemo.done, tutorialFailSafes: tutorialMemo.done ? tutorialMemo.failSafes : '',
      idleNudges: this.idleNudges, idleMs: Math.round(this.idleMs), flags: flags.join(','),
      ...(this.mainDone ? { mainDone: true } : {}), ...(this.cl ? { autonomy: this.closingMetrics() } : {}),
    };
  }

  // ---------------------------------------------------------------- how-to screenshots (standard #19b)
  /** Stages the real UI for how-to card n and draws callouts. Returns the design-space rect to capture. */
  stageHowTo(n) {
    this.clearCallouts(); this.busy = true; this.overlay.removeAll(true);
    this.cfg = FORMS.A; this.st = newState(this.cfg); this.sel = null; this.pinned = []; this.missed = [];
    const upTo = (tick) => { while (this.st.tick < tick) { const [tg, sta] = careful(this.st); act(this.st, tg, sta); } };
    const stn = (s) => this.stations.find((b) => b.station === s);
    const cardsAt = (y0, y1) => ({ x: 0, y: y0, w: 720, h: y1 - y0 });
    const stationsArea = { x: 0, y: L.stY - 110, w: 720, h: 210 };
    if (n === 0) { upTo(7); this.render(); this.say('liam', 'happy', 'More orders than time: choose well!');
      this.callout(300, 64, 56, 'the shift ends at 7:36', 300, 160); this.callout(612, L.liamY - 26, 60, '★ you served', 612, L.liamY + 70);
      return cardsAt(24, L.qTop + 2 * (L.cardH + L.cardGap)); }
    if (n === 1) { upTo(8); this.sel = null; this.pinned = ['o5']; this.render(); const y = L.qTop;
      this.callout(82, y + 56, 46, 'customer', 90, y - 44); this.callout(420, y + 30, 36, 'worth ★★★', 400, y - 44);
      this.callout(256, y + 80, 32, 'next step', 220, y + 170); this.callout(590, y + 79, 54, 'minutes left', 560, y + 170);
      return cardsAt(y - 80, y + 205); }
    if (n === 2) { upTo(2); this.sel = 'o1'; this.pinned = ['o1']; this.render(); const y = L.qTop; const b = stn(nextStation(this.st, 'o1'));
      this.callout(360, y + 56, 80, '① tap an order: it glows', 420, y - 44);
      this.callout(b.x, b.y, 92, '② tap its station', 380, b.y - 60);
      this.callouts.push(this.txt(b.x + 30, b.y - 140, '1 min', { fontSize: '40px', stroke: C.white, strokeThickness: 8 }).setDepth(3001));
      return [cardsAt(y - 80, y + 130), stationsArea]; }
    if (n === 3) { upTo(3); this.sel = 'o2'; this.render(); const b = stn('urn');
      this.callout(300, 64, 56, 'thinking is free: the clock waits', 360, 150);
      this.callout(b.x, b.y, 92, 'wrong station = −1 min', 420, b.y - 60);
      this.callouts.push(this.txt(b.x + 20, b.y - 140, '−1 min', { fontSize: '40px', color: C.red, stroke: C.white, strokeThickness: 8 }).setDepth(3001));
      return [cardsAt(24, 190), stationsArea]; }
    if (n === 4) { upTo(12); this.sel = null; this.render(); this.say('amira', 'happy', 'Boss, one roti canai tapau! Back at 7:20.');
      this.callout(210, L.rowY, 96, 'cook it before she’s back', 380, L.rowY - 110);
      return [cardsAt(L.liamY - 70, L.liamY + 70), cardsAt(L.rowY - 170, L.rowY + 70)]; }
    if (n === 5) { upTo(14); this.sel = null; this.render(); const b = stn('griddle');
      this.callout(360, L.helpY + 26, 60, 'a notice warns you', 360, L.helpY + 110); this.callout(b.x - 44, b.y - 78, 40, 'minutes to go', 400, b.y - 60);
      return [cardsAt(L.helpY - 14, L.helpY + 150), stationsArea]; }
    return null;
  }
}
