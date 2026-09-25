import { ModuleScene } from '../../core/ModuleScene.js';

export default class GameScene extends ModuleScene {
  build() { /* create the world in 720×1280 design space; use this.rand / this.randInt for anything random */ }
  onStart() { /* called after the 3-2-1 countdown */ }
  tick(dt) { /* optional per-frame logic while running */ }
  metrics() { return { score: 0 }; } // returned when time runs out; or call this.finish(metrics) early
}
