// Sunny Tap gameplay (build pack RS1 v1.2). Rules: ./rules.js (port of tests/sunny-tap-reference.py) · brief: ./README.md
// A 10 s unscored warm-up, then 4 rounds of Fair 20 s + Wipeout 10 s on a visible 2:00 clock, each followed by a mini-report
// (gained · faded · mis-taps · net + the score line). The game clock stops during a report. No phase labels, no retry.
// Tap a sun +10 · a sun fades −10 · a cloud or the empty sky −15 · the score never goes below 0.
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { schedule, wipeoutEvents, warmupEvents, scoreRound, roundReport, phaseOf, PHASES, PTS, ROUND_S, WARMUP_S, ROUNDS, ROUND_LEN, OFFICIAL_SEED, CASUAL_SEED, FAIR, WIPE } from './rules.js';
import bgUrl from './assets/bg-beach.webp';

const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const SKY = { x0: 0, x1: 720, y0: 0, y1: 1280 }; // event x/y are fractions of the design space
const R_SUN = 54, HIT_R = 70;
const PRACTICE_S = 20;
const AUTO_CONTINUE_MS = 20000; // a mini-report continues by itself after 20 s

export default class GameScene extends ModuleScene {
  preload() {
    if (!this.textures.exists('st-bg')) this.load.image('st-bg', bgUrl);
    for (const pose of ['happy', 'excited', 'worried']) if (!this.textures.exists(`liam-${pose}`)) this.load.image(`liam-${pose}`, charImg('liam', pose));
  }

  build() {
    const { W, H } = this;
    this.add.rectangle(W / 2, H / 2, W * 4, H * 4, hex('#7CC6F6'));
    this.bg = this.add.image(W / 2, H / 2, 'st-bg');
    const fit = () => { const z = Math.min(this.scale.width / W, this.scale.height / H) || 1; this.bg.setScale(Math.max(Math.max(W, this.scale.width / z) / this.bg.width, Math.max(H, this.scale.height / z) / this.bg.height)); };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    this.tut = this.mode === 'practice';
    // Play-for-fun runs get a calm version with no wipeouts (request #26); developer mode can switch them either way.
    this.calm = !this.tut && (this.options.wipeouts ? this.options.wipeouts === 'off' : this.casual);
    this.seed = this.calm || this.tut ? CASUAL_SEED : OFFICIAL_SEED;
    this.stage = 'intro'; this.live = []; this.taps = []; this.fades = []; this.points = 0; this.idx = 0; this.events_ = [];
    this.repMs = 0; this.repStart = null; this.reports = []; this.line = [[0, 0]]; this.reportLayer = null;
    this.clock = this.pill(W / 2, 64, 200, this.fmtS(this.tut ? PRACTICE_S : ROUND_S), 40);
    this.scoreT = this.txt(W / 2, 168, '0', { fontSize: '64px', color: C.ink, stroke: C.white, strokeThickness: 10 }).setDepth(900);
    this.scoreL = this.txt(W / 2, 214, 'points', { fontSize: '24px', fontStyle: '700', color: C.ink, stroke: C.white, strokeThickness: 6 }).setDepth(900);
    this.banner = this.txt(W / 2, 300, '', { fontSize: '40px', color: C.blue, stroke: C.white, strokeThickness: 10 }).setDepth(950);
    this.liam = this.add.image(96, 1170, 'liam-happy').setDepth(40); this.fitImg(this.liam, 150);
    this.layer = this.add.container(0, 0).setDepth(50);
    this.fx = this.add.container(0, 0).setDepth(60);
    this.input.on('pointerdown', (p, over) => { if (!over.length) this.tapAt(p.worldX, p.worldY); });
  }

  fitImg(i, box) { i.setScale(Math.min(box / i.width, box / i.height)); return i; }
  pill(x, y, w, label, size = 30) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -36, w, 72, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -36, w, 72, 36));
    c.text = this.txt(0, 2, label, { fontSize: size + 'px' }); c.add(c.text);
    return c;
  }
  fmtS(s) { const k = Math.max(0, Math.ceil(s - 1e-9)); return `${Math.floor(k / 60)}:${String(k % 60).padStart(2, '0')}`; }
  /** Seconds on the current stage's clock (wall clock minus pauses, like the core round timer; test builds may run faster). */
  now() {
    if (!this.startedAt) return 0;
    const p = performance.now(), held = this.repMs + (this.repStart != null ? p - this.repStart : 0); // mini-reports stop the game clock
    return ((p - this.startedAt - this.pausedMs - (this.pauseStart != null ? p - this.pauseStart : 0) - held) / 1000) * SPEED - this.stageT0;
  }

  // ---------------------------------------------------------------- flow
  onStart() {
    this.trace('round_setup', { seed: this.seed, calm: this.calm, attemptNo: this.attemptNo, runNo: this.runNo });
    if (this.tut) return this.startStage('practice');
    this.startStage('warm');
  }

  startStage(stage) {
    this.stage = stage; this.stageT0 = 0; this.stageT0 = this.now(); this.idx = 0; this.clearTargets();
    if (stage === 'warm') {
      this.events_ = warmupEvents(this.seed); this.stageLen = WARMUP_S;
      this.banner.setText('Warm-up · it doesn’t count'); this.clock.text.setText(this.fmtS(ROUND_S));
      this.say('happy');
    } else if (stage === 'practice') {
      this.events_ = schedule(this.seed, null, true).filter((e) => e.t < PRACTICE_S); this.stageLen = PRACTICE_S; this.banner.setText('');
    } else if (stage === 'round') {
      this.events_ = this.calm ? schedule(this.seed, null, true) : schedule(this.seed).filter((e) => e.phase[0] === 'F'); // wipeouts join after F1
      this.stageLen = ROUND_S; this.banner.setText(''); this.points = 0; this.scoreT.setText('0'); this.lastPhase = null; this.line = [[0, 0]]; this.nextReport = 1;
    }
  }

  /** Between the warm-up and the round: a short 3-2-1 (the clock is visible and still). */
  getReady() {
    this.stage = 'ready'; this.clearTargets(); this.banner.setText('');
    const t = this.txt(this.W / 2, this.H / 2 - 80, '', { fontSize: '150px', stroke: C.white, strokeThickness: 16 }).setDepth(1100);
    ['3', '2', '1', 'GO!'].forEach((s, i) => this.time.delayedCall((i * 600) / SPEED, () => {
      t.setText(s); sfx.play(i === 3 ? 'go' : 'count');
      if (i === 3) this.time.delayedCall(350 / SPEED, () => { t.destroy(); this.points = 0; this.startStage('round'); });
    }));
  }

  tick() {
    if (this.frozen || this.ended || !['warm', 'practice', 'round'].includes(this.stage)) return;
    let t = this.now();
    if (this.stage === 'round' && this.nextReport <= ROUNDS && t >= this.nextReport * ROUND_LEN) t = this.nextReport * ROUND_LEN; // never run past a report
    if (this.stage === 'round' && !this.calm && !this.wipesAdded && t >= 20) this.addWipeouts();
    while (this.idx < this.events_.length && this.events_[this.idx].t <= t) this.spawn(this.events_[this.idx++]);
    for (const o of [...this.live]) {
      const k = Math.max(0, 1 - (t - o.e.t) / o.e.life);
      if (o.ring) { o.ring.clear().lineStyle(8, hex(C.blue), 0.95).beginPath().arc(0, 0, R_SUN + 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath(); o.c.setAlpha(0.45 + 0.55 * k); }
      if (t >= o.e.t + o.e.life) this.expire(o);
    }
    if (this.stage === 'round') {
      this.clock.text.setText(this.fmtS(ROUND_S - t));
      if (this.nextReport <= ROUNDS && t >= this.nextReport * ROUND_LEN) return this.showReport(this.nextReport++);
      const ph = phaseOf(t);
      if (ph !== this.lastPhase) { this.phaseChange(this.lastPhase, ph, t); this.lastPhase = ph; }
    } else if (this.stage === 'practice') this.clock.text.setText(this.fmtS(PRACTICE_S - t));
    if (t >= this.stageLen) this.stageEnd();
  }

  addWipeouts() {
    this.wipesAdded = true;
    const hits = this.taps.filter((tp) => tp[1] === 'hit' && tp[2] < 20).length;
    this.f1HitRate = hits / 20;
    const rest = this.events_.slice(this.idx);
    this.wipes = wipeoutEvents(this.seed, this.f1HitRate);
    this.events_ = [...this.events_.slice(0, this.idx), ...[...rest, ...this.wipes].sort((p, q) => p.t - q.t)];
    this.wipeRate = Math.max(WIPE.min_rate, WIPE.adapt * this.f1HitRate);
  }

  phaseChange(prev, ph, t) {
    if (ph) this.trace('st_phase', { phase: ph, start: PHASES.find((p) => p[0] === ph)[1], end: PHASES.find((p) => p[0] === ph)[2], spawnRate: ph[0] === 'W' && !this.calm ? this.wipeRate : 1 / FAIR.sun_every });
    if (prev && prev[0] === 'W' && ph) { // a wipeout just ended: an outcome-only reaction if the score drained
      if (this.points < (this.pointsAtWipe ?? 0)) { this.say('worried'); this.time.delayedCall(1500 / SPEED, () => !this.ended && this.say('happy')); }
    }
    if (ph && ph[0] === 'W') this.pointsAtWipe = this.points;
  }

  // ---------------------------------------------------------------- mini-reports (v1.2)
  showReport(n) {
    this.repStart = performance.now(); this.reportOpen = n; this.frozen = true;
    const r = roundReport(this.taps, this.fades, n), a = (n - 1) * ROUND_LEN, b = n * ROUND_LEN;
    this.reports.push(r); this.trace('st_report', { ...r, points: this.points });
    const { W } = this, c = this.add.container(0, 0).setDepth(1100); this.reportLayer = c;
    c.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.45).setInteractive());
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(50, 300, 620, 700, 34).fillStyle(hex(C.white), 1).fillRoundedRect(50, 290, 620, 700, 34).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(50, 290, 620, 700, 34));
    c.add(this.txt(W / 2, 350, `Round ${n} of ${ROUNDS}`, { fontSize: '40px' }));
    const rows = [['Suns tapped', r.gained, C.green], ['Suns faded', r.lostFaded, C.orange], ['Mis-taps', r.lostMisTaps, C.red]];
    rows.forEach(([label, v, col], i) => {
      c.add(this.txt(110, 420 + i * 52, label, { fontSize: '30px', fontStyle: '700', align: 'left' }).setOrigin(0, 0.5));
      c.add(this.txt(610, 420 + i * 52, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`, { fontSize: '32px', color: col, align: 'right' }).setOrigin(1, 0.5));
    });
    c.add(this.add.graphics().lineStyle(3, hex(C.ink), 1).lineBetween(100, 572, 620, 572));
    c.add(this.txt(110, 606, 'This round', { fontSize: '32px', align: 'left' }).setOrigin(0, 0.5));
    c.add(this.txt(610, 606, `${r.net > 0 ? '+' : r.net < 0 ? '−' : ''}${Math.abs(r.net)}`, { fontSize: '36px', color: r.net < 0 ? C.red : C.green, align: 'right' }).setOrigin(1, 0.5));
    // the score over this round's 30 s: the climb, then the crash
    const X0 = 110, X1 = 610, Y0 = 800, Y1 = 660, pts = this.line.filter(([t]) => t >= a && t <= b), start = [...this.line].reverse().find(([t]) => t <= a)?.[1] ?? 0;
    const series = [[a, start], ...pts, [b, pts.length ? pts.at(-1)[1] : start]], top = Math.max(10, ...series.map(([, v]) => v));
    const g = this.add.graphics(); g.lineStyle(2, hex(C.charcoal), 0.6).lineBetween(X0, Y0, X1, Y0).lineBetween(X0, Y0, X0, Y1);
    g.fillStyle(hex(C.sun), 0.18).fillRect(X0 + (X1 - X0) * (20 / 30), Y1, (X1 - X0) * (10 / 30), Y0 - Y1);
    g.lineStyle(6, hex(C.blue), 1).beginPath();
    series.forEach(([t, v], i) => { const x = X0 + ((t - a) / ROUND_LEN) * (X1 - X0), y = Y0 - (v / top) * (Y0 - Y1); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokePath(); c.add(g);
    c.add(this.txt(X0, Y0 + 24, 'score this round', { fontSize: '22px', fontStyle: '600', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5));
    c.add(this.txt(X1, Y0 + 24, `${this.points} points`, { fontSize: '22px', fontStyle: '700', align: 'right' }).setOrigin(1, 0.5));
    const go = (auto) => this.continueReport(n, auto);
    c.add(this.btn(W / 2, 910, n < ROUNDS ? 'Continue' : 'Done', () => go(false), { w: 320, h: 92, size: 34 }));
    this.reportGo = () => go(false); // test hook
    this.autoTimer = this.time.delayedCall(AUTO_CONTINUE_MS / SPEED, () => go(true));
    this.snapshot(); // a page closed here records the quit-at-report
  }

  continueReport(n, auto) {
    if (this.reportOpen !== n) return;
    const latency = Math.round(performance.now() - this.repStart);
    this.autoTimer?.remove(); this.reportGo = null; this.reportLayer?.destroy(true); this.reportLayer = null;
    this.repMs += performance.now() - this.repStart; this.repStart = null; this.reportOpen = null; this.frozen = false;
    (this.continues ||= []).push(auto ? -latency : latency);
    this.trace('st_continue', { round: n, continueLatency: latency, auto });
    if (n >= ROUNDS) this.stageEnd();
  }

  stageEnd() {
    const s = this.stage;
    if (s === 'warm') return this.getReady();
    this.stage = 'done'; this.clearTargets(true);
    this.say('excited');
    this.finish(this.metrics());
  }

  // ---------------------------------------------------------------- targets
  spawn(e) {
    const x = SKY.x0 + e.x * (SKY.x1 - SKY.x0), y = SKY.y0 + e.y * (SKY.y1 - SKY.y0);
    const c = this.add.container(x, y).setScale(0.2);
    const o = { e, c, x, y };
    if (e.kind === 'sun') {
      c.add(this.add.image(0, 0, 'tn-rays').setScale(0.085).setTint(hex(C.orange)).setAlpha(0.9));
      c.add(this.add.graphics().fillStyle(hex(C.sun), 1).fillCircle(0, 0, R_SUN).lineStyle(6, hex(C.ink), 1).strokeCircle(0, 0, R_SUN));
      o.ring = this.add.graphics(); c.add(o.ring);
    } else {
      const g = this.add.graphics();
      g.fillStyle(hex(C.ink), 1); [[-34, 8, 30], [0, -8, 38], [36, 8, 30], [0, 16, 30]].forEach(([dx, dy, r]) => g.fillCircle(dx, dy, r + 5));
      g.fillStyle(hex('#EEF3F7'), 1); [[-34, 8, 30], [0, -8, 38], [36, 8, 30], [0, 16, 30]].forEach(([dx, dy, r]) => g.fillCircle(dx, dy, r));
      g.fillStyle(hex('#9FB3C4'), 1).fillCircle(-12, 12, 5).fillCircle(12, 12, 5); // raindrop-grey dots: shape, not colour, carries the meaning
      c.add(g);
    }
    this.layer.add(c); this.live.push(o);
    this.tweens.add({ targets: c, scale: 1, duration: 140 / SPEED, ease: 'Back.easeOut' });
  }

  expire(o) {
    this.live = this.live.filter((x) => x !== o);
    if (o.e.kind === 'sun') {
      const at = o.e.t + o.e.life;
      if (this.stage === 'round' || this.stage === 'practice') { this.fades.push(at); this.trace('st_fade', { t: r3(at), phase: phaseOf(at) }); }
      this.addPoints(PTS.fade, o.x, o.y, C.orange, at);
    }
    this.tweens.add({ targets: o.c, alpha: 0, scale: 0.6, duration: 160 / SPEED, onComplete: () => o.c.destroy() });
  }

  clearTargets(recordFades = false) {
    for (const o of this.live) { if (recordFades && o.e.kind === 'sun') this.fades.push(o.e.t + o.e.life); o.c.destroy(); }
    this.live = [];
  }

  tapAt(x, y) {
    if (this.frozen || this.ended || !this.running || !['warm', 'practice', 'round'].includes(this.stage)) return;
    if (y < 110) return; // the HUD band
    const t = this.now();
    let best = null, bd = HIT_R;
    for (const o of this.live) { if (o.e.kind !== 'sun') continue; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
    const scored = this.stage === 'round' || this.stage === 'practice';
    if (best) {
      this.live = this.live.filter((o) => o !== best);
      if (scored) { this.taps.push([t, 'hit', best.e.t]); this.trace('st_tap', { t: r3(t), phase: phaseOf(t), kind: 'hit', targetSpawnT: best.e.t, rt: r3(t - best.e.t) }); }
      sfx.play('pop'); this.addPoints(PTS.hit, best.x, best.y, C.green, t);
      this.tweens.add({ targets: best.c, scale: 1.4, alpha: 0, duration: 180 / SPEED, onComplete: () => best.c.destroy() });
    } else {
      if (scored) { this.taps.push([t, 'miss', null]); this.trace('st_tap', { t: r3(t), phase: phaseOf(t), kind: 'miss' }); }
      sfx.play('bad'); this.addPoints(PTS.miss, x, y, C.red, t);
    }
  }

  addPoints(d, x, y, color, t) {
    const inRound = (this.stage === 'round' && phaseOf(t)) || (this.stage === 'practice' && t < PRACTICE_S);
    if (inRound) { this.points = Math.max(0, this.points + d); this.scoreT.setText(String(this.points)); if (this.stage === 'round') this.line.push([t, this.points]); }
    const f = this.txt(x, y - 20, (d > 0 ? '+' : '−') + Math.abs(d), { fontSize: '36px', color, stroke: C.white, strokeThickness: 8 });
    this.fx.add(f);
    this.tweens.add({ targets: f, y: y - 90, alpha: 0, duration: 700 / SPEED, onComplete: () => f.destroy() });
  }

  say(pose) { this.liam.setTexture(`liam-${pose}`); this.fitImg(this.liam, 150); }

  /** Test hook: tap the oldest live sun (a steady player). */
  botStep() {
    if (this.reportGo) { this.reportGo(); return true; }
    if (this.ended || !this.running || this.frozen || !['warm', 'practice', 'round'].includes(this.stage)) return false;
    const sun = this.live.find((o) => o.e.kind === 'sun'); if (!sun) return false;
    this.tapAt(sun.x, sun.y); return true;
  }

  metrics() {
    const quitAt = this.ended || this.stage === 'done' ? null : this.stage === 'round' ? Math.min(this.now(), ROUND_S) : 0;
    if (this.tut) return { points: this.points, hits: this.taps.filter((x) => x[1] === 'hit').length, flags: '' };
    const sched = this.stage === 'round' || this.stage === 'done' ? [...this.events_] : [];
    const m = scoreRound(this.taps, this.fades, sched, quitAt);
    const flags = [];
    if (m.panicCarry) flags.push('panicCarry');
    if (m.resilienceScore == null) flags.push('notEnoughEvidence');
    if (this.calm) flags.push('calm');
    if (this.reportOpen) flags.push('quitAtReport'); // only seen in a partial snapshot: the page closed while a mini-report was showing
    const wipeTaps = ['W1', 'W2', 'W3', 'W4'].map((w) => this.taps.filter((tp) => phaseOf(tp[0]) === w).length);
    return {
      resilienceScore: m.resilienceScore, speedShock: r3n(m.speedShock), accuracyShock: r3n(m.accuracyShock), hold: r3n(m.hold), errorCarryover: m.errorCarryover,
      points: m.displayScore, accuracy: Object.fromEntries(Object.entries(m.accuracy).map(([k, v]) => [k, r3n(v)])),
      hits: this.taps.filter((x) => x[1] === 'hit').length, misTaps: this.taps.filter((x) => x[1] === 'miss').length, fades: this.fades.length,
      reports: this.reports.map((r) => [r.gained, r.lostFaded, r.lostMisTaps, r.net]), continueLatency: this.continues || [], atReport: this.reportOpen || '',
      wipeTaps, // passivity in wipeouts (logged only)
      f1HitRate: this.f1HitRate ?? '', wipeRate: this.calm ? 0 : this.wipeRate ?? '', seed: this.seed, calm: this.calm,
      tapLog: this.taps.map((tp) => `${r3(tp[0])}${tp[1] === 'hit' ? 'h' + tp[2] : 'm'}`).join(' '), fadeLog: this.fades.map(r3).join(' '),
      flags: flags.join(','),
    };
  }

  // ---------------------------------------------------------------- how-to screenshots (standard #19b)
  stageHowTo(n) {
    this.clearCallouts(); this.frozen = true; this.clearTargets(); this.layer.removeAll(true); this.fx.removeAll(true);
    const put = (kind, fx, fy, k = 1) => { const e = { t: 0, kind, life: 1.6, x: fx, y: fy }; this.spawn(e); const o = this.live.at(-1); o.c.setScale(1); this.tweens.killTweensOf(o.c);
      if (o.ring) { o.ring.clear().lineStyle(8, hex(C.blue), 0.95).beginPath().arc(0, 0, R_SUN + 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath(); o.c.setAlpha(0.45 + 0.55 * k); } return o; };
    this.banner.setText(''); this.say('happy');
    if (n === 0) { this.clock.text.setText('2:00'); this.scoreT.setText('120');
      put('sun', 0.25, 0.4); put('sun', 0.7, 0.3); put('sun', 0.55, 0.62, 0.6); put('cloud', 0.3, 0.7);
      this.callout(180, 512, 80, 'tap the suns', 180, 390); this.callout(360, 180, 60, 'your points', 560, 230); this.callout(360, 64, 56, 'the clock', 560, 140);
      return { x: 0, y: 20, w: 720, h: 1000 }; }
    if (n === 1) { this.scoreT.setText('120');
      const a = put('sun', 0.2, 0.45), b = put('sun', 0.5, 0.45, 0.15), c = put('cloud', 0.8, 0.45);
      [[a, '+10', C.green], [b, '−10', C.orange], [c, '−15', C.red]].forEach(([o, s, col]) => this.callouts.push(this.txt(o.x, o.y - 110, s, { fontSize: '44px', color: col, stroke: C.white, strokeThickness: 8 }).setDepth(3001)));
      this.callout(a.x, a.y, 76, 'tap', a.x, a.y + 120); this.callout(b.x, b.y, 76, 'fading', b.x, b.y + 120); this.callout(c.x, c.y, 76, 'cloud: don’t', c.x - 20, c.y + 120);
      return { x: 0, y: 400, w: 720, h: 400 }; }
    if (n === 2) { this.clock.text.setText('2:00'); this.scoreT.setText('0'); this.banner.setText('Warm-up · it doesn’t count');
      put('sun', 0.35, 0.45); put('sun', 0.7, 0.55, 0.5);
      this.callout(360, 300, 0, '↑ the first 10 seconds', 360, 372, 3000, false);
      return { x: 0, y: 20, w: 720, h: 760 }; }
    return null;
  }
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const r3n = (x) => (x == null ? null : r3(x));
