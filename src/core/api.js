// Backend client. Real transport = Google Apps Script web app (spec §7).
// Bodies are sent as text/plain JSON so the browser skips the CORS preflight Apps Script can't answer.
import { API_URL, MOCK } from './config.js';
import { session } from './session.js';
import { mockCall } from './mockServer.js';

export class ApiError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

async function call(action, payload = {}, { retries = 2 } = {}) {
  const body = { action, auth: session.auth(), ...payload };
  if (MOCK) {
    try { return await mockCall(body); } catch (e) { throw new ApiError(e.code || 'mock_error', e.message); }
  }
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      const j = await r.json();
      if (!j.ok) throw new ApiError(j.error || 'server_error', j.message);
      return j.data;
    } catch (e) {
      if (e instanceof ApiError) throw e; // don't retry business errors
      lastErr = e;
      await new Promise((res) => setTimeout(res, 400 * 2 ** i));
    }
  }
  throw new ApiError('network', lastErr?.message);
}

// Fire-and-forget for page unload. Returns false if the browser refused to queue it.
function beacon(action, payload = {}) {
  const body = JSON.stringify({ action, auth: session.auth(), ...payload });
  if (MOCK) { mockCall(JSON.parse(body)); return true; }
  try { return navigator.sendBeacon(API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' })); } catch { return false; }
}

export const api = {
  register: (p) => call('register', p, { retries: 0 }),
  login: (p) => call('login', p, { retries: 0 }),
  roundStart: (p) => call('roundStart', p),
  roundEnd: (p) => call('roundEnd', p),
  log: (events) => call('log', { events }),
  benchmarks: (modules) => call('benchmarks', { modules }),
  report: (runNo) => call('report', { runNo }),
  newRun: () => call('newRun'),
  beacon,
};
