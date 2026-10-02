// Zoey's Big Calls gameplay (build pack JD1 v1.2). Rules: ./rules.js (port of tests/judgement-reference.py) · brief: ./README.md
// A call card: a situation, two options, "Affects N kids", maybe ⏳ urgent, and short messages from 👁 people who saw it or
// 👂 people who heard it (0–2 face up). NO tally: the player weighs the messages. ONE Ask button says who you'd ask next
// (saw it / heard it) and what it costs (2 points, or 6 when urgent). No timer.
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { CONTENT, callsOf, newCall, check, decide, stateOf, bestSide, BOTS, metrics, MAX_CHECKS, COST } from './rules.js';
import bgUrl from './assets/bg-desk.webp';

const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const ms = (x) => x / SPEED;
const IDLE_MS = 20000;
const IMGS = import.meta.glob('./assets/ic-*.webp', { eager: true, import: 'default' });
/** Situation icons (flavour only: the arrows carry all the meaning). */
export const ICON = { A01: 'weather', A02: 'food', A03: 'bus', A04: 'food', A05: 'papers', A06: 'search', A07: 'clock', A08: 'stage', A09: 'clock', A10: 'stage',
  B01: 'papers', B02: 'bus', B03: 'food', B04: 'stage', B05: 'search', B06: 'school', B07: 'clock', B08: 'school', B09: 'papers', B10: 'papers', P1: 'weather', P2: 'food' };
const XL = 170, XR = 550; // the left / right option columns
const L = { zoeyY: 230, cardY: 300, cardH: 540, rowY: 570, rowH: 54, checkY: 918, orY: 990, optY: 1070 };
const SIDE = (d) => (d > 0 ? 'L' : 'R');
const FB = { // practice feedback only (the real round gives none about asking)
  good: 'Good ask: it was close, lots of kids were affected, and that person saw it.',
  wasted: 'Asking cost more than it could win. Just decide.',
  missed: (w) => `It was close, it affects ${w} kids, and the next person saw it: asking was worth it.`,
  against: (o) => `The evidence points to ${o}: one 👁 saw it outweighs one 👂 heard it.`,
};
export const practiceMemo = { done: false, steps: [] }; // [{tries, usedFailSafe}] for tutorialStruggle + learning pickup

export default class GameScene extends ModuleScene {
  preload() {
    if (!this.textures.exists('jd-bg')) this.load.image('jd-bg', bgUrl);
    for (const [p, u] of Object.entries(IMGS)) { const k = 'jd-' + p.slice(12, -5); if (!this.textures.exists(k)) this.load.image(k, u); }
    for (const pose of ['happy', 'excited', 'worried']) if (!this.textures.exists(`zoey-${pose}`)) this.load.image(`zoey-${pose}`, charImg('zoey', pose));
  }

  build() {
    const { W, H } = this;
    this.add.rectangle(W / 2, H / 2, W * 4, H * 4, hex('#E9C58F'));
    this.bg = this.add.image(W / 2, H / 2, 'jd-bg');
    const fit = () => { const z = Math.min(this.scale.width / W, this.scale.height / H) || 1; this.bg.setScale(Math.max(Math.max(W, this.scale.width / z) / this.bg.width, Math.max(H, this.scale.height / z) / this.bg.height)); };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    this.tut = this.mode === 'practice';
    this.form = this.tut ? 'P' : this.options.form === 'A' || this.options.form === 'B' ? this.options.form : !this.casual && Number(this.runNo || 1) <= 1 && this.attemptNo <= 1 ? 'A' : 'B'; // play-for-fun never sees Form A (request #26)
    this.repeatAttempt = !this.tut && Number(this.runNo || 1) <= 1 && this.attemptNo > 1;
    this.calls = callsOf(this.form);
    this.log = []; this.points = 0; this.idleNudges = 0; this.idleMs = 0; this.firstUse = null; this.unlucky = null;
    this.counter = this.pill(270, 64, 280, '');
    this.ptsPill = this.pill(590, 146, 200, '0 pts').setVisible(!this.tut);
    this.zoey = this.add.image(84, L.zoeyY, 'zoey-happy').setDepth(25); this.fitImg(this.zoey, 116);
    this.bubble = this.add.container(0, 0).setDepth(26);
    this.cardC = this.add.container(0, 0).setDepth(20);
    this.ctrlC = this.add.container(0, 0).setDepth(30);
  }

  fitImg(i, box) { i.setScale(Math.min(box / i.width, box / i.height)); return i; }
  pill(x, y, w, label) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -32, w, 64, 32).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -32, w, 64, 32));
    c.text = this.txt(0, 2, label, { fontSize: '28px' }); c.add(c.text);
    return c;
  }

  // ---------------------------------------------------------------- flow
  onStart() {
    this.trace('round_setup', { form: this.form, attemptNo: this.attemptNo, runNo: this.runNo });
    this.idx = -1; this.nextCall();
  }

  nextCall() {
    this.idx++;
    if (this.idx >= this.calls.length) return this.end();
    this.startCall(true);
  }

  startCall(fresh) {
    const call = this.calls[this.idx];
    this.cs = newCall(call); this.phase = 'call'; this.busy = false; this.callStart = this.elapsed;
    if (fresh && this.tut) this.ptries = 0;
    this.counter.text.setText(this.tut ? `Practice ${this.idx + 1} / ${this.calls.length}` : `Call ${this.idx + 1} / ${this.calls.length}`);
    if (fresh) this.say('happy', this.tut ? (this.idx === 0 ? 'Ask someone, or pick a side. Your call!' : 'Another one. Ask, or just decide?') : this.idx === 0 ? 'Big calls today! Ask someone, or decide.' : this.pick(['Next call!', 'What do you think?', 'Your call!', 'Hmm, which one?']));
    this.render();
    if (fresh) { this.cardC.x = this.W; this.tweens.add({ targets: this.cardC, x: 0, duration: ms(380), ease: 'Cubic.easeOut' }); }
    this.armIdle();
  }

  // ---------------------------------------------------------------- input
  doCheck() {
    if (this.phase !== 'call' || this.busy || this.ended || !this.running) return;
    const r = check(this.cs); if (!r) return;
    const c = this.cs.call, verdict = r.verdict === true ? 'good' : r.verdict === false ? 'wasted' : 'neutral';
    this.trace('jd_check', { form: this.form, call: c.id, n: r.n, strength: r.strength, voi: Math.round(r.voi * 100) / 100, verdict, cost: r.cost });
    sfx.play('pop'); this.render(); this.floatText(620, L.cardY + 70, `−${r.cost}`, C.red);
    this.armIdle();
    if (!this.tut) return;
    if (r.verdict === false) return this.practiceFail(c.card.urgent ? 'Asking cost 6 to maybe win a little. Just decide.' : FB.wasted);
    if (r.verdict === true) this.say('excited', FB.good);
  }

  choose(side) {
    if (this.phase !== 'call' || this.busy || this.ended || !this.running) return;
    const c = this.cs.call, e = decide(this.cs, side), best = bestSide(e.tally);
    const t = Math.round(this.elapsed - this.callStart);
    if (this.tut) {
      if (e.missed) return this.practiceFail(FB.missed(c.worth));
      if (!e.correctExAnte) return this.practiceFail(FB.against(c.card.options[SIDE(best)]));
      if (!practiceMemo.done) practiceMemo.steps[this.idx] = { tries: // only the first completed practice counts (Framework v0.5)
        this.ptries + 1, usedFailSafe: !!this.failSafe };
      this.trace('jd_tutorial', { step: this.idx + 1, tries: this.ptries + 1, usedFailSafe: !!this.failSafe });
      this.failSafe = false;
      return this.showResult(e, c.id === 'P1' ? FB.good : 'Right: asking there would cost 6 to maybe win a little.');
    }
    this.log.push(e);
    this.trace('jd_call', { form: this.form, call: c.id, choice: SIDE(side), evidenceAtDecision: e.tally, correctExAnte: e.correctExAnte, checks: this.cs.next,
      missedCheck: e.missed, worth: c.worth, urgent: c.urgent, outcome: e.won ? 'won' : 'lost', points: e.points, ms: t });
    if (this.unlucky && this.unlucky.next == null) { this.unlucky.next = e.correctExAnte; this.trace('jd_unlucky_next', { call: c.id, followedTally: e.correctExAnte }); }
    if (!this.unlucky && best !== 0 && e.correctExAnte && !e.won) this.unlucky = { call: c.id, next: null };
    if (c.urgent && this.firstUse == null) this.firstUse = e.correctExAnte && !e.missed && !e.checks.includes(false);
    this.points += e.points; this.ptsPill.text.setText(`${this.points} pts`);
    this.showResult(e);
  }

  practiceFail(msg) {
    this.busy = true; this.ptries++; sfx.play('bad');
    if (this.ptries >= 2) this.failSafe = true;
    this.say('worried', msg + ' Let’s try that one again.');
    this.time.delayedCall(ms(2600), () => { if (this.ended) return; this.startCall(false); if (this.failSafe) this.guide(); });
  }

  /** Practice fail-safe: say the right next move and pulse its button (the player still makes it). */
  guide() {
    const s = stateOf(this.cs), wise = BOTS.wise(s);
    if (wise[0] === 'check') { this.say('happy', 'Tap Ask: this one is worth asking about.'); this.pulse(this.checkBtn); }
    else { const o = this.cs.call.card.options[SIDE(wise[1])]; this.say('happy', `Now pick ${o}.`); this.pulse(wise[1] > 0 ? this.optL : this.optR); }
  }

  showResult(e, line) {
    this.phase = 'result'; this.busy = false; this.lastEntry = e;
    const c = this.cs.call, o = c.card.options[c.card.outcome];
    const smart = e.best !== 0 && e.correctExAnte;
    if (e.won) { sfx.play('good'); this.burst(e.choice > 0 ? XL : XR, L.optY - 40); } else sfx.play('bad');
    this.say(e.won ? 'excited' : smart ? 'happy' : 'worried', line || (e.best === 0 ? `It was ${o}. A close call: either was fine.`
      : e.won ? (smart ? `It was ${o}! Nice call.` : `It was ${o}. Lucky! The evidence pointed the other way.`)
        : smart ? `It was ${o}. Unlucky! But that was the smart call.` : `It was ${o}. The evidence pointed the other way.`));
    this.showResultCopy(e);
    this.render();
    this.armIdle();
  }

  /** The consequence, in kids (v1.2): stakes and outcomes feel real. */
  showResultCopy(e) {
    const CL = CONTENT.consequenceLines;
    this.consequence = (e.won ? CL.right : e.best === 0 || e.correctExAnte ? CL.wrongSmart : CL.wrong).replace('{kids}', this.cs.call.worth);
  }

  next() {
    if (this.phase !== 'result' || this.busy) return;
    this.busy = true; sfx.play('click');
    this.tweens.add({ targets: this.cardC, x: -this.W, duration: ms(260), onComplete: () => this.nextCall() });
  }

  end() {
    this.phase = 'done'; this.busy = true; this.ctrlC.removeAll(true);
    if (this.tut) { practiceMemo.done = true; return this.finish(this.metrics()); }
    const m = this.metrics();
    const W = this.W, c = this.add.container(0, 0).setDepth(1150);
    c.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.5).setInteractive());
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(40, 170, 640, 960, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(40, 160, 640, 960, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(40, 160, 640, 960, 36));
    c.add(this.fitImg(this.add.image(W / 2, 250, 'zoey-excited'), 130));
    c.add(this.txt(W / 2, 350, `${m.smartCalls} smart calls out of 10`, { fontSize: '36px' }));
    c.add(this.txt(W / 2, 398, `${this.points} points`, { fontSize: '28px', fontStyle: '700', color: C.blue }));
    this.log.forEach((e, i) => {
      const card = this.calls[i].card, y = 460 + i * 50;
      const mark = e.best === 0 ? '≈' : e.correctExAnte ? '✓' : '✗';
      c.add(this.txt(80, y, mark, { fontSize: '28px', color: e.best === 0 ? C.blue : e.correctExAnte ? C.green : C.red }).setOrigin(0, 0.5));
      c.add(this.txt(124, y, card.situation.split(':')[0], { fontSize: '24px', fontStyle: '700', align: 'left' }).setOrigin(0, 0.5));
      c.add(this.txt(640, y, `${e.points} pts`, { fontSize: '22px', fontStyle: '600', color: C.charcoal }).setOrigin(1, 0.5));
    });
    c.add(this.txt(W / 2, 972, '✓ = the call the evidence supported · ≈ = too close to call', { fontSize: '20px', fontStyle: '600', color: C.charcoal }));
    const fin = () => { this.recapDone = null; c.destroy(true); this.finish(this.metrics()); };
    c.add(this.btn(W / 2, 1050, 'Done', fin, { w: 300, h: 96, size: 36 }));
    this.recapDone = fin; // test hook
  }

  // ---------------------------------------------------------------- rendering
  render() { this.renderCard(); this.renderControls(); }

  renderCard() {
    const k = this.cardC; k.removeAll(true);
    const cs = this.cs, c = cs.call, card = c.card, y = L.cardY, h = L.cardH;
    k.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(28, y + 8, 664, h, 28).fillStyle(hex(C.white), 1).fillRoundedRect(28, y, 664, h, 28).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(28, y, 664, h, 28));
    k.add(this.add.graphics().fillStyle(hex(C.red), 1).fillCircle(360, y + 8, 12).lineStyle(3, hex(C.ink), 1).strokeCircle(360, y + 8, 12)); // pin
    const ic = ICON[c.id]; if (ic) k.add(this.fitImg(this.add.image(100, y + 80, 'jd-' + ic), 104));
    k.add(this.txt(170, y + 80, card.situation, { fontSize: '30px', align: 'left', wordWrap: { width: 350 } }).setOrigin(0, 0.5));
    // stakes: how many kids the call affects (v1.2) + ⏳
    k.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillCircle(620, y + 76, 56).fillStyle(hex(C.sun), 1).fillCircle(620, y + 72, 56).lineStyle(5, hex(C.ink), 1).strokeCircle(620, y + 72, 56));
    k.add(this.txt(620, y + 50, 'Affects', { fontSize: '17px', fontStyle: '700' })); k.add(this.txt(620, y + 78, String(c.worth), { fontSize: '38px' })); k.add(this.txt(620, y + 106, 'kids', { fontSize: '18px', fontStyle: '700' }));
    this.worthAt = { x: 620, y: y + 72 };
    if (c.urgent) {
      k.add(this.add.graphics().fillStyle(hex(C.amber), 1).fillRoundedRect(540, y + 140, 160, 44, 22).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(540, y + 140, 160, 44, 22));
      k.add(this.txt(620, y + 163, '⏳ Urgent', { fontSize: '22px' }));
    }
    k.add(this.add.graphics().lineStyle(3, hex(C.charcoal), 0.35).lineBetween(56, y + 196, 664, y + 196));
    // option headers
    k.add(this.txt(XL, y + 222, card.options.L, { fontSize: '28px', color: C.blue })); k.add(this.txt(XR, y + 222, card.options.R, { fontSize: '28px', color: C.blue }));
    k.add(this.txt(360, y + 222, 'or', { fontSize: '22px', fontStyle: '600', color: C.charcoal }));
    // messages: the face-up ones, the ones asked for, then one "?" per person not asked yet. NO tally (the player weighs them).
    const rows = [...(card.startClues || []).map((m) => ({ ...m })), ...cs.checkLog.map((r) => ({ ...card.clues[r.n - 1], fresh: r.n === cs.next }))];
    for (let i = cs.next; i < MAX_CHECKS; i++) rows.push({ hidden: true });
    this.rowYs = [];
    rows.forEach((r, i) => {
      const ry = L.rowY + i * L.rowH; this.rowYs.push(ry);
      if (r.hidden) {
        k.add(this.add.graphics().fillStyle(hex(C.cream), 1).fillRoundedRect(150, ry - 21, 420, 42, 21).lineStyle(3, hex(C.charcoal), 0.4).strokeRoundedRect(150, ry - 21, 420, 42, 21));
        k.add(this.txt(360, ry, '? not asked yet', { fontSize: '21px', fontStyle: '700', color: C.charcoal })); return;
      }
      const saw = r.strength === 2;
      k.add(this.add.graphics().fillStyle(hex(r.fresh ? C.butter : saw ? C.white : C.cream), 1).fillRoundedRect(60, ry - 23, 600, 46, 23).lineStyle(saw ? 4 : 3, hex(C.ink), saw ? 1 : 0.7).strokeRoundedRect(60, ry - 23, 600, 46, 23));
      k.add(this.txt(92, ry, r.icon, { fontSize: '26px' }));
      const t = this.txt(122, ry, r.text, { fontSize: '22px', fontStyle: saw ? '800' : '600', align: 'left' }).setOrigin(0, 0.5); if (t.width > 520) t.setScale(520 / t.width);
      k.add(t);
    });
    if (!rows.some((r) => !r.hidden)) k.add(this.txt(360, L.rowY - 40, 'No messages yet: ask someone, or decide.', { fontSize: '21px', fontStyle: '700', color: C.charcoal }));
  }

  renderControls() {
    const k = this.ctrlC; k.removeAll(true); this.checkBtn = this.optL = this.optR = this.nextBtn = null;
    const cs = this.cs, c = cs.call, card = c.card;
    if (this.phase === 'call') {
      const s = stateOf(cs);
      if (s.left > 0) {
        this.checkBtn = this.btn(360, L.checkY, `${s.nextStrength === 2 ? '👁 Ask someone who saw it' : '👂 Ask someone who heard it'} · −${COST[c.urgent]}`, () => this.doCheck(), { w: 620, h: 96, size: 28, fill: C.sky });
        k.add(this.checkBtn);
      } else k.add(this.txt(360, L.checkY, 'Nobody left to ask. Time to decide!', { fontSize: '26px', fontStyle: '700', color: C.charcoal }));
      k.add(this.txt(360, L.orY, 'or pick one:', { fontSize: '24px', fontStyle: '700', color: C.ink, stroke: C.white, strokeThickness: 6 }));
      this.optL = this.btn(XL + 10, L.optY, card.options.L, () => this.choose(1), { w: 310, h: 110, size: 34 });
      this.optR = this.btn(XR - 10, L.optY, card.options.R, () => this.choose(-1), { w: 310, h: 110, size: 34 });
      k.add([this.optL, this.optR]);
    } else if (this.phase === 'result') {
      const e = this.lastEntry, o = card.options[card.outcome];
      k.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(40, L.checkY - 58, 640, 170, 28).fillStyle(hex(C.cream), 1).fillRoundedRect(40, L.checkY - 64, 640, 170, 28).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(40, L.checkY - 64, 640, 170, 28));
      k.add(this.txt(360, L.checkY - 22, `${e.won ? '✓' : '✗'} It was ${o}!`, { fontSize: '34px', color: e.won ? C.green : C.red }));
      k.add(this.txt(this.tut ? 360 : 200, L.checkY + 44, this.tut ? 'Practice: no points' : `${e.points ? '+' : ''}${e.points} pts`, { fontSize: '28px', color: C.ink }));
      if (!this.tut && this.consequence) { const t = this.txt(360, L.checkY + 88, this.consequence, { fontSize: '21px', fontStyle: '700', color: C.charcoal }); if (t.width > 600) t.setScale(600 / t.width); k.add(t); }
      if (!this.tut) {
        const label = e.best === 0 ? '≈ Close call' : e.correctExAnte ? 'Smart call ✓' : null;
        if (label) {
          k.add(this.add.graphics().fillStyle(hex(e.best === 0 ? C.sky : C.mint), 1).fillRoundedRect(360, L.checkY + 18, 280, 52, 26).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(360, L.checkY + 18, 280, 52, 26));
          k.add(this.txt(500, L.checkY + 44, label, { fontSize: '26px', color: e.best === 0 ? C.blue : C.green }));
          this.badgeAt = { x: 500, y: L.checkY + 44 };
        }
      }
      this.nextBtn = this.btn(360, L.optY, this.idx + 1 >= this.calls.length ? 'Finish ▶' : 'Next call ▶', () => this.next(), { w: 400, h: 104, size: 34 });
      k.add(this.nextBtn);
    }
  }

  say(pose, text) {
    this.lastSay = text;
    this.zoey.setTexture(`zoey-${pose}`); this.fitImg(this.zoey, 116);
    const b = this.bubble; b.removeAll(true);
    const t = this.txt(166, L.zoeyY, text, { fontSize: '25px', fontStyle: '700', align: 'left', wordWrap: { width: 500 } }).setOrigin(0, 0.5);
    const h = Math.max(76, t.height + 24);
    b.add([this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(148, L.zoeyY - h / 2, 544, h, 26).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(148, L.zoeyY - h / 2, 544, h, 26), t]);
  }

  pulse(obj) { if (obj) this.tweens.add({ targets: obj, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: 3, duration: 220, onComplete: () => obj.setScale(1) }); }

  armIdle() {
    const now = performance.now();
    if (this.lastInputAt) this.idleMs += Math.max(0, now - this.lastInputAt - IDLE_MS);
    this.lastInputAt = now; this.idleTimer?.remove();
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => { if (this.ended || this.phase !== 'call') return; this.idleNudges++; this.trace('idle', { n: this.idleNudges }); this.say('happy', 'No rush. Check a clue, or pick a side.'); });
  }

  /** Test hook: the reference "wise" bot's next move, through the same buttons a player taps. */
  botStep() {
    if (this.ended || !this.running || !this.cs) return false;
    if (this.recapDone) { this.recapDone(); return true; }
    if (this.busy) return false;
    if (this.phase === 'result') { this.next(); return true; }
    if (this.phase !== 'call') return false;
    const a = BOTS.wise(stateOf(this.cs));
    if (a[0] === 'check') this.doCheck(); else this.choose(a[1]);
    return true;
  }

  metrics() {
    if (this.tut) return { steps: practiceMemo.steps.length, failSafes: practiceMemo.steps.filter((s) => s?.usedFailSafe).length, flags: '' };
    const log = this.log, m = log.length ? metrics(log) : { judgementScore: 0 };
    const checksMade = log.reduce((a, e) => a + e.checks.length, 0);
    const flags = [];
    if (log.length && m.missed >= 3 && checksMade === 0) flags.push('impulsive');
    if (log.length && m.wasted >= 4) flags.push('overChecker');
    if (log.length && m.decisionAccuracy < 0.6) flags.push('againstEvidence');
    if (this.repeatAttempt) flags.push('repeatAttempt');
    const st = practiceMemo.steps.filter(Boolean);
    if (practiceMemo.done && st.some((s) => s.usedFailSafe)) flags.push('tutorialStruggle');
    const learn = {};
    if (this.firstUse != null) learn.firstUse = [this.firstUse ? 1 : 0, 1];
    if (practiceMemo.done && st.length) learn.pickup = [st.reduce((a, s) => a + (s.usedFailSafe ? 2 : Math.min(2, s.tries - 1)), 0), 2 * st.length];
    return {
      ...m, smartCalls: log.filter((e) => e.correctExAnte).length, points: this.points, checksMade, form: this.form,
      callLog: log.map((e) => `${e.id} c${e.checks.length} ${SIDE(e.choice)} t${e.tally} ${e.correctExAnte ? 'ok' : 'no'}${e.missed ? ' missed' : ''} ${e.won ? 'won' : 'lost'} ${e.points}`).join(';'),
      unluckyNext: this.unlucky ? (this.unlucky.next == null ? '' : this.unlucky.next ? 'followed' : 'strayed') : 'none',
      learn: Object.keys(learn).length ? learn : null,
      idleNudges: this.idleNudges, idleMs: Math.round(this.idleMs), flags: flags.join(','),
    };
  }

  // ---------------------------------------------------------------- how-to screenshots (standard #19b)
  stageHowTo(n) {
    this.clearCallouts(); this.busy = false; this.phase = 'call'; this.cardC.x = 0;
    const A = callsOf('A'), at = (id) => A.find((c) => c.id === id);
    const set = (id) => { this.calls = A; this.idx = A.indexOf(at(id)); this.cs = newCall(at(id)); this.counter.text.setText(`Call ${this.idx + 1} / 10`); };
    const card = { x: 0, y: L.cardY - 70, w: 720, h: L.cardH + 90 }, card2 = { ...card, h: L.cardH + 150 }, ctrl = { x: 0, y: L.checkY - 70, w: 720, h: L.optY + 130 - L.checkY + 70 };
    const msg = (i) => L.rowY + i * L.rowH;
    if (n === 0) { set('A01'); this.say('happy', 'Big calls today! Ask someone, or decide.'); this.render();
      this.callout(300, L.cardY + 80, 70, 'the call', 300, L.cardY - 38);
      this.callout(XL + 10, L.optY, 70, 'pick a side', 360, L.optY + 90); this.callout(620, L.cardY + 72, 62, 'kids it affects', 600, L.cardY - 38);
      return [card, ctrl]; }
    if (n === 1) { set('A05'); this.render();
      this.callout(620, L.cardY + 72, 62, 'kids affected', 620, L.cardY - 38);
      this.callout(92, msg(0), 30, 'messages already in', 280, L.cardY + 166, 3000, false);
      return [card2]; }
    if (n === 2) { set('A01'); this.render();
      this.callout(92, msg(0), 30, '👁 saw it: first-hand', 470, msg(0) - 58, 3000, false); this.callout(92, msg(1), 30, '👂 heard it: second-hand', 470, msg(1) + 58, 3000, false);
      this.say('happy', 'Saw it beats heard it. One 👁 outweighs one 👂.');
      return [{ x: 0, y: L.zoeyY - 60, w: 720, h: 120 }, { x: 0, y: msg(0) - 100, w: 720, h: 240 }]; }
    if (n === 3) { set('A01'); check(this.cs); this.render();
      this.callout(360, L.checkY, 60, 'who you’d ask next · its cost', 360, L.checkY + 70);
      this.callout(92, msg(2), 30, 'the answer', 560, msg(2), 3000, false); (this.callouts ||= []).push(this.txt(620, L.cardY + 160, '−2', { fontSize: '40px', color: C.red, stroke: C.white, strokeThickness: 8 }).setDepth(3001));
      return [card, { x: 0, y: L.checkY - 60, w: 720, h: 180 }]; }
    if (n === 4) { set('A04'); const e = decide(this.cs, -1); this.lastEntry = e; this.phase = 'result'; this.showResultCopy(e); this.render();
      this.say('happy', 'It was Cupcakes. Unlucky! But that was the smart call.');
      this.callout(this.badgeAt.x, this.badgeAt.y, 60, 'you’re scored on this', 360, L.checkY + 160);
      return [{ x: 0, y: L.zoeyY - 60, w: 720, h: 120 }, { x: 0, y: msg(0) - 40, w: 720, h: 3 * L.rowH + 60 }, { x: 0, y: L.checkY - 80, w: 720, h: 280 }]; }
    return null;
  }
}
