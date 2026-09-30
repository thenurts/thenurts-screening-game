// Autonomy (requests #32–34, Framework v0.7): the two finales' rules and the level read match tests/autonomy-reference.py,
// and the scoring layer combines them into a label, a factor, flags, probes and a Validity row. Run: npm run test:unit
// Fixture: tests/fixtures/autonomy-parity.json ← python3 tests/autonomy-fixture.py (reference personas, 440 plays).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as MK from '../src/modules/mamak-rush/closing.js';
import * as FX from '../src/modules/fix-it-kit/freefix.js';
import { ADAPTERS, scoreAll, validity, DEFAULTS } from '../src/scoring/index.js';
import { finaleRead, combineAutonomy, levelOf, autonomyFactor, targetOf } from '../src/scoring/autonomy.js';

const F = JSON.parse(readFileSync('tests/fixtures/autonomy-parity.json', 'utf8'));
const mkPlay = (log) => { const st = MK.newClosing(), by = Object.fromEntries(log.map(([t, c, tp]) => [t, [c, tp]])); while (!st.over) { const e = by[st.t] || [null, false]; MK.step(st, e[0], e[1]); } return st; };
const fxPlay = (log) => { const st = FX.newFreeFix(); for (const [c, tp] of log) FX.apply(st, c ? `${c[0]}:${c[1]}` : null, tp); return st; };
const mkMetrics = (st, extra = {}) => ({ autonomy: { log: MK.encodeLog(st), done: true, tips: 0, firstActionMs: 4000, medianActionMs: 3000, idleMs: 0 }, ...extra });
const fxMetrics = (st, extra = {}) => ({ autonomy: { log: FX.encodeLog(st), done: true, tips: 0, firstActionMs: 4000, medianActionMs: 3000, idleMs: 0 }, ...extra });

test('Closing Time: rules + level read match the reference on 240 persona plays (via the stored log, as the Sheet replays it)', () => {
  for (const c of F.mamak) {
    const r = finaleRead('mamak-rush', mkMetrics(mkPlay(c.log)), ADAPTERS['mamak-rush']);
    assert.equal(r.status, 'ok'); assert.equal(r.level, c.level, `${c.persona} ${c.seed}`);
    for (const k of ['coherence', 'balance', 'outcome', 'tipBefore']) assert.equal(r.facts[k], c[k], `${c.persona} ${c.seed} ${k}`);
  }
  assert.equal(MK.TAU, F.tauMamak);
});

test('Free Fix: rules + level read match the reference on 200 persona plays; the exhaustive best matches', () => {
  for (const c of F.fixIt) {
    const r = finaleRead('fix-it-kit', fxMetrics(fxPlay(c.log)), ADAPTERS['fix-it-kit']);
    assert.equal(r.level, c.level, `${c.persona} ${c.seed}`);
    for (const k of ['coherence', 'balance', 'outcome', 'tipBefore']) assert.ok(Math.abs(r.facts[k] - c[k]) < 1e-12, `${c.persona} ${c.seed} ${k}`);
  }
  assert.deepEqual(FX.bestOf(), F.bestFx); assert.equal(FX.TAU, F.tauFixIt);
});

test('combining two finales: agree · range (lower level) · inconsistent → L2; one finale or practised → provisional (factor 1)', () => {
  const ok = (game, level, extra = {}) => ({ game, status: 'ok', level, facts: { coherence: 0.8, balance: 0.6, outcome: 0.6, tipBefore: 0 }, ...extra });
  for (const c of F.combine) {
    const r = combineAutonomy([ok('Closing Time', c.a), ok('Free Fix', c.b)]);
    assert.equal(r.level, c.level); assert.equal(r.label, c.label.replace('–', '–')); assert.equal(r.factorLevel, c.level);
  }
  assert.equal(combineAutonomy([ok('Closing Time', 1), ok('Free Fix', 1)]).red, true); // the red flag needs L1 in BOTH
  assert.equal(combineAutonomy([ok('Closing Time', 1), ok('Free Fix', 2)]).red, false);
  const one = combineAutonomy([ok('Closing Time', 3)]); assert.match(one.label, /provisional: one finale/); assert.equal(one.factorLevel, null);
  const pr = combineAutonomy([ok('Closing Time', 1), ok('Free Fix', 1, { provisional: true })]); assert.match(pr.label, /practised before/); assert.equal(pr.red, false); assert.equal(pr.factorLevel, null);
  assert.match(combineAutonomy([{ game: 'Free Fix', status: 'n/a', why: 'disengaged or idle' }]).label, /not enough evidence/);
  assert.match(combineAutonomy([]).label, /not measured/);
});

test('freeze = a note only; disengaged or idle → n/a; tips are free (only a pattern of tips BEFORE trying reads L1)', () => {
  const bal = F.mamak.find((c) => c.persona === 'purpose-setter' && c.level === 3);
  const st = mkPlay(bal.log);
  const frozen = finaleRead('mamak-rush', { autonomy: { ...mkMetrics(st).autonomy, firstActionMs: 30000, medianActionMs: 3000 } }, ADAPTERS['mamak-rush']);
  assert.equal(frozen.freeze, true); assert.equal(frozen.level, 3); // a freeze on its own never lowers the level
  assert.match(combineAutonomy([frozen]).notes.join(), /freeze on its own is a note/);
  assert.equal(finaleRead('mamak-rush', { ...mkMetrics(st), flags: 'disengaged' }, ADAPTERS['mamak-rush']).status, 'n/a');
  assert.equal(finaleRead('mamak-rush', { autonomy: { ...mkMetrics(st).autonomy, idleMs: 200000 } }, ADAPTERS['mamak-rush']).status, 'n/a');
  // one early tip, same moves → still L3; tips before most moves → L1
  const oneTip = mkPlay(bal.log.map(([t, c], i) => [t, c, i === 0]));
  assert.equal(finaleRead('mamak-rush', mkMetrics(oneTip), ADAPTERS['mamak-rush']).level, 3);
  const manyTips = mkPlay(bal.log.map(([t, c]) => [t, c, true]));
  assert.equal(finaleRead('mamak-rush', mkMetrics(manyTips), ADAPTERS['mamak-rush']).level, 1);
});

test('autonomyFactor: targets Junior L1 · Mid L2 · Lead L3 (Intern L1, Freelance ≥ L2); 1.0 · 0.8 · 0.6; switch off in ScoringConfig', () => {
  assert.equal(targetOf('Lead', 'Intern'), 1); assert.equal(targetOf('Junior', 'Freelance'), 2); assert.equal(targetOf('Mid', 'Full-time'), 2);
  assert.equal(autonomyFactor(1, 'Junior', 'Full-time'), 1); assert.equal(autonomyFactor(1, 'Mid', 'Full-time'), 0.8); assert.equal(autonomyFactor(1, 'Lead', 'Full-time'), 0.6);
  assert.equal(autonomyFactor(3, 'Lead', 'Full-time'), 1); assert.equal(autonomyFactor(null, 'Lead', 'Full-time'), 1);
  assert.equal(autonomyFactor(1, 'Lead', 'Full-time', { ...DEFAULTS, 'autonomy.enabled': false }), 1);
  assert.equal(levelOf({ tipBefore: 0, coherence: 0.7, balance: 0.6, outcome: 0.5, tau: 0.575 }), 3);
});

test('pipeline: the finales change the suitability spectrum and flags, never a trait score', () => {
  const FXR = JSON.parse(readFileSync('tests/fixtures/scoring-rounds.json', 'utf8'));
  const uid = 'a.tester@example.com|+60100000999';
  const base = FXR.rounds.filter((r) => r.mode === 'real').map((r) => ({ userId: uid, runNo: 1, module: r.module, moduleVersion: String(r.moduleVersion), mode: 'real', status: 'completed', startedAt: Date.parse(r.startedAt) || 0, metrics: (({ autonomy, ...m }) => m)(r.metrics) })); // no finales
  const withFinales = (mkLog, fxLog) => base.map((r) => (r.module === 'mamak-rush' ? { ...r, metrics: { ...r.metrics, autonomy: mkMetrics(mkPlay(mkLog)).autonomy } } : r.module === 'fix-it-kit' ? { ...r, metrics: { ...r.metrics, autonomy: fxMetrics(fxPlay(fxLog)).autonomy } } : r));
  const run = (rounds) => scoreAll({ users: [{ userId: uid, name: 'Test Player', currentRun: 1 }], registrations: { [uid]: { employmentType: 'Full-time', desiredFunction: 'Events' } }, rounds, interactions: [] });
  const l1 = [F.mamak.find((c) => c.level === 1 && c.persona === 'executor-high'), F.fixIt.find((c) => c.level === 1 && c.persona === 'executor-high')];
  const l3 = [F.mamak.find((c) => c.level === 3), F.fixIt.find((c) => c.level === 3)];
  const none = run(base), low = run(withFinales(l1[0].log, l1[1].log)), high = run(withFinales(l3[0].log, l3[1].log));
  for (const t of ['organisation', 'creative', 'judgement', 'communication', 'critical', 'resilience', 'risk', 'learning']) { assert.equal(low.scores[0][t], none.scores[0][t], t); assert.equal(high.scores[0][t], none.scores[0][t], t); }
  assert.equal(high.scores[0].autonomy, 'L3'); assert.equal(low.scores[0].autonomy, 'L1'); assert.match(none.scores[0].autonomy, /not measured/);
  assert.equal(high.scores[0].fitLead, none.scores[0].fitLead); // meets every target → 1.0
  assert.equal(low.scores[0].fitJunior, none.scores[0].fitJunior);
  assert.ok(Math.abs(low.scores[0].fitLead - none.scores[0].fitLead * 0.6) <= 0.1); assert.ok(Math.abs(low.scores[0].fitMid - none.scores[0].fitMid * 0.8) <= 0.1);
  assert.match(low.scores[0].redFlags, /autonomy: L1 in both finales/); assert.doesNotMatch(high.scores[0].redFlags, /autonomy/);
  assert.match(none.insights[0]['probe first'], /autonomy \(not measured/); assert.doesNotMatch(high.insights[0]['probe first'], /autonomy/);
  assert.equal(high.insights[0].autonomy, 'L3'); assert.match(high.scores[0]['autonomy detail'], /Closing Time L3.*Free Fix L3/);
  // a round closed during the finale still counts for its trait (the scored part was done)
  const left = run(base.map((r) => (r.module === 'mamak-rush' ? { ...r, status: 'abandoned', metrics: { ...r.metrics, mainDone: true } } : r)));
  assert.equal(left.scores[0].organisation, none.scores[0].organisation); assert.match(left.scores[0].notes, /left during the Closing Time finale/);
});

test('validity: autonomy vs "needed little hand-holding", with the AUC < 0.6 fallback note', () => {
  const scores = [3, 3, 1, 1, 2].map((l, i) => ({ user_id: `u${i}`, autonomy: `L${l}`, autonomyLevel: l }));
  const good = validity(scores, scores.map((s, i) => ({ user_id: s.user_id, rater: 'Adrian', 'needed little hand-holding': i < 2 ? 'Y' : 'N' }))).find((r) => r.trait === 'autonomy');
  assert.equal(good.AUC, 1); assert.match(good['band × answer'], /L3 × Y: 2/); assert.equal(good.note, '');
  const bad = validity(scores, scores.map((s, i) => ({ user_id: s.user_id, rater: 'Adrian', 'needed little hand-holding': i < 2 ? 'N' : 'Y' }))).find((r) => r.trait === 'autonomy');
  assert.match(bad.note, /autonomy.enabled = false/);
});
