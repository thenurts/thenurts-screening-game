// Lucky Dip gameplay. Rules/sequences: ./rules.js · scoring: ./scoring.js · brief: ./README.md
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { SEQUENCES, SETBACK_BAG, trayValue, LADDER, GOLD_X, FREE_STEP, FREE_DIPS } from './rules.js';
import { score } from './scoring.js';
import bgUrl from './assets/bg-stall.webp';
import bagNormalUrl from './assets/bag-normal.webp';
import bagGoldUrl from './assets/bag-gold.webp';
import pepperUrl from './assets/pepper.webp';
import jarUrl from './assets/jar.webp';
import trayUrl from './assets/tray.webp';
import sOrange from './assets/sweet-orange.webp';
import sTeal from './assets/sweet-teal.webp';
import sYellow from './assets/sweet-yellow.webp';

// Fixed animation budget (identical for everyone). ?speed=N (local/mock only) speeds it up for automated tests.
const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const T = { arrive: 900, mia: 600, reveal: 500, bank: 800, spoil: 1000 };
const ms = (k) => T[k] / SPEED;
const IDLE_MS = 15000;
const SWEETS = ['ld-sweet-orange', 'ld-sweet-teal', 'ld-sweet-yellow'];

function hash32(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

export default class GameScene extends ModuleScene {
  preload() {
    const imgs = { 'ld-bg': bgUrl, 'ld-bag-normal': bagNormalUrl, 'ld-bag-gold': bagGoldUrl, 'ld-pepper': pepperUrl, 'ld-jar': jarUrl, 'ld-tray': trayUrl, 'ld-sweet-orange': sOrange, 'ld-sweet-teal': sTeal, 'ld-sweet-yellow': sYellow };
    Object.entries(imgs).forEach(([k, u]) => { if (!this.textures.exists(k)) this.load.image(k, u); });
    for (const p of ['happy', 'worried', 'excited']) if (!this.textures.exists(`mia-${p}`)) this.load.image(`mia-${p}`, charImg('mia', p));
  }

  build() {
    const { W, H } = this;
    // --- scene
    this.add.rectangle(W / 2, H / 2, W * 4, H * 4, hex('#E9803A')); // matches the counter panels beyond the art
    const bg = this.add.image(W / 2, H / 2, 'ld-bg');
    // Cover the full visible height (tall phones show more than the 720×1280 design area)
    const fitBg = () => { const v = this.cameras.main.worldView; bg.setScale(Math.max(H, v.height || H) / bg.height); };
    fitBg(); this.scale.on('resize', fitBg); this.events.once('shutdown', () => this.scale.off('resize', fitBg));
    this.add.rectangle(W / 2, 0, W * 4, 300, 0x000000, 0.06).setOrigin(0.5, 0); // slight darkening under the HUD
    // --- state
    this.bags = []; this.decisions = []; this.points = 0; this.idleNudges = 0; this.bagIdx = -1; this.locked = true;
    this.keepLeft = (hash32(this.playerKey) & 1) === 0;
    this.buttonSide = this.keepLeft ? 'keep-left' : 'keep-right';

    // --- HUD: bag counter + jar total
    this.counter = this.pill(W / 2, 64, 230, 'Bag 0 / 20');
    // --- Mia (reacts to outcomes only)
    this.mia = this.add.image(120, 250, 'mia-happy'); this.sizeMia();
    this.mia.baseY = 250;
    this.tweens.add({ targets: this.mia, y: 244, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
    this.bubble = this.add.container(300, 190).setAlpha(0).setDepth(50);
    const bg2 = this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-120, -34, 240, 68, 22).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(-120, -34, 240, 68, 22);
    this.bubbleText = this.txt(0, 0, 'Still there?', { fontSize: '28px' });
    this.bubble.add([bg2, this.bubbleText]);

    // --- peek strip (what's left in the bag) + prize ladder
    this.strip = this.add.container(W / 2 + 70, 330);
    this.ladder = this.add.container(W / 2, 420);
    // --- bag
    this.bag = this.add.image(W / 2, 610, 'ld-bag-normal').setAlpha(0);
    this.badge = this.add.container(W / 2 + 120, 480).setAlpha(0);
    // --- tray + jar on the counter
    this.add.image(250, 905, 'ld-tray').setDisplaySize(300, 300 * 248 / 377);
    this.trayItems = this.add.container(250, 890);
    this.trayLabel = this.txt(250, 812, '', { fontSize: '56px', color: C.ink, stroke: C.white, strokeThickness: 10 });
    this.jar = this.add.image(560, 860, 'ld-jar').setDisplaySize(220, 220 * 294 / 320);
    this.jarLabel = this.txt(540, 990, '0', { fontSize: '44px', color: C.white, stroke: C.ink, strokeThickness: 8 });
    this.add.image(502, 996, 'ld-sweet-yellow').setDisplaySize(44, 25);
    // --- buttons (equal size and weight; side counterbalanced per player)
    const keepX = this.keepLeft ? 190 : 530, dipX = this.keepLeft ? 530 : 190;
    this.keepBtn = this.btn(keepX, 1130, 'Keep', () => this.choose('keep'), { w: 300, h: 110, size: 40, fill: C.white });
    this.dipBtn = this.btn(dipX, 1130, 'Dip', () => this.choose('dip'), { w: 300, h: 110, size: 40, fill: C.white });
    this.setButtons(false);
  }

  pill(x, y, w, label) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -36, w, 72, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -36, w, 72, 36));
    c.text = this.txt(0, 2, label, { fontSize: '32px' }); c.add(c.text);
    return c;
  }

  onStart() {
    const repeat = this.mode === 'real' && (this.attemptNo > 1 || (this.roundNo && this.roundNo !== '1'));
    this.sequenceId = this.mode === 'practice' ? 'P' : repeat ? 'B' : 'A';
    this.repeatAttempt = !!repeat;
    this.seq = SEQUENCES[this.sequenceId];
    this.trace('round_setup', { sequenceId: this.sequenceId, buttonSide: this.buttonSide, attemptNo: this.attemptNo });
    this.nextBag();
  }

  // ---------------------------------------------------------------- bag lifecycle
  nextBag() {
    this.clearIdle();
    this.bagIdx++;
    if (this.bagIdx >= this.seq.length) { this.miaPose('excited', 'bounce'); return this.finish(this.metrics()); }
    const b = this.seq[this.bagIdx];
    this.cur = { ...b, bag: this.bagIdx + 1, k: 0, drawn: [] };
    this.counter.text.setText(`Bag ${this.bagIdx + 1} / ${this.seq.length}`); this.pop(this.counter);
    this.trace('bag_arrive', { bag: this.cur.bag, stake: b.type });
    // bag slides in from the right
    const key = b.type === 'gold' ? 'ld-bag-gold' : 'ld-bag-normal';
    this.bag.setTexture(key).setDisplaySize(300, 300 * this.bag.height / this.bag.width).setPosition(this.W + 260, 610).setAlpha(1).setAngle(12);
    this.tweens.add({ targets: this.bag, x: this.W / 2, angle: 0, duration: ms('arrive'), ease: 'Back.easeOut' });
    sfx.play('whoosh');
    this.drawBadge(b.type);
    this.drawStrip();
    this.drawLadder();
    this.setTray(0);
    this.time.delayedCall(ms('arrive'), () => {
      if (b.type === 'free') return this.awaitChoice();
      // Mia always makes the first dip (so the bag-4 loss is identical and unavoidable for everyone)
      this.miaDip();
      this.time.delayedCall(ms('mia'), () => this.reveal());
    });
  }

  miaDip() {
    this.tweens.add({ targets: this.mia, x: 200, y: 330, angle: 12, duration: ms('mia') / 2, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Draw the next item from the bag. */
  reveal() {
    const b = this.cur;
    const drawNo = b.k + 1; // 1-based draw index (Mia's = 1)
    const isPepper = b.type !== 'free' && drawNo === b.j;
    const item = this.add.image(this.bag.x, this.bag.y - 80, isPepper ? 'ld-pepper' : SWEETS[drawNo % 3]).setDisplaySize(isPepper ? 90 : 110, isPepper ? 98 : 62).setDepth(40);
    this.pop(this.bag, 1.08, 90);
    if (isPepper) {
      this.tweens.add({ targets: item, y: 720, angle: 25, duration: ms('reveal'), ease: 'Cubic.easeOut' });
      this.time.delayedCall(ms('reveal'), () => this.spoil(item));
      return;
    }
    b.k = drawNo; b.drawn.push(drawNo);
    sfx.play('dip', { step: b.k });
    const slot = this.trayItems.list.length;
    this.tweens.add({ targets: item, x: 250 - 80 + (slot % 5) * 40, y: 880 - Math.floor(slot / 5) * 20, displayWidth: 70, displayHeight: 40, duration: ms('reveal'), ease: 'Cubic.easeIn',
      onComplete: () => { item.destroy(); const s = this.add.image(-80 + (slot % 5) * 40, -Math.floor(slot / 5) * 20, SWEETS[drawNo % 3]).setDisplaySize(70, 40); this.trayItems.add(s); this.burst(250, 880, [C.sun, C.teal, C.orange]); } });
    this.time.delayedCall(ms('reveal'), () => {
      this.setTray(trayValue(b, b.k));
      this.drawStrip(); this.drawLadder();
      const full = b.type === 'free' ? b.k >= FREE_DIPS : b.k >= 5;
      if (full) this.bank('auto'); else this.awaitChoice();
    });
  }

  awaitChoice() {
    this.choiceAt = performance.now();
    this.setButtons(true);
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => this.nudge());
  }

  nudge() {
    this.idleNudges++;
    this.trace('idle', { bag: this.cur.bag, n: this.idleNudges });
    this.bubble.setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(2500, () => this.tweens.add({ targets: this.bubble, alpha: 0, duration: 300 }));
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => this.nudge());
  }
  clearIdle() { this.idleTimer?.remove(); this.idleTimer = null; }

  choose(choice) {
    if (this.locked || !this.running) return;
    this.setButtons(false); this.clearIdle();
    const b = this.cur; const t = Math.round(performance.now() - this.choiceAt);
    if (this.pendingSetback) { this.trace('setback_next', { msToNextChoice: Math.round(performance.now() - this.pendingSetback), action: 'continue' }); this.pendingSetback = null; }
    if (b.type === 'free') {
      this.trace('free_choice', { bag: b.bag, k: b.k, choice, ms: t });
      this.freeChoices = (this.freeChoices || 0) + 1;
    } else {
      this.decisions.push({ bag: b.bag, stake: b.type, k: b.k, choice, ms: t });
      this.trace('dip_choice', { bag: b.bag, stake: b.type, k: b.k, sweetsLeft: 5 - b.k, trayValue: trayValue(b, b.k), choice, ms: t });
    }
    if (choice === 'keep') this.bank('keep');
    else { this.pop(this.bag, 1.1, 100); this.reveal(); }
  }

  bank(endedBy) {
    const b = this.cur; const pts = trayValue(b, b.k);
    this.points += pts;
    this.recordBag(endedBy, pts);
    sfx.play('clunk');
    this.miaPose('happy', 'hop');
    // tray sweets fly into the jar
    this.trayItems.list.slice().forEach((s, i) => {
      const wx = this.trayItems.x + s.x, wy = this.trayItems.y + s.y;
      const fly = this.add.image(wx, wy, s.texture.key).setDisplaySize(70, 40).setDepth(45);
      this.tweens.add({ targets: fly, x: 560, y: 820, scale: fly.scale * 0.6, duration: ms('bank') * 0.8, delay: i * 40 / SPEED, ease: 'Cubic.easeIn', onComplete: () => fly.destroy() });
    });
    this.trayItems.removeAll(true);
    if (pts > 0) this.floatText(560, 760, `+${pts}`, C.ink);
    this.time.delayedCall(ms('bank') * 0.8, () => { this.jarLabel.setText(String(this.points)); this.pop(this.jar, 1.08); this.pop(this.jarLabel, 1.2); });
    this.tweens.add({ targets: this.bag, x: -260, angle: -12, duration: ms('bank'), ease: 'Back.easeIn' });
    this.time.delayedCall(ms('bank'), () => this.nextBag());
  }

  spoil(pepperImg) {
    const b = this.cur;
    this.recordBag('pepper', 0);
    sfx.play('fizz');
    this.shake(220, 0.01);
    this.miaPose('worried', 'wobble');
    this.trayItems.list.forEach((s) => this.tweens.add({ targets: s, alpha: 0, y: s.y + 30, duration: ms('spoil') * 0.6 }));
    this.tweens.add({ targets: pepperImg, alpha: 0, scale: pepperImg.scale * 1.4, delay: ms('spoil') * 0.5, duration: ms('spoil') * 0.4, onComplete: () => pepperImg.destroy() });
    this.setTray(0, true);
    this.tweens.add({ targets: this.bag, x: -260, angle: -12, delay: ms('spoil') * 0.5, duration: ms('spoil') * 0.5, ease: 'Back.easeIn' });
    if (b.bag === SETBACK_BAG && this.mode === 'real') this.pendingSetback = performance.now() + ms('spoil');
    this.time.delayedCall(ms('spoil'), () => { this.trayItems.removeAll(true); this.nextBag(); });
  }

  recordBag(endedBy, points) {
    const b = this.cur;
    const rec = { bag: b.bag, stake: b.type, j: b.j ?? null, dips: b.type === 'free' ? b.k : Math.max(0, (endedBy === 'pepper' ? b.j : b.k) - 1), endedBy, points };
    this.bags.push(rec);
    this.trace(b.type === 'free' ? 'free_bag' : 'bag_end', b.type === 'free' ? { bag: b.bag, dipsTaken: b.k, points } : { bag: b.bag, stake: b.type, dips: rec.dips, endedBy, points });
  }

  // ---------------------------------------------------------------- visuals
  sizeMia() { const f = this.mia.frame; this.mia.setDisplaySize(170, 170 * f.height / f.width); }
  miaPose(pose, motion) {
    this.mia.setTexture(`mia-${pose}`); this.sizeMia();
    if (motion === 'hop') this.tweens.add({ targets: this.mia, y: this.mia.baseY - 30, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
    if (motion === 'wobble') this.tweens.add({ targets: this.mia, angle: { from: -8, to: 8 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => this.mia.setAngle(0) });
    if (motion === 'bounce') this.tweens.add({ targets: this.mia, scale: this.mia.scale * 1.12, duration: 200, yoyo: true, repeat: 2 });
    if (pose !== 'excited') this.time.delayedCall(1200 / SPEED, () => { if (!this.ended) { this.mia.setTexture('mia-happy'); this.sizeMia(); } });
  }

  drawBadge(type) {
    this.badge.removeAll(true);
    if (type === 'normal') return this.badge.setAlpha(0);
    const label = type === 'gold' ? '×3' : 'FREE';
    const w = type === 'gold' ? 110 : 130;
    this.badge.add(this.add.graphics().fillStyle(hex(type === 'gold' ? C.sun : C.mint), 1).fillRoundedRect(-w / 2, -32, w, 64, 32).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -32, w, 64, 32));
    this.badge.add(this.txt(0, 2, label, { fontSize: '34px' }));
    this.badge.setAlpha(1).setScale(0);
    this.tweens.add({ targets: this.badge, scale: 1, delay: ms('arrive') * 0.6, duration: 300, ease: 'Back.easeOut' });
    if (type === 'gold') this.tweens.add({ targets: this.badge, angle: { from: -6, to: 6 }, duration: 700, yoyo: true, repeat: 2 });
  }

  /** Icons for what's still inside: sweets left + the pepper (shape + ✕ badge, never colour alone). */
  drawStrip() {
    const b = this.cur; this.strip.removeAll(true);
    const total = b.type === 'free' ? FREE_DIPS : 5;
    const left = total - b.k;
    const items = []; for (let i = 0; i < left; i++) items.push(SWEETS[(b.k + 1 + i) % 3]);
    if (b.type !== 'free') items.push('pepper');
    const gap = 74, x0 = -((items.length - 1) * gap) / 2;
    const plate = this.add.graphics().fillStyle(hex(C.white), 0.92).fillRoundedRect(x0 - 50, -44, (items.length - 1) * gap + 100, 88, 44).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(x0 - 50, -44, (items.length - 1) * gap + 100, 88, 44);
    this.strip.add(plate);
    items.forEach((k, i) => {
      if (k === 'pepper') {
        this.strip.add(this.add.image(x0 + i * gap, 0, 'ld-pepper').setDisplaySize(46, 50));
        const x = x0 + i * gap + 20, y = -22;
        this.strip.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillCircle(x, y, 14));
        this.strip.add(this.txt(x, y, '✕', { fontSize: '18px', color: C.white }));
      } else this.strip.add(this.add.image(x0 + i * gap, 0, k).setDisplaySize(62, 35));
    });
    this.strip.x = this.W / 2 + 70;
  }

  /** Prize ladder: what the tray is worth after each dip; the current step is highlighted. */
  drawLadder() {
    const b = this.cur; this.ladder.removeAll(true);
    const steps = b.type === 'free' ? [1, 2, 3].map((k) => k * FREE_STEP) : LADDER.slice(1).map((v) => v * (b.type === 'gold' ? GOLD_X : 1));
    const gap = 118, x0 = -((steps.length - 1) * gap) / 2;
    steps.forEach((v, i) => {
      const on = i + 1 === b.k;
      const g = this.add.graphics().fillStyle(hex(on ? C.sun : C.white), on ? 1 : 0.85).fillRoundedRect(x0 + i * gap - 50, -26, 100, 52, 26).lineStyle(on ? 5 : 3, hex(C.ink), 1).strokeRoundedRect(x0 + i * gap - 50, -26, 100, 52, 26);
      this.ladder.add(g);
      this.ladder.add(this.txt(x0 + i * gap, 1, String(v), { fontSize: '26px', fontStyle: on ? '900' : '700', color: on ? C.ink : C.charcoal }));
      if (i < steps.length - 1) this.ladder.add(this.txt(x0 + i * gap + gap / 2, 0, '›', { fontSize: '26px', color: C.charcoal }));
    });
  }

  setTray(v, spoiled = false) {
    this.trayLabel.setText(spoiled ? '0' : v ? String(v) : '');
    if (v) this.pop(this.trayLabel, 1.25);
    if (spoiled) { this.trayLabel.setColor(C.red); this.time.delayedCall(ms('spoil'), () => this.trayLabel.setColor(C.ink).setText('')); }
  }

  setButtons(on) {
    this.locked = !on;
    [this.keepBtn, this.dipBtn].forEach((b) => { b.setAlpha(on ? 1 : 0.45); if (on) b.setInteractive(); else b.disableInteractive(); });
  }

  // ---------------------------------------------------------------- results
  onTimeUp() { // idle cap: remaining bags are not played; flagged
    this.clearIdle(); this.setButtons(false); this.timedOut = true;
    this.trace('time_cap', { bagsPlayed: this.bags.length });
    this.finish(this.metrics());
  }

  metrics() {
    const s = score({ decisions: this.decisions || [], bags: this.bags || [], idleNudges: this.idleNudges || 0, timedOut: !!this.timedOut, repeatAttempt: !!this.repeatAttempt });
    return {
      points: this.points || 0,
      bagsBanked: (this.bags || []).filter((b) => b.points > 0).length,
      bagsPlayed: (this.bags || []).length,
      ...s,
      sequenceId: this.sequenceId || '', buttonSide: this.buttonSide, idleNudges: this.idleNudges || 0,
      // raw decisions for re-scoring later: [bag, stake(N|G), k, choice(0 keep|1 dip), ms]
      decisions: (this.decisions || []).map((d) => [d.bag, d.stake === 'gold' ? 'G' : 'N', d.k, d.choice === 'dip' ? 1 : 0, d.ms]),
      bagLog: (this.bags || []).map((b) => [b.bag, b.stake[0].toUpperCase(), b.dips, b.endedBy[0], b.points]),
    };
  }
}
