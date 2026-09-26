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
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return out_({ ok: true, data: fn(body) });
  } catch (err) {
    if (err && err.code) return out_({ ok: false, error: err.code });
    // Unexpected failure: keep a record in the Errors tab so it can be diagnosed, and give the player a reference.
    var ref = Utilities.getUuid().slice(0, 8).toUpperCase();
    reportError_(ref, body, err);
    return out_({ ok: false, error: 'server_error', ref: ref });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* not held */ }
  }
}

function doGet() {
  return out_({ ok: true, data: { service: 'The Nurts screening game API', time: new Date().toISOString() } });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Adds a "The Nurts" menu to the Sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('The Nurts').addItem('Refresh Candidate Summary', 'refreshSummary').addToUi();
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
  var id = w.casual ? { userId: CASUAL_ID, casual: true } : { userId: w.userId, email: w.email, phone: w.phone, name: w.name };
  return { identity: id, runNo: w.run, completed: completedIn_(w.key, w.run) };
}

function touch_(w) { // last_seen
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
function refreshSummary() {
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
  users.forEach(function (u) { // official score = completed real round in the current run
    rounds.forEach(function (r) {
      if (r[RC.user_id] === u[UC.user_id] && Number(r[RC.run_no]) === Number(u[UC.current_run]) && r[RC.mode] === 'real' && r[RC.status] === 'completed') {
        var s = per[u[UC.user_id] + '|' + r[RC.module]];
        if (s && s.score === '') { s.score = r[RC.primary_score]; try { s.summary = r[RC.summary_json] ? JSON.parse(r[RC.summary_json]) : null; } catch (x) { s.summary = null; } }
      }
    });
  });
  var head = ['user_id', 'name', 'email', 'phone', 'employment_type', 'desired_function', 'cv_link', 'registered_at', 'last_seen', 'current_run', 'runs_completed'];
  modules.forEach(function (m) { head.push(m + ': score', m + ': real attempts', m + ': unfinished', m + ': practice rounds', m + ': read how-to first', m + ': how-to views', m + ': how-to secs', m + ': practised first', m + ': left mid-round'); (sumKeys[m] || []).forEach(function (k) { head.push(m + ': ' + k); }); });
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
    refreshSummary();
  } finally { lock.releaseLock(); }
}
