// Local stand-in for Google Apps Script: runs apps-script/Code.gs in a VM with in-memory fakes of the
// Sheets/Cache/Drive services, behind an HTTP server. Lets the real HTTP transport be tested end to end.
//   node tests/gas-harness/server.mjs      → http://localhost:8787  (POST = doPost, GET /__dump, POST /__reset)
import http from 'node:http';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.GAS_PORT || 8787);
const code = readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');

function coerce(v, textFmt) {
  if (v instanceof Date || typeof v === 'boolean' || typeof v === 'number' || v == null) return v ?? '';
  const s = String(v);
  if (s.startsWith("'")) return s.slice(1);
  if (textFmt) return s;
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s); // what Sheets does to "+60129876543" or "1"
  if (s === 'TRUE' || s === 'FALSE') return s === 'TRUE';
  return s;
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.fmt = {}; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return 1000; }
  setFrozenRows() { return this; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = this.sh.data[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] ?? ''); out.push(o); }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`setValues size mismatch on ${this.sh.name}: range ${this.nr}x${this.nc}, data ${v.length}x${v[0].length}`);
    for (let i = 0; i < this.nr; i++) {
      const ri = this.r - 1 + i; this.sh.data[ri] ||= [];
      for (let j = 0; j < this.nc; j++) { const cj = this.c - 1 + j; this.sh.data[ri][cj] = coerce(v[i][j], this.sh.fmt[cj] === '@'); }
    }
    return this;
  }
  setValue(x) { return this.setValues([[x]]); }
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sh.fmt[this.c - 1 + j] = f; return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

let state;
function fresh() {
  const sheets = [new Sheet('Sheet1')];
  const props = {}; const cache = new Map(); const files = [];
  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: (s) => sheets.splice(sheets.indexOf(s), 1),
    setSpreadsheetTimeZone() {},
  };
  const ctx = {
    console, Date, JSON, Math, Object, String, Number, Array, Error, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v),
      getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
      putAll: (o) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)),
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    Utilities: {
      base64Decode: (b) => [...Buffer.from(b, 'base64')], getUuid: () => randomUUID(),
      formatDate: (d) => d.toISOString().replace(/[-:T]/g, '').slice(0, 15), newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    DriveApp: {
      createFolder: () => ({ getId: () => 'folder-1' }),
      getFolderById: () => ({ createFile: (blob) => { files.push(blob.name); return { getUrl: () => 'https://drive.example/' + blob.name }; } }),
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, everyHours() { return this; }, create() {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'Code.gs' });
  ctx.setup();
  state = { ctx, sheets, files, cache };
}
fresh();

const dump = () => Object.fromEntries(state.sheets.map((s) => [s.name, s.data]));

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.statusCode = 405; return res.end(); } // Apps Script can't answer preflights either
    if (req.url.startsWith('/__dump')) return res.end(JSON.stringify({ sheets: dump(), files: state.files }));
    if (req.url.startsWith('/__reset')) { fresh(); return res.end('{"ok":true}'); }
    if (req.method === 'GET') return res.end(state.ctx.doGet().content);
    if (!/^text\/plain/.test(req.headers['content-type'] || '')) { res.statusCode = 415; return res.end('{"ok":false,"error":"client must send text/plain"}'); }
    try { res.end(state.ctx.doPost({ postData: { contents: body } }).content); }
    catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e) })); }
  });
}).listen(PORT, () => console.log(`GAS harness on http://localhost:${PORT}`));
