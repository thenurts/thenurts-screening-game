// The Nurts Mamak · organisation (Liam). Brief: ./README.md · build pack: 11-game-concepts.md (O1 v1.2)
// How-to images are screenshots of the real game UI with callouts: regenerate with `node tools/make-howto-shots.mjs mamak-rush`.
import s0 from './assets/howto-0.webp';
import s1 from './assets/howto-1.webp';
import s2 from './assets/howto-2.webp';
import s3 from './assets/howto-3.webp';
import s4 from './assets/howto-4.webp';
import s5 from './assets/howto-5.webp';

export default {
  id: 'mamak-rush',
  version: 2, // v1.2: auto-collected tapau (Later tray), announced gas outage, score vs best possible 27 ★, how-to v2, UI clarity kit
  title: 'The Nurts Mamak',
  tagline: 'Liam’s working the counter at The Nurts Mamak. Can you keep the evening rush happy?',
  trait: 'organisation',
  host: 'liam',
  hostLine: 'Each job takes 1 minute, and the clock only moves when I work. No rush!',
  estMinutes: 3,
  logEvents: [], // v1.8 policy: o1_* events go to the round trace + actionLog
  summaryKeys: ['orgScore', 'planScore', 'pressureScore', 'starsServed', 'valueShare', 'expiredHigh', 'halfDone', 'parkedReturn', 'errorsUnderLoad', 'form', 'flags'],
  howTo: [
    { title: 'Your goal', body: 'Serve as many ★ as you can before the shift ends at 7:36. There are more orders than time, so you can’t serve everyone. Choose well.', shot: s0 },
    { title: 'Read an order card', body: '★ = what it’s worth. ⏳ = minutes before the customer leaves. Dots = the steps; the lit dot is the next one.', shot: s1 },
    { title: 'Cook a step', body: '① Tap an order: it glows. ② Tap the station that matches its lit dot. Each step takes 1 minute.', shot: s2 },
    { title: 'The clock waits for you', body: 'Thinking is free. The clock only moves when you cook a step or tap Wait. A wrong station wastes 1 minute.', shot: s3 },
    { title: 'Takeaway orders', body: 'Some customers order a tapau (takeaway) for later. Cook it before they’re back. They collect it themselves.', shot: s4 },
    { title: 'Watch the notices', body: 'A notice warns you before a station goes off for a few minutes. Plan around it.', shot: s5 },
  ],
  helpCards: [1, 2, 3, 4, 5], // the ? button in play reopens cards 2–6
  practice: { durationSec: null, showTimer: false, scored: false }, // 3 learn-by-doing steps
  round: { durationSec: null, showTimer: false }, // a 36-minute wall-clock shift = 36 actions; no real-time timer
  metrics: [
    { key: 'starsServed', label: 'Stars served', unit: '★', primary: true, higherIsBetter: true },
    { key: 'served', label: 'Orders served', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.orgScore ?? 0),
  devOptions: { form: ['A', 'B'] },
  load: () => import('./GameScene.js'),
};
