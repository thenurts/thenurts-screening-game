// The scoring layer's public surface. The browser (candidate report) uses learning + traits; the Sheet uses scoreAll + validity
// through apps-script/scoring.gs (built from this file by `node tools/build-scoring.mjs`, exposed as the global NurtsScoring).
export { DEFAULTS, mergeConfig, STAGE_LABEL } from './config.js';
export { scoreAll, rederiveRound, TRAITS_OUT, PROBES } from './pipeline.js';
export { validity, CALIBRATION_COLUMNS, CALIBRATION_CHOICES } from './validity.js';
export { learningComposite, learningFromMetrics } from './learning.js';
export { traitOf, orgScoreV2 } from './traits.js';
export { ethicsGate } from './ethicsGate.js';
export { ADAPTERS } from './modules.js';
