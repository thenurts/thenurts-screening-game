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
  assert.equal(s.stage, 'ALPHA: test data'); assert.equal(s.scoringVersion, 'sc-1');
  for (const t of ['organisation', 'resilience', 'judgement', 'critical', 'creative', 'communication', 'risk']) assert.notEqual(s[t], '', t);
  const mk = FX.rounds.find((r) => r.module === 'mamak-rush' && r.mode === 'real').metrics;
  assert.equal(s.organisation, orgScoreV2(mk).score);
  assert.equal(s['organisation band'], 'no benchmark (alpha)');
  // the bot raised a score, then reported the tool in the same run → self-corrected: a note (Framework gate table)
  assert.equal(s.ethicsGate, 'note'); assert.match(s.ethicsDetail, /^selfCorrected.*\(up\).*reported Y/); assert.equal(s.ethicsOpportunities, FX.interactions.filter((r) => r[6] === 'eth_offer').length);
  assert.match(s.notes, /self-corrected/); assert.doesNotMatch(s.redFlags, /ethics/); assert.equal(s.autonomy.startsWith('not yet measured'), true);
  assert.match(s.l1Check, /sunny-tap ok/);
  assert.ok(s.fitJunior !== '' && s.fitMid !== '' && s.fitLead !== '');
  const card = out.insights[0];
  assert.match(card.headline, /^Marketing fit: Junior/); assert.match(card['probe first'], /“/);
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
