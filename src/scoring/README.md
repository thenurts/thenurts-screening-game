# The Nurts scoring layer (`src/scoring/`) · sc-1 · built 2026-09-30

Requests #28–31 · design: `claude/13-scoring-layer-design.md` v0.1 · formulas and weights: `claude/10-evaluation-framework.md` v0.5.
It turns the raw tabs (Rounds, RoundTraces, Interactions) into evidence a person reviews. **It never makes a decision.**

## One codebase, three places
| Where | How |
|---|---|
| Unit tests | `tests/scoring.unit.test.mjs`, `tests/learning.unit.test.mjs` import these files directly |
| The candidate's report | only `learning.js` (the learning band) and `traits.js` (Mamak's 60/40 organisation) |
| The Sheet | `apps-script/scoring.gs` = a build of this folder (`node tools/build-scoring.mjs`), exposed as the global `NurtsScoring`; `Code.gs` calls `NurtsScoring.scoreAll()` on **Rescore all** and hourly with the Candidate Summary. A unit test fails if `scoring.gs` is out of date |

## Layers
| Layer | File | What |
|---|---|---|
| L1 | `pipeline.js` `rederiveRound` + each game's `src/modules/<id>/rescore.js` | re-derives the round's metrics from its raw logs (decisions, turnLog, claimLog, actionLog, tryLog, callLog, tapLog) **with the game's own code**; `l1Check` = ok / mismatch / n/a. Rescoring uses the re-derived values, so a fixed formula in a game applies to old rounds too |
| L2 | `traits.js` | one trait per game; organisation re-weighted to planning 60 / pressure 40 (`o1.*`); setback hooks and secondary signals logged at weight 0 |
| L3 | `learning.js`, `learnFacts.js`, `ethicsGate.js` | learning v2 (30/20/20/15/15, n/a rules, ≥ 2 parts from ≥ 2 games, Low / Typical / High); the ethics gate (noFlag · note · flag · notOffered, + positive "reported") |
| L4 | `pipeline.js` | norms per `module@version`: < 5 no benchmark · 5–29 early (probes only) · ≥ 30 Strong (top 30%) / Typical / Probe (bottom 20%); off in Alpha |
| L5 | `fit.js` | role fit per function × type × level (the Framework table, caps, floors, Intern caps, Lead +1), the risk-band factor, the suitability spectrum, best-fit function; autonomy "not yet measured" (factor 1) |
| L6 | `pipeline.js` | red flags · notes · positives · caveats (Framework rule 4; never auto-reject) |
| L7 | `pipeline.js` | Scores row, Insights card (template sentences), Norms; `validity.js` = the Calibration → Validity loop |

## ScoringConfig
`config.js` holds the defaults; the Sheet's **ScoringConfig** tab (created on the first rescore) overrides any key, one row per key with a JSON value. Change a value → bump `scoringVersion` → **The Nurts → Rescore all**. The previous version's Scores tab is kept as `Scores <version>`.

## Stage (`stage` key: alpha · beta · soft · hard)
Alpha: norms off, every staff row says "ALPHA: test data". Beta: norms computed, labelled "Beta, not for decisions". Soft: "Calibration". Hard: live. **The Nurts → Archive and purge…** (type PURGE) copies the spreadsheet to a private archive folder, clears the raw and derived tabs (not ScoringConfig, not the CV files) and logs it in **Purges**.

## Adding a game
Give it a `rescore.js` (`primaryKey`, `rederive(metrics)`, `learningFacts(metrics)`), add one line to `modules.js` and one case to `traits.js`, then rebuild `scoring.gs`.
