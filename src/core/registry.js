// Discovers modules from src/modules/*/index.js (manifests are tiny; each GameScene is a lazy chunk).
import order from '../modules.config.js';
import { TRAITS } from './traits.js';

const found = import.meta.glob('../modules/*/index.js', { eager: true });
const byId = {};
for (const [path, mod] of Object.entries(found)) {
  const m = mod.default;
  const dir = path.split('/').at(-2);
  if (dir.startsWith('_')) continue; // _template etc.
  const problems = [];
  if (!m || m.id !== dir) problems.push(`id must equal folder name "${dir}"`);
  if (m && !TRAITS[m.trait]) problems.push(`unknown trait "${m?.trait}"`);
  if (m && typeof m.load !== 'function') problems.push('missing load()');
  if (m && !(m.metrics || []).some((x) => x.primary)) problems.push('needs one primary metric');
  if (problems.length) { console.error(`[registry] module ${dir} skipped: ${problems.join('; ')}`); continue; }
  byId[m.id] = m;
}

export const modules = order.filter((id) => {
  if (!byId[id]) console.warn(`[registry] "${id}" in modules.config.js but not found/valid`);
  return !!byId[id];
}).map((id) => byId[id]);

export const getModule = (id) => byId[id];

// Play order is shuffled per run (Adrian, 2026-09-26), seeded by player + run, so a resumed run keeps its
// order and a new run gets a new one. Reports and the Summary keep the fixed trait order regardless.
function hash32(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export function runOrder(playerKey, runNo) {
  let a = hash32(`${playerKey}#${runNo}`) || 1;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = modules.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export const nextModule = (completed, order = modules) => order.find((m) => !completed.includes(m.id)) || null;
export const hostOf = (m) => m.host || TRAITS[m.trait].host;
