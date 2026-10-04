// Request #30: the Soft Launch feedback loop. Calibration rows (staff ratings, Y / N / ?) vs the game results → per-trait AUC,
// band × answer tables and rater agreement. Descriptive only below 20 rated people; no weight changes from this alone.
import { auc, mean, r1 } from './util.js';
import { DEFAULTS } from './config.js';

export const CALIBRATION_COLUMNS = ['user_id', 'rater', 'relationship', 'role worked in', 'level', 'would work with again', 'needed little hand-holding',
  'organised and reliable', 'clear communicator', 'spots flaws in arguments', 'good calls under uncertainty', 'creative problem-solver',
  'stays calm under pressure', 'learns quickly', 'any integrity concerns', 'risk style', 'overall', 'note'];
export const CALIBRATION_CHOICES = {
  rater: ['Adrian', 'Rachel'], relationship: ['employee', 'past employee', 'collaborator', 'friend or family'],
  'role worked in': ['Events', 'Marketing', 'Sales', 'Product', 'Creative', 'Other', 'n/a'], level: ['Intern', 'Junior', 'Mid', 'Lead', 'n/a'],
  'would work with again': ['Y', 'N'], 'needed little hand-holding': ['Y', 'N', "don't know"], 'risk style': ['cautious', 'balanced', 'bold', '?'],
  overall: ['a good case', 'a bad case', 'mixed'],
};
for (const k of ['organised and reliable', 'clear communicator', 'spots flaws in arguments', 'good calls under uncertainty', 'creative problem-solver', 'stays calm under pressure', 'learns quickly', 'any integrity concerns']) CALIBRATION_CHOICES[k] = ['Y', 'N', '?'];
export const TRAIT_ITEM = { organisation: 'organised and reliable', communication: 'clear communicator', critical: 'spots flaws in arguments', judgement: 'good calls under uncertainty', creative: 'creative problem-solver', resilience: 'stays calm under pressure', learning: 'learns quickly' };

/** scores: the Scores rows (pipeline output) · ratings: Calibration rows (objects keyed by CALIBRATION_COLUMNS). */
export function validity(scores, ratings, cfg = DEFAULTS) {
  const byUser = Object.fromEntries(scores.map((s) => [s.user_id, s]));
  const rated = [...new Set(ratings.map((r) => r.user_id).filter((u) => byUser[u]))];
  const descriptive = rated.length < cfg['validity.descriptiveBelow'];
  const label = descriptive ? `descriptive only (n = ${rated.length} rated; needs ${cfg['validity.descriptiveBelow']})` : `n = ${rated.length} rated`;
  const bandOf = (s, t) => { const b = String(s[`${t} band`] || ''); return /Strong|High/.test(b) ? 'Strong' : /Probe|Low/.test(b) ? 'Probe' : b ? (/Typical/.test(b) ? 'Typical' : 'no band') : ''; };
  const rows = [];
  for (const [t, item] of Object.entries(TRAIT_ITEM)) {
    const yes = [], no = [], table = {};
    for (const r of ratings) {
      const s = byUser[r.user_id]; const v = Number(s?.[t]); const a = r[item];
      if (!s || s[t] === '' || Number.isNaN(v) || (a !== 'Y' && a !== 'N')) continue;
      (a === 'Y' ? yes : no).push(v);
      const k = `${bandOf(s, t) || 'no band'} × ${a}`; table[k] = (table[k] || 0) + 1;
    }
    const A = auc(yes, no);
    rows.push({ trait: t, 'rater item': item, n: yes.length + no.length, AUC: A ?? '', 'mean score Y': r1(mean(yes)) ?? '', 'mean score N': r1(mean(no)) ?? '',
      'band × answer': Object.entries(table).map(([k, n]) => `${k}: ${n}`).join(' · '), 'rater agreement': agreement(ratings, item),
      note: A == null ? 'needs both Y and N answers' : A < 0.55 ? 'mismatch: near chance or inverted' : '', status: label });
  }
  // autonomy (Framework v0.7): the combined level vs "needed little hand-holding"; AUC < 0.6 → back to probe-only (autonomy.enabled = false)
  { const yes = [], no = [], table = {};
    for (const r of ratings) {
      const s = byUser[r.user_id], a = r['needed little hand-holding']; const v = Number(s?.autonomyLevel);
      if (!s || s.autonomyLevel === '' || s.autonomyLevel == null || Number.isNaN(v) || (a !== 'Y' && a !== 'N')) continue;
      (a === 'Y' ? yes : no).push(v); const k = `L${v}${/provisional/.test(s.autonomy) ? ' (provisional)' : ''} × ${a}`; table[k] = (table[k] || 0) + 1;
    }
    const A = auc(yes, no);
    rows.push({ trait: 'autonomy', 'rater item': 'needed little hand-holding', n: yes.length + no.length, AUC: A ?? '', 'mean score Y': r1(mean(yes)) ?? '', 'mean score N': r1(mean(no)) ?? '',
      'band × answer': Object.entries(table).map(([k, n]) => `${k}: ${n}`).join(' · '), 'rater agreement': agreement(ratings, 'needed little hand-holding'),
      note: A == null ? 'needs both Y and N answers (scores = level 1–3; the 90-day hand-holding check is in the Outcomes rows below)' : A < cfg['autonomy.validAuc'] ? `AUC below ${cfg['autonomy.validAuc']}: consider autonomy.enabled = false (probe-only) until it is fixed` : '', status: label }); }
  // ethics: the gate vs "any integrity concerns"; risk: the game band vs the rater's style
  const eth = {}; let riskSame = 0, riskN = 0;
  for (const r of ratings) {
    const s = byUser[r.user_id]; if (!s) continue;
    if (r['any integrity concerns'] === 'Y' || r['any integrity concerns'] === 'N') { const k = `${s.ethicsGate || 'n/a'} × ${r['any integrity concerns']}`; eth[k] = (eth[k] || 0) + 1; }
    const want = { cautious: 'C', balanced: 'B', bold: 'Bo' }[r['risk style']];
    if (want && s['risk band']) { riskN++; if (s['risk band'] === want) riskSame++; }
  }
  rows.push({ trait: 'ethics', 'rater item': 'any integrity concerns', n: Object.values(eth).reduce((a, b) => a + b, 0), AUC: '', 'mean score Y': '', 'mean score N': '', 'band × answer': Object.entries(eth).map(([k, n]) => `${k}: ${n}`).join(' · '), 'rater agreement': agreement(ratings, 'any integrity concerns'), note: '', status: label });
  rows.push({ trait: 'risk', 'rater item': 'risk style', n: riskN, AUC: '', 'mean score Y': '', 'mean score N': '', 'band × answer': riskN ? `same band ${riskSame} of ${riskN}` : '', 'rater agreement': agreement(ratings, 'risk style'), note: '', status: label });
  // good vs bad cases: which traits separate them
  const good = ratings.filter((r) => r.overall === 'a good case' && byUser[r.user_id]), bad = ratings.filter((r) => r.overall === 'a bad case' && byUser[r.user_id]);
  const val = (u, t) => (byUser[u][t] === '' || byUser[u][t] == null ? NaN : Number(byUser[u][t]));
  const sep = Object.keys(TRAIT_ITEM).map((t) => { const g = good.map((r) => val(r.user_id, t)).filter((x) => !Number.isNaN(x)), b = bad.map((r) => val(r.user_id, t)).filter((x) => !Number.isNaN(x)); const d = g.length && b.length ? r1(mean(g) - mean(b)) : null; return d == null ? null : `${t} ${d > 0 ? '+' : ''}${d}`; }).filter(Boolean);
  rows.push({ trait: 'good vs bad cases', 'rater item': 'overall', n: good.length + bad.length, AUC: '', 'mean score Y': '', 'mean score N': '', 'band × answer': sep.join(' · ') || '(needs good and bad cases)', 'rater agreement': agreement(ratings, 'overall'), note: 'mean score gap (good − bad)', status: label });
  return rows;
}

/** Where Adrian and Rachel both rated the same person: the share of items they answered the same (ignoring ?). */
function agreement(ratings, item) {
  const by = {}; for (const r of ratings) (by[r.user_id] ||= {})[r.rater] = r[item];
  let same = 0, n = 0;
  for (const v of Object.values(by)) { const a = v.Adrian, b = v.Rachel; if (!a || !b || a === '?' || b === '?' || a === "don't know" || b === "don't know") continue; n++; if (a === b) same++; }
  return n ? `${same} of ${n} agree` : '';
}

// ---- FW-5: the Outcomes tab (staff-only) = the real feedback loop. One row per hire; reminders at 90 days and 12 months.
export const OUTCOME_COLUMNS = ['user_id', 'hired', 'hireDate', 'function', 'type', 'level hired at', '90-day productivity (1–5)', 'needed hand-holding',
  'reliability (1–5)', '12-month status', 'notes', '90-day reminder sent', '12-month reminder sent'];
export const OUTCOME_CHOICES = {
  hired: ['Y', 'N'], function: ['Events', 'Marketing', 'Sales', 'Product', 'Creative', 'Other'], type: ['Intern', 'Freelance', 'Part-time', 'Full-time'],
  'level hired at': ['Intern', 'Junior', 'Mid', 'Lead'], '90-day productivity (1–5)': ['1', '2', '3', '4', '5'], 'needed hand-holding': ['Y', 'N'],
  'reliability (1–5)': ['1', '2', '3', '4', '5'], '12-month status': ['here', 'resigned', 'terminated'],
};
const DAY = 864e5;
const dateOf = (v) => { if (v instanceof Date) return v.getTime(); const t = Date.parse(String(v || '')); return Number.isNaN(t) ? null : t; };
const blank = (v) => v === '' || v == null;

/** Which reminders are due now: [{ index (0-based row in `outcomes`), kind: '90-day' | '12-month', due (ms) }]. */
export function outcomeReminders(outcomes, now = Date.now()) {
  const out = [];
  outcomes.forEach((o, index) => {
    const hd = dateOf(o.hireDate); if (String(o.hired).trim().toUpperCase() !== 'Y' || hd == null) return;
    if (now >= hd + 90 * DAY && blank(o['90-day productivity (1–5)']) && blank(o['90-day reminder sent'])) out.push({ index, kind: '90-day', due: hd + 90 * DAY });
    if (now >= hd + 365 * DAY && blank(o['12-month status']) && blank(o['12-month reminder sent'])) out.push({ index, kind: '12-month', due: hd + 365 * DAY });
  });
  return out;
}

/** Validity rows from the Outcomes tab: each trait's score vs 90-day productivity (4–5 vs 1–3) and 12-month retention, and
 * autonomy vs the 90-day "needed hand-holding". Descriptive only below outcomes.minHires hires. */
export function outcomesValidity(scores, outcomes, cfg = DEFAULTS) {
  const byUser = Object.fromEntries(scores.map((s) => [s.user_id, s]));
  const hires = outcomes.filter((o) => String(o.hired).trim().toUpperCase() === 'Y' && byUser[o.user_id]);
  const withOutcome = hires.filter((o) => !blank(o['90-day productivity (1–5)']) || !blank(o['12-month status']));
  const minH = cfg['outcomes.minHires'] ?? 10;
  const status = withOutcome.length < minH ? `descriptive only (n = ${withOutcome.length} hires with outcomes; needs ${minH})` : `n = ${withOutcome.length} hires`;
  const rows = [];
  const row = (trait, item, yes, no, note = '') => { const A = auc(yes, no); rows.push({ trait, 'rater item': item, n: yes.length + no.length, AUC: A ?? '', 'mean score Y': r1(mean(yes)) ?? '', 'mean score N': r1(mean(no)) ?? '', 'band × answer': '', 'rater agreement': '', note: A == null ? 'needs both outcomes' : A < 0.55 ? 'mismatch: near chance or inverted' : note, status }); };
  const val = (o, t) => { const v = byUser[o.user_id][t]; return blank(v) || Number.isNaN(Number(v)) ? null : Number(v); };
  for (const t of Object.keys(TRAIT_ITEM)) {
    const py = [], pn = [], ry = [], rn = [];
    for (const o of hires) {
      const v = val(o, t); if (v == null) continue;
      const p = Number(o['90-day productivity (1–5)']); if (p >= 1 && p <= 5) (p >= 4 ? py : pn).push(v);
      const st = String(o['12-month status'] || '').trim(); if (st === 'here') ry.push(v); else if (st === 'resigned' || st === 'terminated') rn.push(v);
    }
    row(t, 'outcome: 90-day productivity 4–5 (Y) vs 1–3 (N)', py, pn);
    row(t, 'outcome: still here at 12 months (Y) vs left (N)', ry, rn);
  }
  const ay = [], an = [];
  for (const o of hires) { const v = val(o, 'autonomyLevel'), h = String(o['needed hand-holding'] || '').trim().toUpperCase(); if (v == null) continue; if (h === 'N') ay.push(v); else if (h === 'Y') an.push(v); }
  row('autonomy', 'outcome: needed NO hand-holding at 90 days (Y) vs needed it (N)', ay, an, '');
  if (rows.at(-1).AUC !== '' && rows.at(-1).AUC < cfg['autonomy.validAuc']) rows.at(-1).note = `AUC below ${cfg['autonomy.validAuc']}: consider autonomy.enabled = false (probe-only) until it is fixed`;
  return rows;
}
