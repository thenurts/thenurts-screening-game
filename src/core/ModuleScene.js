// Base class for every minigame's gameplay scene (spec §5). Modules extend this and implement:
//   build()            – create the world (use this.rand for anything random)
//   onStart()          – called after the 3-2-1 countdown
//   metrics()          – return the metrics object when time runs out
// and may call this.finish(metrics) early. Core owns timers, HUD, logging, quit and hand-off.
import Phaser from 'phaser';
import { C, hex, FONT, W, H } from './theme.js';
import { log } from './logger.js';
import { sfx } from './sfx.js';
import { api } from './api.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class ModuleScene extends Phaser.Scene {
  init(data) {
    this.manifest = data.manifest;
    this.mode = data.mode; // 'practice' | 'real'
    this.roundNo = data.roundNo;
    this.runNo = data.runNo;
    this.seed = data.seed >>> 0;
    this.onDone = data.onDone;
    this.rand = mulberry32(this.seed || 1);
    this.W = W; this.H = H;
    this.duration = (this.mode === 'practice' ? this.manifest.practice.durationSec : this.manifest.round.durationSec) * 1000;
    this.elapsed = 0; this.running = false; this.ended = false; this.hiddenAt = null;
  }

  // ---- helpers for modules ----
  randInt(a, b) { return a + Math.floor(this.rand() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  log(name, value) { log(this.manifest.id, 'g:' + name, value, this.ctx()); }
  ctx() { return { roundNo: this.roundNo, moduleVersion: this.manifest.version }; }
  get remainingMs() { return Math.max(0, this.duration - this.elapsed); }

  txt(x, y, str, style = {}) {
    const t = this.add.text(x, y, str, { fontFamily: FONT.body, fontSize: '36px', fontStyle: '800', color: C.ink, align: 'center', ...style });
    t.setResolution(Math.min(3, Math.max(1, this.zoom || 1)));
    return t.setOrigin(0.5);
  }

  /** Chunky brand button in design space. */
  btn(x, y, label, cb, { w = 300, h = 88, fill = C.sun, size = 32 } = {}) {
    const c = this.add.container(x, y);
    const shadow = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, h / 2);
    const face = this.add.graphics().fillStyle(hex(fill), 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    const t = this.txt(0, 0, label, { fontSize: size + 'px' });
    const top = this.add.container(0, 0, [face, t]);
    c.add([shadow, top]);
    c.setSize(w, h + 8).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { top.y = 6; sfx.play('click'); });
    c.on('pointerout', () => { top.y = 0; });
    c.on('pointerup', () => { top.y = 0; cb(); });
    return c;
  }

  pop(obj, s = 1.15, ms = 120) { this.tweens.add({ targets: obj, scaleX: obj.scaleX * s, scaleY: obj.scaleY / s * 1.02, yoyo: true, duration: ms, ease: 'Quad.easeOut' }); }
  shake(ms = 160, k = 0.008) { this.cameras.main.shake(ms, k); }
  floatText(x, y, str, color = C.ink) {
    const t = this.txt(x, y, str, { fontSize: '40px', color, stroke: C.white, strokeThickness: 8 });
    this.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }
  burst(x, y, colors = [C.sun, C.orange, C.teal]) {
    const e = this.add.particles(x, y, 'tn-dot', { speed: { min: 180, max: 480 }, lifespan: 600, scale: { start: 0.35, end: 0 }, tint: colors.map(hex), emitting: false });
    e.explode(18); this.time.delayedCall(700, () => e.destroy());
  }

  // ---- lifecycle ----
  create() {
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);
    this.events.once('shutdown', () => this.cleanup());
    this.build?.();
    this.makeHud();
    this.onVis = () => this.visibility();
    this.onHide = () => this.pageHide();
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('pagehide', this.onHide);
    this.countdown();
  }

  fitCamera() {
    const { width: w, height: h } = this.scale;
    this.zoom = Math.min(w / W, h / H);
    this.cameras.main.setZoom(this.zoom).centerOn(W / 2, H / 2);
  }

  makeHud() {
    const d = 1000;
    this.hud = this.add.container(0, 0).setDepth(d);
    const pill = this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(W / 2 - 110, 26, 220, 76, 38).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(W / 2 - 110, 26, 220, 76, 38);
    this.timerText = this.txt(W / 2, 64, this.fmt(this.duration), { fontSize: '40px' });
    this.timerBar = this.add.graphics();
    this.hud.add([pill, this.timerText, this.timerBar]);
    if (this.mode === 'practice') {
      const b = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(W / 2 - 90, 112, 180, 40, 20);
      this.hud.add([b, this.txt(W / 2, 132, 'PRACTICE', { fontSize: '22px', color: C.sun })]);
    }
    const quit = this.roundIcon(58, 64, '✕', () => this.askQuit());
    this.muteBtn = this.roundIcon(W - 58, 64, sfx.muted ? '🔇' : '🔊', () => { sfx.toggle(); this.muteBtn.label.setText(sfx.muted ? '🔇' : '🔊'); });
    this.hud.add([quit, this.muteBtn]);
  }

  roundIcon(x, y, glyph, cb) {
    const c = this.add.container(x, y);
    const g = this.add.graphics().fillStyle(hex(C.white), 1).fillCircle(0, 0, 36).lineStyle(5, hex(C.ink), 1).strokeCircle(0, 0, 36);
    c.label = this.txt(0, 2, glyph, { fontSize: '30px' });
    c.add([g, c.label]).setSize(80, 80).setInteractive({ useHandCursor: true }).on('pointerup', () => { sfx.play('click'); cb(); });
    return c;
  }

  fmt(ms) { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  countdown() {
    const steps = ['3', '2', '1', 'GO!'];
    const t = this.txt(W / 2, H / 2, '', { fontSize: '200px', color: C.ink, stroke: C.white, strokeThickness: 18 }).setDepth(1100);
    steps.forEach((s, i) => this.time.delayedCall(i * 650, () => {
      t.setText(s).setScale(1.6).setAlpha(1);
      sfx.play(i === 3 ? 'go' : 'count');
      this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
      if (i === 3) this.tweens.add({ targets: t, alpha: 0, scale: 1.4, delay: 350, duration: 250, onComplete: () => { t.destroy(); this.begin(); } });
    }));
  }

  begin() { this.running = true; this.startedAt = performance.now(); this.onStart?.(); }

  update(time, dt) {
    if (!this.running || this.ended) return;
    this.elapsed += dt;
    this.timerText.setText(this.fmt(this.remainingMs));
    const k = this.remainingMs / this.duration;
    this.timerBar.clear().fillStyle(hex(k < 0.2 ? C.red : C.sun), 1).fillRoundedRect(W / 2 - 80, 88, 160 * k, 8, 4);
    if (k < 0.2 && Math.ceil(this.remainingMs / 1000) !== this._lastTick) { this._lastTick = Math.ceil(this.remainingMs / 1000); sfx.play('tick'); this.pop(this.timerText, 1.2); }
    this.tick?.(dt);
    if (this.remainingMs <= 0) this.finish(this.metrics());
  }

  /** End the round. Shows the end beat, then hands metrics to core. */
  finish(metrics) {
    if (this.ended) return;
    this.ended = true; this.running = false;
    this.input.enabled = false;
    const banner = this.txt(W / 2, H / 2, this.remainingMs <= 0 ? "TIME!" : 'DONE!', { fontSize: '150px', stroke: C.white, strokeThickness: 18 }).setDepth(1100).setScale(0.2);
    sfx.play('fanfare');
    this.tweens.add({ targets: banner, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.time.delayedCall(1300, () => this.onDone({ status: 'completed', metrics, elapsedMs: Math.round(this.elapsed) }));
  }

  askQuit() {
    if (this.ended) return;
    this.running = false;
    const layer = this.add.container(0, 0).setDepth(1200);
    const dim = this.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x0b0b0b, 0.55).setInteractive();
    const panel = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(70, 420 + 10, 580, 420, 36)
      .fillStyle(hex(C.white), 1).fillRoundedRect(70, 420, 580, 420, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(70, 420, 580, 420, 36);
    const warn = this.mode === 'real' ? 'This attempt will be recorded\nas not finished.' : 'Your practice will end.';
    layer.add([dim, panel, this.txt(W / 2, 500, 'Leave this round?', { fontSize: '42px' }), this.txt(W / 2, 590, warn, { fontSize: '28px', fontStyle: '600', color: C.charcoal }),
      this.btn(W / 2, 700, 'Keep playing', () => { layer.destroy(); this.running = true; }, { w: 460 }),
      this.btn(W / 2, 800, 'Leave', () => { this.ended = true; this.onDone({ status: 'quit', elapsedMs: Math.round(this.elapsed) }); }, { w: 460, fill: C.white, h: 72, size: 28 })]);
    this.tweens.add({ targets: layer, alpha: { from: 0, to: 1 }, duration: 150 });
  }

  visibility() {
    if (this.ended) return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = performance.now();
      log(this.manifest.id, 'app_hidden', { elapsedMs: Math.round(this.elapsed) }, this.ctx());
      this.scene.pause();
    } else if (this.hiddenAt) {
      log(this.manifest.id, 'app_visible', { awayMs: Math.round(performance.now() - this.hiddenAt) }, this.ctx());
      this.hiddenAt = null;
      this.scene.resume();
    }
  }

  pageHide() {
    if (this.ended) return;
    log(this.manifest.id, 'round_abandon_pending', { elapsedMs: Math.round(this.elapsed), mode: this.mode }, this.ctx());
    api.beacon('roundEnd', { module: this.manifest.id, roundNo: this.roundNo, status: 'abandoned', metrics: null });
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('pagehide', this.onHide);
    this.scale.off('resize', this.fitCamera, this);
  }
}
