import { ModuleScene } from '../../core/ModuleScene.js';
import { C, hex } from '../../core/theme.js';
import { sfx } from '../../core/sfx.js';

const LIFE = 1400; // ms a sun stays tappable

export default class GameScene extends ModuleScene {
  build() {
    this.add.rectangle(this.W / 2, this.H / 2, this.W * 3, this.H * 3, hex(C.sky)); // full-bleed backdrop
    this.add.rectangle(this.W / 2, this.H - 90, this.W * 3, 180, hex(C.mint));
    this.hits = 0; this.misses = 0; this.spawned = 0; this.score = 0; this.reacts = [];
    this.scoreText = this.txt(this.W / 2, 190, '0', { fontSize: '64px' }).setDepth(900);
    // Tapping the sky (not a sun) is a miss.
    this.input.on('pointerdown', (p, over) => {
      if (!this.running || over.length) return;
      this.misses++; sfx.play('bad'); this.floatText(p.worldX, p.worldY, 'miss', C.red);
      this.log('miss', { x: Math.round(p.worldX), y: Math.round(p.worldY) });
    });
  }

  onStart() { this.spawn(); }

  spawn() {
    if (!this.running) return;
    const x = this.randInt(110, this.W - 110), y = this.randInt(300, this.H - 260);
    const id = ++this.spawned; const born = this.time.now;
    const sun = this.add.container(x, y);
    const rays = this.add.image(0, 0, 'tn-rays').setScale(0.09).setTint(hex(C.orange)).setAlpha(0.9);
    const disc = this.add.graphics().fillStyle(hex(C.sun), 1).fillCircle(0, 0, 58).lineStyle(6, hex(C.ink), 1).strokeCircle(0, 0, 58);
    sun.add([rays, disc]).setSize(150, 150).setInteractive({ useHandCursor: true }).setScale(0);
    this.tweens.add({ targets: sun, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: rays, angle: 180, duration: LIFE });
    const shrink = this.tweens.add({ targets: sun, scale: 0, delay: 250, duration: LIFE - 250, ease: 'Quad.easeIn', onComplete: () => { sun.destroy(); this.log('expired', { id }); } });
    sun.once('pointerdown', () => {
      if (!this.running) return;
      const rt = Math.round(this.time.now - born);
      shrink.stop(); sun.disableInteractive();
      this.hits++; this.reacts.push(rt);
      const pts = Math.max(10, Math.round(100 - rt / 15));
      this.score += pts; this.scoreText.setText(String(this.score)); this.pop(this.scoreText);
      sfx.play('coin'); this.burst(x, y); this.floatText(x, y - 40, '+' + pts);
      this.tweens.add({ targets: sun, scale: 1.4, alpha: 0, duration: 180, onComplete: () => sun.destroy() });
      this.log('hit', { id, rt, pts });
    });
    this.time.delayedCall(this.randInt(500, 900), () => this.spawn());
  }

  metrics() {
    const taps = this.hits + this.misses;
    const avg = this.reacts.length ? Math.round(this.reacts.reduce((a, b) => a + b, 0) / this.reacts.length) : null;
    return { score: this.score, accuracy: taps ? Math.round((this.hits / taps) * 100) : 0, avgReactMs: avg, hits: this.hits, misses: this.misses, spawned: this.spawned };
  }
}
