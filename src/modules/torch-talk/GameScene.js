// Torch Talk gameplay. Items/forms: ./forms.js · checker: ./checker.js · scoring: ./scoring.js · brief: ./README.md
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex, FONT } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { buildRound, trayOrder, QUESTIONS } from './forms.js';
import { check, fixPasses, slotsFor } from './checker.js';
import { score, turnPoints, REACTIONS } from './scoring.js';
import bgUrl from './assets/bg-garden.webp';
import torchUrl from './assets/torch.webp';
import slipUrl from './assets/slip.webp';
import notebookUrl from './assets/notebook.webp';
import walkieUrl from './assets/walkie.webp';
import pencilUrl from './assets/pencil.webp';
import tapeUrl from './assets/tape.webp';

// Fixed animation budget (identical for everyone). ?speed=N (local/mock only) speeds it up for automated tests.
const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const T = { noteIn: 600, panel: 500, flash: 350, decode: 700, react: 1200, reply: 1900 };
const ms = (k) => T[k] / SPEED;
const IDLE_MS = 20000;
const PAPER = '#FDFAE2', PAPER_EDGE = '#6E2415';
const FIX_CAP = 6, MAX_ASKS = 3;
const NAMES = { liam: 'Liam', mia: 'Mia', zoey: 'Zoey', noah: 'Noah' };
const ICON = { when: '🕒', where: '📍', bring: '🎒' };
const norm = (w) => w.replace(/[^A-Za-z0-9'’\-é]/g, '').replace('’', "'").toLowerCase();

export default class GameScene extends ModuleScene {
  preload() {
    const imgs = { 'tt-bg': bgUrl, 'tt-torch': torchUrl, 'tt-slip': slipUrl, 'tt-notebook': notebookUrl, 'tt-walkie': walkieUrl, 'tt-pencil': pencilUrl, 'tt-tape': tapeUrl };
    Object.entries(imgs).forEach(([k, u]) => { if (!this.textures.exists(k)) this.load.image(k, u); });
    const poses = { noah: ['happy', 'worried', 'excited', 'threequarter'], liam: ['front', 'happy', 'worried', 'excited'], mia: ['front', 'happy', 'worried', 'excited'], zoey: ['front', 'happy', 'worried', 'excited'] };
    for (const [c, ps] of Object.entries(poses)) for (const p of ps) if (!this.textures.exists(`${c}-${p}`)) this.load.image(`${c}-${p}`, charImg(c, p));
  }

  // ---------------------------------------------------------------- world
  build() {
    this.turns = []; this.points = 0; this.idleNudges = 0; this.turnIdx = -1; this.phase = 'intro';
    this.msg = []; this.asks = []; this.answerShown = false;
    this.world = this.add.container(0, 0);
    this.panel = this.add.container(0, 0).setDepth(100);
    this.overlay = this.add.container(0, 0).setDepth(800);
    this.bubble = this.add.container(this.W / 2, 0).setAlpha(0).setDepth(850);
    this.turnPill = this.pill(250, 64, 230, 'Turn 0 / 10');
    this.scorePill = this.pill(480, 64, 190, 'Score 0');
    this.drawWorld();
    this.layout();
    const onResize = () => { this.drawWorld(); this.layout(); if (this.item) this.renderPanel(); };
    this.scale.on('resize', onResize); this.events.once('shutdown', () => this.scale.off('resize', onResize));
    // bar reordering (drag) is tracked at scene level
    this.input.on('pointermove', (p) => this.dragMove(p));
    this.input.on('pointerup', (p) => this.dragEnd(p));
  }

  pill(x, y, w, label) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -36, w, 72, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -36, w, 72, 36));
    c.text = this.txt(0, 2, label, { fontSize: '30px' }); c.add(c.text);
    return c;
  }

  /** Visible design-space rectangle (tall phones see more than 720×1280). */
  view() {
    const z = this.zoom || 1;
    const vh = this.scale.height / z, vw = this.scale.width / z;
    const dpr = this.scale.width / (this.game.canvas.clientWidth || this.scale.width);
    return { z: z / dpr, vh, vw, top: this.H / 2 - vh / 2, bottom: this.H / 2 + vh / 2 }; // z = CSS px per design unit
  }

  drawWorld() {
    const v = this.view(); const { W, H } = this;
    this.world.removeAll(true);
    this.world.add(this.add.rectangle(W / 2, H / 2, v.vw + 40, v.vh + 40, hex('#E9B7C8')));
    const bg = this.add.image(W / 2, H / 2, 'tt-bg'); const s = v.vh / bg.height; bg.setScale(s);
    this.world.add(bg);
    const bw = bg.width * s;
    const at = (fx, fy) => ({ x: W / 2 + (fx - 0.5) * bw, y: H / 2 + (fy - 0.5) * v.vh });
    // Noah on the treehouse platform; the friend in the blanket-fort opening (build pack §12)
    const n = at(0.30, 0.485), f = at(0.72, 0.80);
    this.noahH = 0.15 * v.vh; this.friendH = 0.14 * v.vh;
    this.noah = this.add.image(Math.max(n.x, 90), n.y, 'noah-happy').setOrigin(0.5, 1); this.sizeChar(this.noah, this.noahH);
    this.friend = this.add.image(Math.min(f.x, W - 70), f.y, `${this.item?.recipient || 'liam'}-front`).setOrigin(0.5, 1); this.sizeChar(this.friend, this.friendH);
    this.torch = this.add.image(this.noah.x + this.noah.displayWidth * 0.5, this.noah.y - this.noahH * 0.3, 'tt-torch');
    this.torch.setDisplaySize(0.085 * v.vh, 0.085 * v.vh * this.torch.height / this.torch.width);
    const fx = this.friend.x, fy = this.friend.y - this.friendH * 0.62;
    this.torch.setRotation(Math.atan2(fy - this.torch.y, fx - this.torch.x));
    const r = this.torch.rotation, half = this.torch.displayWidth * 0.42;
    this.lens = { x: this.torch.x + Math.cos(r) * half, y: this.torch.y + Math.sin(r) * half };
    this.target = { x: fx - this.friend.displayWidth * 0.2, y: fy };
    this.glow = this.add.circle(this.lens.x, this.lens.y, 0.05 * v.vh, hex(C.sun), 0.9).setAlpha(0).setBlendMode('ADD');
    this.beam = this.add.graphics();
    this.notebook = this.add.image(this.friend.x - this.friend.displayWidth * 0.5 - 120, this.friend.y - this.friendH * 0.2, 'tt-notebook').setAlpha(0);
    this.notebook.setDisplaySize(260, 260 * this.notebook.height / this.notebook.width);
    this.nbText = this.txt(this.notebook.x + 72, this.notebook.y - 4, '', { fontSize: '19px', fontStyle: '700', color: C.ink, wordWrap: { width: 100 }, lineSpacing: -4 }).setAlpha(0);
    this.pencil = this.add.image(this.notebook.x + 100, this.notebook.y - 40, 'tt-pencil').setDisplaySize(70, 69).setAlpha(0);
    this.slip = this.add.container(Math.min(this.friend.x - 30, W - 190), this.friend.y - this.friendH - 110).setAlpha(0).setDepth(50);
    this.world.add([this.noah, this.torch, this.glow, this.beam, this.friend, this.notebook, this.nbText, this.pencil, this.slip]);
  }

  /** Expression poses are head-and-shoulders busts; full-body poses (front) are cropped to match, so swaps don't jump. */
  sizeChar(img, h) {
    const fr = img.frame, full = fr.height / fr.width > 1.6, k = full ? 0.56 : 1;
    if (full) img.setCrop(0, 0, fr.width, fr.height * k); else img.setCrop();
    img.setOrigin(0.5, k).setDisplaySize((h / k) * fr.width / fr.height, h / k);
  }
  pose(img, who, p) { img.setTexture(`${who}-${p}`); this.sizeChar(img, img === this.noah ? this.noahH : this.friendH); }

  /** Fit the compose panel to the visible height (≥ 48 CSS px touch targets on phones; note collapses if needed). */
  layout() {
    const v = this.view();
    const touch = this.sys.game.device.input.touch;
    const y0 = this.mode === 'practice' ? 165 : 112;
    const y1 = v.bottom - (touch ? 40 : 16) / v.z;
    const avail = y1 - y0;
    const gap = 10, sp = 12;
    let tileH = Math.max(84, 48 / v.z);
    const floor = (touch ? 44 : 34) / v.z;
    const need = (noteH, th) => noteH + 84 + 158 + (6 * th + 5 * gap) + th + 5 * sp;
    let noteH = 262, collapsed = false;
    while (need(noteH, tileH) > avail && tileH > Math.max(floor, 60)) tileH -= 2;
    if (need(noteH, tileH) > avail) { collapsed = true; noteH = 96; tileH = Math.max(84, 48 / v.z); while (need(noteH, tileH) > avail && tileH > 56) tileH -= 2; }
    const L = { y0, y1, tileH, gap, noteH, collapsed };
    L.noteY = y0; L.stripY = L.noteY + noteH + sp; L.barY = L.stripY + 84 + sp; L.trayY = L.barY + 158 + sp;
    L.btnY = L.trayY + 6 * tileH + 5 * gap + sp + tileH / 2;
    L.panelTop = y0 - 8; L.panelBottom = v.bottom + 30;
    this.L = L;
    this.drop = v.bottom - L.panelTop + 40; // how far the panel slides to reveal the garden
    this.bubble.y = L.stripY + 40;
  }

  // ---------------------------------------------------------------- round
  onStart() {
    const r = buildRound({ mode: this.mode, runNo: this.runNo, attemptNo: this.attemptNo, rand: this.rand });
    this.form = r.form; this.items = r.items; this.restarted = r.restartedAfterSetback;
    this.trace('round_setup', { form: this.form, itemIds: this.items.map((x) => x.id), attemptNo: this.attemptNo, runNo: this.runNo });
    this.nextTurn();
  }

  nextTurn() {
    this.clearIdle();
    this.turnIdx++;
    if (this.turnIdx >= this.items.length) return this.endRound();
    const it = (this.item = this.items[this.turnIdx]);
    this.msg = []; this.asks = []; this.answerShown = false; this.fix = null; this.phase = 'compose'; this.cap = it.cap;
    this.tray = trayOrder(it);
    this.turnStartAt = performance.now();
    this.turnPill.text.setText(`Turn ${this.turnIdx + 1} / ${this.items.length}`); this.pop(this.turnPill);
    this.pose(this.friend, it.recipient, 'front');
    this.trace('turn', { turn: this.turnIdx + 1, itemId: it.id, recipient: it.recipient });
    this.renderPanel();
    this.panel.x = this.W; this.tweens.add({ targets: this.panel, x: 0, duration: ms('noteIn'), ease: 'Cubic.easeOut' });
    sfx.play('whoosh');
    this.armIdle();
  }

  // ---------------------------------------------------------------- panel rendering
  renderPanel() {
    const { W } = this; const L = this.L; const it = this.item;
    this.spark?.remove(); this.spark = null;
    this.panel.removeAll(true); this.hideOverlay();
    const bg = this.add.graphics().fillStyle(hex(C.cream), 0.97).fillRoundedRect(14, L.panelTop, W - 28, L.panelBottom - L.panelTop, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(14, L.panelTop, W - 28, L.panelBottom - L.panelTop, 36);
    this.panel.add(bg);
    // note (always visible, or one tap away on short screens)
    if (L.collapsed) this.panel.add(this.noteCollapsed(L.noteY));
    else { const n = this.noteCard(W / 2, L.noteY, 660, L.noteH); this.panel.add(n); this.noteWords = n.words; }
    this.panel.add(this.phase === 'fix' ? this.fixBanner(L.stripY) : this.recipientStrip(L.stripY));
    this.panel.add(this.barView(L.barY));
    this.panel.add(this.trayView(L.trayY));
    const bw = 300, bh = Math.min(L.tileH, 100);
    const askOn = this.phase === 'compose' && this.asks.length < MAX_ASKS && this.asks.length < 3;
    this.askBtn = this.btn(190, L.btnY, 'Ask', () => this.openAsk(), { w: bw, h: bh, size: 34, fill: C.white });
    this.sendBtn = this.btn(530, L.btnY, this.phase === 'fix' ? 'Send fix' : 'Send', () => this.send(), { w: bw, h: bh, size: 34, fill: C.white });
    this.askBtn.list[1].add(this.add.image(-78, 0, 'tt-walkie').setDisplaySize(30, 52));
    this.sendBtn.list[1].add(this.add.image(this.phase === 'fix' ? -112 : -84, 0, 'tt-torch').setDisplaySize(58, 30));
    this.enable(this.askBtn, askOn); this.enable(this.sendBtn, this.msg.length > 0 && (this.phase === 'compose' || this.phase === 'fix'));
    this.panel.add([this.askBtn, this.sendBtn]);
  }

  enable(b, on) { b.setAlpha(on ? 1 : 0.4); if (on) b.setInteractive({ useHandCursor: true }); else b.disableInteractive(); }

  /** Paper note with word-by-word layout (so words can be highlighted when the player asks for something already there). */
  noteCard(x, y, w, h) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(hex(C.ink), 0.18).fillRoundedRect(-w / 2 + 6, 10, w, h, 18);
    g.fillStyle(hex(PAPER), 1).fillRoundedRect(-w / 2, 0, w, h, 18).lineStyle(5, hex(PAPER_EDGE), 1).strokeRoundedRect(-w / 2, 0, w, h, 18);
    c.add(g);
    const lines = this.add.graphics(); c.add(lines);
    const tape = this.add.image(0, -2, 'tt-tape').setOrigin(0.5, 81 / 135); tape.setDisplaySize(170, 170 * tape.height / tape.width); c.add(tape);
    const hl = this.add.container(0, 0); c.add(hl); c.hl = hl;
    const words = this.item.note.split(/\s+/);
    let fs = 31, laid;
    for (; fs >= 20; fs--) { laid = this.flow(words, w - 72, fs); if (laid.rows * fs * 1.36 <= h - 56) break; }
    const lh = fs * 1.36, top = 34 + (h - 46 - laid.rows * lh) / 2;
    lines.lineStyle(2, hex(C.sky), 0.8);
    for (let r = 0; r < laid.rows; r++) lines.lineBetween(-w / 2 + 28, top + (r + 1) * lh - 3, w / 2 - 28, top + (r + 1) * lh - 3);
    c.words = laid.items.map((p) => {
      const t = this.add.text(-w / 2 + 36 + p.x, top + p.row * lh + lh / 2, p.word, { fontFamily: FONT.body, fontSize: fs + 'px', fontStyle: '600', color: C.ink }).setOrigin(0, 0.5);
      t.setResolution(Math.min(3, Math.max(1, this.zoom || 1)));
      c.add(t); return { t, key: norm(p.word) };
    });
    return c;
  }

  /** Greedy word wrap using measured widths. */
  flow(words, maxW, fs) {
    const probe = this.add.text(0, 0, '', { fontFamily: FONT.body, fontSize: fs + 'px', fontStyle: '600' });
    const space = (probe.setText('a a').width - probe.setText('aa').width);
    let x = 0, row = 0; const items = [];
    for (const word of words) {
      const wd = probe.setText(word).width;
      if (x > 0 && x + wd > maxW) { row++; x = 0; }
      items.push({ word, x, row, w: wd }); x += wd + space;
    }
    probe.destroy();
    return { items, rows: row + 1 };
  }

  noteCollapsed(y) {
    const c = this.add.container(this.W / 2, y);
    const g = this.add.graphics().fillStyle(hex(PAPER), 1).fillRoundedRect(-330, 0, 660, this.L.noteH, 18).lineStyle(5, hex(PAPER_EDGE), 1).strokeRoundedRect(-330, 0, 660, this.L.noteH, 18);
    const first = this.item.note.length > 34 ? this.item.note.slice(0, 32).replace(/\s+\S*$/, '') + '…' : this.item.note;
    c.add([g, this.txt(-300, this.L.noteH / 2, first, { fontSize: '26px', fontStyle: '600' }).setOrigin(0, 0.5),
      this.add.graphics().fillStyle(hex(C.sun), 1).fillRoundedRect(170, 14, 146, this.L.noteH - 28, 20).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(170, 14, 146, this.L.noteH - 28, 20),
      this.txt(243, this.L.noteH / 2 + 1, 'Read ▼', { fontSize: '24px' })]);
    const hit = this.add.rectangle(0, this.L.noteH / 2, 660, this.L.noteH, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => { sfx.play('click'); this.showNoteOverlay(); }); c.add(hit);
    return c;
  }

  showNoteOverlay(highlightWords = null) {
    this.hideOverlay();
    const v = this.view();
    const dim = this.add.rectangle(this.W / 2, this.H / 2, v.vw + 40, v.vh + 40, 0x0b0b0b, 0.45).setInteractive();
    const n = this.noteCard(this.W / 2, this.L.noteY, 660, 300);
    this.noteWords = n.words;
    const hint = this.txt(this.W / 2, this.L.noteY + 330, 'Tap anywhere to close', { fontSize: '24px', color: C.white });
    this.overlay.add([dim, n, hint]);
    dim.on('pointerup', () => this.hideOverlay());
    this.trace('note_expand', { turn: this.turnIdx + 1 });
    if (highlightWords) this.highlight(highlightWords, n);
  }
  hideOverlay() { this.overlay.removeAll(true); }

  highlight(keys, card = null) {
    if (this.L.collapsed && !card) return this.showNoteOverlay(keys);
    const words = card ? card.words : this.noteWords; const host = card || this.panel.list.find((o) => o.words === this.noteWords);
    if (!words || !host) return;
    words.filter((w) => keys.includes(w.key)).forEach((w) => {
      const r = this.add.rectangle(w.t.x - 4, w.t.y, w.t.width + 8, w.t.height * 0.9, hex(C.sun), 0.85).setOrigin(0, 0.5);
      host.hl.add(r);
      this.tweens.add({ targets: r, alpha: 0, delay: 1500 / SPEED, duration: 500, onComplete: () => r.destroy() });
    });
  }

  recipientStrip(y) {
    const it = this.item; const c = this.add.container(0, y);
    const g = this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(40, 0, 640, 84, 42).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(40, 0, 640, 84, 42);
    const face = this.add.image(96, 42, `${it.recipient}-front`); const fr = face.frame; const s = 110 / fr.height;
    face.setDisplaySize(fr.width * s, 110).setCrop(0, 0, fr.width, fr.height * 0.58).setPosition(96, 42 + 110 * 0.21);
    c.add([g, face, this.txt(150, 42, `To ${NAMES[it.recipient]}`, { fontSize: '30px' }).setOrigin(0, 0.5)]);
    const old = it.knowsContext;
    const label = old ? 'Old friend' : 'New friend · first day';
    const lw = old ? 220 : 330, bx = 668 - lw;
    c.add(this.add.graphics().fillStyle(hex(old ? C.butter : C.mint), 1).fillRoundedRect(bx, 14, lw, 56, 28).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(bx, 14, lw, 56, 28));
    const ic = this.add.graphics();
    if (old) { ic.fillStyle(hex(C.teal), 1).fillCircle(bx + 30, 36, 9).fillCircle(bx + 46, 36, 9).fillRoundedRect(bx + 18, 46, 40, 14, 7); }
    else { ic.fillStyle(hex(C.green), 1).fillEllipse(bx + 28, 38, 18, 11).fillEllipse(bx + 46, 34, 20, 12).fillRect(bx + 36, 38, 4, 20); }
    c.add([ic, this.txt(bx + 64, 43, label, { fontSize: '24px', fontStyle: '800' }).setOrigin(0, 0.5)]);
    return c;
  }

  fixBanner(y) {
    const c = this.add.container(0, y); const it = this.item;
    c.add(this.add.graphics().fillStyle(hex(C.peach), 1).fillRoundedRect(40, 0, 640, 84, 42).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(40, 0, 640, 84, 42));
    c.add(this.txt(360, 42, `${NAMES[it.recipient]} wrote “${it.mixup.echo}?” · send a quick fix`, { fontSize: '26px' }));
    return c;
  }

  barView(y) {
    const c = this.add.container(0, y); this.barSlots = [];
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(40, 0, 640, 158, 28).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(40, 0, 640, 158, 28));
    // word-count dots + counter ("each word costs one flash")
    const cap = this.cap, used = this.msg.length;
    for (let i = 0; i < cap; i++) c.add(this.add.circle(66 + i * 26, 138, 8, hex(i < used ? C.sun : C.white)).setStrokeStyle(3, hex(C.ink)));
    c.add(this.txt(650, 138, `${used} / ${cap}`, { fontSize: '24px', fontStyle: '800' }).setOrigin(1, 0.5));
    if (!used) c.add(this.txt(360, 60, this.phase === 'fix' ? 'Tap words for your fix' : 'Tap words to build your message', { fontSize: '26px', fontStyle: '600', color: C.charcoal }));
    // words wrap over up to 3 rows
    let fs = 26, rows;
    const place = (size) => {
      const probe = this.add.text(0, 0, '', { fontFamily: FONT.body, fontSize: size + 'px', fontStyle: '800' });
      let x = 56, r = 0; const out = [];
      for (const w of this.msg) { const pw = probe.setText(w).width + 28; if (x + pw > 664) { r++; x = 56; } out.push({ w, x, r, pw }); x += pw + 8; }
      probe.destroy(); return { out, rows: r + 1 };
    };
    rows = place(fs); if (rows.rows > 2) { fs = 21; rows = place(fs); }
    const rh = rows.rows > 2 ? 38 : 56, top = 10;
    rows.out.forEach((p, i) => {
      const wc = this.add.container(p.x + p.pw / 2, top + p.r * (rh + 4) + rh / 2);
      wc.add(this.add.graphics().fillStyle(hex(C.sun), 1).fillRoundedRect(-p.pw / 2, -rh / 2, p.pw, rh, rh / 2).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(-p.pw / 2, -rh / 2, p.pw, rh, rh / 2));
      wc.add(this.txt(0, 1, p.w, { fontSize: fs + 'px' }));
      wc.setSize(p.pw, rh + 4).setInteractive({ useHandCursor: true });
      wc.on('pointerdown', (ptr) => { this.drag = { i, x0: ptr.worldX, y0: ptr.worldY, obj: wc, moved: false }; });
      this.barSlots.push({ x: wc.x, y: y + wc.y });
      c.add(wc);
    });
    this.barC = c;
    return c;
  }

  trayView(y) {
    const c = this.add.container(0, y); const L = this.L;
    const tw = (640 - 2 * 12) / 3, th = L.tileH, full = this.msg.length >= this.cap;
    const active = this.phase === 'compose' || this.phase === 'fix';
    this.tray.forEach((w, i) => {
      const x = 40 + (i % 3) * (tw + 12) + tw / 2, yy = Math.floor(i / 3) * (th + L.gap) + th / 2;
      const tc = this.add.container(x, yy);
      if (w === null) { // the gap spot: the answer only appears after asking the right question
        if (!this.answerShown) {
          const g = this.add.graphics().lineStyle(3, hex(C.charcoal), 0.5);
          g.strokeRoundedRect(-tw / 2 + 4, -th / 2 + 4, tw - 8, th - 8, (th - 8) / 2);
          tc.add([g, this.txt(0, 0, '✦', { fontSize: '30px', color: C.amber })]);
          this.spark = this.tweens.add({ targets: tc.list[1], alpha: 0.3, yoyo: true, repeat: -1, duration: 700 });
          return c.add(tc);
        }
        w = this.item.gap.answerTile;
      }
      const used = this.msg.includes(w);
      const isNew = this.item.gap && w === this.item.gap.answerTile;
      tc.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(-tw / 2, -th / 2 + 5, tw, th - 4, (th - 4) / 2)
        .fillStyle(hex(isNew ? C.mint : C.white), 1).fillRoundedRect(-tw / 2, -th / 2, tw, th - 4, (th - 4) / 2).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(-tw / 2, -th / 2, tw, th - 4, (th - 4) / 2));
      tc.add(this.txt(0, -2, w, { fontSize: '30px' }));
      tc.setAlpha(used ? 0.3 : full || !active ? 0.6 : 1);
      if (!used && active) {
        tc.setSize(tw, th).setInteractive({ useHandCursor: true });
        tc.on('pointerup', () => this.addWord(w, tc));
      }
      c.add(tc);
    });
    return c;
  }

  // ---------------------------------------------------------------- input
  addWord(w, tile) {
    if (!(this.phase === 'compose' || this.phase === 'fix') || this.msg.includes(w)) return;
    if (this.msg.length >= this.cap) { this.shake(120, 0.004); sfx.play('bad'); this.trace('bar_full', { turn: this.turnIdx + 1 }); return; }
    this.msg.push(w); sfx.play('click');
    this.trace('add', w);
    this.armIdle(); this.renderPanel();
  }

  dragMove(p) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(p.worldX - d.x0, p.worldY - d.y0) > 14) { d.moved = true; this.panel.bringToTop(this.barC); d.obj.setScale(1.08); }
    if (d.moved) { d.obj.x = p.worldX - this.barC.x; d.obj.y = p.worldY - this.barC.y - this.panel.y; }
  }

  dragEnd(p) {
    const d = this.drag; if (!d) return; this.drag = null;
    const w = this.msg[d.i];
    if (!d.moved) { this.msg.splice(d.i, 1); this.trace('remove', w); sfx.play('click'); }
    else {
      let best = d.i, bd = Infinity;
      this.barSlots.forEach((s, k) => { const dist = Math.hypot(p.worldX - s.x, (p.worldY - s.y) * 1.6); if (dist < bd) { bd = dist; best = k; } });
      if (best !== d.i) { this.msg.splice(d.i, 1); this.msg.splice(best, 0, w); this.trace('reorder', [d.i, best]); sfx.play('click'); }
    }
    this.armIdle(); this.renderPanel();
  }

  openAsk() {
    if (this.phase !== 'compose' || this.asks.length >= MAX_ASKS) return;
    this.armIdle(); this.hideOverlay();
    const v = this.view(), W = this.W, cy = this.L.trayY + 200;
    const dim = this.add.rectangle(W / 2, this.H / 2, v.vw + 40, v.vh + 40, 0x0b0b0b, 0.5).setInteractive();
    const g = this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(90, cy - 250 + 10, 540, 540, 36).fillStyle(hex(C.white), 1).fillRoundedRect(90, cy - 250, 540, 540, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(90, cy - 250, 540, 540, 36);
    const title = this.txt(W / 2, cy - 190, 'What do you need to know?', { fontSize: '32px' });
    const note = this.txt(W / 2, cy - 145, 'Each question costs 1 point', { fontSize: '22px', fontStyle: '600', color: C.charcoal });
    const asked = this.asks.map((a) => a.q);
    const chips = ['when', 'where', 'bring'].map((k, i) => {
      const b = this.btn(W / 2, cy - 60 + i * 100, `${ICON[k]}  ${QUESTIONS[k]}`, () => { this.hideOverlay(); this.ask(k); }, { w: 400, h: 84, size: 30, fill: C.butter });
      this.enable(b, !asked.includes(k)); return b;
    });
    const cancel = this.btn(W / 2, cy + 240, 'Back', () => { this.hideOverlay(); this.trace('ask_cancel'); }, { w: 240, h: 68, size: 26, fill: C.white });
    this.overlay.add([dim, g, title, note, ...chips, cancel]);
    this.trace('ask_open', { turn: this.turnIdx + 1 });
  }

  ask(k) {
    const it = this.item;
    const correct = !!(it.gap && it.gap.question === k && !this.answerShown);
    this.asks.push({ q: k, correct });
    this.trace('ask', { turn: this.turnIdx + 1, itemId: it.id, needed: !!it.gap, picked: k, correct, askNo: this.asks.length });
    this.floatText(480, this.L.btnY - 70, '−1', C.red);
    if (correct) {
      this.answerShown = true;
      this.replySlip(it.gap.reply, true);
      this.renderPanel();
      const i = this.tray.indexOf(null), tw = (640 - 24) / 3;
      this.burst(40 + (i % 3) * (tw + 12) + tw / 2, this.L.trayY + Math.floor(i / 3) * (this.L.tileH + this.L.gap) + this.L.tileH / 2, [C.sun, C.mint, C.teal]);
      sfx.play('good');
    } else {
      const slots = slotsFor(k, it);
      this.renderPanel();
      if (slots.length) { this.replySlip('It’s in the note!', false); this.highlight(slots.flatMap((s) => s.accept.map(norm))); }
      else this.replySlip('You don’t need that for this one.', false);
      sfx.play('tick');
    }
  }

  replySlip(text, good) {
    const c = this.add.container(this.W / 2, this.L.barY + 70).setDepth(860).setAlpha(0);
    const s = this.add.image(0, 0, 'tt-slip'); s.setDisplaySize(470, 470 * s.height / s.width);
    const t = this.txt(24, 12, text, { fontSize: '28px', wordWrap: { width: 330 }, color: good ? C.green : C.ink });
    c.add([s, this.add.image(-170, 14, 'tt-walkie').setDisplaySize(44, 76), t]);
    this.add.existing(c);
    this.tweens.add({ targets: c, alpha: 1, y: c.y - 20, duration: 220 });
    this.tweens.add({ targets: c, alpha: 0, delay: ms('reply'), duration: 300, onComplete: () => c.destroy() });
  }

  // ---------------------------------------------------------------- idle
  armIdle() { this.clearIdle(); this.bubble.setAlpha(0); this.idleTimer = this.time.delayedCall(IDLE_MS, () => this.nudge()); }
  clearIdle() { this.idleTimer?.remove(); this.idleTimer = null; }
  nudge() {
    if (this.ended) return;
    this.idleNudges++; this.trace('idle', { turn: this.turnIdx + 1, n: this.idleNudges });
    this.bubble.removeAll(true);
    this.bubble.add([this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-230, -40, 460, 80, 30).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(-230, -40, 460, 80, 30),
      this.txt(0, 0, 'Still there? Noah’s waiting!', { fontSize: '28px' })]);
    this.bubble.setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(2500, () => this.tweens.add({ targets: this.bubble, alpha: 0, duration: 300 }));
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => this.nudge());
  }

  // ---------------------------------------------------------------- send
  send() {
    if (!this.msg.length || !(this.phase === 'compose' || this.phase === 'fix')) return;
    this.clearIdle(); this.hideOverlay();
    const it = this.item, words = [...this.msg];
    if (this.setbackAt && this.phase === 'compose') { this.trace('comm_setback_next', { msToNextSend: Math.round(performance.now() - this.setbackAt), action: 'continue' }); this.setbackAt = null; }
    let outcome;
    if (this.phase === 'fix') {
      const pass = fixPasses(words, it);
      this.fix = { words, pass };
      this.trace('comm_repair', { turn: this.turnIdx + 1, words, pass });
      outcome = pass ? 'pass' : 'fail';
    } else {
      const res = check(words, it);
      const rec = { turn: this.turnIdx + 1, itemId: it.id, form: it.form || 'P', recipient: it.recipient, knowsContext: it.knowsContext, gap: !!it.gap,
        words, ideal: it.ideal.length, used: words.length, pass: res === 'pass', failReason: res === 'pass' ? '' : res,
        shorthandTile: it.shorthand?.tile || '', contextTile: it.context?.tile || '', usedShorthand: !!(it.shorthand && words.includes(it.shorthand.tile)),
        asks: this.asks.slice(), ms: Math.round(performance.now() - this.turnStartAt) };
      rec.points = turnPoints(rec);
      this.cur = rec; this.turns.push(rec);
      this.trace('comm_message', { turn: rec.turn, itemId: rec.itemId, words, ideal: rec.ideal, used: rec.used, pass: rec.pass, failReason: rec.failReason, usedShorthand: rec.usedShorthand });
      outcome = it.mixup ? 'echo' : rec.pass ? 'pass' : 'fail';
    }
    this.phase = 'send';
    this.renderPanel();
    this.tweens.add({ targets: this.panel, y: this.drop, duration: ms('panel'), ease: 'Cubic.easeIn' });
    this.time.delayedCall(ms('panel'), () => this.transmit(words, outcome));
  }

  transmit(words, outcome) {
    this.nbText.setText('').setAlpha(1); this.notebook.setAlpha(1);
    const b = this.beam; b.clear();
    const { x: x0, y: y0 } = this.lens, { x: x1, y: y1 } = this.target;
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 22);
    b.fillStyle(hex(C.sun), 0.55); for (let i = 1; i < n; i++) b.fillCircle(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 4);
    words.forEach((w, i) => this.time.delayedCall(i * ms('flash'), () => {
      this.glow.setAlpha(1).setScale(1); this.tweens.add({ targets: this.glow, alpha: 0, scale: 1.6, duration: ms('flash') * 0.9 });
      const dot = this.add.circle(x0, y0, 12, hex(C.sun)).setDepth(60).setBlendMode('ADD');
      this.world.add(dot);
      this.tweens.add({ targets: dot, x: x1, y: y1, duration: ms('flash') * 0.85, ease: 'Sine.easeIn', onComplete: () => { dot.destroy(); this.nbText.setText(words.slice(0, i + 1).join(' ')); } });
      sfx.play('dip', { step: i % 5 });
    }));
    const tDecode = words.length * ms('flash');
    this.time.delayedCall(tDecode, () => {
      b.clear();
      this.pencil.setAlpha(1).setAngle(0);
      this.tweens.add({ targets: this.pencil, angle: { from: -12, to: 12 }, x: this.pencil.x + 6, duration: 110 / SPEED, yoyo: true, repeat: 2, onComplete: () => this.pencil.setAlpha(0) });
    });
    this.time.delayedCall(tDecode + ms('decode'), () => this.react(outcome));
  }

  react(outcome) {
    const it = this.item, R = REACTIONS[outcome];
    this.pose(this.friend, it.recipient, R.friend); this.pose(this.noah, 'noah', R.noah);
    sfx.play(R.sfx);
    if (outcome === 'pass') this.burst(this.friend.x, this.friend.y - this.friendH * 0.8, [C.sun, C.teal, C.green]);
    if (outcome === 'fail') this.tweens.add({ targets: this.friend, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => this.friend.setAngle(0) });
    // result slip: ✓ / puzzled ✗ / the scripted mix-up echo
    this.slip.removeAll(true);
    const s = this.add.image(0, 0, 'tt-slip'); s.setDisplaySize(300, 300 * s.height / s.width);
    const label = outcome === 'echo' ? `${it.mixup.echo}?` : outcome === 'pass' ? '✓' : '✗';
    this.slip.add([s, this.txt(10, 8, label, { fontSize: outcome === 'echo' ? '52px' : '84px', color: outcome === 'pass' ? C.green : outcome === 'fail' ? C.red : C.ink })]);
    if (this.mode === 'practice' && this.phase === 'send' && !this.fix) this.slip.add(this.txt(0, 130, `Shortest: ${it.ideal.join(' ')}`, { fontSize: '24px', color: C.white, stroke: C.ink, strokeThickness: 6, wordWrap: { width: 420 } }));
    this.slip.setAlpha(1).setScale(0.3); this.tweens.add({ targets: this.slip, scale: 1, duration: 260, ease: 'Back.easeOut' });
    const hold = ms('react') + (this.mode === 'practice' ? 1200 / SPEED : 0);
    this.time.delayedCall(hold, () => {
      this.slip.setAlpha(0); this.notebook.setAlpha(0); this.nbText.setAlpha(0);
      this.pose(this.noah, 'noah', 'happy'); this.pose(this.friend, it.recipient, 'front');
      if (outcome === 'echo') { this.phase = 'fix'; this.cap = FIX_CAP; this.msg = []; this.renderPanel(); this.slideUp(); this.armIdle(); return; }
      this.endTurn();
    });
  }

  slideUp() { this.tweens.add({ targets: this.panel, y: 0, duration: ms('panel'), ease: 'Cubic.easeOut' }); }

  endTurn() {
    const rec = this.cur;
    if (rec) {
      if (this.fix) rec.fix = this.fix;
      this.points += rec.points; this.scorePill.text.setText(`Score ${this.points}`); this.pop(this.scorePill, 1.15);
      if (rec.points > 0) this.floatText(480, 130, `+${rec.points}`, C.ink);
      if (this.item.mixup && this.mode === 'real') this.setbackAt = performance.now();
    }
    this.cur = null;
    this.phase = 'between';
    this.tweens.add({ targets: this.panel, y: 0, duration: ms('panel'), ease: 'Cubic.easeOut' });
    this.time.delayedCall(ms('panel'), () => this.nextTurn());
  }

  endRound() {
    this.phase = 'done';
    this.pose(this.noah, 'noah', 'excited'); this.pose(this.friend, this.item.recipient, 'excited');
    this.tweens.add({ targets: this.panel, y: this.drop, duration: ms('panel') });
    this.finish(this.metrics());
  }

  onTimeUp() { // 300 s cap: unplayed turns score 0 and the round is flagged
    this.clearIdle(); this.timedOut = true;
    this.trace('time_cap', { turnsPlayed: this.turns.length });
    this.finish(this.metrics());
  }

  // ---------------------------------------------------------------- results
  metrics() {
    const turns = this.turns || [];
    const s = score({ turns, idleNudges: this.idleNudges || 0, timedOut: !!this.timedOut, restartedAfterSetback: !!this.restarted, nTurns: (this.items || []).length || 10 });
    return {
      ...s,
      form: this.form || '', itemIds: (this.items || []).map((x) => x.id).join(' '), turnsPlayed: turns.length, idleNudges: this.idleNudges || 0,
      // raw turns for re-scoring later: [turn, itemId, message, pass, failReason, asks (q+ right / q- other), points, fix (+ passed / - not)]
      turnLog: turns.map((t) => [t.turn, t.itemId, t.words.join(' '), t.pass ? 1 : 0, t.failReason, t.asks.map((a) => a.q + (a.correct ? '+' : '-')).join(','), t.points,
        t.fix ? t.fix.words.join(' ') + (t.fix.pass ? ' +' : ' -') : '', t.ms]),
    };
  }
}
