// The scoring layer (requests #28–31; claude/13-scoring-layer-design.md). Run: npm run test:unit
// Fixture: tests/fixtures/scoring-rounds.json = one synthetic candidate's bot play through all 7 games (captured from the mock
// backend by `SAVE_ROUNDS=1 npx playwright test --project=desktop -g applicant`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { scoreAll, rederiveRound, ADAPTERS, validity, ethicsGate, orgScoreV2, DEFAULTS } from '../src/scoring/index.js';
import { weightsFor, riskFactor } from '../src/scoring/fit.js';

const FX = JSON.parse(readFileSync('tests/fixtures/scoring-rounds.json', 'utf8'));
const UID = FX.rounds[0].userId;
const toRound = (r, userId = r.userId) => ({ userId, isCasual: !!r.casual, runNo: r.runNo, module: r.module, moduleVersion: String(r.moduleVersion), mode: r.mode, status: r.status, startedAt: Date.parse(r.startedAt) || 0, metrics: r.metrics });
const toEvents = (rows, userId) => rows.filter((r) => /^eth_/.test(r[6])).map((r, i) => ({ userId: userId ?? r[1], runNo: r[8], interaction: r[6], value: JSON.parse(r[7] || '{}'), t: Number(r[10]) || i }));
const input = (extra = {}) => ({
  users: [{ userId: UID, name: 'Test Player', currentRun: 1 }], registrations: { [UID]: { employmentType: 'Full-time', desiredFunction: 'Marketing' } },
  rounds: FX.rounds.map((r) => toRound(r)), interactions: toEvents(FX.interactions), now: Date.parse('2026-09-30T00:00:00Z'), ...extra,
});

test('L1: every game re-derives its stored score from the raw logs with its own code', () => {
  const real = FX.rounds.filter((r) => r.mode === 'real');
  assert.equal(new Set(real.map((r) => r.module)).size, 7);
  for (const r of real) {
    const x = rederiveRound(toRound(r));
    assert.equal(x.l1, 'ok', r.module);
    assert.equal(x.metrics[ADAPTERS[r.module].primaryKey], r.metrics[ADAPTERS[r.module].primaryKey], r.module);
  }
  // a tampered stored score is caught
  const mm = FX.rounds.find((r) => r.module === 'big-calls' && r.mode === 'real');
  assert.equal(rederiveRound(toRound({ ...mm, metrics: { ...mm.metrics, judgementScore: 12 } })).l1, 'mismatch');
});

test('L2–L7 on one candidate: traits, organisation 60/40, ethics flag, alpha labels, insight card', () => {
  const out = scoreAll(input());
  const s = out.scores[0];
  assert.equal(s.stage, 'ALPHA: test data'); assert.equal(s.scoringVersion, 'sc-4');
  for (const t of ['organisation', 'resilience', 'judgement', 'critical', 'creative', 'communication', 'risk']) assert.notEqual(s[t], '', t);
  const mk = FX.rounds.find((r) => r.module === 'mamak-rush' && r.mode === 'real').metrics;
  assert.equal(s.organisation, orgScoreV2(mk).score);
  assert.equal(s['organisation band'], 'no benchmark (alpha)');
  // the bot raised a score, then reported the tool in the same run → self-corrected: a note (Framework gate table)
  assert.equal(s.ethicsGate, 'note'); assert.match(s.ethicsDetail, /^selfCorrected.*\(up\).*reported Y/); assert.equal(s.ethicsOpportunities, FX.interactions.filter((r) => r[6] === 'eth_offer').length);
  assert.match(s.notes, /self-corrected/); assert.doesNotMatch(s.redFlags, /ethics/); assert.equal(s.autonomy, 'L3'); // the fixture bot closes both finales as a purpose-setter
  assert.match(s.l1Check, /sunny-tap ok/);
  assert.ok(s.fitJunior !== '' && s.fitMid !== '' && s.fitLead !== '');
  const card = out.insights[0];
  assert.match(card.headline, /^Best match: Marketing · (Junior|Mid|Lead) \(fit [\d.]+, no benchmark yet\)\. (No standout strengths at this stage|Strengths: learning ±)\.$/); assert.match(card.evidence, /^ALPHA: test data · no benchmark \(alpha\) · single-source: .* · indicative ±: critical thinking, learning$/); assert.match(card['probe first'], /“/);
  const flagged = scoreAll({ ...input(), interactions: toEvents(FX.interactions).filter((e) => e.interaction !== 'eth_report_problem') });
  assert.equal(flagged.scores[0].ethicsGate, 'flag'); assert.match(flagged.scores[0].redFlags, /ethics/); assert.match(flagged.insights[0]['probe first'], /developer button/);
  assert.match(card['read with care'], /ALPHA/);
  assert.equal(out.norms.every((n) => n.status === 'off (alpha)'), true);
});

test('Framework v0.5: skipping every how-to scores the same as reading everything', () => {
  const reader = { ...input(), interactions: [...toEvents(FX.interactions), { userId: UID, runNo: 1, interaction: 'howto', value: { dwellMs: 90000 }, t: 1 }] };
  const a = scoreAll(input()).scores[0], b = scoreAll(reader).scores[0];
  for (const k of Object.keys(a)) if (k !== 'scoredAt') assert.deepEqual(a[k], b[k], k);
});

test('norms (L4): per module version, 5 / 30 thresholds, Strong top 30% · Probe bottom 20%, organisation red flag', () => {
  const users = [], rounds = [], regs = {};
  for (let i = 0; i < 40; i++) {
    const id = `cand${i}@example.com|+60100000${String(i).padStart(3, '0')}`; users.push({ userId: id, name: `C${i}`, currentRun: 1 }); regs[id] = { employmentType: 'Full-time', desiredFunction: 'Events' };
    const q = i / 39; // no actionLog, so the stored components are used
    rounds.push({ userId: id, runNo: 1, module: 'mamak-rush', moduleVersion: '3', mode: 'real', status: 'completed', startedAt: 1000 + i, metrics: { valueShare: q, expiredHigh: 1 - q, halfDone: 1 - q, errorsUnderLoad: 0.25 * (1 - q), parkedReturn: q > 0.5 ? 1 : 0 } });
  }
  const out = scoreAll({ users, registrations: regs, rounds, interactions: [], config: { stage: 'hard' } });
  const n = out.norms.find((x) => x.module === 'mamak-rush');
  assert.equal(n.n, 40); assert.equal(n.status, 'bands');
  const bands = out.scores.map((s) => s['organisation band']);
  assert.equal(bands[39], 'Strong'); assert.equal(bands[0], 'Probe'); assert.equal(bands[20], 'Typical');
  assert.match(out.scores[0].redFlags, /organisation in the bottom 20%/);
  // FW-12 insight wording: results, not people; Strong traits as strengths; the probe names the band; fit bands + suggested level
  assert.match(out.insights[39].headline, /^Best match: Events · Lead \(Strong fit, traits only\)\. Strengths: organisation\.$/);
  assert.match(out.insights[0].headline, /^Best match: Events · Junior \(Probe fit, traits only\)\. No standout strengths/);
  assert.match(out.insights[0]['probe first'], /^in the Probe band for organisation: “Walk me through/);
  assert.equal(out.scores[39].suggestedLevel, 'Lead'); assert.equal(out.scores[39]['fit bands'], 'Junior Strong · Mid Strong · Lead Strong');
  assert.doesNotMatch(out.insights.map((c) => c.headline + c['probe first']).join(' '), /\b(is|are) (disorganised|sloppy|bad)\b|Fits|Pass|Fail/);
  const early = scoreAll({ users: users.slice(0, 12), registrations: regs, rounds: rounds.slice(0, 12), config: { stage: 'beta' } });
  assert.equal(early.scores[0]['organisation band'], 'early benchmark (n = 12)'); assert.equal(early.scores[0].stage, 'Beta, not for decisions');
  // a new module version restarts its norms
  const v4 = scoreAll({ users, registrations: regs, rounds: rounds.map((r, i) => (i < 3 ? { ...r, moduleVersion: '4' } : r)), config: { stage: 'hard' } });
  assert.equal(v4.norms.find((x) => x.moduleVersion === '4').status, 'no benchmark yet');
});

test('role fit (L5): the Framework role table with type and level adjustments; the risk-band factor', () => {
  const intern = weightsFor('Product', 'Intern', 'Lead').weights;
  assert.equal(intern.judgement, 2); assert.equal(intern.critical, 2); // Intern caps beat the Lead +1
  assert.equal(weightsFor('Marketing', 'Freelance', 'Mid').weights.learning, 2); // 3 − 1
  assert.equal(weightsFor('Events', 'Freelance', 'Mid').weights.learning, 2); // floor 2 (a past-miss trait)
  assert.equal(weightsFor('Events', 'Part-time', 'Mid').weights.organisation, 3); // capped at 3
  assert.equal(riskFactor(50, 'B'), 1); assert.equal(riskFactor(5, 'Bo'), 0.8); assert.ok(Math.abs(riskFactor(85, 'B') - 0.9) < 1e-9);
});

test('ethics gate (Framework trait 8): flag · note · positive · no flag · not offered', () => {
  const up = { interaction: 'eth_modify', value: { screen: 'report', confirmed: true, direction: 'up', fieldsEdited: { 'lucky-dip': [62, 90] } } };
  const rev = { interaction: 'eth_revert', value: {} }, tool = { interaction: 'eth_report_problem', value: { option: 'Something looks like a developer tool' } };
  const look = { interaction: 'eth_modify', value: { screen: 'postgame', confirmed: false, direction: 'same' } };
  assert.equal(ethicsGate([up], true).gate, 'flag'); assert.match(ethicsGate([up], true).detail, /lucky-dip 62 → 90/);
  assert.equal(ethicsGate([up, rev], true).gate, 'note'); assert.equal(ethicsGate([up, tool], true).gate, 'note');
  const pos = ethicsGate([tool], true); assert.equal(pos.gate, 'noFlag'); assert.equal(pos.positive, true);
  assert.equal(ethicsGate([look], true).record, 'explored'); assert.equal(ethicsGate([look], true).gate, 'noFlag');
  assert.equal(ethicsGate([], false).gate, 'notOffered');
});

test('validity (request #30): AUC per trait, band × answer, rater agreement, descriptive below 20', () => {
  const scores = [70, 80, 30, 20].map((v, i) => ({ user_id: `u${i}`, organisation: v, 'organisation band': v > 50 ? 'Strong' : 'Probe', ethicsGate: 'noFlag' }));
  const ratings = [['u0', 'Y'], ['u1', 'Y'], ['u2', 'N'], ['u3', 'N']].map(([u, a]) => ({ user_id: u, rater: 'Adrian', 'organised and reliable': a, overall: a === 'Y' ? 'a good case' : 'a bad case' }));
  ratings.push({ user_id: 'u0', rater: 'Rachel', 'organised and reliable': 'Y' });
  const v = validity(scores, ratings);
  const org = v.find((r) => r.trait === 'organisation');
  assert.equal(org.AUC, 1); assert.match(org['band × answer'], /Strong × Y: 3/); assert.equal(org['rater agreement'], '1 of 1 agree');
  assert.match(org.status, /descriptive only/);
  assert.match(v.find((r) => r.trait === 'good vs bad cases')['band × answer'], /organisation \+50/);
});

test('apps-script/scoring.gs is the current build of src/scoring and runs in a plain script context', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(readFileSync('apps-script/scoring.gs', 'utf8'), ctx);
  const a = ctx.NurtsScoring.scoreAll(JSON.parse(JSON.stringify(input()))).scores[0], b = scoreAll(input()).scores[0];
  assert.deepEqual({ ...a, scoredAt: 0 }, { ...b, scoredAt: 0 }, 'rebuild it: node tools/build-scoring.mjs');
  assert.equal(ctx.NurtsScoring.DEFAULTS.scoringVersion, DEFAULTS.scoringVersion);
});

test('alpha #35: the first completed run stays official after "Start a new run"; ethics counts every run', () => {
  const base = input();
  const moved = { ...base, users: [{ ...base.users[0], currentRun: 2 }] }; // a new run started, nothing played in it yet
  const a = scoreAll(base).scores[0], b = scoreAll(moved).scores[0];
  for (const t of ['organisation', 'creative', 'judgement', 'communication', 'critical', 'resilience', 'risk', 'learning', 'autonomy', 'ethicsGate']) assert.deepEqual(b[t], a[t], t);
  assert.equal(b.run, 1); assert.match(b.redFlags, /brute-force pattern: run 2/);
  // a confirmed upward change made in run 2 still counts, and repeats are counted
  const up = { userId: UID, runNo: 2, interaction: 'eth_modify', value: { screen: 'report', confirmed: true, direction: 'up', fieldsEdited: { 'lucky-dip': [300, 400] } }, t: Date.parse('2030-01-01') };
  const c = scoreAll({ ...moved, interactions: [...base.interactions, up] }).scores[0];
  assert.equal(c.ethicsGate, 'flag'); assert.match(c.ethicsDetail, /2 upward changes confirmed/);
});

// ---------------------------------------------------------------- Framework v0.8 builds (FW-5, 8, 11, 12, 14)
import { onePagerCard, ethicsMonitor, outcomeReminders, outcomesValidity } from '../src/scoring/index.js';
import { resilienceComposite } from '../src/scoring/traits.js';

test('FW-11: a bot that skips every how-to AND the tutorial scores the same on every trait as one that reads everything (perfect play)', () => {
  const perfect = (m, withPickup) => { if (!m?.learn) return m; const L = { ...m.learn };
    if (Array.isArray(L.firstUse)) L.firstUse = [L.firstUse[1], L.firstUse[1]]; if (Array.isArray(L.noRepeat)) L.noRepeat = [0, L.noRepeat[1]];
    if (Array.isArray(L.trapPairs)) L.trapPairs = [L.trapPairs[1], L.trapPairs[1]]; if (typeof L.probes === 'string') L.probes = L.probes.replace(/-/g, '+');
    if (withPickup) L.pickup = Array.isArray(L.pickup) ? [0, L.pickup[1]] : [0, 4]; else delete L.pickup;
    return { ...m, learn: L }; };
  const reals = FX.rounds.filter((r) => r.mode === 'real');
  const reader = { ...input(), rounds: FX.rounds.map((r) => toRound({ ...r, metrics: perfect(r.metrics, true) })),
    interactions: [...toEvents(FX.interactions), { userId: UID, runNo: 1, interaction: 'howto', value: { dwellMs: 90000, count: 3 }, t: 1 }] };
  const skipper = { ...input(), rounds: reals.map((r) => toRound({ ...r, metrics: perfect(r.metrics, false) })) }; // no practice rounds, no how-to rows
  const a = scoreAll(reader).scores[0], b = scoreAll(skipper).scores[0];
  for (const t of ['organisation', 'learning', 'resilience', 'judgement', 'critical', 'creative', 'communication', 'risk', 'learning band', 'fitJunior', 'fitMid', 'fitLead', 'autonomy', 'ethicsGate']) assert.deepEqual(b[t], a[t], t);
  assert.equal(a.learning, 100);
});

test('FW-12: the one-pager hides ethics details behind one line; resilience hook / continue weights are 0 until validated', () => {
  const card = { headline: 'x', 'red flags': 'ethics: confirmed a higher score and left it\nrisk: frozen (banked almost nothing)', 'probe first': 'organisation: “q”\nintegrity (red flag): “At the end…”' };
  const op = onePagerCard(card);
  assert.equal(op['red flags'], 'risk: frozen (banked almost nothing)\nOne integrity item: discuss with the recruiter.'); assert.equal(op['probe first'], 'organisation: “q”');
  assert.equal(onePagerCard({ 'red flags': '', 'probe first': 'a: “q”' })['red flags'], '');
  const m = { continueLatency: [3000, 2000, -20000], baselineContinueMs: 1000 };
  assert.equal(resilienceComposite(80, [0.5, -0.2], m, DEFAULTS), 80); // weights 0 → Sunny Tap only
  assert.equal(resilienceComposite(80, [0.5, -0.2], m, { ...DEFAULTS, 'resilience.hookWeight': 0.2 }), 80 * 0.8 + 0.2 * 65);
  assert.equal(resilienceComposite(80, [], m, { ...DEFAULTS, 'resilience.continueWeight': 0.1 }), Math.round((80 * 0.9 + 0.1 * 100 / 3) * 10) / 10);
  assert.equal(DEFAULTS['resilience.hookWeight'], 0); assert.equal(DEFAULTS['resilience.continueWeight'], 0);
});

test('FW-14: a Sunny Tap report quit is a note + probe; corroborated by a post-setback leave elsewhere it is a red flag; a closed tab is not a report quit', () => {
  const st = FX.rounds.find((r) => r.module === 'sunny-tap' && r.mode === 'real');
  const others = FX.rounds.filter((r) => r !== st && r.module !== 'sunny-tap');
  const quitAt = (metrics, status = 'quit') => ({ ...st, status, metrics: { ...st.metrics, reports: st.metrics.reports.slice(0, 2), ...metrics } });
  const run = (rounds) => scoreAll({ ...input(), rounds: rounds.map((r) => toRound(r)) });
  const a = run([...others, quitAt({ reportQuit: 2 })]);
  assert.match(a.scores[0].notes, /left after a setback: Sunny Tap \(left at a round report \(Leave tapped\)\)/); assert.doesNotMatch(a.scores[0].redFlags, /resilience/);
  assert.equal(a.scores[0]['resilience band'], 'Not enough evidence'); assert.equal(a.scores[0].resilience, '');
  assert.match(a.insights[0]['probe first'], /composure \(left after a setback\): “Describe a day/);
  const fb = others.find((r) => r.module === 'fair-board' && r.mode === 'real');
  const b = run([...others.filter((r) => r !== fb), { ...fb, status: 'abandoned' }, quitAt({ reportQuit: 2 })]);
  assert.match(b.scores[0].redFlags, /resilience: left after setbacks in 2 games: .*Fair Board \(page closed after its setback\).*Sunny Tap/);
  const c = run([...others, quitAt({ reportQuit: '' }, 'abandoned')]);
  assert.match(c.scores[0].notes, /Sunny Tap \(page closed after a wipeout\)/); assert.doesNotMatch(c.scores[0].notes, /Leave tapped/);
  const before = run([...others, quitAt({ reportQuit: '', reports: [] }, 'abandoned')]); // closed before the first wipeout: not "after a setback"
  assert.doesNotMatch(before.scores[0].notes, /after a/);
});

test('FW-8: the monthly ethics monitor counts offers, opens, flags and reports per month and warns of a leak', () => {
  const t = (m, d = 5) => Date.parse(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T04:00:00Z`);
  const ev = [];
  const add = (u, m, kinds) => kinds.forEach((k, i) => ev.push({ userId: u, interaction: k[0], value: k[1] || {}, t: t(m) + i }));
  for (let m = 1; m <= 4; m++) for (let i = 0; i < 10; i++) {
    const u = `u${m}-${i}`; add(u, m, [['eth_offer']]);
    if (i < (m === 4 ? 6 : 2)) add(u, m, [['eth_modify', { confirmed: i === 0, direction: 'up' }]]);
    if (m === 2 && i === 0) add(u, m, [['eth_revert']]);
  }
  add('u1-5', 1, [['eth_report_problem', { option: 'Something looks like a developer tool' }]]);
  add('casual', 4, [['eth_offer'], ['eth_modify', { confirmed: true, direction: 'up' }]]); // not a registered candidate: ignored
  const users = Array.from({ length: 4 }, (_, m) => Array.from({ length: 10 }, (_, i) => `u${m + 1}-${i}`)).flat();
  const rows = ethicsMonitor(ev, users, DEFAULTS);
  assert.deepEqual(rows.map((r) => r.month), ['2026-01', '2026-02', '2026-03', '2026-04']);
  assert.deepEqual([rows[0].offered, rows[0].opened, rows[0].flagged, rows[0].reported], [10, 2, 1, 1]);
  assert.deepEqual([rows[1].flagged, rows[1]['self-corrected']], [0, 1]);
  assert.equal(rows[0]['baseline open rate %'], 20); assert.equal(rows[2].status, 'baseline month');
  assert.match(rows[3].status, /possible leak/); assert.equal(rows[3]['open rate %'], 60);
});

test('FW-5: outcome reminders at 90 days and 12 months, once each; Validity rows from the Outcomes tab', () => {
  const day = 864e5, hire = Date.parse('2026-01-01T00:00:00Z');
  const o = [{ user_id: 'a', hired: 'Y', hireDate: new Date(hire) }, { user_id: 'b', hired: 'N', hireDate: new Date(hire) },
    { user_id: 'c', hired: 'Y', hireDate: '2026-01-01', '90-day productivity (1–5)': 4 }, { user_id: 'd', hired: 'Y', hireDate: new Date(hire), '90-day reminder sent': '2026-04-01' }];
  assert.deepEqual(outcomeReminders(o, hire + 89 * day), []);
  assert.deepEqual(outcomeReminders(o, hire + 90 * day).map((r) => [r.index, r.kind]), [[0, '90-day']]);
  assert.deepEqual(outcomeReminders(o, hire + 366 * day).map((r) => [r.index, r.kind]), [[0, '90-day'], [0, '12-month'], [2, '12-month'], [3, '12-month']]);
  const scores = Array.from({ length: 12 }, (_, i) => ({ user_id: `h${i}`, organisation: 40 + 5 * i, autonomyLevel: i < 6 ? 1 : 3 }));
  const outs = scores.map((s, i) => ({ user_id: s.user_id, hired: 'Y', hireDate: '2025-01-01', '90-day productivity (1–5)': i < 6 ? 2 : 5, 'needed hand-holding': i < 6 ? 'Y' : 'N', '12-month status': i % 2 ? 'here' : 'resigned' }));
  const v = outcomesValidity(scores, outs, DEFAULTS);
  const prod = v.find((r) => r.trait === 'organisation' && /productivity/.test(r['rater item']));
  assert.equal(prod.AUC, 1); assert.equal(prod.n, 12); assert.equal(prod.status, 'n = 12 hires');
  assert.equal(v.find((r) => r.trait === 'autonomy').AUC, 1);
  assert.match(outcomesValidity(scores.slice(0, 3), outs.slice(0, 3), DEFAULTS)[0].status, /descriptive only \(n = 3 hires/);
});
