// TEST MODULE – proves the module contract end to end. Remove from modules.config.js before launch.
export default {
  id: 'sample-tap',
  version: 1,
  title: 'Sunny Tap',
  tagline: 'Tap the suns before they fade. Quick warm-up!',
  trait: 'test',
  host: 'liam',
  hostLine: 'Warm-up time! Tap every sun you see.',
  estMinutes: 1,
  // Tier B row events (each needs a purpose in the brief). Test module: none, so hit/miss/expired go to the round trace.
  logEvents: [],
  howTo: [
    { title: 'Tap the suns', body: 'Suns pop up around the screen. Tap each one before it shrinks away.', img: 'char:liam-excited' },
    { title: 'Be quick and careful', body: 'Faster taps score more. Tapping empty space counts as a miss.', icon: '☀️' },
  ],
  practice: { durationSec: 10, scored: false },
  round: { durationSec: 20 },
  metrics: [
    { key: 'score', label: 'Score', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'accuracy', label: 'Accuracy', unit: '%', higherIsBetter: true },
    { key: 'avgReactMs', label: 'Average reaction', unit: 'ms', higherIsBetter: false },
  ],
  traitScore: (m) => Math.round(0.6 * (m.accuracy ?? 0) + 0.4 * Math.max(0, 100 - ((m.avgReactMs ?? 1500) - 300) / 12)),
  load: () => import('./GameScene.js'),
};
