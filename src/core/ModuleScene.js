// Base class for every minigame's gameplay scene (spec §5). Modules extend this and implement:
//   build()            – create the world (use this.rand for anything random)
//   onStart()          – called after the 3-2-1 countdown
//   metrics()          – return the metrics object when time runs out
// and may call this.finish(metrics) early. Core owns timers, HUD, logging, quit and hand-off.
import Phaser from 'phaser';
import { C, hex, FONT, W, H } from './theme.js';
import { log, trace, setPartial, flushBeacon } from './logger.js';
import { sfx } from './sfx.js';
import { api } from './api.js';
import { howToModal } from './screens/game.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class ModuleScene extends Phaser.Scene {
  init(data) {
    this.manifest = data.manifest;
    this.mode = data.mode; // 'practice' | 'real'
    this.roundNo = data.roundNo; // null until the server numbers it (the round starts without waiting)
    this.roundUid = data.roundUid;
    this.playerKey = data.playerKey || ''; // stable per player (for counterbalancing, e.g. button side)
    this.attemptNo = data.attemptNo || 1;  // real attempts at this game in this run, counted on this device
    this.options = data.options || {};     // per-module options (manifest.devOptions), empty in normal play
    this.casual = !!data.casual;           // "Just play for fun": never the official content, no one-shot surprises (request #26)
    this.showTimer = (this.mode === 'practice' ? this.manifest.practice : this.manifest.round).showTimer !== false;
    this.runNo = data.runNo;
    this.seed = data.seed >>> 0;
    this.onDone = data.onDone;
    this.rand = mulberry32(this.seed || 1);
    this.W = W; this.H = H;
    const sec = (this.mode === 'practice' ? this.manifest.practice : this.manifest.round).durationSec;
    this.duration = sec ? sec * 1000 : Infinity; // durationSec: null = no round cap (the game ends itself)
    this.elapsed = 0; this.running = false; this.ended = false; this.hiddenAt = null;
  }

  // ---- helpers for modules ----
  randInt(a, b) { return a + Math.floor(this.rand() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  /**
   * Tier B: a decision event that gets its own Interactions row, but ONLY if listed in manifest.logEvents
   * (each with a stated purpose in the module brief). Anything else is downgraded to the round trace.
   */
  log(name, value) {
    if ((this.manifest.logEvents || []).includes(name)) log(this.manifest.id, 'g:' + name, value, this.ctx());
    else this.trace(name, value);
  }
  /** Tier C: fine detail, appended to the round's single live RoundTraces row as [ms, name, value]. */
  trace(name, value) { trace(this.roundUid, value === undefined ? [Math.round(this.elapsed), name] : [Math.round(this.elapsed), name, value]); }
  ctx() { return { roundNo: this.roundNo, roundUid: this.roundUid, moduleVersion: this.manifest.version }; }
  snapshot() { try { setPartial(this.roundUid, this.metrics?.() ?? null, this.elapsed); } catch { /* module not ready */ } }
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
    if (this.showTimer) { // games without a visible clock (decision budget) still have a hidden time cap
      const pill = this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(W / 2 - 110, 26, 220, 76, 38).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(W / 2 - 110, 26, 220, 76, 38);
      this.timerText = this.txt(W / 2, 64, this.fmt(this.duration), { fontSize: '40px' });
      this.timerBar = this.add.graphics();
      this.hud.add([pill, this.timerText, this.timerBar]);
    }
    if (this.mode === 'practice') {
      const b = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(W / 2 - 90, 112, 180, 40, 20);
      this.hud.add([b, this.txt(W / 2, 132, 'PRACTICE', { fontSize: '22px', color: C.sun })]);
    }
    const quit = this.roundIcon(58, 64, '✕', () => this.askQuit());
    this.muteBtn = this.roundIcon(W - 58, 64, sfx.muted ? '🔇' : '🔊', () => { sfx.toggle(); this.muteBtn.label.setText(sfx.muted ? '🔇' : '🔊'); });
    this.hud.add([quit, this.muteBtn]);
    // Suite standard #19g: a ? button in play reopens the key how-to cards (manifest.helpCards, default all)
    if (this.manifest.howTo?.length) { this.helpBtn = this.roundIcon(W - 150, 64, '?', () => this.openHowTo()); this.hud.add(this.helpBtn); }
  }

  openHowTo() {
    if (this.ended || this.helpOpen) return;
    this.helpOpen = true; this.trace('help_open');
    const wasRunning = this.running; this.running = false; this.pauseClock(); this.input.enabled = false;
    howToModal(this.manifest, document.getElementById('tn-ui'), { pages: this.manifest.helpCards, where: 'round',
      onClose: () => { this.helpOpen = false; this.input.enabled = true; this.resumeClock(); this.running = wasRunning && !this.ended; this.trace('help_close'); } });
  }

  /** How-to screenshots (standard #19b): an amber ring + a label, drawn on the real UI. Returns the objects for cleanup. */
  callout(x, y, r, label, lx = x, ly = y - r - 50, depth = 3000, line = true) {
    const g = this.add.graphics().setDepth(depth);
    g.lineStyle(8, hex(C.amber), 1).strokeCircle(x, y, r);
    const t = this.txt(lx, ly, label, { fontSize: '28px', color: C.ink }).setDepth(depth + 1);
    const pad = 14, bw = t.width + pad * 2, bh = t.height + pad;
    const bg = this.add.graphics().setDepth(depth).fillStyle(hex(C.sun), 1).fillRoundedRect(lx - bw / 2, ly - bh / 2, bw, bh, bh / 2).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(lx - bw / 2, ly - bh / 2, bw, bh, bh / 2);
    // a short pointer from the label towards the ring
    const ang = Math.atan2(y - ly, x - lx), d = Math.hypot(x - lx, y - ly);
    if (line && d > r + bh) g.lineStyle(6, hex(C.ink), 1).lineBetween(lx + Math.cos(ang) * (bh / 2 + 4), ly + Math.sin(ang) * (bh / 2 + 4), x - Math.cos(ang) * (r + 4), y - Math.sin(ang) * (r + 4));
    (this.callouts ||= []).push(g, bg, t);
    return [g, bg, t];
  }
  clearCallouts() { (this.callouts || []).forEach((o) => o.destroy()); this.callouts = []; }

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

  // Round time is wall-clock (minus pauses), not summed frame deltas: Phaser caps dt on slow frames, which
  // would make the timer run slow on low-end phones and give those candidates extra time.
  begin() { this.running = true; this.startedAt = performance.now(); this.pausedMs = 0; this.pauseStart = null; this.onStart?.(); }
  pauseClock() { if (this.startedAt && this.pauseStart == null) this.pauseStart = performance.now(); }
  resumeClock() { if (this.pauseStart != null) { this.pausedMs += performance.now() - this.pauseStart; this.pauseStart = null; } }

  update(time, dt) {
    if (!this.running || this.ended) return;
    this.elapsed = performance.now() - this.startedAt - this.pausedMs;
    if (this.showTimer) this.timerText.setText(this.fmt(this.remainingMs));
    const k = this.remainingMs / this.duration;
    if (this.showTimer) this.timerBar.clear().fillStyle(hex(k < 0.2 ? C.red : C.sun), 1).fillRoundedRect(W / 2 - 80, 88, 160 * k, 8, 4);
    if (this.showTimer && k < 0.2 && Math.ceil(this.remainingMs / 1000) !== this._lastTick) { this._lastTick = Math.ceil(this.remainingMs / 1000); sfx.play('tick'); this.pop(this.timerText, 1.2); }
    this.tick?.(dt);
    if (!this._snapAt || performance.now() - this._snapAt > 3000) { this._snapAt = performance.now(); this.snapshot(); }
    if (this.remainingMs <= 0) { if (this.onTimeUp) this.onTimeUp(); else this.finish(this.metrics()); }
  }

  /** End the round. Shows the end beat, then hands metrics to core. */
  finish(metrics) {
    if (this.ended) return;
    this.ended = true; this.running = false;
    this.input.enabled = false;
    setPartial(this.roundUid, metrics, this.elapsed);
    const banner = this.txt(W / 2, H / 2, this.remainingMs <= 0 ? "TIME!" : 'DONE!', { fontSize: '150px', stroke: C.white, strokeThickness: 18 }).setDepth(1100).setScale(0.2);
    sfx.play('fanfare');
    this.tweens.add({ targets: banner, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.time.delayedCall(1300, () => this.onDone({ status: 'completed', metrics, elapsedMs: Math.round(this.elapsed) }));
  }

  askQuit() {
    if (this.ended) return;
    this.running = false; this.pauseClock(); this.onAskQuit?.();
    const layer = this.add.container(0, 0).setDepth(1200);
    const dim = this.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x0b0b0b, 0.55).setInteractive();
    const panel = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(70, 420 + 10, 580, 420, 36)
      .fillStyle(hex(C.white), 1).fillRoundedRect(70, 420, 580, 420, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(70, 420, 580, 420, 36);
    const warn = this.mode === 'real' ? 'This attempt will be recorded\nas not finished.' : 'Your practice will end.';
    layer.add([dim, panel, this.txt(W / 2, 500, 'Leave this round?', { fontSize: '42px' }), this.txt(W / 2, 590, warn, { fontSize: '28px', fontStyle: '600', color: C.charcoal }),
      this.btn(W / 2, 700, 'Keep playing', () => { layer.destroy(); this.resumeClock(); this.running = !!this.startedAt; this.onQuitCancelled?.(); }, { w: 460 }),
      this.btn(W / 2, 800, 'Leave', () => this.leave(), { w: 460, fill: C.white, h: 72, size: 28 })]);
    this.tweens.add({ targets: layer, alpha: { from: 0, to: 1 }, duration: 150 });
  }

  /** An explicit Leave tap (Framework v0.8: only this counts as quitting; a closed tab is an abandon). The round's metrics so far
   * go with it, marked explicitQuit, so the scoring layer can tell where the player left (e.g. Sunny Tap's reportQuit). */
  leave() {
    this.explicitQuit = true;
    let m = null; try { m = this.metrics?.() ?? null; } catch { m = null; }
    this.ended = true;
    this.onDone({ status: 'quit', metrics: m ? { ...m, explicitQuit: true } : null, elapsedMs: Math.round(this.elapsed) });
  }

  visibility() {
    if (this.ended) return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = performance.now(); this.pauseClock();
      this.trace('app_hidden');
      this.snapshot(); flushBeacon(); // they may never come back: save the round as it stands
      this.scene.pause();
    } else if (this.hiddenAt) {
      this.trace('app_visible', { awayMs: Math.round(performance.now() - this.hiddenAt) });
      this.hiddenAt = null; this.resumeClock();
      this.scene.resume();
    }
  }

  pageHide() {
    if (this.ended) return;
    this.snapshot();
    this.trace('page_closed');
    flushBeacon();
    api.beacon('roundEnd', { roundUid: this.roundUid, module: this.manifest.id, mode: this.mode, moduleVersion: this.manifest.version, seed: this.seed, status: 'abandoned', metrics: null });
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('pagehide', this.onHide);
    this.scale.off('resize', this.fitCamera, this);
  }
}
