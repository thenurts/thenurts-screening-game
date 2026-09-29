// Sunny Tap · resilience (Liam). Brief: ./README.md · build pack: 11-game-concepts.md (RS1 v1.1). Always played last (request #25).
// How-to images are screenshots of the real game UI with callouts: regenerate with `node tools/make-howto-shots.mjs sunny-tap`.
// The how-to never mentions the wipeouts (the consent line and the end-of-suite debrief cover them).
import s0 from './assets/howto-0.webp';
import s1 from './assets/howto-1.webp';
import s2 from './assets/howto-2.webp';

export default {
  id: 'sunny-tap',
  version: 2, // v1 was the retired "Sunny Tap" test module
  title: 'Sunny Tap',
  tagline: 'Tap the suns before they fade. How many points can you keep?',
  trait: 'resilience',
  host: 'liam',
  hostLine: 'Sunny day at the beach! Tap every sun you can.',
  estMinutes: 3,
  playLast: true, // run order: always the final game (request #25)
  logEvents: [], // v1.8 policy: st_* events go to the round trace + tapLog / fadeLog
  summaryKeys: ['resilienceScore', 'speedShock', 'accuracyShock', 'hold', 'errorCarryover', 'points', 'flags'],
  howTo: [
    { title: 'Your goal', body: 'Tap the suns before they fade. Score as many points as you can in 1:50.', shot: s0 },
    { title: 'Suns yes, clouds no', body: 'Sun = +10. A sun that fades = −3. Tapping a cloud or the empty sky = −15.', shot: s1 },
    { title: 'Warm up first', body: 'A 10-second warm-up comes first. It doesn’t count.', shot: s2 },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // 20 s at the fair pace
  round: { durationSec: null, showTimer: false }, // the scene draws its own 1:50 clock
  metrics: [
    { key: 'points', label: 'Points', unit: '', primary: true, higherIsBetter: true },
    { key: 'hits', label: 'Suns tapped', unit: '' },
  ],
  traitScore: (m) => Number(m.resilienceScore ?? 0),
  devOptions: { wipeouts: ['on', 'off'] },
  load: () => import('./GameScene.js'),
};
