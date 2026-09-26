// Browser-local stand-in for the Apps Script backend (dev/testing only). Mirrors spec §6–7 behaviour:
// user id = "<email>|<phone>", casual players = "Casual User" (no PII, keyed internally by session),
// rounds numbered server-side, Users/Registrations/Rounds/Interactions tables.
import { CASUAL_ID, emailOk, phoneOk, normEmail, normPhone, userIdOf } from './identity.js';

const KEY = 'thenurts_mock_db_v2';
const q = new URLSearchParams(location.search);
const SEED_BENCH = q.get('seedbench') === '1';
const BENCH_INCLUDE_CASUAL = false; // spec §7: benchmarks use registered candidates only
let mem = null;

function db() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY)) || null; } catch { mem = null; }
  mem ||= { users: {}, casual: {}, registrations: [], rounds: [], interactions: [], seen: {} };
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode: memory only */ } }
const now = () => new Date().toISOString();
const err = (code) => { const e = new Error(code); e.code = code; throw e; };

/** Resolve the caller: a registered user row, or a per-session casual row. `key` scopes rounds. */
function who(auth) {
  if (auth?.casual && auth.sessionId) {
    const c = db().casual[auth.sessionId] ||= { sessionId: auth.sessionId, currentRun: 1, createdAt: now() };
    return { key: 'casual:' + auth.sessionId, row: c, casual: true };
  }
  const u = auth && db().users[auth.userId];
  if (!u || u.email !== normEmail(auth.email) || u.phone !== normPhone(auth.phone)) err('auth_failed');
  return { key: u.userId, row: u, casual: false };
}
function completedIn(key, runNo) {
  return [...new Set(db().rounds.filter((r) => r.key === key && r.runNo === runNo && r.mode === 'real' && r.status === 'completed').map((r) => r.module))];
}
function identity(w) {
  const r = w.row;
  const id = w.casual ? { userId: CASUAL_ID, casual: true } : { userId: r.userId, email: r.email, phone: r.phone, name: r.name };
  return { identity: id, runNo: r.currentRun, completed: completedIn(w.key, r.currentRun) };
}
function markAbandoned(key) {
  db().rounds.forEach((r) => { if (r.key === key && r.status === 'started') { r.status = 'abandoned'; r.endedAt = now(); } });
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function benchmarkFor(module, version) {
  const first = {};
  db().rounds
    .filter((r) => r.module === module && r.moduleVersion === version && r.mode === 'real' && r.status === 'completed' && (BENCH_INCLUDE_CASUAL || !r.casual))
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    .forEach((r) => { first[r.key] ||= r; });
  const rows = Object.values(first);
  const out = {};
  (rows[0] ? Object.keys(rows[0].metrics) : []).forEach((k) => {
    const vals = rows.map((r) => r.metrics[k]).filter((v) => typeof v === 'number');
    out[k] = { median: vals.length ? median(vals) : null, n: vals.length };
  });
  return out;
}

function seedFakes(module, version, metrics) {
  if (!SEED_BENCH) return;
  const have = db().rounds.filter((r) => r.module === module && r.key.startsWith('fake')).length;
  for (let i = have; i < 12; i++) {
    const m = {};
    Object.entries(metrics).forEach(([k, v]) => {
      let x = typeof v === 'number' ? Math.round(v * (0.55 + Math.random() * 0.9) * 10) / 10 : v;
      if (typeof x === 'number' && /accuracy|rate|pct/i.test(k)) x = Math.min(100, x);
      m[k] = x;
    });
    db().rounds.push({ key: 'fake' + i, casual: false, runNo: 1, module, moduleVersion: version, roundNo: '1', mode: 'real', startedAt: now(), endedAt: now(), status: 'completed', metrics: m });
  }
}

const handlers = {
  register({ profile, consent }) {
    const email = normEmail(profile.email), phone = normPhone(profile.phone);
    if (!emailOk(email)) err('invalid_email');
    if (!phoneOk(phone)) err('invalid_phone');
    if (!consent) err('consent_required');
    // Either identifier already in use → must log in (stops re-registering to get a fresh run).
    if (Object.values(db().users).some((u) => u.email === email || u.phone === phone)) err('already_registered');
    const u = { userId: userIdOf(email, phone), email, phone, name: profile.name, createdAt: now(), currentRun: 1, runsCompleted: 0 };
    db().users[u.userId] = u;
    db().registrations.push({ ts: now(), userId: u.userId, ...profile, email, phone, cv: profile.cvName || '', consent });
    return identity({ key: u.userId, row: u, casual: false });
  },
  login({ email, phone }) {
    const u = db().users[userIdOf(email, phone)];
    if (!u) err('login_fail');
    markAbandoned(u.userId);
    return identity({ key: u.userId, row: u, casual: false });
  },
  casualStart({ auth }) {
    const w = who(auth);
    return identity(w);
  },
  roundStart({ auth, module, mode, moduleVersion }) {
    const w = who(auth);
    markAbandoned(w.key);
    const run = w.row.currentRun;
    const n = db().rounds.filter((r) => r.key === w.key && r.runNo === run && r.module === module && r.mode === mode).length + 1;
    const roundNo = mode === 'practice' ? 'P' + n : String(n);
    db().rounds.push({ key: w.key, casual: w.casual, runNo: run, module, moduleVersion, roundNo, mode, startedAt: now(), endedAt: null, status: 'started', metrics: {} });
    let h = 2166136261; for (const ch of w.key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return { roundNo, runNo: run, seed: (h ^ (run * 7919) ^ (n * 104729) ^ (mode === 'practice' ? 0x5eed : 0)) >>> 0 };
  },
  roundEnd({ auth, module, roundNo, status, metrics }) {
    const w = who(auth);
    const r = db().rounds.find((x) => x.key === w.key && x.runNo === w.row.currentRun && x.module === module && x.roundNo === roundNo);
    if (r && r.status === 'started') Object.assign(r, { status, endedAt: now(), metrics: metrics || {} });
    if (r && status === 'completed' && r.mode === 'real') seedFakes(module, r.moduleVersion, metrics);
    return { benchmark: r ? benchmarkFor(module, r.moduleVersion) : {} };
  },
  log({ auth, events }) {
    const w = who(auth);
    const ack = [];
    events.forEach((e) => {
      if (db().seen[e.event_id]) return;
      db().seen[e.event_id] = 1;
      // Interactions columns (spec §6): timestamp, user_id, email, phone, module, round_no, interaction, value,
      // run_no, session_id, client_ts, event_id, module_version
      db().interactions.push([now(), w.casual ? CASUAL_ID : w.row.userId, w.casual ? '' : w.row.email, w.casual ? '' : w.row.phone,
        e.module, e.round_no, e.interaction, e.value, w.row.currentRun, e.session_id, e.client_ts, e.event_id, e.module_version]);
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
    const w = who(auth);
    const results = {};
    db().rounds.filter((r) => r.key === w.key && r.runNo === runNo && r.mode === 'real' && r.status === 'completed')
      .forEach((r) => { results[r.module] ||= { metrics: r.metrics, moduleVersion: r.moduleVersion, benchmark: benchmarkFor(r.module, r.moduleVersion), endedAt: r.endedAt }; });
    return { runNo, results };
  },
  newRun({ auth }) {
    const w = who(auth);
    markAbandoned(w.key);
    w.row.runsCompleted = (w.row.runsCompleted || 0) + 1;
    w.row.currentRun += 1;
    return identity(w);
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
