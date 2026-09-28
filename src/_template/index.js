// Copy this folder to src/modules/<your-id>/, rename, fill in, then add the id to src/modules.config.js.
// Folders starting with "_" are ignored by the registry.
export default {
  id: '_template',             // must equal the folder name; permanent (it's written to the Sheet)
  version: 1,                  // bump whenever scoring/difficulty changes (benchmarks split by version)
  title: 'Game title',
  tagline: 'One line shown on the pre-game card.',
  trait: 'risk',               // key from src/core/traits.js (never shown to the candidate)
  host: 'mia',                 // optional; defaults to the trait's host
  hostLine: 'Optional host speech bubble on the pre-game card.',
  estMinutes: 2,
  logEvents: [],               // tier B: decision events that get their own Interactions row; everything else from this.log() goes to the round trace
  howTo: [ { title: 'Page title', body: 'What to do.', img: 'char:mia-excited' } ], // or icon: '🎈'
  practice: { durationSec: 30, scored: false },
  round: { durationSec: 90 },
  metrics: [
    { key: 'score', label: 'Score', unit: 'pts', primary: true, higherIsBetter: true },
  ],
  traitScore: (m) => 50,       // metrics → 0..100 for the report radar
  load: () => import('./GameScene.js'),
};
