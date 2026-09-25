// Always-on animated brand backdrop behind the shell screens: slow sun rays, floating shapes, paper grain.
// Gameplay scenes launch above it. flow.js calls setMood()/celebrate() for polish beats.
import Phaser from 'phaser';
import { C, hex } from './theme.js';

export default class BackdropScene extends Phaser.Scene {
  constructor() { super({ key: 'backdrop' }); }

  create() {
    this.makeTextures();
    const { width: w, height: h } = this.scale;
    this.bg = this.add.rectangle(0, 0, w, h, hex(C.cream)).setOrigin(0);
    this.rays = this.add.image(w / 2, h * 0.3, 'tn-rays').setAlpha(0.55);
    this.floaters = [];
    const cols = [C.sun, C.sky, C.mint, C.peach, C.lilac, C.teal];
    for (let i = 0; i < 14; i++) {
      const s = this.add.image(Phaser.Math.Between(0, w), Phaser.Math.Between(0, h), i % 3 ? 'tn-dot' : 'tn-ring')
        .setTint(hex(cols[i % cols.length])).setAlpha(0.6).setScale(Phaser.Math.FloatBetween(0.4, 1.3) * this.k());
      s.vy = Phaser.Math.FloatBetween(-0.25, -0.08); s.vx = Phaser.Math.FloatBetween(-0.08, 0.08); s.spin = Phaser.Math.FloatBetween(-0.004, 0.004);
      this.floaters.push(s);
    }
    this.grain = this.add.tileSprite(0, 0, w, h, 'tn-grain').setOrigin(0).setAlpha(0.35).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.confetti = this.add.particles(0, 0, 'tn-chip', {
      speed: { min: 350, max: 900 }, angle: { min: 230, max: 310 }, gravityY: 1100, lifespan: 2200, rotate: { start: 0, end: 720 },
      scale: { min: 0.6 * this.k(), max: 1.2 * this.k() }, tint: [C.sun, C.teal, C.red, C.purple, C.green, C.orange].map(hex), emitting: false,
    }).setDepth(10);
    this.scale.on('resize', this.layout, this);
  }

  k() { return Math.max(0.6, Math.min(this.scale.width, this.scale.height * 0.5625) / 720) * 1.4; }

  makeTextures() {
    if (this.textures.exists('tn-rays')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const R = 900;
    g.fillStyle(hex(C.butter), 1);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = a0 + Math.PI / 16;
      g.fillTriangle(R, R, R + Math.cos(a0) * R, R + Math.sin(a0) * R, R + Math.cos(a1) * R, R + Math.sin(a1) * R);
    }
    g.generateTexture('tn-rays', R * 2, R * 2); g.clear();
    g.fillStyle(0xffffff, 1).fillCircle(40, 40, 40); g.generateTexture('tn-dot', 80, 80); g.clear();
    g.lineStyle(12, 0xffffff, 1).strokeCircle(40, 40, 32); g.generateTexture('tn-ring', 80, 80); g.clear();
    g.fillStyle(0xffffff, 1).fillRoundedRect(0, 0, 18, 10, 3); g.generateTexture('tn-chip', 18, 10); g.destroy();
    // Paper grain: tiny noise tile, multiplied over everything for the illustrated-paper feel.
    const ct = this.textures.createCanvas('tn-grain', 128, 128);
    const ctx = ct.getContext(); const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = 225 + Math.random() * 30; img.data[i] = img.data[i + 1] = v; img.data[i + 2] = v - 6; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0); ct.refresh();
  }

  layout(size) {
    const { width: w, height: h } = size;
    this.bg.setSize(w, h); this.grain.setSize(w, h);
    this.rays.setPosition(w / 2, h * 0.3);
  }

  update(_, dt) {
    this.rays.rotation += 0.00004 * dt;
    const { width: w, height: h } = this.scale;
    for (const s of this.floaters) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.rotation += s.spin * dt;
      if (s.y < -60) { s.y = h + 60; s.x = Phaser.Math.Between(0, w); }
      if (s.x < -60) s.x = w + 60; if (s.x > w + 60) s.x = -60;
    }
  }

  setMood(css) { this.bg.setFillStyle(hex(css || C.cream)); }
  celebrate() {
    const { width: w, height: h } = this.scale;
    this.confetti.explode(60, w * 0.2, h + 10); this.confetti.explode(60, w * 0.8, h + 10);
  }
}
