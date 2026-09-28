// Mia's Fix-It Kit · creative problem solving (Mia). Brief: ./README.md · build pack: 11-game-concepts.md (CR1 v1)
// How-to images are screenshots of the real game UI with callouts: regenerate with `node tools/make-howto-shots.mjs fix-it-kit`.
import s0 from './assets/howto-0.webp';
import s1 from './assets/howto-1.webp';
import s2 from './assets/howto-2.webp';
import s3 from './assets/howto-3.webp';

export default {
  id: 'fix-it-kit',
  version: 1,
  title: 'Mia’s Fix-It Kit',
  tagline: 'Things keep going wrong at sports day. How many ways can you fix them?',
  trait: 'creative',
  host: 'mia',
  hostLine: 'Sports day keeps going wrong! Help me fix things with my kit.',
  estMinutes: 3,
  logEvents: [], // v1.8 policy: cr_* events go to the round trace + tryLog
  summaryKeys: ['creativeScore', 'fluency', 'originality', 'flexibility', 'hitRate', 'blockedRecovery', 'ideasFound', 'form', 'flags'],
  howTo: [
    { title: 'Your goal', body: 'Things keep going wrong at sports day. Find as many different fixes as you can with Mia’s kit. Unusual ideas count extra.', shot: s0 },
    { title: 'Make a fix', body: '① Drag or tap 1 or 2 things into the Fix tray. ② Pick how each is used. ③ Tap Try it.', shot: s1 },
    { title: 'New ideas count', body: 'The same idea twice only counts once. Try a different way.', shot: s2 },
    { title: '6 tries each', body: 'Every try uses a dot, even if it doesn’t work. No timer. Tap Done to move on.', shot: s3 },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // the hot bench: find 2 different fixes
  round: { durationSec: null, showTimer: false }, // 3 problems × 6 tries, no timer
  metrics: [
    { key: 'ideasFound', label: 'Different ideas found', unit: '', primary: true, higherIsBetter: true },
    { key: 'triesUsed', label: 'Tries used', unit: '' },
  ],
  traitScore: (m) => Number(m.creativeScore ?? 0),
  devOptions: { form: ['A', 'B'] },
  load: () => import('./GameScene.js'),
};
