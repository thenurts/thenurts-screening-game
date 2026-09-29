// Zoey's Big Calls · judgement (Zoey). Brief: ./README.md · build pack: 11-game-concepts.md (JD1 v1.1)
// How-to images are screenshots of the real game UI with callouts: regenerate with `node tools/make-howto-shots.mjs big-calls`.
import s0 from './assets/howto-0.webp';
import s1 from './assets/howto-1.webp';
import s2 from './assets/howto-2.webp';
import s3 from './assets/howto-3.webp';
import s4 from './assets/howto-4.webp';

export default {
  id: 'big-calls',
  version: 1,
  title: 'Zoey’s Big Calls',
  tagline: 'Zoey has 10 calls to make for the school week. Check the clues, or decide?',
  trait: 'judgement',
  host: 'zoey',
  hostLine: 'I’m class event captain, and I have 10 big calls to make. Help me get them right!',
  estMinutes: 3,
  logEvents: [], // v1.8 policy: jd_* events go to the round trace + callLog
  summaryKeys: ['judgementScore', 'decisionAccuracy', 'infoValue', 'good', 'wasted', 'missed', 'smartCalls', 'form', 'flags'],
  howTo: [
    { title: 'Your goal', body: 'Zoey makes 10 calls. Pick the side the clues support. Calls are worth 10, 20 or 30 points.', shot: s0 },
    { title: 'Read a call card', body: 'Two choices. The badge shows what it’s worth. ⏳ = urgent. The tally adds up the arrows so far.', shot: s1 },
    { title: 'Check, or decide', body: 'Check shows the next clue. The button tells you if it’s strong or weak, and what it costs: 2 points, or 6 if urgent.', shot: s2 },
    { title: 'Follow the arrows', body: 'Strong clues have 2 arrows, weak ones 1. Go with the side the tally favours.', shot: s3 },
    { title: 'The call, not luck', body: 'A smart call can still turn out unlucky. You’re scored on the call the clues supported.', shot: s4 },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // 2 calls with check feedback (fail-safe after 2 tries)
  round: { durationSec: null, showTimer: false }, // 10 calls, no timer
  metrics: [
    { key: 'smartCalls', label: 'Smart calls (of 10)', unit: '', primary: true, higherIsBetter: true },
    { key: 'points', label: 'Points', unit: '' },
  ],
  traitScore: (m) => Number(m.judgementScore ?? 0),
  devOptions: { form: ['A', 'B'] },
  load: () => import('./GameScene.js'),
};
