// Interaction logger (spec §6, v1.7).
//   Tier A/B  log(module, interaction, value, ctx) → one row each in Interactions.
//   Tier C    trace(roundUid, item) / setPartial(roundUid, metrics) → the round's single live RoundTraces row.
// Everything is batched into one `sync` request every 3 s (or 20 events), kept in an offline queue in
// localStorage, sent by sendBeacon when the page is closed, and de-duplicated server-side by event_id.
import { api } from './api.js';
import { session } from './session.js';
import { LOG_BATCH, LOG_FLUSH_MS, DEBUG } from './config.js';

const QKEY = 'thenurts_log_queue_v2';
const HOLD_MS = 8000; // wait this long for a round number before sending that round's events without it
let queue = [];       // events
let traces = {};      // roundUid → { cid, module, moduleVersion, mode, items: [], partial, elapsedMs, dirty }
let ends = [];        // roundEnd payloads that failed to send; retried on every flush
const rounds = {};    // roundUid → roundNo (once the server has numbered it)
let timer = null;
let flushing = false;
const listeners = new Set(); // debug panel

function persist() {
  try { localStorage.setItem(QKEY, JSON.stringify({ queue: queue.slice(-500), traces, ends: ends.slice(-20) })); } catch { /* ignore */ }
}
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(QKEY) || '{}');
    const fresh = (t) => Date.now() - t < 7 * 864e5;
    queue = (s.queue || []).filter((e) => fresh(e.client_ts)).concat(queue);
    Object.assign(traces, s.traces || {});
    ends = (s.ends || []).concat(ends);
  } catch { /* ignore */ }
}

const stringify = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const mine = (cid, sid) => cid === session.key || (!cid && sid === session.sessionId);

function schedule(now = false) {
  if (now) return flush();
  if (!timer) timer = setTimeout(flush, LOG_FLUSH_MS);
}

/** log('core', 'howto_open', value, { roundNo, roundUid, moduleVersion }) */
export function log(module, interaction, value = '', ctx = {}) {
  const e = {
    event_id: session.uuid(),
    cid: session.key, // null until identity is known; routes queued events (never sent)
    session_id: session.sessionId,
    client_ts: Date.now(),
    module,
    round_no: ctx.roundNo ?? (ctx.roundUid && rounds[ctx.roundUid]) ?? '',
    round_uid: ctx.roundUid || '',
    module_version: ctx.moduleVersion ?? '',
    interaction,
    value: stringify(value),
  };
  queue.push(e);
  persist();
  listeners.forEach((fn) => fn(e));
  if (DEBUG) console.debug('[log]', module, interaction, e.round_no, e.value);
  schedule(queue.length >= LOG_BATCH);
  return e;
}

// ---- tier C: one live record per round ----
export function openTrace(roundUid, { module, moduleVersion, mode }) {
  traces[roundUid] = { cid: session.key, module, moduleVersion, mode, items: [], partial: null, elapsedMs: 0, dirty: true };
  persist(); schedule();
}
export function trace(roundUid, item) {
  const t = traces[roundUid]; if (!t) return;
  t.items.push(item); t.dirty = true;
  if (DEBUG) listeners.forEach((fn) => fn({ module: t.module, round_no: '~', interaction: 'trace', value: JSON.stringify(item) }));
  if (t.items.length % 10 === 0) persist();
  schedule();
}
export function setPartial(roundUid, metrics, elapsedMs) {
  const t = traces[roundUid]; if (!t) return;
  t.partial = metrics; t.elapsedMs = Math.round(elapsedMs); t.dirty = true;
  persist(); schedule();
}
/** Remove and return what hasn't been sent yet, to ride along with roundEnd. */
export function takeTrace(roundUid) {
  const t = traces[roundUid]; if (!t) return null;
  delete traces[roundUid]; persist();
  return { roundUid, module: t.module, moduleVersion: t.moduleVersion, mode: t.mode, items: t.items, partial: t.partial, elapsedMs: t.elapsedMs };
}

// ---- round bookkeeping ----
/** The server has numbered this round: fill it into queued events. */
export function resolveRound(roundUid, roundNo) {
  rounds[roundUid] = roundNo;
  queue.forEach((e) => { if (e.round_uid === roundUid && !e.round_no) e.round_no = roundNo; });
  persist(); schedule(true);
}
/** roundEnd couldn't be delivered: keep it and retry on later flushes (and next visit). */
export function queueEnd(payload) { ends.push({ ...payload, cid: session.key }); persist(); schedule(); }

function readyEvents(filterFn) {
  const now = Date.now();
  return queue.filter((e) => filterFn(e) && (!e.round_uid || e.round_no || now - e.client_ts > HOLD_MS)).slice(0, 50);
}
function dirtyTraces(filterFn) {
  return Object.entries(traces).filter(([, t]) => t.dirty && filterFn(t))
    .map(([uid, t]) => ({ roundUid: uid, module: t.module, moduleVersion: t.moduleVersion, mode: t.mode, items: t.items.slice(), partial: t.partial, elapsedMs: t.elapsedMs }));
}
function markSent(evs, trs) {
  const ids = new Set(evs.map((e) => e.event_id));
  queue = queue.filter((e) => !ids.has(e.event_id));
  trs.forEach((s) => { const t = traces[s.roundUid]; if (t) { t.items.splice(0, s.items.length); t.dirty = t.items.length > 0; } });
  persist();
}
const strip = (e) => { const { cid, ...rest } = e; return rest; };

export async function flush() {
  clearTimeout(timer); timer = null;
  if (flushing) return;
  flushing = true;
  try {
    await sendOrphans();
    if (!session.known) return;
    for (const p of ends.filter((x) => x.cid === session.key)) {
      try { const { cid, ...body } = p; await api.roundEnd(body); ends = ends.filter((x) => x !== p); persist(); } catch { break; }
    }
    const evs = readyEvents((e) => mine(e.cid, e.session_id));
    const trs = dirtyTraces((t) => t.cid === session.key);
    if (!evs.length && !trs.length) return;
    await api.sync(evs.map(strip), trs);
    markSent(evs, trs);
  } catch {
    // keep everything; retry later
  } finally {
    flushing = false;
    const pending = queue.some((e) => mine(e.cid, e.session_id)) || Object.values(traces).some((t) => t.dirty && t.cid === session.key);
    if (pending && session.known) timer = setTimeout(flush, LOG_FLUSH_MS * 2);
  }
}

// Casual events left over from an earlier page load (e.g. the tab was closed) carry no PII, so they can be
// sent with their own session id, whoever is playing now.
async function sendOrphans() {
  const sids = new Set();
  queue.forEach((e) => { if (e.cid?.startsWith('casual:') && e.cid !== session.key) sids.add(e.cid.slice(7)); });
  Object.values(traces).forEach((t) => { if (t.cid?.startsWith('casual:') && t.cid !== session.key) sids.add(t.cid.slice(7)); });
  for (const sid of sids) {
    const cid = 'casual:' + sid;
    const evs = queue.filter((e) => e.cid === cid).slice(0, 50);
    const trs = dirtyTraces((t) => t.cid === cid);
    await api.sync(evs.map(strip), trs, { casual: true, sessionId: sid });
    markSent(evs, trs);
    Object.keys(traces).forEach((u) => { if (traces[u].cid === cid && !traces[u].dirty) delete traces[u]; });
    persist();
  }
}

// Page is closing: send everything we have for the current player, including live round traces.
export function flushBeacon() {
  if (!session.known) return;
  const evs = queue.filter((e) => mine(e.cid, e.session_id)).slice(0, 50);
  const trs = dirtyTraces((t) => t.cid === session.key);
  if (!evs.length && !trs.length) return;
  if (api.beacon('sync', { events: evs.map(strip), traces: trs })) markSent(evs, trs);
}

// Called after register/login: stamp this page load's anonymous events with the new identity.
export function claimAnonymous() {
  queue.forEach((e) => { if (!e.cid && e.session_id === session.sessionId) e.cid = session.key; });
  persist(); flush();
}

export function onLog(fn) { listeners.add(fn); return () => listeners.delete(fn); }

restore();
window.addEventListener('pagehide', flushBeacon);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushBeacon(); });
