/**
 * The Nurts – candidate screening game backend (Google Apps Script web app bound to the results Sheet).
 * Spec: claude/01-architecture-spec.md §6–7 (v1.8). Reference behaviour: src/core/mockServer.js.
 *
 * Identity: registered user_id = "<email>|<phone>" (no NRIC anywhere). Casual players = "Casual User",
 * no PII, kept apart by session_id. All requests are POST bodies of JSON sent as text/plain.
 *
 * Logging tiers (spec §6): A/B events → one row each in Interactions; C (fine detail) → ONE live row per
 * round in RoundTraces, created when the round starts and updated every few seconds while it is played,
 * so a round abandoned by closing the window is still on record up to its last moment.
 *
 * First-time setup (once): run setup() from the editor, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Later changes: Deploy → Manage deployments → edit → New version.
 * After pasting this version, run setup() once more (it adds the new tabs/columns and keeps all data).
 */

var CASUAL_ID = 'Casual User';
// Developer mode (Game Ideas request #14). Enabled only while Script Property DEV_PIN is set; delete it to switch dev
// mode off on the server. Dev Test rows are written like casual rows, so benchmarks, Users and the Candidate Summary skip them.
var DEV_ID = 'Dev Test';
var BENCHMARK_INCLUDE_CASUAL = false;
var BENCHMARK_MIN_N = 5;
var STALE_MINUTES = 30;
var MAX_CV_BYTES = 5 * 1024 * 1024;
var TRACE_CELL_MAX = 48000; // Sheets cells hold ≤ 50,000 characters
var CV_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

// Sheet tabs and their columns. New columns may only ever be APPENDED on the right.
var TABS = {
  Interactions: ['timestamp', 'user_id', 'email', 'phone', 'module', 'round_no', 'interaction', 'value', 'run_no', 'session_id', 'client_ts', 'event_id', 'module_version', 'round_uid'],
  Registrations: ['timestamp', 'user_id', 'name', 'email', 'phone', 'employment_type', 'desired_function', 'cv_link', 'consent_version', 'consent_lang', 'user_agent'],
  Users: ['user_id', 'email', 'phone', 'name', 'created_at', 'current_run', 'runs_completed', 'last_seen'],
  Casual: ['session_id', 'created_at', 'current_run', 'last_seen'],
  Rounds: ['user_id', 'session_id', 'is_casual', 'run_no', 'module', 'module_version', 'round_no', 'mode', 'started_at', 'ended_at', 'status', 'primary_score', 'metrics_json', 'player_key', 'round_uid', 'seed', 'summary_json', 'position_in_run', 'module_order'],
  RoundTraces: ['round_uid', 'user_id', 'session_id', 'run_no', 'module', 'module_version', 'round_no', 'mode', 'status', 'started_at', 'updated_at', 'elapsed_ms', 'event_count', 'partial_metrics', 'trace', 'trace_overflow', 'truncated_events'],
};
// Columns stored as plain text so Sheets never turns "+60129876543" or round "1" into numbers.
var TEXT_COLS = { Interactions: ['user_id', 'phone', 'round_no', 'module_version'], Registrations: ['user_id', 'phone'], Users: ['user_id', 'phone'], Rounds: ['user_id', 'round_no', 'module_version', 'round_uid'], RoundTraces: ['round_uid', 'user_id', 'round_no', 'module_version'] };
function idx_(tab) { var o = {}; TABS[tab].forEach(function (c, i) { o[c] = i; }); return o; }
var RC = idx_('Rounds'), UC = idx_('Users'), TC = idx_('RoundTraces');

// ---------------------------------------------------------------- entry points

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  var fn = ACTIONS[body.action];
  if (!fn) return out_({ ok: false, error: 'unknown_action' });
  // Read-only actions never wait for the lock (alpha #35 A5: the report failed while a rescore held it). Writes wait up to
  // 25 s; if the Sheet is still busy the client is told "busy" and retries, so nothing is lost.
  var lock = READ_ONLY_ACTIONS[body.action] ? null : LockService.getScriptLock();
  try {
    if (lock) { try { lock.waitLock(25000); } catch (lx) { return out_({ ok: false, error: 'busy' }); } }
    var data;
    try { data = fn(body); } catch (first) { // Google's "Service Spreadsheets failed / timed out" is transient: try once more
      if (first && first.code || !/Service Spreadsheets|timed out/i.test(String(first && first.message))) throw first;
      Utilities.sleep(1000); data = fn(body);
    }
    return out_({ ok: true, data: data });
  } catch (err) {
    if (err && err.code) return out_({ ok: false, error: err.code });
    // Unexpected failure: keep a record in the Errors tab so it can be diagnosed, and give the player a reference.
    var ref = Utilities.getUuid().slice(0, 8).toUpperCase();
    reportError_(ref, body, err);
    return out_({ ok: false, error: 'server_error', ref: ref });
  } finally {
    try { if (lock) lock.releaseLock(); } catch (x) { /* not held */ }
  }
}

var READ_ONLY_ACTIONS = { report: true, benchmarks: true };

function doGet() {
  return out_({ ok: true, data: { service: 'The Nurts screening game API', time: new Date().toISOString() } });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Adds a "The Nurts" menu to the Sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('The Nurts')
    .addItem('Refresh Candidate Summary', 'refreshSummary')
    .addItem('Rescore all', 'rescoreAll')
    .addItem('Make a one-pager for the selected candidate', 'onePager')
    .addSeparator()
    .addItem('Delete Dev Test rows', 'deleteDevRows')
    .addItem('Archive and purge…', 'archiveAndPurge')
    .addToUi();
}

// ---------------------------------------------------------------- helpers

function fail_(code) { var e = new Error(code); e.code = code; throw e; }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name) { return ss_().getSheetByName(name) || fail_('setup_needed'); }
function now_() { return new Date(); }
function cache_() { return CacheService.getScriptCache(); }
function normEmail_(v) { return String(v || '').trim().toLowerCase(); }
function normPhone_(v) { return String(v || '').trim(); }
function emailOk_(v) { return /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(v) && v.length <= 120; }
function phoneOk_(v) { return /^\+[1-9]\d{7,14}$/.test(v); }
function userIdOf_(email, phone) { return normEmail_(email) + '|' + normPhone_(phone); }
function str_(v, max) { v = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return v.length > (max || 45000) ? v.slice(0, max || 45000) : v; }
// Stop spreadsheet formula injection from user-typed text.
function safe_(v) { v = str_(v, 45000); return /^[=+\-@]/.test(v) && !/^\+\d+$/.test(v) ? "'" + v : v; }
function uid_(v) { return String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40); }

function rows_(name) {
  var sh = sh_(name); var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, sh.getLastColumn()).getValues() : [];
}
function append_(name, rows) {
  if (!rows.length) return 0;
  var sh = sh_(name); var at = sh.getLastRow() + 1;
  sh.getRange(at, 1, rows.length, rows[0].length).setValues(rows);
  return at;
}
function findRow_(name, col, value) { // 1-based sheet row number, or 0
  var sh = sh_(name); var n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var vals = sh.getRange(2, col + 1, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === value) return i + 2;
  return 0;
}
/** Row lookup with a short-lived cache (rows are only ever appended, never moved). */
function cachedRow_(tab, col, value) {
  var ck = 'row:' + tab + ':' + value; var hit = cache_().get(ck);
  if (hit) { var r = Number(hit); if (String(sh_(tab).getRange(r, col + 1).getValue()) === value) return r; }
  var found = findRow_(tab, col, value);
  if (found) cache_().put(ck, String(found), 21600);
  return found;
}

/** Resolve the caller. Returns { key, casual, userId, email, phone, run, rowNo, tab }. */
function who_(auth) {
  if (auth && auth.dev) { // developer mode: a short-lived token from devAuth
    if (!devPin_() || !auth.devToken || !cache_().get('devtok:' + String(auth.devToken).slice(0, 64))) fail_('dev_refused');
    var dsid = String(auth.sessionId || '').slice(0, 64); if (!dsid) fail_('dev_refused');
    var drun = Number(cache_().get('devrun:' + dsid)) || 1;
    return { key: 'dev:' + dsid, casual: true, dev: true, userId: DEV_ID, email: '', phone: '', run: drun, rowNo: 0, tab: '', sessionId: dsid };
  }
  if (auth && auth.casual && auth.sessionId) {
    var sid = String(auth.sessionId).slice(0, 64);
    var r = cachedRow_('Casual', 0, sid);
    if (!r) { r = append_('Casual', [[sid, now_(), 1, now_()]]); cache_().put('row:Casual:' + sid, String(r), 21600); }
    var run = Number(sh_('Casual').getRange(r, 3).getValue()) || 1;
    return { key: 'casual:' + sid, casual: true, userId: CASUAL_ID, email: '', phone: '', run: run, rowNo: r, tab: 'Casual', sessionId: sid };
  }
  if (!auth || !auth.userId) fail_('auth_failed');
  var row = cachedRow_('Users', UC.user_id, String(auth.userId));
  if (!row) fail_('auth_failed');
  var u = sh_('Users').getRange(row, 1, 1, TABS.Users.length).getValues()[0];
  if (u[UC.email] !== normEmail_(auth.email) || String(u[UC.phone]) !== normPhone_(auth.phone)) fail_('auth_failed');
  return { key: u[UC.user_id], casual: false, userId: u[UC.user_id], email: u[UC.email], phone: String(u[UC.phone]), name: u[UC.name], run: Number(u[UC.current_run]) || 1, rowNo: row, tab: 'Users' };
}

function completedIn_(key, run) {
  var done = {};
  rows_('Rounds').forEach(function (r) {
    if (r[RC.player_key] === key && Number(r[RC.run_no]) === run && r[RC.mode] === 'real' && r[RC.status] === 'completed') done[r[RC.module]] = 1;
  });
  return Object.keys(done);
}

function identity_(w) {
  var id = w.dev ? { userId: DEV_ID, casual: true, dev: true } : w.casual ? { userId: CASUAL_ID, casual: true } : { userId: w.userId, email: w.email, phone: w.phone, name: w.name };
  return { identity: id, runNo: w.run, completed: completedIn_(w.key, w.run) };
}

function touch_(w) { // last_seen
  if (w.dev) return;
  var col = w.tab === 'Users' ? UC.last_seen + 1 : 4;
  sh_(w.tab).getRange(w.rowNo, col).setValue(now_());
}

/** Close this player's previously open round (tracked in cache) as abandoned. The hourly job catches the rest. */
function closeOpenRound_(key, exceptUid) {
  var open = cache_().get('open:' + key);
  if (!open || open === exceptUid) return;
  setRoundStatus_(open, 'abandoned', null, null);
  cache_().remove('open:' + key);
}

function setRoundStatus_(roundUid, status, primary, metrics) {
  var r = cachedRow_('Rounds', RC.round_uid, roundUid);
  if (r) {
    var sh = sh_('Rounds');
    if (sh.getRange(r, RC.status + 1).getValue() === 'started') {
      sh.getRange(r, RC.ended_at + 1, 1, 4).setValues([[now_(), status, primary == null ? '' : primary, metrics ? str_(metrics) : '']]);
    }
  }
  var t = cachedRow_('RoundTraces', TC.round_uid, roundUid);
  if (t) {
    var ts = sh_('RoundTraces');
    if (ts.getRange(t, TC.status + 1).getValue() === 'started') { ts.getRange(t, TC.status + 1).setValue(status); ts.getRange(t, TC.updated_at + 1).setValue(now_()); }
  }
  return r;
}

function median_(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Median of each metric over each player's FIRST completed real round of this module version. Cached 5 min. */
function benchmarkFor_(module, version, fresh) {
  var ck = 'bench:' + module + ':' + version;
  if (!fresh) { var hit = cache_().get(ck); if (hit) return JSON.parse(hit); }
  var first = {};
  rows_('Rounds').forEach(function (r) {
    if (r[RC.module] !== module || String(r[RC.module_version]) !== String(version) || r[RC.mode] !== 'real' || r[RC.status] !== 'completed') return;
    if (!BENCHMARK_INCLUDE_CASUAL && (r[RC.is_casual] === true || r[RC.is_casual] === 'TRUE')) return;
    var k = r[RC.player_key]; var t = new Date(r[RC.ended_at]).getTime();
    if (!first[k] || t < first[k].t) first[k] = { t: t, m: JSON.parse(r[RC.metrics_json] || '{}') };
  });
  var list = Object.keys(first).map(function (k) { return first[k].m; });
  var outp = {}; var keys = {};
  list.forEach(function (m) { Object.keys(m).forEach(function (k) { keys[k] = 1; }); });
  Object.keys(keys).forEach(function (k) {
    var vals = list.map(function (m) { return m[k]; }).filter(function (v) { return typeof v === 'number'; });
    outp[k] = { median: vals.length >= BENCHMARK_MIN_N ? median_(vals) : null, n: vals.length };
  });
  cache_().put(ck, JSON.stringify(outp), 300);
  return outp;
}

function saveCv_(cv, email) {
  if (!cv || !cv.data) return '';
  var ext = String(cv.name || '').split('.').pop().toLowerCase();
  if (!CV_TYPES[ext]) fail_('invalid_cv');
  var bytes = Utilities.base64Decode(cv.data);
  if (bytes.length > MAX_CV_BYTES) fail_('invalid_cv');
  var folderId = PropertiesService.getScriptProperties().getProperty('CV_FOLDER_ID');
  if (!folderId) fail_('setup_needed');
  var stamp = Utilities.formatDate(now_(), 'Asia/Kuala_Lumpur', 'yyyyMMdd-HHmmss');
  var file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, CV_TYPES[ext], email + '_' + stamp + '.' + ext));
  return file.getUrl();
}

/** Create the round's Rounds row and its live RoundTraces row. Idempotent on round_uid. */
function ensureRound_(w, b) {
  var uid = uid_(b.roundUid); if (!uid) fail_('bad_round');
  var existing = cachedRow_('Rounds', RC.round_uid, uid);
  if (existing) return { row: existing, roundNo: String(sh_('Rounds').getRange(existing, RC.round_no + 1).getValue()) };
  var mode = b.mode === 'practice' ? 'practice' : 'real';
  var n = 1;
  rows_('Rounds').forEach(function (r) { if (r[RC.player_key] === w.key && Number(r[RC.run_no]) === w.run && r[RC.module] === b.module && r[RC.mode] === mode) n++; });
  var roundNo = mode === 'practice' ? 'P' + n : String(n);
  var t = now_();
  var row = append_('Rounds', [[w.userId, w.casual ? w.sessionId : '', w.casual, w.run, safe_(b.module), str_(b.moduleVersion), roundNo, mode, t, '', 'started', '', '', w.key, uid, Number(b.seed) >>> 0, '', Number(b.positionInRun) || '', str_(b.moduleOrder || '', 200)]]);
  cache_().put('row:Rounds:' + uid, String(row), 21600);
  cache_().put('rno:' + uid, roundNo, 21600);
  var tr = cachedRow_('RoundTraces', TC.round_uid, uid);
  if (tr) sh_('RoundTraces').getRange(tr, TC.round_no + 1).setValue(roundNo); // trace arrived first
  else {
    tr = append_('RoundTraces', [[uid, w.userId, w.casual ? w.sessionId : '', w.run, safe_(b.module), str_(b.moduleVersion), roundNo, mode, 'started', t, t, 0, 0, '', '', '', 0]]);
    cache_().put('row:RoundTraces:' + uid, String(tr), 21600);
  }
  return { row: row, roundNo: roundNo };
}

/** Append fine-detail items to the round's live trace row (tier C). */
function appendTrace_(w, tr) {
  var uid = uid_(tr.roundUid); if (!uid) return;
  var sh = sh_('RoundTraces');
  var row = cachedRow_('RoundTraces', TC.round_uid, uid);
  if (!row) {
    var t = now_();
    row = append_('RoundTraces', [[uid, w.userId, w.casual ? w.sessionId : '', w.run, safe_(tr.module), str_(tr.moduleVersion), cache_().get('rno:' + uid) || '', tr.mode === 'practice' ? 'practice' : 'real', 'started', t, t, 0, 0, '', '', '', 0]]);
    cache_().put('row:RoundTraces:' + uid, String(row), 21600);
  }
  var cur = sh.getRange(row, 1, 1, TABS.RoundTraces.length).getValues()[0];
  var items = (tr.items || []).map(function (it) { return JSON.stringify(it); });
  var trace = String(cur[TC.trace] || ''), over = String(cur[TC.trace_overflow] || ''), dropped = Number(cur[TC.truncated_events]) || 0;
  items.forEach(function (s) {
    if (trace.length + s.length + 1 <= TRACE_CELL_MAX) trace += (trace ? '\n' : '') + s;
    else if (over.length + s.length + 1 <= TRACE_CELL_MAX) over += (over ? '\n' : '') + s;
    else dropped++;
  });
  var count = (Number(cur[TC.event_count]) || 0) + items.length;
  var partial = tr.partial != null ? str_(tr.partial, 4000) : cur[TC.partial_metrics];
  var elapsed = tr.elapsedMs != null ? Number(tr.elapsedMs) : cur[TC.elapsed_ms];
  sh.getRange(row, TC.updated_at + 1, 1, 7).setValues([[now_(), elapsed, count, partial, trace, over, dropped]]);
}

function logRows_(w, events) {
  var cache = cache_();
  var ids = events.map(function (e) { return 'ev:' + e.event_id; });
  var seen = ids.length ? cache.getAll(ids) : {};
  var fresh = [], mark = {};
  events.forEach(function (e, i) {
    if (!e.event_id || seen[ids[i]] || mark[ids[i]]) return;
    mark[ids[i]] = '1';
    var rno = str_(e.round_no) || (e.round_uid ? cache.get('rno:' + uid_(e.round_uid)) || '' : '');
    fresh.push([now_(), w.userId, w.email, w.phone, safe_(e.module), rno, safe_(e.interaction), safe_(e.value), w.run,
      str_(e.session_id || w.sessionId || ''), Number(e.client_ts) || '', str_(e.event_id), str_(e.module_version), uid_(e.round_uid)]);
  });
  append_('Interactions', fresh);
  if (Object.keys(mark).length) cache.putAll(mark, 21600);
}

// ---------------------------------------------------------------- actions (spec §7)

var ACTIONS = {
  /** Developer mode sign-in: the PIN lives only in Script Property DEV_PIN (never in the public code). */
  devAuth: function (b) {
    var pin = devPin_(); if (!pin) fail_('dev_refused');
    var tries = Number(cache_().get('devfail')) || 0;
    if (tries >= 10) fail_('dev_locked'); // 10 wrong PINs → locked for 10 minutes
    if (String(b.pin || '') !== pin) { cache_().put('devfail', String(tries + 1), 600); fail_('dev_pin'); }
    var token = Utilities.getUuid();
    cache_().put('devtok:' + token, '1', 21600);
    return { token: token };
  },
  register: function (b) {
    var p = b.profile || {};
    var email = normEmail_(p.email), phone = normPhone_(p.phone);
    if (!emailOk_(email)) fail_('invalid_email');
    if (!phoneOk_(phone)) fail_('invalid_phone');
    if (!b.consent) fail_('consent_required');
    var users = rows_('Users');
    for (var i = 0; i < users.length; i++) if (users[i][UC.email] === email || String(users[i][UC.phone]) === phone) fail_('already_registered');
    var uid = userIdOf_(email, phone);
    // A CV problem must never block registration: record why, and tell the player to email it instead.
    var cvLink = '', cvFailed = false;
    try { cvLink = saveCv_(b.cv, email); }
    catch (cvErr) { cvFailed = true; cvLink = 'NOT SAVED: ' + (cvErr.code || 'error'); if (!cvErr.code) reportError_('CV', b, cvErr); }
    var t = now_();
    append_('Users', [[uid, email, phone, safe_(p.name), t, 1, 0, t]]);
    append_('Registrations', [[t, uid, safe_(p.name), email, phone, safe_(p.employmentType), safe_(p.desiredFunction), cvLink, str_(b.consentVersion), str_(b.consentLang), str_(b.userAgent || '', 300)]]);
    return { identity: { userId: uid, email: email, phone: phone, name: p.name }, runNo: 1, completed: [], cvFailed: cvFailed };
  },

  login: function (b) {
    var email = normEmail_(b.email), phone = normPhone_(b.phone);
    if (!cachedRow_('Users', UC.user_id, userIdOf_(email, phone))) {
      append_('Interactions', [[now_(), '', emailOk_(email) ? email : '', '', 'core', '', 'login_fail', 'no_match', '', '', '', Utilities.getUuid(), '', '']]);
      fail_('login_fail');
    }
    var w = who_({ userId: userIdOf_(email, phone), email: email, phone: phone });
    closeOpenRound_(w.key, null); touch_(w);
    return identity_(w);
  },

  casualStart: function (b) {
    var w = who_(b.auth);
    if (!w.casual) fail_('auth_failed');
    return identity_(w);
  },

  /** Called in the background as the countdown starts. The client supplies round_uid + seed; retries are safe. */
  roundStart: function (b) {
    var w = who_(b.auth);
    closeOpenRound_(w.key, uid_(b.roundUid));
    var r = ensureRound_(w, b);
    cache_().put('open:' + w.key, uid_(b.roundUid), 21600);
    touch_(w);
    return { roundNo: r.roundNo, runNo: w.run };
  },

  /** Upsert: if roundStart never arrived (offline, closed tab), the round is created here, so it is never lost. */
  roundEnd: function (b) {
    var w = who_(b.auth);
    var uid = uid_(b.roundUid);
    var r = ensureRound_(w, b);
    var status = ['completed', 'quit', 'abandoned'].indexOf(b.status) >= 0 ? b.status : 'quit';
    var rowNo = setRoundStatus_(uid, status, b.primary, b.metrics);
    if (rowNo && b.summary) sh_('Rounds').getRange(rowNo, RC.summary_json + 1).setValue(str_(b.summary, 4000));
    if (b.trace) appendTrace_(w, b.trace);
    if (cache_().get('open:' + w.key) === uid) cache_().remove('open:' + w.key);
    var version = sh_('Rounds').getRange(r.row, RC.module_version + 1).getValue();
    var mode = sh_('Rounds').getRange(r.row, RC.mode + 1).getValue();
    return { roundNo: r.roundNo, benchmark: benchmarkFor_(b.module, version, status === 'completed' && mode === 'real') };
  },

  /** Batched upload every few seconds: tier A/B events → Interactions rows; tier C → live RoundTraces rows. */
  sync: function (b) {
    var w = who_(b.auth);
    logRows_(w, (b.events || []).slice(0, 100));
    (b.traces || []).slice(0, 10).forEach(function (tr) { appendTrace_(w, tr); });
    return { ok: true };
  },

  log: function (b) { // kept for older clients
    var w = who_(b.auth);
    logRows_(w, (b.events || []).slice(0, 100));
    return { ack: (b.events || []).map(function (e) { return e.event_id; }) };
  },

  benchmarks: function (b) {
    var o = {};
    (b.modules || []).forEach(function (m) { o[m.id] = benchmarkFor_(m.id, m.version); });
    return o;
  },

  report: function (b) {
    var w = who_(b.auth);
    var run = Number(b.runNo) || w.run;
    var results = {};
    rows_('Rounds').forEach(function (r) {
      if (r[RC.player_key] !== w.key || Number(r[RC.run_no]) !== run || r[RC.mode] !== 'real' || r[RC.status] !== 'completed' || results[r[RC.module]]) return;
      results[r[RC.module]] = { metrics: JSON.parse(r[RC.metrics_json] || '{}'), moduleVersion: r[RC.module_version], endedAt: r[RC.ended_at] };
    });
    Object.keys(results).forEach(function (m) { results[m].benchmark = benchmarkFor_(m, results[m].moduleVersion); });
    return { runNo: run, results: results };
  },

  newRun: function (b) {
    var w = who_(b.auth);
    closeOpenRound_(w.key, null);
    if (w.dev) { cache_().put('devrun:' + w.sessionId, String(w.run + 1), 21600); w.run += 1; return identity_(w); }
    var sh = sh_(w.tab);
    if (w.casual) sh.getRange(w.rowNo, 3).setValue(w.run + 1);
    else {
      var done = Number(sh.getRange(w.rowNo, UC.runs_completed + 1).getValue()) || 0;
      sh.getRange(w.rowNo, UC.current_run + 1, 1, 2).setValues([[w.run + 1, done + 1]]);
    }
    w.run += 1;
    return identity_(w);
  },
};

// ---------------------------------------------------------------- Candidate Summary (derived; rebuilt, never edited by hand)

/**
 * One row per registered candidate, per module: official score (current run), real attempts, unfinished
 * attempts (quit/abandoned), practice rounds, read How to play BEFORE the first real attempt, how-to views
 * (more than 1 = re-read) and seconds, practised first, and times they left the game mid-round.
 * Rebuilt hourly and from the "The Nurts" menu.
 */
function refreshSummary() { buildSummaryGuarded_(60000); }
/** The derived tabs only READ the raw tabs, so rebuilding them never takes the players' lock (alpha #35 A5). A document lock
 * stops two rebuilds overlapping: the hourly job skips if one is running; the menu waits up to a minute. */
function buildSummaryGuarded_(waitMs) {
  var dl = null; try { dl = LockService.getDocumentLock(); } catch (x) { dl = null; }
  if (dl && !dl.tryLock(waitMs)) { try { SpreadsheetApp.getUi().alert('A rescore is already running. Try again in a minute.'); } catch (x) { /* trigger */ } return false; }
  try { buildSummary_(); return true; } finally { try { if (dl) dl.releaseLock(); } catch (x) { /* not held */ } }
}
function buildSummary_() {
  var users = rows_('Users'), regs = rows_('Registrations'), rounds = rows_('Rounds');
  var reg = {}; regs.forEach(function (r) { reg[r[1]] = r; });
  var modules = []; rounds.forEach(function (r) { if (modules.indexOf(r[RC.module]) < 0) modules.push(r[RC.module]); });
  var how = {}; // key user|module → { first: ms, secs, views }
  var ic = idx_('Interactions');
  rows_('Interactions').forEach(function (r) {
    var it = r[ic.interaction]; // 'howto' = one row per viewing (v1.8); howto_open/close = older rows
    if (it !== 'howto' && it !== 'howto_open' && it !== 'howto_close') return;
    var k = r[ic.user_id] + '|' + r[ic.module]; var h = how[k] || (how[k] = { first: null, secs: 0, views: 0 });
    var t = new Date(r[ic.timestamp]).getTime();
    if (it !== 'howto_close') { h.views++; if (h.first === null || t < h.first) h.first = t; }
    if (it !== 'howto_open') { try { h.secs += Math.round((JSON.parse(r[ic.value]).dwellMs || 0) / 1000); } catch (x) { /* ignore */ } }
  });
  var away = {}; // key user|module → times the player left the game mid-round (tab switch / app switch)
  rows_('RoundTraces').forEach(function (r) {
    if (r[TC.mode] !== 'real') return;
    var n = (String(r[TC.trace]) + String(r[TC.trace_overflow])).split('"app_hidden"').length - 1;
    if (n) { var k = r[TC.user_id] + '|' + r[TC.module]; away[k] = (away[k] || 0) + n; }
  });
  var sumKeys = {}; // module → ordered staff-facing keys (from each game's manifest.summaryKeys)
  rounds.forEach(function (r) {
    if (!r[RC.summary_json]) return;
    try { Object.keys(JSON.parse(r[RC.summary_json])).forEach(function (k) { var a = sumKeys[r[RC.module]] || (sumKeys[r[RC.module]] = []); if (a.indexOf(k) < 0) a.push(k); }); } catch (x) { /* ignore */ }
  });
  var per = {}; // user|module → stats
  rounds.forEach(function (r) {
    var k = r[RC.user_id] + '|' + r[RC.module]; var s = per[k] || (per[k] = { attempts: 0, unfinished: 0, practice: 0, firstReal: null, firstPractice: null, score: '', summary: null });
    var t = new Date(r[RC.started_at]).getTime();
    if (r[RC.mode] === 'practice') { s.practice++; if (s.firstPractice === null || t < s.firstPractice) s.firstPractice = t; return; }
    s.attempts++;
    if (r[RC.status] === 'quit' || r[RC.status] === 'abandoned') s.unfinished++;
    if (s.firstReal === null || t < s.firstReal) s.firstReal = t;
  });
  // official score = the FIRST completed real round of each game, in any run (Framework: only the first completed real round
  // counts; a later "Start a new run" must not hide it, alpha #35 A4). Later runs show up as real attempts + the brute-force flag.
  rounds.filter(function (r) { return r[RC.mode] === 'real' && r[RC.status] === 'completed'; })
    .sort(function (a, b) { return new Date(a[RC.started_at]).getTime() - new Date(b[RC.started_at]).getTime(); })
    .forEach(function (r) {
      var s = per[r[RC.user_id] + '|' + r[RC.module]];
      if (s && s.score === '') { s.score = r[RC.primary_score]; try { s.summary = r[RC.summary_json] ? JSON.parse(r[RC.summary_json]) : null; } catch (x) { s.summary = null; } }
    });
  var head = ['user_id', 'name', 'email', 'phone', 'employment_type', 'desired_function', 'cv_link', 'registered_at', 'last_seen', 'current_run', 'runs_completed'];
  modules.forEach(function (m) { head.push(m + ': score', m + ': real attempts', m + ': unfinished', m + ': practice rounds', m + ': read how-to first', m + ': how-to views', m + ': how-to secs', m + ': practised first', m + ': left mid-round'); (sumKeys[m] || []).forEach(function (k) { head.push(m + ': ' + k); }); });
  // Scoring layer (requests #28–31): the same pipeline builds the Scores / Norms / Insights / Validity tabs; the Summary
  // shows its headline columns next to the raw per-game ones.
  var scored = runScoring_(users, regs, rounds, away);
  var byUser = {}; scored.scores.forEach(function (x) { byUser[x.user_id] = x; });
  var SUMMARY_SCORE_KEYS = ['stage'].concat([].concat.apply([], NurtsScoring.TRAITS_OUT.map(function (t) { return [t, t + ' band']; })))
    .concat(['roleFit', 'fitJunior', 'fitMid', 'fitLead', 'bestFitFunction', 'autonomy', 'ethicsGate', 'ethicsDetail', 'redFlags', 'notes', 'positives', 'caveats', 'practisedNote', 'scoringVersion']);
  SUMMARY_SCORE_KEYS.forEach(function (k) { head.push(k); });
  var out = [head];
  users.forEach(function (u) {
    var g = reg[u[UC.user_id]] || [];
    var row = [u[UC.user_id], u[UC.name], u[UC.email], u[UC.phone], g[5] || '', g[6] || '', g[7] || '', u[UC.created_at], u[UC.last_seen], u[UC.current_run], u[UC.runs_completed]];
    modules.forEach(function (m) {
      var k = u[UC.user_id] + '|' + m; var s = per[k]; var h = how[k];
      var extra = (sumKeys[m] || []).map(function (sk) { return s && s.summary && s.summary[sk] != null ? s.summary[sk] : ''; });
      if (!s) { row.push('', 0, 0, 0, '', h ? h.views : 0, h ? h.secs : 0, '', 0); row.push.apply(row, extra); return; }
      var before = function (t) { return t !== null && (s.firstReal === null || t < s.firstReal); };
      row.push(s.score, s.attempts, s.unfinished, s.practice, before(h ? h.first : null) ? 'Y' : 'N', h ? h.views : 0, h ? h.secs : 0, before(s.firstPractice) ? 'Y' : 'N', away[k] || 0);
      row.push.apply(row, extra);
    });
    var sc = byUser[u[UC.user_id]] || {};
    SUMMARY_SCORE_KEYS.forEach(function (k) { row.push(cell_(sc[k])); });
    out.push(row);
  });
  var ss = ss_(); var sh = ss.getSheetByName('Candidate Summary') || ss.insertSheet('Candidate Summary', 0);
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setNumberFormat('@');
  sh.getRange(1, 4, out.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, out.length, head.length).setValues(out);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#FED33C');
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
}

// ---------------------------------------------------------------- scoring layer (requests #28–31; claude/13-scoring-layer-design.md)
// The formulas live in scoring.gs (a build of src/scoring/, the same code the tests run). Raw tabs are never changed here:
// every derived tab is rebuilt from them and stamped with scoringVersion + stage.
var SCORING_TABS = { config: 'ScoringConfig', scores: 'Scores', norms: 'Norms', insights: 'Insights', calibration: 'Calibration', validity: 'Validity', purges: 'Purges', onePager: 'One-pager' };

/** A cell value: numbers stay numbers, text is made formula-safe. */
function cell_(v) { return v == null ? '' : typeof v === 'number' || typeof v === 'boolean' ? v : safe_(v); }

/** ScoringConfig tab → { key: value } (JSON values, or plain text). Missing keys use the defaults in scoring.gs. */
function readConfig_() {
  var sh = ss_().getSheetByName(SCORING_TABS.config); if (!sh || sh.getLastRow() < 2) return {};
  var o = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var k = String(r[0] || '').trim(); if (!k) return;
    var v = r[1]; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (x) { /* plain text, e.g. alpha */ } }
    o[k] = v;
  });
  return o;
}

/** Rewrites a derived tab: a header row from `keys`, then one row per object. */
function writeTab_(name, keys, objs, note) {
  var ss = ss_(); var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  var out = [keys].concat(objs.map(function (o) { return keys.map(function (k) { return cell_(o[k]); }); }));
  sh.getRange(1, 1, out.length, keys.length).setValues(out);
  sh.getRange(1, 1, 1, keys.length).setFontWeight('bold').setBackground(note ? '#F1D5FA' : '#FED33C');
  sh.setFrozenRows(1);
  return sh;
}

function tabObjects_(name) {
  var sh = ss_().getSheetByName(name); if (!sh || sh.getLastRow() < 2) return [];
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; }).filter(function (o) { return o.user_id; });
}

/** Builds the pipeline input from the raw tabs, runs it, and writes Scores / Norms / Insights / Validity. */
function runScoring_(users, regs, rounds, away) {
  setupScoringTabs_(); // existing Sheets get the new tabs on their first rescore
  var ic = idx_('Interactions');
  var reg = {}; regs.forEach(function (r) { reg[r[1]] = { employmentType: r[5], desiredFunction: r[6] }; });
  var input = {
    config: readConfig_(), now: Date.now(), away: away || {}, registrations: reg,
    users: users.map(function (u) { return { userId: u[UC.user_id], name: u[UC.name], currentRun: Number(u[UC.current_run]) || 1, runsCompleted: Number(u[UC.runs_completed]) || 0 }; }),
    rounds: rounds.map(function (r) {
      var m = null; try { m = r[RC.metrics_json] ? JSON.parse(r[RC.metrics_json]) : null; } catch (x) { m = null; }
      return { userId: r[RC.user_id], isCasual: r[RC.is_casual] === true || r[RC.is_casual] === 'TRUE' || r[RC.user_id] === CASUAL_ID || r[RC.user_id] === DEV_ID, runNo: Number(r[RC.run_no]) || 1, module: r[RC.module], moduleVersion: String(r[RC.module_version]), mode: r[RC.mode], status: r[RC.status], startedAt: new Date(r[RC.started_at]).getTime() || 0, metrics: m };
    }),
    interactions: rows_('Interactions').filter(function (r) { return /^eth_/.test(r[ic.interaction]); }).map(function (r) {
      var v = {}; try { v = JSON.parse(r[ic.value]) || {}; } catch (x) { v = {}; }
      return { userId: r[ic.user_id], runNo: Number(r[ic.run_no]) || 1, interaction: r[ic.interaction], value: v, t: Number(r[ic.client_ts]) || new Date(r[ic.timestamp]).getTime() };
    }),
  };
  var res = NurtsScoring.scoreAll(input);
  // keep the previous version's scores when the version changes (so old and new can be compared)
  var old = ss_().getSheetByName(SCORING_TABS.scores);
  if (old && old.getLastRow() > 1) {
    var h = old.getRange(1, 1, 1, old.getLastColumn()).getValues()[0], vi = h.indexOf('scoringVersion');
    var was = vi >= 0 ? old.getRange(2, vi + 1).getValue() : '';
    if (was && was !== res.scoringVersion && !ss_().getSheetByName('Scores ' + was)) {
      var snap = ss_().insertSheet('Scores ' + was); var vals = old.getRange(1, 1, old.getLastRow(), old.getLastColumn()).getValues();
      snap.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
    }
  }
  var keys = res.scores.length ? Object.keys(res.scores[0]) : ['stage', 'scoringVersion', 'scoredAt', 'user_id'];
  writeTab_(SCORING_TABS.scores, keys, res.scores);
  writeTab_(SCORING_TABS.norms, ['module', 'moduleVersion', 'trait', 'n', 'p20', 'p50', 'p70', 'status', 'stage', 'scoringVersion'], res.norms);
  writeTab_(SCORING_TABS.insights, ['stage', 'user_id', 'name', 'role', 'headline', 'autonomy', 'probe first', 'red flags', 'read with care', 'not measured', 'scoringVersion'], res.insights);
  var val = NurtsScoring.validity(res.scores, tabObjects_(SCORING_TABS.calibration), res.config);
  writeTab_(SCORING_TABS.validity, ['trait', 'rater item', 'n', 'AUC', 'mean score Y', 'mean score N', 'band × answer', 'rater agreement', 'note', 'status'], val);
  return res;
}

/** Menu → The Nurts → Rescore all: rebuilds every derived tab from the raw data with the current ScoringConfig. */
function rescoreAll() {
  if (!buildSummaryGuarded_(60000)) return;
  try { SpreadsheetApp.getUi().alert('Rescored everyone with ScoringConfig ' + (readConfig_().scoringVersion || NurtsScoring.DEFAULTS.scoringVersion) + '.'); } catch (x) { /* run from the editor or a trigger */ }
}

/** Creates the staff input tabs once (ScoringConfig with the defaults, Calibration with dropdowns) and the Purges log. */
function setupScoringTabs_() {
  var ss = ss_();
  if (!ss.getSheetByName(SCORING_TABS.config)) {
    var sh = ss.insertSheet(SCORING_TABS.config); var d = NurtsScoring.DEFAULTS;
    var rows = [['key', 'value', 'note']].concat(Object.keys(d).map(function (k) { return [k, typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k]), k === 'stage' ? 'alpha · beta · soft · hard' : k === 'scoringVersion' ? 'bump whenever you change a value, then The Nurts → Rescore all' : '']; }));
    sh.getRange(1, 1, rows.length, 3).setValues(rows); sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#FED33C'); sh.setFrozenRows(1);
    sh.getRange(2, 1, rows.length - 1, 2).setNumberFormat('@');
  } else upgradeConfig_();
  if (!ss.getSheetByName(SCORING_TABS.calibration)) {
    var cal = ss.insertSheet(SCORING_TABS.calibration); var cols = NurtsScoring.CALIBRATION_COLUMNS;
    cal.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#F1D5FA'); cal.setFrozenRows(1);
    cal.getRange(1, 1, cal.getMaxRows(), 1).setNumberFormat('@');
    try {
      cols.forEach(function (c, i) {
        var choices = NurtsScoring.CALIBRATION_CHOICES[c]; if (!choices) return;
        cal.getRange(2, i + 1, cal.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(choices, true).setAllowInvalid(false).build());
      });
    } catch (x) { /* no data validation in the test harness */ }
  }
  if (!ss.getSheetByName(SCORING_TABS.purges)) {
    var pg = ss.insertSheet(SCORING_TABS.purges); pg.getRange(1, 1, 1, 6).setValues([['date', 'stage', 'reason', 'archive copy', 'rows cleared', 'by']]).setFontWeight('bold'); pg.setFrozenRows(1);
  }
}

/** An existing ScoringConfig tab after a code update: adds new keys with their defaults, drops keys the code no longer uses,
 * and moves scoringVersion up to the code's version when the Sheet's is older (sc-1 → sc-2). Adrian's edited values are kept. */
function upgradeConfig_() {
  var sh = ss_().getSheetByName(SCORING_TABS.config); if (!sh) return;
  var d = NurtsScoring.DEFAULTS, old = NurtsScoring.OBSOLETE_KEYS || [];
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
  var have = {}, changed = false;
  rows = rows.filter(function (r) { var k = String(r[0] || '').trim(); if (old.indexOf(k) >= 0) { changed = true; return false; } if (k) have[k] = true; return true; });
  var num = function (v) { var m = /^sc-(\d+)/.exec(String(v || '')); return m ? Number(m[1]) : 0; };
  rows.forEach(function (r) { if (String(r[0]).trim() === 'scoringVersion' && num(r[1]) < num(d.scoringVersion)) { r[1] = d.scoringVersion; r[2] = 'bump whenever you change a value, then The Nurts → Rescore all (updated by a code update)'; changed = true; } });
  Object.keys(d).forEach(function (k) { if (!have[k]) { rows.push([k, typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k]), 'added by a code update']); changed = true; } });
  if (!changed) return;
  sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), 3).clearContent();
  if (rows.length) { sh.getRange(2, 1, rows.length, 3).setValues(rows); sh.getRange(2, 1, rows.length, 2).setNumberFormat('@'); }
}

/** Menu → Make a one-pager: the Insights card of the selected row (or a user_id you type), laid out for printing. */
function onePager() {
  var ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet(), id = '';
  if (sh.getName() === SCORING_TABS.insights || sh.getName() === SCORING_TABS.scores || sh.getName() === 'Candidate Summary') {
    var r = sh.getActiveRange().getRow(); var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (r > 1) id = sh.getRange(r, head.indexOf('user_id') + 1).getValue();
  }
  if (!id) { var p = ui.prompt('One-pager', 'Type the candidate’s user_id (email|phone):', ui.ButtonSet.OK_CANCEL); if (p.getSelectedButton() !== ui.Button.OK) return; id = p.getResponseText().trim(); }
  if (!makeOnePager_(id)) ui.alert('No insight card for ' + id + '. Run The Nurts → Rescore all first.');
}
function makeOnePager_(userId) {
  var card = tabObjects_(SCORING_TABS.insights).filter(function (o) { return o.user_id === userId; })[0]; if (!card) return false;
  var ss = ss_(); var sh = ss.getSheetByName(SCORING_TABS.onePager) || ss.insertSheet(SCORING_TABS.onePager); sh.clear();
  var rows = [['The Nurts · candidate insight card', ''], [card.name + '  ·  ' + card.role, card.stage], ['', ''],
    ['Headline', card.headline], ['Autonomy', card.autonomy || '–'], ['Probe first', card['probe first']], ['Red flags', card['red flags'] || 'none'], ['Read with care', card['read with care'] || '–'], ['Not measured', card['not measured']],
    ['', ''], ['How to use this', 'One input, reviewed by a person, alongside the CV, a structured interview and a work trial. Never an automatic rejection.'], ['Scoring', card.scoringVersion]];
  sh.getRange(1, 1, rows.length, 2).setValues(rows.map(function (r) { return [cell_(r[0]), cell_(r[1])]; }));
  sh.getRange(1, 1, rows.length, 1).setFontWeight('bold');
  try { sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 620); sh.getRange(1, 2, rows.length, 1).setWrap(true); } catch (x) { /* harness */ }
  return true;
}

/** Menu → Archive and purge… (request #31): only after typing PURGE. Copies the whole spreadsheet to a private archive
 * folder, then clears the raw and derived tabs, resets the norms and logs it. ScoringConfig is kept; CV files stay in Drive. */
function archiveAndPurge() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Archive and purge', 'This copies the whole spreadsheet to an archive, then CLEARS all candidate and game data. Type PURGE to continue:', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK || a.getResponseText().trim() !== 'PURGE') { ui.alert('Nothing was changed.'); return; }
  var b = ui.prompt('Archive and purge', 'Why? (e.g. "end of Alpha")', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) { ui.alert('Nothing was changed.'); return; }
  var res = purge_(b.getResponseText().trim(), 'PURGE');
  ui.alert('Archived to ' + res.url + ' and cleared ' + res.rows + ' rows.');
}
function activeEmail_() { try { return Session.getActiveUser().getEmail() || ''; } catch (x) { return ''; } }
function purge_(reason, confirm) {
  if (confirm !== 'PURGE') fail_('purge_not_confirmed');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var ss = ss_(), props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty('ARCHIVE_FOLDER_ID');
    if (!folderId) { folderId = DriveApp.createFolder('The Nurts – results archives (private)').getId(); props.setProperty('ARCHIVE_FOLDER_ID', folderId); }
    var stage = readConfig_().stage || NurtsScoring.DEFAULTS.stage;
    var copy = DriveApp.getFileById(ss.getId()).makeCopy('The Nurts results archive ' + Utilities.formatDate(now_(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd HHmm') + ' (' + stage + ')', DriveApp.getFolderById(folderId));
    var n = 0;
    ['Interactions', 'Registrations', 'Users', 'Casual', 'Rounds', 'RoundTraces', SCORING_TABS.calibration].forEach(function (tab) {
      var sh = ss.getSheetByName(tab); if (!sh || sh.getLastRow() < 2) return;
      n += sh.getLastRow() - 1; sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    });
    ss.getSheets().forEach(function (sh) { if (/^Scores /.test(sh.getName())) ss.deleteSheet(sh); });
    ['Candidate Summary', SCORING_TABS.scores, SCORING_TABS.norms, SCORING_TABS.insights, SCORING_TABS.validity, SCORING_TABS.onePager].forEach(function (tab) { var sh = ss.getSheetByName(tab); if (sh) sh.clear(); });
    var pg = ss.getSheetByName(SCORING_TABS.purges);
    pg.getRange(pg.getLastRow() + 1, 1, 1, 6).setValues([[now_(), stage, safe_(reason || ''), copy.getUrl(), n, safe_(activeEmail_())]]);
    refreshSummary();
    return { url: copy.getUrl(), rows: n };
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- setup & maintenance

/** Append a diagnostic row to the Errors tab (created on first use). Never includes the CV contents. */
function reportError_(ref, body, err) {
  try {
    console.error(ref, err && err.stack ? err.stack : err);
    var ss = ss_(); var sh = ss.getSheetByName('Errors');
    if (!sh) { sh = ss.insertSheet('Errors'); sh.getRange(1, 1, 1, 6).setValues([['timestamp', 'ref', 'action', 'user', 'message', 'stack']]).setFontWeight('bold'); }
    var who = body && body.auth ? (body.auth.casual ? CASUAL_ID : body.auth.userId) : (body && body.profile ? normEmail_(body.profile.email) : '');
    sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setValues([[now_(), ref, body && body.action || '', who || '', str_(err && err.message || err, 500), str_(err && err.stack || '', 2000)]]);
  } catch (x) { console.error('reportError_ failed', x); }
}

/** Run once from the editor (safe to re-run): creates tabs/headers, the CV folder and the hourly job. */
function setup() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone('Asia/Kuala_Lumpur');
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = TABS[name];
    var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    for (var i = 0; i < cols.length; i++) if (have[i] && have[i] !== cols[i]) throw new Error('Tab "' + name + '" column ' + (i + 1) + ' is "' + have[i] + '", expected "' + cols[i] + '". Columns may only be added on the right.');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#FED33C');
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (c) { sh.getRange(1, cols.indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  });
  var first = ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CV_FOLDER_ID')) {
    var folder = DriveApp.createFolder('The Nurts – Candidate CVs (private)');
    props.setProperty('CV_FOLDER_ID', folder.getId());
  }
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'markStaleRounds'; })) {
    ScriptApp.newTrigger('markStaleRounds').timeBased().everyHours(1).create();
  }
  setupScoringTabs_();
  refreshSummary();
  console.log('Setup complete. CV folder: https://drive.google.com/drive/folders/' + props.getProperty('CV_FOLDER_ID'));
}

/** Hourly: rounds still "started" after STALE_MINUTES become "abandoned"; then rebuild the Candidate Summary. */
function markStaleRounds() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var cutoff = Date.now() - STALE_MINUTES * 60000; var t = now_();
    [['Rounds', RC.status, RC.started_at, RC.ended_at], ['RoundTraces', TC.status, TC.updated_at, TC.status]].forEach(function (spec) {
      var sh = sh_(spec[0]); var data = rows_(spec[0]);
      for (var i = 0; i < data.length; i++) {
        if (data[i][spec[1]] !== 'started' || new Date(data[i][spec[2]]).getTime() >= cutoff) continue;
        if (spec[0] === 'Rounds') sh.getRange(i + 2, spec[3] + 1, 1, 2).setValues([[t, 'abandoned']]);
        else sh.getRange(i + 2, TC.status + 1).setValue('abandoned');
      }
    });
  } finally { lock.releaseLock(); }
  buildSummaryGuarded_(1000); // outside the players' lock (alpha #35 A5); skipped if a rebuild is already running
}

// ---------------------------------------------------------------- developer mode helpers
function devPin_() { return String(PropertiesService.getScriptProperties().getProperty('DEV_PIN') || '').trim(); }

/** Sheet menu → The Nurts → Delete Dev Test rows: removes every row written in developer mode. */
function deleteDevRows() {
  var n = 0;
  ['Interactions', 'Rounds', 'RoundTraces'].forEach(function (tab) {
    var sh = sh_(tab); var last = sh.getLastRow(); if (last < 2) return;
    var col = TABS[tab].indexOf('user_id'); var width = sh.getLastColumn();
    var vals = sh.getRange(2, 1, last - 1, width).getValues();
    var keep = vals.filter(function (r) { return r[col] !== DEV_ID; });
    n += vals.length - keep.length;
    if (keep.length === vals.length) return;
    sh.getRange(2, 1, last - 1, width).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
  });
  // cached row lookups re-check the cell they point at, so shifted rows are found again automatically
  try { SpreadsheetApp.getUi().alert('Deleted ' + n + ' Dev Test rows.'); } catch (x) { /* run from the editor */ }
  return n;
}
