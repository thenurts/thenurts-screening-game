// Fails the build if any module's assets exceed 3 MB (spec §10).
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const LIMIT = 3 * 1024 * 1024;
const dir = 'src/modules';
let bad = false;
const size = (p) => statSync(p).isDirectory() ? readdirSync(p).reduce((s, f) => s + size(join(p, f)), 0) : statSync(p).size;
for (const m of readdirSync(dir)) {
  const a = join(dir, m, 'assets');
  if (!existsSync(a)) continue;
  const s = size(a);
  console.log(`module ${m}: ${(s / 1024).toFixed(0)} KB assets`);
  if (s > LIMIT) { console.error(`✖ ${m} exceeds 3 MB`); bad = true; }
}
process.exit(bad ? 1 : 0);
