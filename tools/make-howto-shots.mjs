// Regenerates the how-to images from the REAL game UI (suite standard #19b): each module's GameScene.stageHowTo(n) sets
// up the scene and draws callouts; this script screenshots that area and saves src/modules/<id>/assets/howto-<n>.webp.
// Needs a mock build served on :4173 (npm run build && npx vite preview --port 4173) and python3 + Pillow.
// Usage: node tools/make-howto-shots.mjs [moduleId ...]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['lucky-dip', 'torch-talk', 'fair-board', 'mamak-rush', 'fix-it-kit', 'big-calls', 'sunny-tap'];
const tmp = 'test-results/howto-shots'; mkdirSync(tmp, { recursive: true });
const b = await chromium.launch({ executablePath: exe });
for (const id of ids) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:4173/?mock=1&speed=10&first=${id}`); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('#btn-casual'); await p.waitForSelector('#btn-start'); await p.waitForTimeout(600); await p.click('#btn-start');
  await p.waitForFunction((k) => { const s = window.__tnGame?.scene.getScene('mod:' + k); return s && s.running; }, id, { timeout: 30000 });
  await p.waitForTimeout(800);
  for (let n = 0; n < 12; n++) {
    const rects = await p.evaluate(([k, i]) => {
      const g = window.__tnGame, s = g.scene.getScene('mod:' + k); if (!s.stageHowTo) return null;
      s.tweens.killAll(); let r = s.stageHowTo(i); if (!r) return null; if (!Array.isArray(r)) r = [r];
      const cam = s.cameras.main, c = g.canvas.getBoundingClientRect(), kk = (c.width / g.scale.width) * cam.zoom;
      return r.map((q) => ({ x: c.left + (q.x - cam.worldView.x) * kk, y: c.top + (q.y - cam.worldView.y) * kk, width: q.w * kk, height: q.h * kk }));
    }, [id, n]);
    if (!rects) break;
    await p.waitForTimeout(350);
    await p.evaluate((k) => window.__tnGame.scene.getScene('mod:' + k).tweens.killAll(), id);
    const parts = [];
    for (const [j, rect] of rects.entries()) { // several areas of the same screen are stacked into one picture
      const clip = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(390 - Math.max(0, rect.x), rect.width), height: Math.min(844 - Math.max(0, rect.y), rect.height) };
      const f = `${tmp}/${id}-${n}-${j}.png`; await p.screenshot({ path: f, clip }); parts.push(f);
    }
    execFileSync('python3', ['-c', `from PIL import Image
ims = [Image.open(f).convert('RGB') for f in ${JSON.stringify(parts)}]
W = max(i.width for i in ims); gap = 10 if len(ims) > 1 else 0
out = Image.new('RGB', (W, sum(i.height for i in ims) + gap * (len(ims) - 1)), (255, 245, 218)); y = 0
for i in ims: out.paste(i, (0, y)); y += i.height + gap
out.thumbnail((640, 640)); out.save('src/modules/${id}/assets/howto-${n}.webp', 'WEBP', quality=82, method=6)`]);
    console.log(id, n, rects.length, 'area(s)');
  }
  if (errs.length) console.log(id, 'errors:', errs);
  await p.close();
}
await b.close();
