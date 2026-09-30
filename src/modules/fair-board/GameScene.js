// Fair Board gameplay. Content/forms: ./forms.js · scoring: ./scoring.js · brief: ./README.md
import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';
import { charImg } from '../../core/ui/dom.js';
import { CONTENT, CONTENT_VERSION, BOARD_TITLES, BUMP_ORDER, pickForm, parseEvidence } from './forms.js';
import { score, isCorrect } from './scoring.js';
import corkUrl from './assets/bg-cork.webp';

// Fixed animation budget (identical for everyone). ?speed=N (local/mock only) speeds it up for automated tests.
const q = new URLSearchParams(location.search);
const SPEED = (location.hostname === 'localhost' || q.get('mock') === '1') && Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
const T = { claimIn: 260, board: 900, bump: 1800, check: 1500, feedback: 0 };
const ms = (k) => T[k] / SPEED;
const IDLE_MS = 20000;
const PEOPLE = ['liam', 'mia', 'noah', 'raj', 'amira', 'zoey'];
const NAMES = { liam: 'Liam', mia: 'Mia', noah: 'Noah', raj: 'Raj', amira: 'Amira', zoey: 'Zoey', teacher: 'Teacher' };
// Board paper, claim area and buttons in the 720 × 1280 design space (text ≥ 28 units ≈ 14 CSS px on a 375 px phone)
const R = { x: 34, y: 170, w: 652, h: 590 };
const L = { claimY: 780, claimH: 176, checkY: 1024, btnY: 1146 };
const STALL_COLOURS = [C.orange, C.teal, C.purple, C.green];
const ICONS = { gate: '🚪', lemonade: '🍋', tent: '⛺', cakes: '🧁', stage: '🎤', badges: '📛', hall: '🏫', field: '🌱', plants: '🪴',
  hut: '🛖', juice: '🧃', stickers: '⭐', cookies: '🍪', seeds: '🌻', lawn: '🌿', gym: '🏀' };
const TILE = { gate: C.mint, stage: C.lilac, hall: C.sky, gym: C.sky, field: C.mint, lawn: C.mint, tent: C.butter, hut: C.butter };

/** The latest practice on this page (the real round carries tutorialStruggle when ≥ 2 of the 3 claims needed the fail-safe). */
export const practiceMemo = { done: false, failSafes: 0 };

export default class GameScene extends ModuleScene {
  preload() {
    if (!this.textures.exists('fb-cork')) this.load.image('fb-cork', corkUrl);
    for (const p of PEOPLE) if (!this.textures.exists(`${p}-happy`)) this.load.image(`${p}-happy`, charImg(p, 'happy'));
    for (const k of ['zoey-excited', 'zoey-worried', 'liam-worried']) if (!this.textures.exists(k)) this.load.image(k, charImg(...k.split('-')));
  }

  build() {
    const { W, H } = this;
    this.add.rectangle(W / 2, H / 2, W * 4, H * 4, hex('#9C6B3F'));
    // Corkboard: a nine-slice so the wooden frame, bunting and grass keep their shape on any screen height.
    const s = W / 1024;
    this.cork = this.add.nineslice(W / 2, H / 2, 'fb-cork', undefined, 1024, 1536, 64, 64, 236, 220).setScale(s);
    // Full visible height (tall phones see more than 1280); width stays 720 so wide screens show a framed board on a wooden wall.
    const fit = () => { const z = Math.min(this.scale.width / W, this.scale.height / H) || 1; this.cork.setSize(W / s, Math.max(H, this.scale.height / z) / s); this.cork.setPosition(W / 2, H / 2); };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));

    // state
    this.form = pickForm({ mode: this.mode, runNo: this.runNo, attemptNo: this.attemptNo, form: this.options.form, casual: this.casual });
    this.repeatAttempt = this.mode === 'real' && Number(this.runNo || 1) <= 1 && this.attemptNo > 1;
    this.setupContent();
    this.ptries = {}; this.pFailSafes = 0; this.failSafeFor = null;
    this.log = []; this.idx = -1; this.locked = true; this.idleNudges = 0; this.idleMs = 0; this.rowOrder = [0, 1, 2, 3, 4];

    this.counter = this.pill(W / 2, 64, 250, this.form === 'P' ? `Practice 1 / ${this.claims.length}` : `Claim 1 / ${this.claims.length}`);
    this.boardLayer = this.add.container(0, 0).setDepth(10);
    this.overlay = this.add.container(0, 0).setDepth(60); // Check outlines + insets

    // claim bubble: source avatar + text
    this.claimC = this.add.container(0, 0).setDepth(20);
    const g = this.add.graphics();
    g.fillStyle(hex(C.ink), 1).fillRoundedRect(196, L.claimY + 6, 494, L.claimH, 30);
    g.fillStyle(hex(C.white), 1).fillRoundedRect(196, L.claimY, 494, L.claimH, 30).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(196, L.claimY, 494, L.claimH, 30);
    g.fillStyle(hex(C.white), 1).fillTriangle(200, L.claimY + 70, 172, L.claimY + 96, 200, L.claimY + 112);
    g.lineStyle(5, hex(C.ink), 1).lineBetween(198, L.claimY + 70, 172, L.claimY + 96).lineBetween(172, L.claimY + 96, 198, L.claimY + 112);
    this.claimText = this.txt(222, L.claimY + L.claimH / 2, '', { fontSize: '32px', fontStyle: '700', align: 'left', wordWrap: { width: 446, useAdvancedWrap: true }, lineSpacing: 4 }).setOrigin(0, 0.5);
    this.avatar = this.add.container(98, L.claimY + 78);
    this.nameText = this.txt(98, L.claimY + L.claimH - 4, '', { fontSize: '24px', color: C.white, stroke: C.ink, strokeThickness: 6 });
    this.claimC.add([g, this.claimText, this.avatar, this.nameText]).setAlpha(0);

    // buttons: Agree · Disagree (equal pills, fixed sides) + Check
    this.agreeBtn = this.btn(190, L.btnY, 'Agree', () => this.answer('agree'), { w: 300, h: 110, size: 40, fill: C.white });
    this.doubtBtn = this.btn(530, L.btnY, 'Disagree', () => this.answer('doubt'), { w: 300, h: 110, size: 38, fill: C.white });
    this.checkBtn = this.btn(W / 2, L.checkY, '🔍 Check', () => this.check(), { w: 280, h: 96, size: 32, fill: C.sun });
    [this.agreeBtn, this.doubtBtn, this.checkBtn].forEach((b) => b.setDepth(30));
    this.setButtons(false);

    this.coach = this.add.container(0, 0).setDepth(700).setAlpha(0); // Zoey's idle nudge
  }

  setupContent() {
    if (this.form === 'P') {
      const p = CONTENT.practice;
      this.boards = { practice: p.board };
      const src = ['mia', 'noah', 'liam'];
      this.claims = p.claims.map((c, i) => ({ ...c, id: `P${c.n}`, board: 'practice', type: 'practice', cue: null, source: src[i % 3], evidence: 'practice:all' }));
      this.setbackAfter = 0;
    } else {
      const F = CONTENT.forms[this.form];
      this.boards = F.boards;
      this.claims = F.claims.slice().sort((a, b) => a.n - b.n);
      this.setbackAfter = F.setbackAfter;
    }
  }

  pill(x, y, w, label) {
    const c = this.add.container(x, y).setDepth(900);
    c.add(this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(-w / 2, -36, w, 72, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(-w / 2, -36, w, 72, 36));
    c.text = this.txt(0, 2, label, { fontSize: '30px' }); c.add(c.text);
    return c;
  }

  setButtons(on) {
    this.locked = !on;
    for (const b of [this.agreeBtn, this.doubtBtn, this.checkBtn]) { b.setAlpha(on ? 1 : 0.55); on ? b.setInteractive() : b.disableInteractive(); }
  }

  // ---------------------------------------------------------------- avatars
  /** Bust (or the teacher's chalkboard) fitted into a round frame at (0,0) of the container. */
  makeAvatar(c, who, pose = 'happy', r = 72) {
    c.removeAll(true);
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillCircle(0, 5, r).fillStyle(hex(who === 'teacher' ? C.sage : C.butter), 1).fillCircle(0, 0, r).lineStyle(5, hex(C.ink), 1).strokeCircle(0, 0, r));
    if (who === 'teacher') {
      const b = this.add.graphics();
      b.fillStyle(hex('#8A5A33'), 1).fillRoundedRect(-52, -40, 104, 74, 8).fillStyle(hex('#1F4A3A'), 1).fillRoundedRect(-45, -33, 90, 60, 5);
      b.lineStyle(3, 0xffffff, 0.9).lineBetween(-34, -16, -4, -16).lineBetween(-34, -2, 18, -2).lineBetween(-34, 12, 6, 12);
      b.fillStyle(hex('#8A5A33'), 1).fillRect(-30, 34, 8, 18).fillRect(22, 34, 8, 18);
      c.add([b, this.txt(24, -14, 'A+', { fontSize: '20px', color: C.white })]);
      return;
    }
    const key = this.textures.exists(`${who}-${pose}`) ? `${who}-${pose}` : `${who}-happy`;
    const img = this.add.image(0, 4, key);
    const k = Math.min((r * 1.9) / img.width, (r * 1.9) / img.height);
    img.setScale(k);
    c.add(img);
  }

  // ---------------------------------------------------------------- boards
  paper(c, title) {
    const g = this.add.graphics();
    g.fillStyle(hex(C.ink), 0.35).fillRoundedRect(R.x + 6, R.y + 10, R.w, R.h, 18);
    g.fillStyle(hex(C.cream), 1).fillRoundedRect(R.x, R.y, R.w, R.h, 18).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(R.x, R.y, R.w, R.h, 18);
    for (const [px, py] of [[R.x + 26, R.y + 24], [R.x + R.w - 26, R.y + 24]]) g.fillStyle(hex(C.red), 1).fillCircle(px, py, 11).fillStyle(0xffffff, 0.6).fillCircle(px - 3, py - 3, 3);
    c.add([g, this.txt(R.x + R.w / 2, R.y + 40, title, { fontSize: '36px' })]);
  }

  sticky(c, x, y, w, text, fontSize = 26) {
    const t = this.txt(x, y, text, { fontSize: fontSize + 'px', fontStyle: '700', color: C.ink, wordWrap: { width: w - 24 } });
    const h = Math.max(50, t.height + 18);
    const g = this.add.graphics().fillStyle(hex(C.sun), 1).fillRect(x - w / 2, y - h / 2, w, h).lineStyle(3, hex(C.ink), 0.8).strokeRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle(hex(C.red), 1).fillCircle(x, y - h / 2 + 2, 8);
    c.add([g, t]);
    return { x: x - w / 2, y: y - h / 2, w, h };
  }

  weather(c, x, y, kind, k = 1) {
    const g = this.add.graphics();
    if (kind === 'sun') {
      g.lineStyle(4 * k, hex(C.amber), 1);
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g.lineBetween(x + Math.cos(a) * 15 * k, y + Math.sin(a) * 15 * k, x + Math.cos(a) * 22 * k, y + Math.sin(a) * 22 * k); }
      g.fillStyle(hex(C.sun), 1).fillCircle(x, y, 11 * k).lineStyle(3 * k, hex(C.amber), 1).strokeCircle(x, y, 11 * k);
    } else {
      g.fillStyle(hex('#9AA7B0'), 1).fillCircle(x - 9 * k, y - 4 * k, 10 * k).fillCircle(x + 5 * k, y - 8 * k, 12 * k).fillCircle(x + 14 * k, y - 2 * k, 9 * k).fillRect(x - 18 * k, y - 4 * k, 34 * k, 10 * k);
      g.lineStyle(4 * k, hex(C.blue), 1).lineBetween(x - 10 * k, y + 12 * k, x - 14 * k, y + 22 * k).lineBetween(x + 2 * k, y + 12 * k, x - 2 * k, y + 22 * k).lineBetween(x + 14 * k, y + 12 * k, x + 10 * k, y + 22 * k);
    }
    c.add(g);
  }

  /** Draws a board into container c and returns { cells(): { name → rect } } (rects in design space before any zoom). */
  drawBoard(c, name) {
    if (name === 'sales') return this.drawSales(c, this.boards.sales);
    if (name === 'times') return this.drawTimes(c, this.boards.times);
    if (name === 'map') return this.drawMap(c, this.boards.map);
    return this.drawPractice(c, this.boards.practice);
  }

  drawSales(c, d) {
    this.paper(c, BOARD_TITLES.sales);
    const x0 = R.x + 20, nameW = 156, colW = (R.w - 40 - nameW) / 3, hy = R.y + 100, rowH = 80, ry = R.y + 140;
    const stalls = Object.keys(d.stalls);
    const max = Math.max(...stalls.flatMap((s) => d.stalls[s]));
    const g = this.add.graphics(); c.add(g);
    g.lineStyle(2, hex(C.charcoal), 0.35);
    stalls.forEach((_, i) => g.lineBetween(x0, ry + rowH * (i + 1), x0 + R.w - 40, ry + rowH * (i + 1)));
    d.days.forEach((day, j) => {
      const cx = x0 + nameW + colW * j;
      c.add(this.txt(cx + colW / 2 - 22, hy, day, { fontSize: '30px' }));
      this.weather(c, cx + colW / 2 + 36, hy, d.weather[day], 0.9);
    });
    stalls.forEach((s, i) => {
      const y = ry + rowH * i + rowH / 2;
      c.add(this.txt(x0 + 6, y, s, { fontSize: '28px', fontStyle: '700', align: 'left' }).setOrigin(0, 0.5));
      d.stalls[s].forEach((v, j) => {
        const bx = x0 + nameW + colW * j + 8, len = Math.max(6, (v / max) * 84);
        g.fillStyle(hex(STALL_COLOURS[i % 4]), 1).fillRoundedRect(bx, y - 15, len, 30, 8).lineStyle(2, hex(C.ink), 1).strokeRoundedRect(bx, y - 15, len, 30, 8);
        c.add(this.txt(bx + len + 8, y, String(v), { fontSize: '28px', align: 'left' }).setOrigin(0, 0.5));
      });
    });
    const note = this.sticky(c, R.x + R.w / 2, R.y + R.h - 58, 420, d.note);
    const table = { x: x0 - 6, y: hy - 30, w: R.w - 28, h: ry + rowH * stalls.length - hy + 34 };
    return {
      cells: () => {
        const m = { all: table, note, weather: { x: x0 + nameW - 4, y: hy - 30, w: colW * 3 + 8, h: 60 } };
        stalls.forEach((s, i) => { m[s] = { x: x0 - 6, y: ry + rowH * i + 2, w: R.w - 28, h: rowH - 4 }; });
        d.days.forEach((day, j) => { m[day.toLowerCase()] = { x: x0 + nameW + colW * j - 2, y: hy - 30, w: colW, h: ry + rowH * stalls.length - hy + 34 }; });
        return m;
      },
    };
  }

  drawTimes(c, d) {
    this.paper(c, BOARD_TITLES.times);
    const x0 = R.x + 24, w = R.w - 48, cols = [x0 + 8, x0 + 290, x0 + 470], rowH = 64, ry = R.y + 176;
    const header = this.txt(R.x + R.w / 2 - 20, R.y + 92, d.header, { fontSize: '30px', color: C.blue });
    c.add(header);
    this.weather(c, header.x + header.width / 2 + 34, R.y + 92, /sunny/i.test(d.header) ? 'sun' : 'rain', 0.9);
    ['Event', 'Time', 'Place'].forEach((t, i) => c.add(this.txt(cols[i], R.y + 142, t, { fontSize: '24px', color: C.charcoal, align: 'left' }).setOrigin(0, 0.5)));
    const names = Object.keys(d.events);
    const g = this.add.graphics().lineStyle(2, hex(C.charcoal), 0.35); c.add(g);
    g.lineBetween(x0, ry - 4, x0 + w, ry - 4);
    const rows = names.map((n, i) => {
      const e = d.events[n];
      const row = this.add.container(0, 0);
      row.add(this.add.graphics().fillStyle(hex(i % 2 ? C.butter : C.white), 1).fillRoundedRect(x0, ry, w, rowH - 6, 10));
      row.add(this.txt(cols[0], ry + rowH / 2 - 3, n, { fontSize: '28px', fontStyle: '700', align: 'left' }).setOrigin(0, 0.5));
      row.add(this.txt(cols[1], ry + rowH / 2 - 3, `${e.start}–${e.end}`, { fontSize: '28px', align: 'left' }).setOrigin(0, 0.5));
      row.add(this.txt(cols[2], ry + rowH / 2 - 3, e.place, { fontSize: '28px', fontStyle: '700', align: 'left' }).setOrigin(0, 0.5));
      row.name = n;
      c.add(row);
      return row;
    });
    const slotOf = (i) => this.rowOrder.indexOf(i);
    rows.forEach((row, i) => { row.y = slotOf(i) * rowH; });
    this.rowH = rowH;
    const note = this.sticky(c, R.x + R.w / 2, R.y + R.h - 50, 500, d.note);
    return {
      rows,
      cells: () => {
        const m = { all: { x: x0 - 6, y: R.y + 118, w: w + 12, h: ry + rowH * names.length - R.y - 116 }, note, header: { x: R.x + 90, y: R.y + 66, w: R.w - 180, h: 54 } };
        names.forEach((n, i) => { m[n] = { x: x0 - 6, y: ry + slotOf(i) * rowH - 4, w: w + 12, h: rowH + 2 }; });
        return m;
      },
    };
  }

  drawMap(c, d) {
    this.paper(c, BOARD_TITLES.map);
    const cw = 190, ch = 124, gap = 12, gx = R.x + (R.w - (cw * 3 + gap * 2)) / 2, gy = R.y + 78;
    const m = {};
    d.grid.forEach((row, r) => row.forEach((n, k) => {
      const x = gx + k * (cw + gap), y = gy + r * (ch + gap);
      const stall = !TILE[n];
      c.add(this.add.graphics().fillStyle(hex(TILE[n] || C.peach), 1).fillRoundedRect(x, y, cw, ch, 16).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(x, y, cw, ch, 16));
      c.add(this.txt(x + cw / 2, y + 44, ICONS[n] || '📍', { fontSize: '40px' }));
      c.add(this.txt(x + cw / 2, y + 96, n, { fontSize: '28px', fontStyle: stall ? '700' : '800' }));
      m[n] = { x: x - 2, y: y - 2, w: cw + 4, h: ch + 4 };
    }));
    m.all = { x: gx - 8, y: gy - 8, w: cw * 3 + gap * 2 + 16, h: ch * 3 + gap * 2 + 16 };
    m.key = this.sticky(c, R.x + R.w / 2, R.y + R.h - 56, 560, `Key: ${d.key}`, 24);
    return { cells: () => m };
  }

  drawPractice(c, d) {
    this.paper(c, d.stall);
    const x0 = R.x + 60, y0 = R.y + 170, max = Math.max(...Object.values(d.sold));
    const title = this.txt(R.x + R.w / 2 - 22, R.y + 100, d.weather, { fontSize: '30px', color: C.blue });
    c.add(title); this.weather(c, title.x + title.width / 2 + 32, R.y + 100, /sun/i.test(d.weather) ? 'sun' : 'rain', 0.9);
    const g = this.add.graphics(); c.add(g);
    Object.entries(d.sold).forEach(([k, v], i) => {
      const y = y0 + i * 110, len = (v / max) * 300;
      c.add(this.txt(x0, y, k, { fontSize: '32px', align: 'left' }).setOrigin(0, 0.5));
      g.fillStyle(hex(STALL_COLOURS[i]), 1).fillRoundedRect(x0 + 150, y - 22, len, 44, 10).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(x0 + 150, y - 22, len, 44, 10);
      c.add(this.txt(x0 + 150 + len + 14, y, String(v), { fontSize: '32px', align: 'left' }).setOrigin(0, 0.5));
    });
    const all = { x: R.x + 30, y: R.y + 66, w: R.w - 60, h: 300 };
    return { cells: () => ({ all }) };
  }

  showBoard(name, instant = false) {
    const old = this.page;
    this.page = this.add.container(0, 0);
    this.boardLayer.add(this.page);
    this.board = name; this.boardApi = this.drawBoard(this.page, name); this.rows = this.boardApi.rows || null;
    if (instant || !old) return Promise.resolve();
    this.page.x = this.W;
    return new Promise((res) => {
      this.tweens.add({ targets: old, x: -this.W, duration: ms('board') * 0.45, ease: 'Cubic.easeIn', onComplete: () => old.destroy(true) });
      const n = ['sales', 'times', 'map'].indexOf(name) + 1;
      const banner = this.txt(this.W / 2, R.y + R.h / 2, `Board ${n} of 3`, { fontSize: '64px', stroke: C.white, strokeThickness: 12 }).setDepth(80).setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: ms('board') * 0.3, yoyo: true, hold: ms('board') * 0.35, onComplete: () => banner.destroy() });
      sfx.play('whoosh');
      this.tweens.add({ targets: this.page, x: 0, delay: ms('board') * 0.4, duration: ms('board') * 0.5, ease: 'Cubic.easeOut', onComplete: res });
    });
  }

  // ---------------------------------------------------------------- round
  onStart() {
    this.trace('round_setup', { form: this.form, contentVersion: CONTENT_VERSION, attemptNo: this.attemptNo, runNo: this.runNo, ids: this.claims.map((c) => c.id).join(',') });
    this.next();
  }

  async next() {
    this.clearCheck(true);
    this.idx++;
    if (this.idx >= this.claims.length) return this.end();
    const c = this.claims[this.idx];
    if (c.board !== this.board) await this.showBoard(c.board, this.idx === 0);
    this.claim = c; this.checks = 0;
    this.counter.text.setText(this.form === 'P' ? `Practice ${c.n} / ${this.claims.length}` : `Claim ${c.n} / ${this.claims.length}`);
    this.makeAvatar(this.avatar, c.source);
    this.nameText.setText(NAMES[c.source] || '');
    this.claimText.setText(c.text);
    this.claimC.setAlpha(0).setX(40);
    this.tweens.add({ targets: this.claimC, alpha: 1, x: 0, duration: ms('claimIn'), ease: 'Cubic.easeOut' });
    sfx.play('pop');
    this.shownAt = this.elapsed;
    this.setButtons(true);
    if (this.form === 'P' && this.failSafeFor === c.n) { // fail-safe: only the right answer is available
      const right = c.truth === 'sound' ? this.agreeBtn : this.doubtBtn, other = right === this.agreeBtn ? this.doubtBtn : this.agreeBtn;
      other.setAlpha(0.3).disableInteractive();
      this.tweens.add({ targets: right, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: 5, duration: 240, onComplete: () => right.setScale(1) });
      this.say('zoey', 'happy', `${c.feedback} Tap ${right === this.agreeBtn ? 'Agree' : 'Disagree'}.`, 4000);
    }
    this.armIdle();
  }

  armIdle() {
    this.idleTimer?.remove();
    this.idleTimer = this.time.delayedCall(IDLE_MS, () => {
      if (this.locked || this.ended) return;
      this.idleNudges++;
      this.trace('idle', { n: this.claim.n, count: this.idleNudges });
      this.say('zoey', 'happy', 'No rush. Check the board, then Agree or Disagree.', 3200);
    });
  }

  /** Zoey (or anyone) pops up over the claim area for a moment. */
  say(who, pose, text, holdMs) {
    const c = this.coach; c.removeAll(true);
    const y = L.claimY - 70;
    const bg = this.add.graphics().fillStyle(hex(C.white), 1).fillRoundedRect(150, y - 44, 540, 88, 26).lineStyle(4, hex(C.ink), 1).strokeRoundedRect(150, y - 44, 540, 88, 26);
    const av = this.add.container(92, y); this.makeAvatar(av, who, pose, 56);
    c.add([bg, av, this.txt(420, y, text, { fontSize: '26px', fontStyle: '700', wordWrap: { width: 500 } })]);
    this.tweens.killTweensOf(c);
    c.setAlpha(0); this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    if (holdMs) this.tweens.add({ targets: c, alpha: 0, delay: holdMs, duration: 250 });
  }

  check() {
    if (this.locked || !this.claim) return;
    this.checks++;
    this.trace('fb_check', { n: this.claim.n, count: this.checks });
    sfx.play('whoosh');
    this.clearCheck(true);
    const parts = parseEvidence(this.claim.evidence);
    const here = parts.filter((p) => p.board === this.board || p.board === 'practice');
    const away = parts.filter((p) => p.board !== this.board && p.board !== 'practice');
    const rects = here.flatMap((p) => p.cells.map((n) => this.boardApi.cells()[n]).filter(Boolean));
    this.checkShown = rects.length + away.length; // for tests: how many evidence cells/insets were outlined
    // zoom the page towards the evidence
    if (rects.length) {
      const bx = Math.min(...rects.map((r) => r.x)), by = Math.min(...rects.map((r) => r.y));
      const bw = Math.max(...rects.map((r) => r.x + r.w)) - bx, bh = Math.max(...rects.map((r) => r.y + r.h)) - by;
      const z = Math.max(1, Math.min(1.12, (R.w * 0.95) / bw, (R.h * 0.95) / bh));
      const cx = bx + bw / 2, cy = by + bh / 2;
      this.zoomTo(z, cx, cy);
      const g = this.add.graphics(); this.overlay.add(g);
      const map = (r) => ({ x: cx + (r.x - cx) * z, y: cy + (r.y - cy) * z, w: r.w * z, h: r.h * z });
      rects.map(map).forEach((r) => g.lineStyle(7, hex(C.amber), 1).strokeRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 14));
      this.tweens.add({ targets: g, alpha: { from: 1, to: 0.45 }, yoyo: true, repeat: -1, duration: 260 });
      this.evCenterY = cy; this.evCenterX = cx;
    } else { this.evCenterY = R.y; this.evCenterX = R.x; }
    // evidence on another board → a small inset copy of that board, placed away from the outlined cells
    away.forEach((p) => this.inset(p));
    this.checkTimer = this.time.delayedCall(ms('check'), () => this.clearCheck());
  }

  zoomTo(z, cx, cy, dur = 200) {
    this.tweens.killTweensOf(this.page);
    this.tweens.add({ targets: this.page, scale: z, x: cx * (1 - z), y: cy * (1 - z), duration: dur / SPEED, ease: 'Cubic.easeOut' });
  }

  inset(p) {
    const k = 0.5, c = this.add.container(0, 0);
    const api = this.drawBoard(c, p.board);
    const g = this.add.graphics(); c.add(g);
    p.cells.map((n) => api.cells()[n]).filter(Boolean).forEach((r) => g.lineStyle(8, hex(C.amber), 1).strokeRoundedRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, 16));
    const top = this.evCenterY > R.y + R.h / 2, left = this.evCenterX > R.x + R.w / 2;
    const tx = left ? R.x - 10 : R.x + R.w * (1 - k) + 10, ty = top ? R.y - 20 : R.y + R.h * (1 - k) + 20;
    c.setScale(k).setPosition(tx - R.x * k, ty - R.y * k);
    this.overlay.add(c);
  }

  clearCheck(instant = false) {
    this.checkTimer?.remove(); this.checkTimer = null;
    this.overlay.each((o) => this.tweens.killTweensOf(o));
    this.overlay.removeAll(true);
    if (this.page) { if (instant) { this.tweens.killTweensOf(this.page); this.page.setScale(1).setPosition(0, 0); } else this.zoomTo(1, 0, 0, 220); }
  }

  answer(response) {
    if (this.locked || !this.claim) return;
    this.setButtons(false);
    this.idleTimer?.remove();
    const c = this.claim, t = Math.round(this.elapsed - this.shownAt);
    this.idleMs += Math.max(0, t - IDLE_MS); // time past the nudge point (logged only)
    const entry = { n: c.n, id: c.id, board: c.board, type: c.type, truth: c.truth, cue: c.cue || null, source: c.source, response, checks: this.checks, ms: t };
    this.log.push(entry);
    this.trace('fb_claim', { form: this.form, n: c.n, id: c.id, board: c.board, type: c.type, truth: c.truth, cue: c.cue || '', source: c.source, checked: this.checks, response, ms: t });
    if (this.bumpAt != null) { this.trace('fb_bump_next', { msToNextResponse: Math.round(this.elapsed - this.bumpAt) }); this.bumpNextMs = Math.round(this.elapsed - this.bumpAt); this.bumpAt = null; }
    this.coach.setAlpha(0);
    this.clearCheck(true);
    const btn = response === 'agree' ? this.agreeBtn : this.doubtBtn;
    this.pop(btn, 1.06);
    sfx.play('click');
    this.tweens.add({ targets: this.claimC, alpha: 0, x: -30, duration: ms('claimIn') * 0.8 });
    if (this.form === 'P') return this.practiceFeedback(entry);
    this.floatText(this.W / 2, 150, '✓ answer saved', C.charcoal); // visible consequence, no right/wrong feedback (by design)
    if (this.setbackAfter && c.n === this.setbackAfter) return this.time.delayedCall(ms('claimIn'), () => this.bump());
    this.time.delayedCall(ms('claimIn'), () => this.next());
  }

  practiceFeedback(e) {
    const ok = isCorrect(e);
    sfx.play(ok ? 'good' : 'bad');
    const c = this.add.container(0, 0).setDepth(750);
    const y0 = L.claimY - 10;
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(30, y0 + 8, 660, 300, 30).fillStyle(hex(ok ? C.mint : C.peach), 1).fillRoundedRect(30, y0, 660, 300, 30).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(30, y0, 660, 300, 30));
    const av = this.add.container(110, y0 + 90); this.makeAvatar(av, 'zoey', ok ? 'excited' : 'worried', 62); c.add(av);
    c.add(this.txt(200, y0 + 56, ok ? '✓ Right!' : '✗ Not quite.', { fontSize: '40px', align: 'left' }).setOrigin(0, 0.5));
    c.add(this.txt(200, y0 + 140, this.claim.feedback || '', { fontSize: '28px', fontStyle: '700', align: 'left', wordWrap: { width: 460 } }).setOrigin(0, 0.5));
    // learn by doing (standard #19d): a wrong answer is retried; after 2 wrong tries the right button is shown
    const n = this.claim.n, tries = (this.ptries[n] = (this.ptries[n] || 0) + 1);
    const again = () => { this.waitingNext = null; c.destroy(true); this.log.pop(); this.idx--; if (tries >= 2) { this.failSafeFor = n; this.pFailSafes++; } this.next(); };
    const go = ok ? () => { this.waitingNext = null; c.destroy(true); this.next(); } : again;
    const nb = this.btn(this.W / 2, y0 + 240, ok ? (this.idx + 1 >= this.claims.length ? 'Finish' : 'Next') : 'Try again', go, { w: 300, h: 96, size: 34 });
    c.add(nb);
    this.trace('fb_tutorial', { n, tries, ok });
    this.waitingNext = go; // test hook
    c.setAlpha(0); this.tweens.add({ targets: c, alpha: 1, duration: 200 });
  }

  bump() {
    this.trace('fb_bump', { after: this.setbackAfter });
    sfx.play('clunk');
    this.shake(420, 0.012);
    this.say('liam', 'worried', 'Oops! I bumped the board!', ms('bump'));
    // the timetable rows swap places (same content, new order; identical for everyone)
    this.rowOrder = BUMP_ORDER.slice();
    if (this.board === 'times' && this.rows) {
      this.rows.forEach((row, i) => this.tweens.add({ targets: row, y: this.rowOrder.indexOf(i) * this.rowH, angle: { from: (i % 2 ? -4 : 4), to: 0 }, duration: ms('bump') * 0.4, delay: ms('bump') * 0.1, ease: 'Back.easeOut' }));
    }
    this.time.delayedCall(ms('bump'), () => { this.bumpAt = this.elapsed; this.next(); });
  }

  end() {
    this.claim = null;
    this.setButtons(false);
    if (this.form === 'P') { if (!practiceMemo.done) Object.assign(practiceMemo, { done: true, failSafes: this.pFailSafes }); return this.finish(this.metrics()); } // first completed practice only (Framework v0.5)
    const m = this.metrics();
    this.trace('fb_recap', { correct: m.correct });
    const c = this.add.container(0, 0).setDepth(950);
    c.add(this.add.rectangle(this.W / 2, this.H / 2, this.W * 4, this.H * 4, 0x0b0b0b, 0.5).setInteractive());
    const top = 200, h = 860;
    c.add(this.add.graphics().fillStyle(hex(C.ink), 1).fillRoundedRect(40, top + 10, 640, h, 36).fillStyle(hex(C.cream), 1).fillRoundedRect(40, top, 640, h, 36).lineStyle(5, hex(C.ink), 1).strokeRoundedRect(40, top, 640, h, 36));
    const av = this.add.container(this.W / 2, top + 90); this.makeAvatar(av, 'zoey', 'excited', 64); c.add(av);
    c.add(this.txt(this.W / 2, top + 200, `You called ${m.correct} of ${this.log.length} right`, { fontSize: '40px' }));
    c.add(this.txt(this.W / 2, top + 250, '✓ right   ✗ not right', { fontSize: '24px', fontStyle: '700', color: C.charcoal }));
    const cols = 6, cw = 96, chh = 82, gx = this.W / 2 - (cols * cw) / 2;
    this.log.forEach((e, i) => {
      const ok = isCorrect(e), x = gx + (i % cols) * cw + cw / 2, y = top + 320 + Math.floor(i / cols) * (chh + 12);
      c.add(this.add.graphics().fillStyle(hex(ok ? C.mint : C.peach), 1).fillRoundedRect(x - 42, y - chh / 2 + 6, 84, chh - 6, 14).lineStyle(3, hex(C.ink), 1).strokeRoundedRect(x - 42, y - chh / 2 + 6, 84, chh - 6, 14));
      c.add(this.txt(x, y + 3, `${e.n} ${ok ? '✓' : '✗'}`, { fontSize: '28px', color: ok ? C.green : C.red }));
    });
    const done = () => { this.recapDone = null; c.destroy(true); this.finish(this.metrics()); };
    c.add(this.btn(this.W / 2, top + h - 90, 'Done', done, { w: 320, h: 100, size: 38 }));
    this.recapDone = done; // test hook
    c.setAlpha(0); this.tweens.add({ targets: c, alpha: 1, duration: 250 });
  }

  metrics() {
    const log = this.log || [];
    const s = score(log);
    return {
      ...s, form: this.form || '', contentVersion: CONTENT_VERSION,
      claimLog: log.map((e) => [e.n, e.id, e.response === 'agree' ? 'A' : 'D', e.checks, e.ms, isCorrect(e) ? 1 : 0]),
      bumpNextMs: this.bumpNextMs ?? '', idleNudges: this.idleNudges || 0, idleMs: Math.round(this.idleMs || 0),
      repeatAttempt: !!this.repeatAttempt,
      practiceFailSafes: this.form === 'P' ? this.pFailSafes : practiceMemo.done ? practiceMemo.failSafes : '',
      flags: [s.flags, this.repeatAttempt ? 'repeatAttempt' : '', (this.form === 'P' ? this.pFailSafes : practiceMemo.failSafes) >= 2 ? 'tutorialStruggle' : ''].filter(Boolean).join(','),
    };
  }

  // ---------------------------------------------------------------- how-to screenshots (standard #19b)
  stageClaim(k) {
    const c = this.claims[k]; this.idx = k; this.claim = c; this.checks = 0; this.clearCheck(true);
    if (c.board !== this.board) this.showBoard(c.board, true);
    this.makeAvatar(this.avatar, c.source); this.nameText.setText(NAMES[c.source] || ''); this.claimText.setText(c.text);
    this.claimC.setAlpha(1).setX(0); this.setButtons(true);
  }
  stageHowTo(n) {
    this.clearCallouts(); this.coach.setAlpha(0);
    if (n === 0) { this.stageClaim(0);
      this.callout(R.x + R.w / 2, R.y + 300, 120, 'the noticeboard', 360, R.y + 150);
      this.callout(440, L.claimY + L.claimH / 2, 100, 'someone’s claim', 440, L.claimY - 30);
      this.callout(360, L.btnY, 90, 'Agree or Disagree', 360, L.btnY - 110);
      return [{ x: 0, y: R.y - 10, w: 720, h: 420 }, { x: 0, y: L.claimY - 70, w: 720, h: L.btnY - L.claimY + 140 }]; }
    if (n === 1) { const k = this.claims.findIndex((c) => c.type === 'because'); this.stageClaim(k);
      this.callout(440, L.claimY + L.claimH / 2, 110, '“because…”: does the board say why?', 400, L.claimY - 36);
      this.callout(this.doubtBtn.x, L.btnY, 80, 'if not: Disagree', 480, L.btnY - 100);
      return [{ x: 0, y: R.y - 10, w: 720, h: 420 }, { x: 0, y: L.claimY - 80, w: 720, h: L.btnY - L.claimY + 150 }]; }
    if (n === 2) { const k = this.claims.findIndex((c) => c.board === 'sales' && c.type === 'value'); this.stageClaim(k); this.check(); this.checkTimer?.remove();
      this.callout(this.checkBtn.x, this.checkBtn.y, 70, 'Check: zooms in, no cost', 360, this.checkBtn.y - 90);
      return [{ x: 0, y: R.y - 10, w: 720, h: R.h + 20 }, { x: 0, y: this.checkBtn.y - 140, w: 720, h: 200 }]; }
    return null;
  }
}
