// Interaction logger (spec §6): batched every 3 s / 20 events, offline queue in localStorage,
// sendBeacon on pagehide, de-duplicated server-side by event_id.
import { api } from './api.js';
import { session } from './session.js';
import { LOG_BATCH, LOG_FLUSH_MS, DEBUG } from './config.js';

const QKEY = 'thenurts_log_queue_v1';
let queue = [];
let timer = null;
let flushing = false;
const listeners = new Set(); // debug panel

function persist() { try { localStorage.setItem(QKEY, JSON.stringify(queue.slice(-500))); } catch { /* ignore */ } }
function restore() {
  try { const q = JSON.parse(localStorage.getItem(QKEY) || '[]'); if (Array.isArray(q)) queue = q.filter((e) => Date.now() - e.client_ts < 7 * 864e5).concat(queue); } catch { /* ignore */ }
}

const stringify = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** log('core', 'howto_open', value, { roundNo, moduleVersion }) */
export function log(module, interaction, value = '', ctx = {}) {
  const e = {
    event_id: session.uuid(),
    cid: session.key, // null until identity is known; routes queued events (never sent)
    session_id: session.sessionId,
    client_ts: Date.now(),
    module,
    round_no: ctx.roundNo ?? '',
    module_version: ctx.moduleVersion ?? '',
    interaction,
    value: stringify(value),
  };
  // Events before identity is known (e.g. home screen taps) are held until login/register attaches an identity.
  queue.push(e);
  persist();
  listeners.forEach((fn) => fn(e));
  if (DEBUG) console.debug('[log]', module, interaction, e.round_no, e.value);
  if (queue.length >= LOG_BATCH) flush();
  else if (!timer) timer = setTimeout(flush, LOG_FLUSH_MS);
  return e;
}

export async function flush() {
  clearTimeout(timer); timer = null;
  if (!flushing) flushCasualOrphans();
  if (flushing || !queue.length || !session.known) return;
  flushing = true;
  // Only send events that belong to the current candidate (or were logged earlier in this page load
  // before identity was known). Queued events from another candidate on a shared device wait for them.
  const mine = (e) => e.cid === session.key || (!e.cid && e.session_id === session.sessionId);
  const batch = queue.filter(mine).slice(0, 50);
  if (!batch.length) { flushing = false; return; }
  try {
    await api.log(batch.map(({ cid, ...e }) => e));
    // Server de-dupes by event_id, so the whole sent batch can be cleared once the call succeeds.
    const done = new Set(batch.map((e) => e.event_id));
    queue = queue.filter((e) => !done.has(e.event_id));
    persist();
  } catch {
    // keep queue; retry later
  } finally {
    flushing = false;
    if (queue.some((e) => e.cid === session.key)) timer = setTimeout(flush, LOG_FLUSH_MS * 2);
  }
}

// Casual events left over from an earlier page load (e.g. the tab was closed) carry no PII, so they can be
// sent with their own session id, whoever is playing now.
async function flushCasualOrphans() {
  if (orphanBusy) return; orphanBusy = true;
  try { await sendOrphans(); } finally { orphanBusy = false; }
}
let orphanBusy = false;
async function sendOrphans() {
  const orphans = queue.filter((e) => e.cid?.startsWith('casual:') && e.cid !== session.key);
  const bySession = {};
  orphans.forEach((e) => { (bySession[e.cid.slice(7)] ||= []).push(e); });
  for (const [sid, evs] of Object.entries(bySession)) {
    try {
      await api.log(evs.slice(0, 50).map(({ cid, ...e }) => e), { casual: true, sessionId: sid });
      const sent = new Set(evs.slice(0, 50).map((e) => e.event_id));
      queue = queue.filter((e) => !sent.has(e.event_id)); persist();
    } catch { return; }
  }
}

// Unload: beacon whatever is queued (plus any final event already pushed by the caller).
export function flushBeacon() {
  if (!session.known) return;
  const batch = queue.filter((e) => e.cid === session.key || (!e.cid && e.session_id === session.sessionId)).slice(0, 50);
  if (!batch.length) return;
  if (api.beacon('log', { events: batch.map(({ cid, ...e }) => e) })) {
    const sent = new Set(batch.map((e) => e.event_id));
    queue = queue.filter((e) => !sent.has(e.event_id)); persist();
  }
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
