// The scoring layer's public surface. The browser (candidate report) uses learning + traits; the Sheet uses scoreAll + validity
// through apps-script/scoring.gs (built from this file by `node tools/build-scoring.mjs`, exposed as the global NurtsScoring).
export { DEFAULTS, mergeConfig, STAGE_LABEL, OBSOLETE_KEYS } from './config.js';
export { scoreAll, rederiveRound, TRAITS_OUT, PROBES } from './pipeline.js';
export { validity, CALIBRATION_COLUMNS, CALIBRATION_CHOICES, OUTCOME_COLUMNS, OUTCOME_CHOICES, outcomeReminders, outcomesValidity } from './validity.js';
export { ethicsMonitor } from './ethicsMonitor.js';
export { onePagerCard } from './pipeline.js';
export { learningComposite, learningFromMetrics } from './learning.js';
export { traitOf, orgScoreV2 } from './traits.js';
export { ethicsGate } from './ethicsGate.js';
export { ADAPTERS } from './modules.js';
export { finaleRead, combineAutonomy, levelOf, autonomyFactor, targetOf } from './autonomy.js';
