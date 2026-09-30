// Mia's Fix-It Kit gameplay (build pack CR1 v1). Rules: ./rules.js (port of tests/fixit-reference.py) · brief: ./README.md
// A try = 1 or 2 kit objects in the Fix tray, each with the chip saying HOW it's used, then "Try it". 6 tries per problem, no timer.
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { CONTENT, KIT, TRIES, problemsOf, newProblem, tryFix, result, metrics, lookup, explorerChoice } from './rules.js';
import { repeatsOf } from './rescore.js';
import bgUrl from './assets/bg-sports.webp';

const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const ms = (x) => x / SPEED;
const IDLE_MS = 20000;
const IMGS = import.meta.glob('./assets/{kit,prob}-*.webp', { eager: true, import: 'default' });
const img = (name) => IMGS[`./assets/${name}.webp`];
const L0 = { probY: 124, probH: 270, miaY: 470, trayY: 560, trayH: 200, btnY: 812, kitY: 900, cellW: 164, cellH: 170 };
/** Practice: learn by doing (find 2 different fixes; fail-safe after 4 tries shows one working fix). */
let L = L0;
export const practiceMemo = { done: false, tries: 0, failSafe: false };

export default class GameScene extends ModuleScene {
  preload() {
    if (!this.textures.exists('fx-bg')) this.load.image('fx-bg', bgUrl);
    for (const k of Object.keys(KIT)) if (!this.textures.exists(`fx-kit-${k}`)) this.load.image(`fx-kit-${k}`, img(`kit-${k}`));
    for (const p of Object.keys(CONTENT.problems)) if (!this.textures.exists(`fx-prob-${p}`)) this.load.image(`fx-prob-${p}`, img(`prob-${p}`));
    for (const pose of ['happy', 'excited', 'worried']) if (!this.textures.exists(`mia-${pose}`)) this.load.image(`mia-${pose}`, charImg('mia', pose));
  }

  build() {
    const { W, H } = this;
    this.add.rectangle(W / 2, H / 2, W * 4, H * 4, hex('#8FCB6B'));
    this.bg = this.add.image(W / 2, H / 2, 'fx-bg');
    const fit = () => { const z = Math.min(this.scale.width / W, this.scale.height / H) || 1; this.bg.setScale(Math.max(W / this.bg.width, Math.max(H, this.scale.height / z) / this.bg.height)); };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    this.add.rectangle(W / 2, H / 2 + 40, W - 16, 1150, hex(C.cream), 0.35);
    this.tut = this.mode === 'practice';
    L = this.tut ? { ...L0, probY: 166, probH: 240 } : L0; // room for the PRACTICE badge
    this.form = this.tut ? 'P' : this.options.form === 'A' || this.options.form === 'B' ? this.options.form : !this.casual && Number(this.runNo || 1) <= 1 && this.attemptNo <= 1 ? 'A' : 'B'; // play-for-fun never sees Form A (request #26)
    this.repeatAttempt = !this.tut && Number(this.runNo || 1) <= 1 && this.attemptNo > 1;
    this.pids = this.tut ? ['P'] : problemsOf(this.form);
    this.results = []; this.tray = []; this.idleNudges = 0; this.idleMs = 0; this.doneEarly = 0; this.tryLog = [];
    this.counter = this.pill(270, 64, 280, '');
    this.probC = this.add.container(0, 0).setDepth(20);
    this.mia = this.add.image(90, L.miaY, 'mia-happy').setDepth(25); this.fitImg(this.mia, 120);
    this.bubble = this.add.container(0, 0).setDepth(26);
    this.trayC = this.add.container(0, 0).setDepth(30);
    this.kitC = this.add.container(0, 0).setDepth(30);
    this.tryBtn = this.btn(270, L.btnY, 'Try it', () => this.tryIt(), { w: 330, h: 96, size: 36, fill: C.sun }).setDepth(40);
    this.doneBtn = this.btn(590, L.btnY, 'Done', () => this.done(), { w: 190, h: 80, size: 28, fill: C.white }).setDepth(40);
    this.overlay = this.add.container(0, 0).setDepth(1100);
    this.input.on('dragstart', (p, o) => { o.setDepth(60); o.homeX = o.x; o.homeY = o.y; });
    this.input.on('drag', (p, o, x, y) => { o.x = x; o.y = y; });
    this.input.on('dragend', (p, o) => { const inTray = o.y > L.trayY - 40 && o.y < L.trayY + L.trayH + 40; o.x = o.homeX; o.y = o.homeY; o.setDepth(30); o.dragged = true; if (inTray) this.addToTray(o.kitId, 'drag'); });
  }

  fitImg(i, box) { i.setScale(Math.min(box / i.width, box / i.height)); return i; }
  pill(x, y, w, label) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -36, w, 72, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -36, w, 72, 36));
    c.text = this.txt(0, 2, label, { fontSize: '30px' }); c.add(c.text);
    return c;
  }

  // ---------------------------------------------------------------- flow
  onStart() {
    this.trace('round_setup', { form: this.form, attemptNo: this.attemptNo, runNo: this.runNo });
    this.pIdx = -1; this.nextProblem();
  }

  nextProblem() {
    this.busy = false;
    this.pIdx++;
    if (this.pIdx >= this.pids.length) return this.end();
    const pid = this.pids[this.pIdx];
    this.cfg = this.tut ? { ...CONTENT.practice, block: null } : CONTENT.problems[pid];
    this.ps = newProblem(pid, this.cfg, this.tut ? CONTENT.practice.kit : Object.keys(KIT));
    this.tray = []; this.problemStart = this.elapsed; this.blockTry = null;
    this.counter.text.setText(this.tut ? 'Practice' : `Problem ${this.pIdx + 1} / ${this.pids.length}`);
    this.say('happy', this.tut ? 'The bench is too hot! Find 2 different fixes.' : `${this.cfg.title} ${this.cfg.job}!`);
    this.render();
    this.probC.x = this.W; this.tweens.add({ targets: this.probC, x: 0, duration: ms(400), ease: 'Cubic.easeOut' });
    this.armIdle();
  }

  // ---------------------------------------------------------------- input
  addToTray(k, how = 'tap') {
    if (this.busy || this.ended || !this.running || this.ps.over) return;
    if (!this.ps.avail.includes(k)) { this.say('worried', 'That one’s gone for now.'); return; }
    if (this.tray.some((s) => s.k === k)) return;
    if (this.tray.length >= 2) { this.say('happy', 'The Fix tray holds 2 things. Tap one in the tray to take it out.'); return; }
    this.tray.push({ k, chip: null }); sfx.play('pop'); this.trace('cr_add', { k, how });
    this.render(); this.openChips(k); this.armIdle();
  }

  removeFromTray(k) { if (this.busy) return; this.tray = this.tray.filter((s) => s.k !== k); this.trace('cr_remove', { k }); sfx.play('click'); this.render(); }

  /** "Use its…": the everyday use + properties. Nothing is pre-selected. */
  openChips(k) {
    this.overlay.removeAll(true); this.picking = k;
    const W = this.W, chips = KIT[k].chips, top = 360, h = 190 + chips.length * 96;
    this.overlay.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.45).setInteractive());
    this.overlay.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(80, top + 8, 560, h, 32).fillStyle(hex(C.white), 1).fillRoundedRect(80, top, 560, h, 32).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(80, top, 560, h, 32));
    this.overlay.add(this.fitImg(this.add.image(160, top + 70, `fx-kit-${k}`), 100));
    this.overlay.add(this.txt(220, top + 50, KIT[k].name, { fontSize: '32px', align: 'left' }).setOrigin(0, 0.5));
    this.overlay.add(this.txt(220, top + 96, 'Use its…', { fontSize: '28px', fontStyle: '700', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5));
    chips.forEach((c, i) => this.overlay.add(this.btn(W / 2, top + 180 + i * 96, c, () => this.pickChip(k, c), { w: 440, h: 80, size: 28, fill: C.butter })));
    this.chipBtns = chips;
  }

  pickChip(k, chip) {
    const s = this.tray.find((x) => x.k === k); if (!s) return;
    s.chip = chip; this.picking = null; this.overlay.removeAll(true); sfx.play('click');
    this.trace('cr_chip', { k, chip }); this.render();
  }

  tryIt() {
    if (this.busy || this.ended || !this.running || this.ps.over || this.ps.ended) return;
    if (!this.tray.length) { this.say('happy', 'Put 1 or 2 things in the Fix tray first.'); return; }
    const unset = this.tray.find((s) => !s.chip); if (unset) { this.openChips(unset.k); return; }
    const choice = Object.fromEntries(this.tray.map((s) => [s.k, s.chip]));
    const t = Math.round(this.elapsed - (this.lastTryAt ?? this.problemStart)); this.lastTryAt = this.elapsed;
    const { entry, fix, justBlocked } = tryFix(this.ps, choice);
    const [n, , works, isNew, mech, tier, afterBlock] = entry;
    this.tryLog.push({ pid: this.ps.pid, n, choice, works, isNew, mech, tier, afterBlock });
    this.trace('cr_try', { form: this.form, problem: this.ps.pid, n, objects: choice, works, newIdea: isNew, mechanism: mech, tier, afterBlock, ms: t });
    if (this.ps.blocked && this.blockTry != null && isNew && this.blockNext == null) { this.blockNext = n - this.blockTry; this.trace('cr_block_next', { triesToNextNewIdea: this.blockNext, endedEarly: false }); }
    this.tray = [];
    if (isNew) { sfx.play('good'); this.say('excited', fix.line); this.floatText(360, L.probY + 200, '✓ New idea!', C.green); this.burst(360, L.probY + 150); }
    else if (works) { sfx.play('tick'); this.say('happy', 'Same idea: try a different way.'); this.floatText(360, L.probY + 200, '✓ Same idea', C.charcoal); }
    else { sfx.play('bad'); this.say('worried', this.tut ? 'Hmm, that won’t fix it. Try another way.' : 'Hmm, that won’t fix it.'); this.floatText(360, L.probY + 200, '✗', C.red); }
    if (justBlocked) {
      this.blockTry = n;
      this.time.delayedCall(ms(900), () => { this.say('worried', CONTENT.blocks[this.ps.pid]); this.shake(200, 0.006); this.render(); });
    }
    this.render(); this.armIdle();
    if (this.tut) return this.checkPractice();
    if (this.ps.over) this.endProblem('outOfTries');
  }

  checkPractice() {
    const found = Object.keys(this.ps.found).length;
    if (found >= CONTENT.practice.target) {
      if (!practiceMemo.done) Object.assign(practiceMemo, { done: true, tries: // only the first completed practice counts (Framework v0.5)
       this.ps.log.length, failSafe: !!this.failSafe });
      this.trace('cr_tutorial', { tries: this.ps.log.length, usedFailSafe: !!this.failSafe });
      this.busy = true; this.time.delayedCall(ms(1200), () => this.endProblem('done'));
      return;
    }
    if (this.ps.log.length >= 4 && !this.failSafe) { // fail-safe: put one working fix in the tray
      this.failSafe = true;
      const f = CONTENT.practice.fixes.find((x) => !(x.mechanism in this.ps.found));
      this.tray = Object.entries(f.objects).map(([k, ch]) => ({ k, chip: ch[0] }));
      this.time.delayedCall(ms(900), () => { this.say('happy', 'Here’s one way. Tap Try it!'); this.render(); this.pulse(this.tryBtn); });
    }
    this.ps.over = false; // practice never runs out of tries
  }

  done() {
    if (this.busy || this.ended || !this.running || this.ps.ended) return;
    if (!this.ps.over) this.doneEarly++;
    this.endProblem('done');
  }

  endProblem(endedBy) {
    if (this.ps.ended) return; this.ps.ended = true;
    this.overlay.removeAll(true);
    const r = result(this.ps);
    if (!this.tut) this.results.push(r);
    this.trace('cr_problem_end', { problem: this.ps.pid, ideas: Object.keys(r.found), triesUsed: r.log.length, endedBy });
    if (this.ps.blocked && this.blockNext == null && !this.tut) { this.trace('cr_block_next', { triesToNextNewIdea: null, endedEarly: endedBy === 'done' }); this.blockNext = -1; }
    this.busy = true;
    this.time.delayedCall(ms(ps(this.ps) ? 1100 : 700), () => { this.tweens.add({ targets: this.probC, x: -this.W, duration: ms(300), onComplete: () => this.nextProblem() }); });
  }

  end() {
    this.busy = true;
    if (this.tut) return this.finish(this.metrics());
    const m = this.metrics();
    const W = this.W, c = this.add.container(0, 0).setDepth(1150);
    c.add(this.add.rectangle(W / 2, this.H / 2, W * 4, this.H * 4, 0x0b0b0b, 0.5).setInteractive());
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(50, 250, 620, 760, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(50, 240, 620, 760, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(50, 240, 620, 760, 36));
    c.add(this.fitImg(this.add.image(W / 2, 330, 'mia-excited'), 130));
    c.add(this.txt(W / 2, 440, `You found ${m.ideasFound} ideas!`, { fontSize: '38px' }));
    let y = 500;
    this.results.forEach((r) => {
      c.add(this.txt(90, y, CONTENT.problems[r.pid].title, { fontSize: '24px', align: 'left' }).setOrigin(0, 0.5)); y += 36;
      const ideas = Object.keys(r.found);
      c.add(this.txt(110, y, ideas.length ? ideas.map((x) => `✓ ${x}`).join('   ') : '(no fix found)', { fontSize: '22px', fontStyle: '600', color: C.charcoal, align: 'left', wordWrap: { width: 520 } }).setOrigin(0, 0)); y += 90;
    });
    const fin = () => { this.recapDone = null; c.destroy(true); this.finish(this.metrics()); };
    c.add(this.btn(W / 2, 930, 'Done', fin, { w: 300, h: 96, size: 36 }));
    this.recapDone = fin; // test hook
  }

  // ---------------------------------------------------------------- rendering
  render() {
    this.renderProblem(); this.renderTray(); this.renderKit();
    const on = !!this.ps && !this.ps.over && !this.busy;
    this.tryBtn.setAlpha(on && this.tray.length ? 1 : 0.55);
  }

  renderProblem() {
    const c = this.probC; c.removeAll(true);
    const y = L.probY, h = L.probH, ps = this.ps;
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(30, y + 8, 660, h, 28).fillStyle(hex(C.white), 1).fillRoundedRect(30, y, 660, h, 28).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(30, y, 660, h, 28));
    if (this.tut) this.drawBench(c, 150, y + h / 2);
    else c.add(this.fitImg(this.add.image(150, y + h / 2, `fx-prob-${ps.pid}`), 230));
    c.add(this.txt(290, y + 50, this.cfg.title, { fontSize: '30px', align: 'left', wordWrap: { width: 380 } }).setOrigin(0, 0.5));
    c.add(this.txt(290, y + 108, `Job: ${this.cfg.job}`, { fontSize: '26px', fontStyle: '700', color: C.blue, align: 'left' }).setOrigin(0, 0.5));
    c.add(this.txt(290, y + 162, `Ideas found: ${Object.keys(ps.found).length}${this.tut ? ` of ${CONTENT.practice.target}` : ''}`, { fontSize: '26px', align: 'left' }).setOrigin(0, 0.5));
    // tries dots (6)
    const ty = y + h - 48;
    c.add(this.txt(290, ty, 'Tries', { fontSize: '22px', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5));
    for (let i = 0; i < TRIES; i++) {
      const e = ps.log[i], x = 380 + i * 46;
      c.add(this.add.graphics().fillStyle(hex(!e ? C.white : e[3] ? C.green : e[2] ? C.charcoal : C.peach), 1).fillCircle(x, ty, 16).lineStyle(3, hex(C.ink), 1).strokeCircle(x, ty, 16));
    }
  }

  drawBench(c, x, y) {
    const g = this.add.graphics();
    g.fillStyle(hex('#B07A48'), 1).fillRoundedRect(x - 100, y - 10, 200, 26, 8).fillRect(x - 86, y + 16, 14, 60).fillRect(x + 72, y + 16, 14, 60);
    g.lineStyle(5, hex(C.red), 0.9); for (let i = -2; i <= 2; i++) g.beginPath().arc(x + i * 34, y - 40, 12, Math.PI, 0).strokePath();
    g.fillStyle(hex(C.sun), 1).fillCircle(x + 80, y - 90, 26);
    c.add(g);
  }

  renderTray() {
    const c = this.trayC; c.removeAll(true);
    const y = L.trayY, h = L.trayH;
    c.add(this.add.graphics().fillStyle(hex(C.butter), 0.95).fillRoundedRect(30, y, 660, h, 28).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(30, y, 660, h, 28));
    c.add(this.txt(56, y + 26, 'FIX TRAY', { fontSize: '22px', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5));
    for (let i = 0; i < 2; i++) {
      const x = 200 + i * 320, s = this.tray[i];
      const slot = this.add.container(x, y + 110);
      slot.add(this.add.graphics().lineStyle(4, hex(C.charcoal), 0.6).strokeRoundedRect(-140, -70, 280, 140, 22));
      if (!s) slot.add(this.txt(0, 0, i === 0 ? 'Drag or tap a thing here' : '+ another (optional)', { fontSize: '22px', fontStyle: '600', color: C.charcoal, wordWrap: { width: 240 } }));
      else {
        slot.add(this.fitImg(this.add.image(-80, 0, `fx-kit-${s.k}`), 110));
        slot.add(this.txt(24, -30, KIT[s.k].name, { fontSize: '24px', align: 'left' }).setOrigin(0, 0.5));
        slot.add(this.txt(24, 20, s.chip ? `Use its: ${s.chip}` : 'Pick how…', { fontSize: '22px', fontStyle: '700', color: s.chip ? C.blue : C.red, align: 'left', wordWrap: { width: 130 } }).setOrigin(0, 0.5));
        slot.add(this.txt(122, -52, '✕', { fontSize: '26px', color: C.charcoal }));
        slot.setSize(280, 140).setInteractive({ useHandCursor: true }).on('pointerup', () => (s.chip ? this.removeFromTray(s.k) : this.openChips(s.k)));
      }
      c.add(slot);
    }
  }

  renderKit() {
    const c = this.kitC; c.removeAll(true);
    const ids = this.tut ? CONTENT.practice.kit : Object.keys(KIT);
    ids.forEach((k, i) => {
      const x = 30 + (i % 4) * (L.cellW + 12) + L.cellW / 2, y = L.kitY + Math.floor(i / 4) * (L.cellH + 12) + L.cellH / 2;
      const gone = !this.ps.avail.includes(k), inTray = this.tray.some((s) => s.k === k);
      const o = this.add.container(x, y);
      o.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(-L.cellW / 2, -L.cellH / 2 + 6, L.cellW, L.cellH, 22).fillStyle(hex(inTray ? C.sun : C.white), 1).fillRoundedRect(-L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH, 22).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(-L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH, 22));
      o.add(this.fitImg(this.add.image(0, -18, `fx-kit-${k}`), 108));
      o.add(this.txt(0, 58, KIT[k].name, { fontSize: '22px', wordWrap: { width: L.cellW - 12 } }));
      if (gone) { o.setAlpha(0.35); o.add(this.txt(0, -18, '✕', { fontSize: '70px', color: C.red })); }
      else {
        o.kitId = k; o.setSize(L.cellW, L.cellH).setInteractive({ useHandCursor: true, draggable: true });
        o.on('pointerup', () => { if (o.dragged) { o.dragged = false; return; } this.addToTray(k, 'tap'); });
      }
      c.add(o);
    });
  }

  say(pose, text) {
    this.lastSay = text;
    this.mia.setTexture(`mia-${pose}`); this.fitImg(this.mia, 120);
    const b = this.bubble; b.removeAll(true);
    const t = this.txt(170, L.miaY, text, { fontSize: '26px', fontStyle: '700', align: 'left', wordWrap: { width: 480 } }).setOrigin(0, 0.5);
    const h = Math.max(80, t.height + 26);
    b.add([this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(152, L.miaY - h / 2, 530, h, 26).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(152, L.miaY - h / 2, 530, h, 26), t]);
  }

  pulse(obj) { if (obj) this.tweens.add({ targets: obj, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: 3, duration: 220, onComplete: () => obj.setScale(1) }); }

  armIdle() {
    const now = performance.now();
    if (this.lastInputAt) this.idleMs += Math.max(0, now - this.lastInputAt - IDLE_MS);
    this.lastInputAt = now; this.idleTimer?.remove();
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => { if (this.ended) return; this.idleNudges++; this.trace('idle', { n: this.idleNudges }); this.say('happy', 'No rush. Any wild idea is worth a try!'); });
  }

  /** Test hook: the reference explorer's next try, through the same taps a player makes. */
  botStep() {
    if (this.busy || this.ended || !this.running || !this.ps) return false;
    if (this.recapDone) { this.recapDone(); return true; }
    if (this.ps.over) return false;
    const c = explorerChoice(this.ps.pid, this.ps.avail, new Set(Object.keys(this.ps.found)), null, this.cfg.fixes);
    if (!c) { this.done(); return true; }
    this.tray = []; for (const [k, chip] of Object.entries(c)) { this.addToTray(k); this.pickChip(k, chip); }
    this.tryIt(); return true;
  }

  metrics() {
    if (this.tut) return { ideasFound: Object.keys(this.ps?.found || {}).length, tries: this.ps?.log.length || 0, failSafe: !!this.failSafe, flags: '' };
    const res = this.results, m = res.length ? metrics(res) : { creativeScore: 0 };
    const hits = this.tryLog.filter((t) => t.isNew);
    const unusual = hits.filter((t) => Object.entries(t.choice).some(([k, c]) => c !== KIT[k].everydayUse)).length;
    const flags = [];
    if (this.repeatAttempt) flags.push('repeatAttempt');
    if (practiceMemo.done && practiceMemo.failSafe) flags.push('tutorialStruggle');
    const tryLog = this.tryLog.map((t) => `${t.pid}.${t.n} ${Object.entries(t.choice).map(([k, c]) => `${k}:${c}`).join('+')} ${t.isNew ? 'new' : t.works ? 'same' : 'no'}`).join(';');
    return {
      ...m, ideasFound: res.reduce((a, r) => a + Object.keys(r.found).length, 0), form: this.form,
      unusualUseShare: hits.length ? Math.round((unusual / hits.length) * 1000) / 1000 : '', doneEarly: this.doneEarly,
      invalidTries: this.tryLog.filter((t) => !t.works).length, triesUsed: this.tryLog.length,
      tryLog,
      learn: (() => { const L = {}; if (practiceMemo.done) L.pickup = [practiceMemo.failSafe ? 2 : Math.min(2, Math.max(0, practiceMemo.tries - 2)), 2]; const r = repeatsOf(tryLog); if (r) L.noRepeat = r; return Object.keys(L).length ? L : null; })(), // learning v2 (#28)
      idleNudges: this.idleNudges, idleMs: Math.round(this.idleMs), flags: flags.join(','),
    };
  }

  // ---------------------------------------------------------------- how-to screenshots (standard #19b)
  stageHowTo(n) {
    this.clearCallouts(); this.overlay.removeAll(true); this.busy = false;
    this.cfg = CONTENT.problems.A2; this.ps = newProblem('A2'); this.tray = []; this.pids = ['A2'];
    this.counter.text.setText('Problem 2 / 3'); this.probC.x = 0;
    const top = { x: 0, y: L.probY - 16, w: 720, h: L.probH + 30 };
    if (n === 0) { this.say('happy', 'A shuttlecock is stuck. Find different ways to get it down!'); this.render();
      this.callout(150, L.probY + L.probH / 2, 110, 'the problem', 150, L.probY + L.probH + 60);
      this.callout(360, L.trayY + 100, 120, 'the Fix tray', 520, L.trayY - 26); this.callout(360, L.kitY + 180, 150, 'Mia’s kit', 360, L.kitY - 30);
      return [top, { x: 0, y: L.trayY - 60, w: 720, h: 1240 - L.trayY + 60 }]; }
    if (n === 1) { this.tray = [{ k: 'U', chip: null }]; this.render(); this.openChips('U');
      this.callout(480, 540, 200, '② pick how it’s used', 360, 330); this.callout(this.tryBtn.x, this.tryBtn.y, 70, '③ Try it', 440, this.tryBtn.y - 90);
      return [{ x: 0, y: 300, w: 720, h: 620 }]; }
    if (n === 2) { tryFix(this.ps, { W: 'heavy when full' }); tryFix(this.ps, { R: 'long' }); tryFix(this.ps, { R: 'bendy' }); this.render();
      this.callout(380 + 1 * 46, L.probY + 222, 22, 'new idea', 280, L.probY + 300); this.callout(380 + 2 * 46, L.probY + 222, 22, 'same idea', 560, L.probY + 300);
      this.say('happy', 'Same idea: try a different way.');
      return [top, { x: 0, y: L.miaY - 60, w: 720, h: 120 }]; }
    if (n === 3) { tryFix(this.ps, { W: 'heavy when full' }); tryFix(this.ps, { S: 'clangs' }); this.render();
      this.callout(495, L.probY + 222, 140, 'every try uses a dot', 495, L.probY + 150); this.callout(this.doneBtn.x, this.doneBtn.y, 70, 'move on any time', 520, this.doneBtn.y - 100);
      return [top, { x: 0, y: L.btnY - 160, w: 720, h: 220 }]; }
    return null;
  }
}
const ps = (p) => Object.keys(p.found).length > 0;
