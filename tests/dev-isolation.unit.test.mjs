// Developer mode (request #14) stays removable: nothing outside src/dev/ depends on it except the flag file and one boot line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('no file outside src/dev/ references developer mode (except src/main.js and src/dev.config.js)', () => {
  const bad = [];
  for (const f of walk('src').filter((p) => /\.(js|mjs|css|html)$/.test(p))) {
    if (f.startsWith(join('src', 'dev') + '/') || f === join('src', 'dev.config.js')) continue;
    const s = readFileSync(f, 'utf8');
    if (f === join('src', 'main.js')) {
      const lines = s.split('\n').filter((l) => /DEV_MODE|dev\/|devMode/.test(l));
      assert.equal(lines.length, 2, 'main.js: exactly the import and the boot line'); continue;
    }
    if (/from ['"][./]*dev\/|import\(['"][./]*dev\/|devMode|DEV_MODE|dev\.config/.test(s)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('the switch is one boolean, and nodev builds turn it off', () => {
  const s = readFileSync('src/dev.config.js', 'utf8');
  assert.match(s, /export const DEV_MODE = (true|false) && import\.meta\.env\.MODE !== 'nodev';/);
});

test('a nodev build never loads developer-mode code', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const out = mkdtempSync(join(tmpdir(), 'nodev-'));
  execFileSync('npx', ['vite', 'build', '--mode', 'nodev', '--outDir', out, '--emptyOutDir'], { stdio: 'pipe' });
  // The bundler may still write an orphan devMode chunk, but nothing loads it: no other file mentions it or the wrench.
  const files = walk(out).filter((f) => /\.(js|html)$/.test(f) && !/devMode-/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(!/devMode|btn-dev|Developer mode/.test(readFileSync(f, 'utf8')), f);
});
