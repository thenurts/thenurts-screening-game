// Browser-local stand-in for the Apps Script backend (dev/testing only). Mirrors spec §6–7 behaviour:
// hashes the NRIC and discards it, numbers rounds server-side, keeps Users/Rounds/Interactions tables.
import { validateNric, maskNric } from './nric.js';

const KEY = 'thenurts_mock_db_v1';
const q = new URLSearchParams(location.search);
const SEED_BENCH = q.get('seedbench') === '1';
let mem = null;

function db() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY)) || null; } catch { mem = null; }
  mem ||= { users: {}, registrations: [], rounds: [], interactions: [], seen: {} };
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode: memory only */ } }
const now = () => new Date().toISOString();
const err = (code) => { const e = new Error(code); e.code = code; throw e; };

async function hash(nric) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mock-salt:' + nric));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function userOf(auth) {
  const u = auth && db().users[auth.candidateId];
  if (!u || u.email !== auth.email) err('auth_failed');
  return u;
}
function completedIn(cid, runNo) {
  return [...new Set(db().rounds.filter((r) => r.candidateId === cid && r.runNo === runNo && r.mode === 'real' && r.status === 'completed').map((r) => r.module))];
}
function identity(u) {
  return { identity: { candidateId: u.candidateId, nricMasked: u.nricMasked, email: u.email, phone: u.phone, name: u.name }, runNo: u.currentRun, completed: completedIn(u.candidateId, u.currentRun) };
}
function markAbandoned(cid) {
  db().rounds.forEach((r) => { if (r.candidateId === cid && r.status === 'started') { r.status = 'abandoned'; r.endedAt = now(); } });
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function benchmarkFor(module, version) {
  const firstByCandidate = {};
  db().rounds
    .filter((r) => r.module === module && r.moduleVersion === version && r.mode === 'real' && r.status === 'completed')
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    .forEach((r) => { firstByCandidate[r.candidateId] ||= r; });
  const rows = Object.values(firstByCandidate);
  const out = {};
  const keys = rows[0] ? Object.keys(rows[0].metrics) : [];
  keys.forEach((k) => {
    const vals = rows.map((r) => r.metrics[k]).filter((v) => typeof v === 'number');
    out[k] = { median: vals.length ? median(vals) : null, n: vals.length };
  });
  return out;
}

function seedFakes(module, version, metrics) {
  if (!SEED_BENCH) return;
  const have = db().rounds.filter((r) => r.module === module && r.candidateId.startsWith('fake')).length;
  for (let i = have; i < 12; i++) {
    const m = {};
    Object.entries(metrics).forEach(([k, v]) => { let x = typeof v === 'number' ? Math.round(v * (0.55 + Math.random() * 0.9) * 10) / 10 : v;
      if (typeof x === 'number' && /accuracy|rate|pct/i.test(k)) x = Math.min(100, x);
      m[k] = x; });
    db().rounds.push({ candidateId: 'fake' + i, runNo: 1, module, moduleVersion: version, roundNo: 1, mode: 'real', startedAt: now(), endedAt: now(), status: 'completed', metrics: m });
  }
}

const handlers = {
  async register({ profile, nric, consent }) {
    const v = validateNric(nric);
    if (!v.ok) err('invalid_nric');
    if (!consent) err('consent_required');
    const cid = await hash(v.id);
    if (db().users[cid]) err('already_registered');
    const u = { candidateId: cid, nricMasked: maskNric(v.id), email: profile.email.trim().toLowerCase(), phone: profile.phone, name: profile.name, createdAt: now(), currentRun: 1, runsCompleted: 0 };
    db().users[cid] = u;
    db().registrations.push({ ts: now(), candidateId: cid, nricMasked: u.nricMasked, ...profile, cv: profile.cvName || '', consent });
    return identity(u);
  },
  async login({ nric, email }) {
    const v = validateNric(nric);
    const u = v.ok && db().users[await hash(v.id)];
    if (!u || u.email !== String(email).trim().toLowerCase()) err('login_fail');
    markAbandoned(u.candidateId);
    return identity(u);
  },
  roundStart({ auth, module, mode, moduleVersion }) {
    const u = userOf(auth);
    markAbandoned(u.candidateId);
    const mine = db().rounds.filter((r) => r.candidateId === u.candidateId && r.runNo === u.currentRun && r.module === module && r.mode === mode);
    const n = mine.length + 1;
    const roundNo = mode === 'practice' ? 'P' + n : String(n);
    db().rounds.push({ candidateId: u.candidateId, runNo: u.currentRun, module, moduleVersion, roundNo, mode, startedAt: now(), endedAt: null, status: 'started', metrics: {} });
    return { roundNo, runNo: u.currentRun, seed: (parseInt(u.candidateId.slice(0, 8), 16) ^ (u.currentRun * 7919) ^ (n * 104729) ^ (mode === 'practice' ? 0x5eed : 0)) >>> 0 };
  },
  roundEnd({ auth, module, roundNo, status, metrics }) {
    const u = userOf(auth);
    const r = db().rounds.find((x) => x.candidateId === u.candidateId && x.runNo === u.currentRun && x.module === module && x.roundNo === roundNo);
    if (r && r.status === 'started') Object.assign(r, { status, endedAt: now(), metrics: metrics || {} });
    if (r && status === 'completed' && r.mode === 'real') seedFakes(module, r.moduleVersion, metrics);
    return { benchmark: r ? benchmarkFor(module, r.moduleVersion) : {} };
  },
  log({ auth, events }) {
    const u = auth ? db().users[auth.candidateId] : null;
    const ack = [];
    events.forEach((e) => {
      if (db().seen[e.event_id]) return;
      db().seen[e.event_id] = 1;
      db().interactions.push([now(), u?.nricMasked || '', u?.email || '', u?.phone || '', e.module, e.round_no, e.interaction, e.value, u?.currentRun || '', u?.candidateId || '', e.session_id, e.client_ts, e.event_id, e.module_version]);
      ack.push(e.event_id);
    });
    return { ack };
  },
  benchmarks({ modules }) {
    const out = {};
    (modules || []).forEach(({ id, version }) => { out[id] = benchmarkFor(id, version); });
    return out;
  },
  report({ auth, runNo }) {
    const u = userOf(auth);
    const results = {};
    db().rounds.filter((r) => r.candidateId === u.candidateId && r.runNo === runNo && r.mode === 'real' && r.status === 'completed')
      .forEach((r) => { results[r.module] ||= { metrics: r.metrics, moduleVersion: r.moduleVersion, benchmark: benchmarkFor(r.module, r.moduleVersion), endedAt: r.endedAt }; });
    return { runNo, results };
  },
  newRun({ auth }) {
    const u = userOf(auth);
    markAbandoned(u.candidateId);
    u.runsCompleted += 1;
    u.currentRun += 1;
    return identity(u);
  },
};

export async function mockCall(body) {
  await new Promise((r) => setTimeout(r, 120)); // feel like a network
  const h = handlers[body.action];
  if (!h) err('unknown_action');
  const out = await h(body);
  save();
  return JSON.parse(JSON.stringify(out));
}

// Debug helpers (only used with ?debug=1)
export const mockDb = { dump: () => db(), reset: () => { mem = null; try { localStorage.removeItem(KEY); } catch {} } };
