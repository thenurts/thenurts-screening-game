// ScoringConfig defaults (Framework v0.5 + scoring layer design v0.1). The Sheet's ScoringConfig tab overrides any key
// (one row per key, JSON value); every derived number is stamped with `scoringVersion`. Change a value → bump the
// version → The Nurts → Rescore all.
export const DEFAULTS = {
  scoringVersion: 'sc-2', // sc-2: autonomy measured (#32–34)
  stage: 'alpha', // alpha · beta · soft · hard (request #31)
  // L4 norms
  'norms.minProvisional': 5, 'norms.minBands': 30, 'bands.strongTop': 0.30, 'bands.probeBottom': 0.20,
  // L2 traits
  'o1.facetWeights': { planning: 0.60, pressure: 0.40 }, 'o1.pressureSplit': { errorsUnderLoad: 0.60, parkedReturn: 0.40 },
  'o1.planningSplit': { valueShare: 0.30, expiredHigh: 0.20, halfDone: 0.20 },
  'res.hookWeight': 0, // setback hooks: logged only until validated (Framework to set; suggested 0.20)
  'secondary.weight': 0, // secondary signals start at 0 (logged only)
  // L3 learning (Framework v0.4–0.5)
  'learn.weights': { firstUse: 0.30, pickup: 0.20, noRepeat: 0.20, trapPairs: 0.15, adaptation: 0.15 },
  'learn.minParts': 2, 'learn.minGames': 2, 'learn.redFlagMinParts': 3, 'learn.itemNormsReady': false,
  'learn.provisionalBands': { high: 70, low: 40 }, // until 30+ learning scores exist
  // L5 role fit (Framework role profiles)
  roles: {
    Events: { organisation: 3, learning: 2, resilience: 3, judgement: 2, critical: 1, creative: 2, communication: 3, risk: 'B' },
    Marketing: { organisation: 2, learning: 3, resilience: 1, judgement: 2, critical: 2, creative: 3, communication: 2, risk: 'B-Bo' },
    Sales: { organisation: 2, learning: 2, resilience: 3, judgement: 2, critical: 1, creative: 1, communication: 3, risk: 'Bo' },
    Product: { organisation: 2, learning: 2, resilience: 1, judgement: 3, critical: 3, creative: 2, communication: 2, risk: 'C-B' },
    Creative: { organisation: 2, learning: 2, resilience: 1, judgement: 1, critical: 1, creative: 3, communication: 2, risk: 'Bo' },
    Other: { organisation: 3, learning: 2, resilience: 2, judgement: 2, critical: 2, creative: 1, communication: 1, risk: 'C' },
  },
  riskBands: { C: [0, 35], B: [35, 65], Bo: [65, 100], 'B-Bo': [35, 100], 'C-B': [0, 65] },
  'risk.outsideFloor': 0.8, 'risk.outsideSpan': 40,
  typeAdjust: {
    Intern: { learning: 1, cap: { judgement: 2, critical: 2 } },
    Freelance: { organisation: 1, learning: -1 },
    'Part-time': { organisation: 1 },
    'Full-time': {},
  },
  levelAdjust: { Junior: {}, Mid: {}, Lead: { judgement: 1, critical: 1 } },
  'weights.floor': { organisation: 2, learning: 2 }, 'weights.cap': 3,
  // L5 autonomy (request #34; Framework v0.7): two finales → a level → autonomyFactor per suitability level
  'autonomy.enabled': true, // false = probe-only (factor 1), e.g. if the Validity AUC vs "needed little hand-holding" is below 0.6
  'autonomy.rules': { tipBeforeL1: 0.5, coherenceL1: 0.55, coherenceL3: 0.70, outcomeL3: 0.5, freezeRatio: 3, freezeMinMs: 10000, idleNaMs: 120000 },
  'autonomy.targets': { Junior: 1, Mid: 2, Lead: 3 }, 'autonomy.typeMax': { Intern: 1 }, 'autonomy.typeMin': { Freelance: 2 },
  'autonomy.shortFactor': [1, 0.8, 0.6], // meets the target · one level short · two short
  'autonomy.validAuc': 0.6, // Validity: below this vs "needed little hand-holding" → switch the factor off until fixed
  // Validity (request #30)
  'validity.descriptiveBelow': 20,
};

/** DEFAULTS overlaid with the Sheet's values (unknown keys are kept, so new settings can be added without code). */
export function mergeConfig(over = {}) {
  const c = JSON.parse(JSON.stringify(DEFAULTS));
  for (const [k, v] of Object.entries(over || {})) if (v !== '' && v != null) c[k] = v;
  return c;
}

export const MIB = ['organisation', 'learning', 'resilience', 'judgement', 'critical', 'creative', 'communication'];
export const STAGE_LABEL = { alpha: 'ALPHA: test data', beta: 'Beta, not for decisions', soft: 'Calibration', hard: '' };
export const STAGE_NO_NORMS = { alpha: true };
export const OBSOLETE_KEYS = ['autonomyFactor']; // removed from the Sheet's ScoringConfig on the next rescore
