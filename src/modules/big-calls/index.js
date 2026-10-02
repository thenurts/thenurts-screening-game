// Zoey's Big Calls · judgement (Zoey). Brief: ./README.md · build pack: 11-game-concepts.md (JD1 v1.2)
// How-to images are screenshots of the real game UI with callouts: regenerate with `node tools/make-howto-shots.mjs big-calls`.
import s0 from './assets/howto-0.webp';
import s1 from './assets/howto-1.webp';
import s2 from './assets/howto-2.webp';
import s3 from './assets/howto-3.webp';
import s4 from './assets/howto-4.webp';

export default {
  id: 'big-calls',
  version: 3, // v3 = v1.2: no tally, 👁 saw it / 👂 heard it messages, conflicting starts, kids affected (#38); v2: learning v2 (#28)
  title: 'Zoey’s Big Calls',
  tagline: 'Zoey has 10 calls to make for the school week. Ask around, or decide?',
  trait: 'judgement',
  host: 'zoey',
  hostLine: 'I’m class event captain, and I have 10 big calls to make. Help me get them right!',
  estMinutes: 3,
  logEvents: [], // v1.8 policy: jd_* events go to the round trace + callLog
  summaryKeys: ['judgementScore', 'decisionAccuracy', 'infoValue', 'good', 'wasted', 'missed', 'smartCalls', 'form', 'flags'],
  howTo: [
    { title: 'Your goal', body: 'Zoey makes 10 calls for the school week. Each one affects 10, 20 or 30 kids. Pick the side the evidence supports.', shot: s0 },
    { title: 'Read a call card', body: 'Two choices. Some messages are already in. ⏳ = urgent. The badge shows how many kids the call affects.', shot: s1 },
    { title: 'Saw it beats heard it', body: '👁 Saw it = first-hand or official. 👂 Heard it = second-hand or old. One 👁 outweighs one 👂.', shot: s2 },
    { title: 'Ask, or decide', body: 'Ask someone else: the button says if they saw it or heard it, and what it costs: 2 points, or 6 if urgent.', shot: s3 },
    { title: 'The call, not luck', body: 'A smart call can still turn out unlucky. You’re scored on the call the evidence supported.', shot: s4 },
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
