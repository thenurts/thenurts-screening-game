// The Nurts Mamak gameplay. Rules: ./rules.js (port of tests/mamak-reference.py) · practice: ./tutorial.js · brief: ./README.md
// The wall clock moves one minute per action and never on its own, so speed can't matter. Nothing here uses real time
// except the idle nudge (a hint only; idleMs is logged, never scored).
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { FORMS, MENU, STATIONS, newState, act, active, blocked, nextStation, metrics, orgScore, facets, clock, shiftOver, careful } from './rules.js';
import { TUTORIAL, tutorialMemo } from './tutorial.js';
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
const L0 = { helpY: 108, liamY: 232, qTop: 312, cardH: 112, cardGap: 8, maxCards: 5, rowY: 932, stY: 1122 };
let L = L0;
const HELP = '★ value · ⏳ time left · ✔ finish it · 📌 come back';

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
    this.add.rectangle(W / 2, H / 2 + 60, W - 20, 1000, hex(C.cream), 0.55).setStrokeStyle(0); // soft wash so cards read over the art

    this.tut = this.mode === 'practice';
    L = this.tut ? { ...L0, helpY: 160, liamY: 282, qTop: 362, maxCards: 4 } : L0; // room for the PRACTICE badge
    this.form = this.tut ? 'T' : this.options.form === 'A' || this.options.form === 'B' ? this.options.form : Number(this.runNo || 1) <= 1 && this.attemptNo <= 1 ? 'A' : 'B';
    this.repeatAttempt = !this.tut && Number(this.runNo || 1) <= 1 && this.attemptNo > 1;
    this.sel = null; this.pinned = []; this.scroll = 0; this.waits = 0; this.pins = 0; this.idleNudges = 0; this.idleMs = 0; this.acts = [];

    this.clockPill = this.pill(318, 64, 360, '');
    this.helpBtn = this.roundIcon(548, 64, '?', () => this.openHelp()).setDepth(900);
    this.strip = this.add.container(0, L.helpY).setDepth(20);
    // Liam at the counter + speech bubble
    this.liam = this.add.image(98, L.liamY + 6, 'liam-happy').setDepth(25); this.fitImg(this.liam, 140);
    this.bubble = this.add.container(0, 0).setDepth(26);
    this.starPill = this.pill(612, L.liamY - 26, 150, '★ 0'); this.starPill.setDepth(27);
    this.queue = this.add.container(0, 0).setDepth(30);
    this.row = this.add.container(0, 0).setDepth(30);
    this.stations = STATIONS.map((s, i) => this.stationBtn(105 + i * 170, L.stY, s));
    this.fx = this.add.container(0, 0).setDepth(80);
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
    const shadow = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 26);
    c.add([shadow, face]);
    c.paint = (fill) => g.clear().fillStyle(hex(fill), 1).fillRoundedRect(-w / 2, -h / 2, w, h, 26).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
    c.paint(C.white);
    c.gasIcon = this.fitImg(this.add.image(46, -60, 'mk-gas'), 70).setVisible(false); c.add(c.gasIcon);
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
    this.afterAction();
  }

  nextStep() {
    this.tutIdx++;
    if (this.tutIdx >= TUTORIAL.length) {
      const failSafes = this.tutLog.filter((x) => x.failSafe).length;
      Object.assign(tutorialMemo, { done: true, failSafes });
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
    if (!this.sel) { this.say('liam', 'happy', 'Tap an order first, then its station.'); this.pulse(this.queue); return; }
    if (this.sel === 'tapau' && this.tapauCooked()) { this.say('liam', 'happy', 'The tapau is ready. Tap the pin to hand it over.'); return; }
    const target = this.sel, need = nextStation(this.st, target);
    this.doAct(target, s);
    if (s !== need) {
      sfx.play('bad'); this.shake(120, 0.004);
      this.say('liam', 'worried', `Oops, that’s the ${STATION_LABEL[s].toLowerCase()}!`);
      if (this.tut) this.tutWrong();
    }
  }

  onWait() {
    if (this.busy || this.ended || !this.running) return;
    sfx.play('tick'); this.waits++;
    this.doAct(null, null);
  }

  tapauCooked() { const P = this.cfg.parked; return !!P && this.st.tapau.steps >= MENU[P.item][2].length; }

  onPin() {
    if (this.busy || this.ended || !this.running) return;
    const P = this.cfg.parked, t = this.st.tick;
    if (!this.tapauCooked()) return this.selectTarget('tapau');
    if (this.st.tapau.handed) return;
    if (t < P.window[0]) { this.say(P.customer, 'happy', `I’ll be back at ${clock(P.window[0])}!`); return; }
    if (t > P.late[1]) { this.say('liam', 'worried', 'Too late, Amira has gone home.'); return; }
    this.doAct('handover', null);
    this.trace('o1_tapau', { cookedSteps: this.st.tapau.steps, handedTick: this.st.tapau.handed, clock: clock(this.st.tapau.handed) });
    sfx.play('coin'); this.say(P.customer, 'excited', 'Thanks, boss!');
  }

  pinOrder(id) {
    if (this.busy || this.ended) return;
    this.pinned = this.pinned.includes(id) ? this.pinned.filter((x) => x !== id) : [id, ...this.pinned];
    this.pins++; this.trace('o1_plan', { action: 'pin', id }); sfx.play('click'); this.armIdle(); this.render();
  }

  /** Every action = one minute on the clock. */
  doAct(target, station) {
    const st = this.st, before = new Set(active(st).map((o) => o.id)), doneBefore = st.done.length, t = st.tick;
    const e = act(st, target, station);
    this.acts.push(e);
    this.trace('o1_action', { tick: e[0], clock: clock(e[0]), target: e[1], station: e[2], ok: e[3], load: e[4], active: [...before] });
    if (e[3]) sfx.play('pop');
    // served / expired
    st.done.slice(doneBefore).forEach((id) => {
      const o = st.orders.get(id);
      this.trace('o1_order_end', { id, item: o.item, stars: o.stars, status: 'done', startedTick: o.arrived, endTick: t });
      sfx.play('coin'); this.floatText(360, L.qTop + 40, `+${'★'.repeat(o.stars)}`, C.amber);
      if (this.sel === id) this.sel = null;
    });
    [...before].filter((id) => st.orders.get(id).status === 'expired').forEach((id) => {
      const o = st.orders.get(id);
      this.trace('o1_order_end', { id, item: o.item, stars: o.stars, status: 'expired', startedTick: o.arrived, endTick: st.tick });
      this.say(o.cust, 'worried', `${MENU[o.item][0]} took too long… bye!`);
      if (this.sel === id) this.sel = null;
    });
    // resilience hook: actions from the gas running out until the next useful step
    const S = this.cfg.setback;
    if (S && t >= S.tick && this.recover == null) { this.sinceSetback = (this.sinceSetback || 0) + 1; if (e[3]) { this.recover = this.sinceSetback; this.trace('o1_setback_next', { actionsBeforeRecover: this.recover }); } }
    this.armIdle();
    this.afterAction();
  }

  /** Arrivals, announcements, the setback and the end of the shift, after every minute. */
  afterAction() {
    const st = this.st, t = st.tick, P = this.cfg.parked, S = this.cfg.setback;
    if (P && !this.tut && t === P.announce && !this.announced) {
      this.announced = true;
      this.say(P.customer, 'happy', `Boss, one ${MENU[P.item][0].toLowerCase()} tapau (takeaway)! I’ll be back at ${clock(P.window[0])}.`);
    }
    if (S && t === S.tick && !this.gasSaid) { this.gasSaid = true; this.say('liam', 'worried', 'The gas runs out! No griddle for 3 minutes.'); this.shake(300, 0.008); sfx.play('clunk'); }
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

  /** Fail-safe: show the right move (select the right order and pulse its station, or pulse the pin). */
  hint() {
    const s = this.step, st = this.st;
    const target = s.hintTarget || active(st)[0]?.id;
    if (!target) return;
    if (target === 'tapau') { this.pulse(this.pinBtn); this.say('liam', 'happy', 'Tip: tap the 📌 pin to cook the tapau, and again at 7:05.'); return; }
    if (!st.orders.has(target)) return;
    this.sel = target; this.render();
    const need = nextStation(st, target);
    this.pulse(this.stations.find((b) => b.station === need));
    this.say('liam', 'happy', `Tip: ${MENU[st.orders.get(target).item][0]} first, then the ${STATION_LABEL[need].toLowerCase()}.`);
  }

  // ---------------------------------------------------------------- rendering
  render() {
    const st = this.st, t = st.tick;
    this.clockPill.text.setText(`${clock(Math.min(t, this.cfg.ticks + 1))} pm · ends ${clock(this.cfg.ticks + 1)}`);
    const stars = st.done.reduce((a, id) => a + st.orders.get(id).stars, 0) + (st.tapau.handed && this.cfg.parked ? MENU[this.cfg.parked.item][1] : 0);
    this.starPill.text.setText(`★ ${stars}`);
    this.renderStrip();
    this.renderQueue();
    this.renderRow();
    for (const b of this.stations) {
      const off = blocked(st, b.station);
      b.paint(off ? C.charcoal : C.white); b.gasIcon.setVisible(off); b.setAlpha(off ? 0.6 : 1);
    }
  }

  renderStrip() {
    const c = this.strip; c.removeAll(true);
    c.add(this.add.graphics().fillStyle(hex(this.tut ? C.sun : C.butter), 1).fillRoundedRect(30, 0, 660, 52, 26).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(30, 0, 660, 52, 26));
    const label = this.tut ? `Practice ${this.step.step} of 3 · ${this.step.headline}` : HELP;
    const t = this.txt(360, 27, label, { fontSize: this.tut ? '28px' : '24px' }); if (t.width > 620) t.setScale(620 / t.width);
    c.add(t);
  }

  ordered() {
    const list = active(this.st);
    return [...this.pinned.map((id) => list.find((o) => o.id === id)).filter(Boolean), ...list.filter((o) => !this.pinned.includes(o.id))];
  }

  renderQueue() {
    const c = this.queue; c.removeAll(true);
    const list = this.ordered(), n = list.length;
    this.scroll = Math.max(0, Math.min(this.scroll, n - L.maxCards));
    if (!n) c.add(this.txt(360, L.qTop + 120, this.st.tick > this.cfg.ticks ? '' : 'No orders right now. Tap Wait for 1 minute.', { fontSize: '28px', fontStyle: '700', color: C.charcoal }));
    list.slice(this.scroll, this.scroll + L.maxCards).forEach((o, i) => c.add(this.card(o, L.qTop + i * (L.cardH + L.cardGap))));
    if (n > L.maxCards) { // more orders than fit: scroll the queue
      const up = this.scroll > 0, down = this.scroll + L.maxCards < n;
      const y = L.qTop + L.maxCards * (L.cardH + L.cardGap) - 2;
      c.add(this.txt(360, y + 4, `${n} orders waiting`, { fontSize: '22px', fontStyle: '700', color: C.charcoal }));
      if (up) c.add(this.roundIcon(560, y, '▲', () => { this.scroll--; this.render(); }));
      if (down) c.add(this.roundIcon(650, y, '▼', () => { this.scroll++; this.render(); }));
    }
  }

  card(o, y) {
    const c = this.add.container(0, y), w = 660, h = L.cardH, x0 = 30, sel = this.sel === o.id, st = this.st;
    const left = o.due - st.tick + 1, urgent = left <= 2;
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(x0, 6, w, h, 22).fillStyle(hex(sel ? C.sun : C.white), 1).fillRoundedRect(x0, 0, w, h, 22).lineStyle(sel ? 7 : 4, hex(C.ink), 1).strokeRoundedRect(x0, 0, w, h, 22));
    // customer bust
    c.add(this.add.graphics().fillStyle(hex(C.butter), 1).fillCircle(x0 + 52, h / 2, 40).lineStyle(3, hex(C.ink), 1).strokeCircle(x0 + 52, h / 2, 40));
    c.add(this.fitImg(this.add.image(x0 + 52, h / 2 + 2, `${o.cust}-happy`), 76));
    c.add(this.fitImg(this.add.image(x0 + 148, h / 2, `mk-${o.item}`), 92));
    const nt = this.txt(x0 + 204, 30, MENU[o.item][0], { fontSize: '28px', align: 'left' }).setOrigin(0, 0.5);
    c.add([nt, this.txt(nt.x + nt.width + 12, 29, '★'.repeat(o.stars), { fontSize: '26px', color: C.amber, stroke: C.ink, strokeThickness: 3, align: 'left' }).setOrigin(0, 0.5)]);
    // step dots: one station icon per step, done ones ticked, the next one ringed
    MENU[o.item][2].forEach((s, k) => {
      const x = x0 + 226 + k * 70, yy = 80, done = k < o.step, next = k === o.step;
      c.add(this.add.graphics().fillStyle(hex(done ? C.mint : C.white), 1).fillCircle(x, yy, 26).lineStyle(next ? 5 : 2, hex(next ? C.amber : C.ink), 1).strokeCircle(x, yy, 26));
      c.add(this.fitImg(this.add.image(x, yy, `mk-${s}`), 36).setAlpha(done ? 0.45 : 1));
      if (done) c.add(this.txt(x + 14, yy - 14, '✓', { fontSize: '22px', color: C.green }));
    });
    // minutes left
    const cw = 118;
    c.add(this.add.graphics().fillStyle(hex(urgent ? C.peach : C.mint), 1).fillRoundedRect(x0 + w - cw - 70, 56, cw, 44, 22).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(x0 + w - cw - 70, 56, cw, 44, 22));
    c.add(this.txt(x0 + w - 70 - cw / 2, 79, `⏳ ${left} min`, { fontSize: '22px' }));
    // pin to the top (planning tool)
    const pinned = this.pinned.includes(o.id);
    const pb = this.add.container(x0 + w - 36, 34);
    pb.add([this.add.graphics().fillStyle(hex(pinned ? C.sun : C.white), 1).fillCircle(0, 0, 24).lineStyle(3, hex(C.ink), 1).strokeCircle(0, 0, 24), this.txt(0, 1, pinned ? '★' : '☆', { fontSize: '26px' })]);
    pb.setSize(64, 64).setInteractive({ useHandCursor: true }).on('pointerup', (p, lx, ly, ev) => { ev?.stopPropagation?.(); this.pinOrder(o.id); });
    const hit = this.add.rectangle(x0 + (w - 70) / 2, h / 2, w - 70, h, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.selectTarget(o.id));
    c.add([hit, pb]);
    return c;
  }

  renderRow() {
    const c = this.row; c.removeAll(true);
    const st = this.st, P = this.cfg.parked, y = L.rowY;
    // Wait (1 minute passes)
    const wait = this.btn(560, y, '⏱ Wait', () => this.onWait(), { w: 250, h: 92, size: 30, fill: C.white });
    c.add(wait);
    this.pinBtn = null;
    if (P && st.tick >= P.announce) { // the parked tapau: only a small pin with the time, no reminders
      const handed = !!st.tapau.handed, cooked = this.tapauCooked(), sel = this.sel === 'tapau';
      const pc = this.add.container(210, y);
      pc.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(-170, -46 + 6, 340, 92, 24).fillStyle(hex(handed ? C.mint : sel ? C.sun : C.white), 1).fillRoundedRect(-170, -46, 340, 92, 24).lineStyle(sel ? 6 : 4, hex(C.ink), 1).strokeRoundedRect(-170, -46, 340, 92, 24));
      pc.add(this.fitImg(this.add.image(-126, 0, 'mk-tapau'), 72));
      pc.add(this.txt(-80, -14, `📌 ${clock(P.window[0])}`, { fontSize: '28px', align: 'left' }).setOrigin(0, 0.5));
      const steps = MENU[P.item][2];
      if (handed) pc.add(this.txt(-80, 22, 'handed over ✓', { fontSize: '22px', fontStyle: '700', align: 'left' }).setOrigin(0, 0.5));
      else steps.forEach((s, k) => {
        const x = -64 + k * 50, done = k < st.tapau.steps;
        pc.add(this.add.graphics().fillStyle(hex(done ? C.mint : C.white), 1).fillCircle(x, 24, 19).lineStyle(k === st.tapau.steps ? 4 : 2, hex(k === st.tapau.steps ? C.amber : C.ink), 1).strokeCircle(x, 24, 19));
        pc.add(this.fitImg(this.add.image(x, 24, `mk-${s}`), 26).setAlpha(done ? 0.45 : 1));
      });
      if (!handed && cooked) pc.add(this.txt(110, 22, 'ready', { fontSize: '22px', color: C.green }));
      pc.setSize(340, 92).setInteractive({ useHandCursor: true }).on('pointerup', () => this.onPin());
      c.add(pc); this.pinBtn = pc;
    }
  }

  /** Speech bubble next to Liam (or a customer, whose bust replaces Liam's for the moment). */
  say(who, pose, text) {
    this.lastSay = text; // test hook
    const b = this.bubble; b.removeAll(true);
    const tex = `${who}-${this.textures.exists(`${who}-${pose}`) ? pose : 'happy'}`;
    this.liam.setTexture(tex); this.fitImg(this.liam, 140);
    const t = this.txt(190, L.liamY, text, { fontSize: '26px', fontStyle: '700', align: 'left', wordWrap: { width: 330 } }).setOrigin(0, 0.5);
    const h = Math.max(88, t.height + 28);
    b.add([this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(172, L.liamY - h / 2, 360, h, 26).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(172, L.liamY - h / 2, 360, h, 26)
      .fillStyle(hex(C.white), 1).fillTriangle(174, L.liamY - 12, 152, L.liamY + 4, 174, L.liamY + 14), t]);
    this.tweens.killTweensOf(b); b.setAlpha(1).setScale(1);
    this.tweens.add({ targets: b, scale: { from: 0.96, to: 1 }, duration: 160 });
  }

  pulse(obj) { if (obj) this.tweens.add({ targets: obj, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: 3, duration: 220, onComplete: () => obj.setScale(1) }); }

  openHelp() {
    if (this.ended) return;
    this.overlay.removeAll(true); this.trace('help_open', { tick: this.st?.tick });
    const v = this.cameras.main.worldView, W = this.W, top = 260;
    const dim = this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.5).setInteractive();
    const g = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(60, top + 10, 600, 680, 36).fillStyle(hex(C.white), 1).fillRoundedRect(60, top, 600, 680, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(60, top, 600, 680, 36);
    const rows = [['★', 'Worth more', 'more stars = more value'], ['⏳', 'Minutes left', 'before the customer leaves'], ['✔', 'Finish what you start', 'half-done food is wasted'], ['📌', 'Come back later', 'tapau orders wait on a pin'], ['🕖', 'The clock moves only when you work', 'each job = 1 minute; no rush']];
    const items = rows.flatMap(([ic, a, b], i) => [this.txt(120, top + 128 + i * 98, ic, { fontSize: '40px' }),
      this.txt(165, top + 114 + i * 98, a, { fontSize: '30px', align: 'left' }).setOrigin(0, 0.5), this.txt(165, top + 148 + i * 98, b, { fontSize: '23px', fontStyle: '600', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5)]);
    const close = this.btn(W / 2, top + 620, 'Got it', () => this.overlay.removeAll(true), { w: 260, h: 76, size: 30, fill: C.sun });
    this.overlay.add([dim, g, this.txt(W / 2, top + 54, 'Remember', { fontSize: '36px' }), ...items, close]);
    dim.on('pointerup', () => this.overlay.removeAll(true));
    void v;
  }

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
    if (this.busy || this.ended || !this.running || !this.st) return false;
    const [tg, sta] = careful(this.st);
    if (tg === 'handover') this.onPin();
    else if (tg === null) this.onWait();
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
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(60, 370, 600, 520, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(60, 360, 600, 520, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(60, 360, 600, 520, 36));
    c.add(this.fitImg(this.add.image(W / 2, 470, 'liam-excited'), 150));
    c.add(this.txt(W / 2, 590, `${clock(this.cfg.ticks + 1)} pm · Shift over!`, { fontSize: '40px' }));
    c.add(this.txt(W / 2, 660, `You served ★ ${m.starsServed} of ${m.starsAvailable}`, { fontSize: '32px', fontStyle: '700' }));
    const done = () => { this.shiftDone = null; c.destroy(true); this.finish(this.metrics()); };
    c.add(this.btn(W / 2, 790, 'Done', done, { w: 300, h: 96, size: 36 }));
    this.shiftDone = done; // test hook
  }

  metrics() {
    if (this.tut) {
      const log = this.tutLog || [], failSafes = log.filter((x) => x.failSafe).length;
      return { starsServed: log.length, steps: log.length, failSafes, tries: log.map((x) => `${x.step}:${x.tries}${x.failSafe ? '!' : ''}`).join(' '), flags: failSafes >= 2 ? 'tutorialStruggle' : '' };
    }
    const st = this.st; if (!st) return {};
    const m = metrics(st), f = facets(m), P = this.cfg.parked;
    const starsAvailable = this.cfg.stream.reduce((a, [, , i]) => a + MENU[i][1], 0) + (P ? MENU[P.item][1] : 0);
    const starsServed = st.done.reduce((a, id) => a + st.orders.get(id).stars, 0) + (st.tapau.handed && P ? MENU[P.item][1] : 0);
    const log = this.acts, S = this.cfg.setback;
    const okRate = (a, b) => { const xs = log.filter((e) => e[0] >= a && e[0] <= b); return xs.length ? xs.filter((e) => e[3]).length / xs.length : null; };
    const pre = S ? okRate(S.tick - 6, S.tick - 1) : null, post = S ? okRate(S.tick, S.tick + 5) : null;
    const wrong = st.errors.length;
    const flags = [];
    if (this.waits >= 20 || (log.length && wrong / log.length >= 0.5)) flags.push('disengaged');
    if (tutorialMemo.done && tutorialMemo.failSafes >= 2) flags.push('tutorialStruggle');
    if (this.repeatAttempt) flags.push('repeatAttempt');
    return {
      ...m, orgScore: orgScore(m), ...f, starsServed, starsAvailable,
      served: st.done.length, expired: st.expired.length, errors: wrong, waits: this.waits, planToolUse: this.pins,
      postSetbackDelta: pre != null && post != null ? Math.round((post - pre) * 1000) / 1000 : '', actionsBeforeRecover: this.recover ?? '',
      tapauHanded: st.tapau.handed ? clock(st.tapau.handed) : '', form: this.form, minutesPlayed: log.length,
      // raw minutes for re-scoring later: "tick target station ok load"
      actionLog: log.map((e) => `${e[0]} ${e[1] ?? '-'} ${e[2] ?? '-'} ${e[3] ? 1 : 0} ${e[4]}`).join(';'),
      tutorialDone: tutorialMemo.done, tutorialFailSafes: tutorialMemo.done ? tutorialMemo.failSafes : '',
      idleNudges: this.idleNudges, idleMs: Math.round(this.idleMs), flags: flags.join(','),
    };
  }
}
