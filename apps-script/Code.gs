/**
 * The Nurts – candidate screening game backend (Google Apps Script web app bound to the results Sheet).
 * Spec: claude/01-architecture-spec.md §6–7 (v1.4). Reference behaviour: src/core/mockServer.js.
 *
 * Identity: registered user_id = "<email>|<phone>" (no NRIC anywhere). Casual players = "Casual User",
 * no PII, kept apart by session_id. All requests are POST bodies of JSON sent as text/plain.
 *
 * First-time setup (once): run setup() from the editor, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). Later changes: Deploy → Manage deployments → edit → New version.
 */

var CASUAL_ID = 'Casual User';
var BENCHMARK_INCLUDE_CASUAL = false;
var BENCHMARK_MIN_N = 5;
var STALE_MINUTES = 30;
var MAX_CV_BYTES = 5 * 1024 * 1024;
var CV_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

// Sheet tabs and their columns. New columns may only ever be APPENDED on the right.
var TABS = {
  Interactions: ['timestamp', 'user_id', 'email', 'phone', 'module', 'round_no', 'interaction', 'value', 'run_no', 'session_id', 'client_ts', 'event_id', 'module_version'],
  Registrations: ['timestamp', 'user_id', 'name', 'email', 'phone', 'employment_type', 'desired_function', 'cv_link', 'consent_version', 'consent_lang', 'user_agent'],
  Users: ['user_id', 'email', 'phone', 'name', 'created_at', 'current_run', 'runs_completed', 'last_seen'],
  Casual: ['session_id', 'created_at', 'current_run', 'last_seen'],
  Rounds: ['user_id', 'session_id', 'is_casual', 'run_no', 'module', 'module_version', 'round_no', 'mode', 'started_at', 'ended_at', 'status', 'primary_score', 'metrics_json', 'player_key'],
};
// Columns stored as plain text so Sheets never turns "+60129876543" or round "1" into numbers.
var TEXT_COLS = { Interactions: ['user_id', 'phone', 'round_no', 'module_version'], Registrations: ['user_id', 'phone'], Users: ['user_id', 'phone'], Rounds: ['user_id', 'round_no', 'module_version'] };
var RC = {}; TABS.Rounds.forEach(function (c, i) { RC[c] = i; }); // Rounds column index
var UC = {}; TABS.Users.forEach(function (c, i) { UC[c] = i; });

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
    console.error(err && err.stack ? err.stack : err);
    return out_({ ok: false, error: 'server_error' });
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

// ---------------------------------------------------------------- helpers

function fail_(code) { var e = new Error(code); e.code = code; throw e; }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name) { return ss_().getSheetByName(name) || fail_('setup_needed'); }
function now_() { return new Date(); }
function normEmail_(v) { return String(v || '').trim().toLowerCase(); }
function normPhone_(v) { return String(v || '').trim(); }
function emailOk_(v) { return /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(v) && v.length <= 120; }
function phoneOk_(v) { return /^\+[1-9]\d{7,14}$/.test(v); }
function userIdOf_(email, phone) { return normEmail_(email) + '|' + normPhone_(phone); }
function str_(v, max) { v = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return v.length > (max || 45000) ? v.slice(0, max || 45000) : v; }
// Stop spreadsheet formula injection from user-typed text.
function safe_(v) { v = str_(v, 45000); return /^[=+\-@]/.test(v) && !/^\+\d+$/.test(v) ? "'" + v : v; }

function rows_(name) {
  var sh = sh_(name); var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, sh.getLastColumn()).getValues() : [];
}
function append_(name, rows) {
  if (!rows.length) return;
  var sh = sh_(name);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}
function findRow_(name, col, value) { // 1-based sheet row number, or 0
  var sh = sh_(name); var n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var vals = sh.getRange(2, col + 1, n, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === value) return i + 2;
  return 0;
}

/** Resolve the caller. Returns { key, casual, userId, email, phone, run, rowNo, tab }. */
function who_(auth) {
  if (auth && auth.casual && auth.sessionId) {
    var sid = String(auth.sessionId).slice(0, 64);
    var r = findRow_('Casual', 0, sid);
    if (!r) { append_('Casual', [[sid, now_(), 1, now_()]]); r = sh_('Casual').getLastRow(); }
    var run = Number(sh_('Casual').getRange(r, 3).getValue()) || 1;
    return { key: 'casual:' + sid, casual: true, userId: CASUAL_ID, email: '', phone: '', run: run, rowNo: r, tab: 'Casual', sessionId: sid };
  }
  if (!auth || !auth.userId) fail_('auth_failed');
  var row = findRow_('Users', UC.user_id, String(auth.userId));
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

/** Mark this player's still-open rounds as abandoned (they started something new or came back). */
function markAbandoned_(key) {
  var sh = sh_('Rounds'); var data = rows_('Rounds'); var t = now_();
  for (var i = 0; i < data.length; i++) {
    if (data[i][RC.player_key] === key && data[i][RC.status] === 'started') {
      sh.getRange(i + 2, RC.ended_at + 1, 1, 2).setValues([[t, 'abandoned']]);
    }
  }
}

function median_(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Median of each metric over each player's FIRST completed real round of this module version. Cached 5 min. */
function benchmarkFor_(module, version, fresh) {
  var ck = 'bench:' + module + ':' + version;
  var cache = CacheService.getScriptCache();
  if (!fresh) { var hit = cache.get(ck); if (hit) return JSON.parse(hit); }
  var first = {};
  rows_('Rounds').forEach(function (r) {
    if (r[RC.module] !== module || String(r[RC.module_version]) !== String(version) || r[RC.mode] !== 'real' || r[RC.status] !== 'completed') return;
    if (!BENCHMARK_INCLUDE_CASUAL && (r[RC.is_casual] === true || r[RC.is_casual] === 'TRUE')) return;
    var k = r[RC.player_key]; var t = new Date(r[RC.ended_at]).getTime();
    if (!first[k] || t < first[k].t) first[k] = { t: t, m: JSON.parse(r[RC.metrics_json] || '{}') };
  });
  var list = Object.keys(first).map(function (k) { return first[k].m; });
  var outp = {};
  var keys = {}; list.forEach(function (m) { Object.keys(m).forEach(function (k) { keys[k] = 1; }); });
  Object.keys(keys).forEach(function (k) {
    var vals = list.map(function (m) { return m[k]; }).filter(function (v) { return typeof v === 'number'; });
    outp[k] = { median: vals.length >= BENCHMARK_MIN_N ? median_(vals) : null, n: vals.length };
  });
  cache.put(ck, JSON.stringify(outp), 300);
  return outp;
}

function seedOf_(key, run, n, mode) {
  var h = 2166136261;
  for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h ^ (run * 7919) ^ (n * 104729) ^ (mode === 'practice' ? 0x5eed : 0)) >>> 0;
}

function logRow_(w, e) {
  return [now_(), w.userId, w.email, w.phone, safe_(e.module), str_(e.round_no), safe_(e.interaction), safe_(e.value), w.run,
    str_(e.session_id || w.sessionId || ''), Number(e.client_ts) || '', str_(e.event_id), str_(e.module_version)];
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
    var cvLink = saveCv_(b.cv, email);
    var t = now_();
    append_('Users', [[uid, email, phone, safe_(p.name), t, 1, 0, t]]);
    append_('Registrations', [[t, uid, safe_(p.name), email, phone, safe_(p.employmentType), safe_(p.desiredFunction), cvLink, str_(b.consentVersion), str_(b.consentLang), str_(b.userAgent || '', 300)]]);
    return { identity: { userId: uid, email: email, phone: phone, name: p.name }, runNo: 1, completed: [] };
  },

  login: function (b) {
    var email = normEmail_(b.email), phone = normPhone_(b.phone);
    var row = findRow_('Users', UC.user_id, userIdOf_(email, phone));
    if (!row) {
      append_('Interactions', [[now_(), '', emailOk_(email) ? email : '', '', 'core', '', 'login_fail', 'no_match', '', '', '', Utilities.getUuid(), '']]);
      fail_('login_fail');
    }
    var w = who_({ userId: userIdOf_(email, phone), email: email, phone: phone });
    markAbandoned_(w.key); touch_(w);
    return identity_(w);
  },

  casualStart: function (b) {
    var w = who_(b.auth);
    if (!w.casual) fail_('auth_failed');
    return identity_(w);
  },

  roundStart: function (b) {
    var w = who_(b.auth);
    markAbandoned_(w.key);
    var mode = b.mode === 'practice' ? 'practice' : 'real';
    var n = 1;
    rows_('Rounds').forEach(function (r) { if (r[RC.player_key] === w.key && Number(r[RC.run_no]) === w.run && r[RC.module] === b.module && r[RC.mode] === mode) n++; });
    var roundNo = mode === 'practice' ? 'P' + n : String(n);
    append_('Rounds', [[w.userId, w.casual ? w.sessionId : '', w.casual, w.run, safe_(b.module), str_(b.moduleVersion), roundNo, mode, now_(), '', 'started', '', '', w.key]]);
    touch_(w);
    return { roundNo: roundNo, runNo: w.run, seed: seedOf_(w.key, w.run, n, mode) };
  },

  roundEnd: function (b) {
    var w = who_(b.auth);
    var sh = sh_('Rounds'); var data = rows_('Rounds'); var version = null; var mode = null;
    for (var i = data.length - 1; i >= 0; i--) {
      var r = data[i];
      if (r[RC.player_key] === w.key && Number(r[RC.run_no]) === w.run && r[RC.module] === b.module && String(r[RC.round_no]) === String(b.roundNo)) {
        version = r[RC.module_version]; mode = r[RC.mode];
        if (r[RC.status] === 'started') {
          var status = ['completed', 'quit', 'abandoned'].indexOf(b.status) >= 0 ? b.status : 'quit';
          sh.getRange(i + 2, RC.ended_at + 1, 1, 4).setValues([[now_(), status, b.primary == null ? '' : b.primary, b.metrics ? str_(b.metrics) : '']]);
        }
        break;
      }
    }
    if (version === null) return { benchmark: {} };
    return { benchmark: benchmarkFor_(b.module, version, b.status === 'completed' && mode === 'real') };
  },

  log: function (b) {
    var w = who_(b.auth);
    var events = (b.events || []).slice(0, 100);
    var cache = CacheService.getScriptCache();
    var ids = events.map(function (e) { return 'ev:' + e.event_id; });
    var seen = ids.length ? cache.getAll(ids) : {};
    var fresh = [], mark = {};
    events.forEach(function (e, i) {
      if (!e.event_id || seen[ids[i]] || mark[ids[i]]) return;
      mark[ids[i]] = '1'; fresh.push(logRow_(w, e));
    });
    append_('Interactions', fresh);
    if (Object.keys(mark).length) cache.putAll(mark, 21600);
    return { ack: events.map(function (e) { return e.event_id; }) };
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
    markAbandoned_(w.key);
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

// ---------------------------------------------------------------- setup & maintenance

/** Run once from the editor (safe to re-run): creates tabs/headers, the CV folder and the hourly clean-up. */
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
  console.log('Setup complete. CV folder: https://drive.google.com/drive/folders/' + props.getProperty('CV_FOLDER_ID'));
}

/** Hourly: rounds still "started" after STALE_MINUTES become "abandoned" (window closed mid-round). */
function markStaleRounds() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sh = sh_('Rounds'); var data = rows_('Rounds'); var cutoff = Date.now() - STALE_MINUTES * 60000; var t = now_();
    for (var i = 0; i < data.length; i++) {
      if (data[i][RC.status] === 'started' && new Date(data[i][RC.started_at]).getTime() < cutoff) sh.getRange(i + 2, RC.ended_at + 1, 1, 2).setValues([[t, 'abandoned']]);
    }
  } finally { lock.releaseLock(); }
}
