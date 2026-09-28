// The Nurts Mamak · organisation (Liam). Brief: ./README.md · build pack: 11-game-concepts.md (O1 v1)
import bg from './assets/bg-mamak.webp';
import tapau from './assets/tapau.webp';

export default {
  id: 'mamak-rush',
  version: 1,
  title: 'The Nurts Mamak',
  tagline: 'Liam’s working the counter at The Nurts Mamak. Can you keep the evening rush happy?',
  trait: 'organisation',
  host: 'liam',
  hostLine: 'Each job takes 1 minute, and the clock only moves when I work. No rush!',
  estMinutes: 3,
  logEvents: [], // v1.8 policy: o1_action / o1_order_end / o1_tapau / o1_plan / o1_setback_next go to the round trace + actionLog
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['orgScore', 'planScore', 'pressureScore', 'valueDone', 'expiredHigh', 'halfDone', 'parkedReturn', 'errorsUnderLoad', 'form', 'flags'],
  howTo: [
    { title: 'Liam’s working the counter', body: 'Each job takes 1 minute on the clock, and the clock only moves when you work. No rush. Plan it.', img: bg },
    { title: 'Remember', body: '★ = worth more · ⏳ = minutes left · finish what you start · 📌 = come back later. Tap Practice to try it step by step.', img: tapau },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // 3 learn-by-doing steps
  round: { durationSec: null, showTimer: false }, // a 36-minute wall-clock shift (7:00–7:36 pm) = 36 actions; no real-time timer
  metrics: [
    { key: 'starsServed', label: 'Stars served', unit: '★', primary: true, higherIsBetter: true },
    { key: 'served', label: 'Orders served', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.orgScore ?? 0),
  devOptions: { form: ['A', 'B'] }, // developer mode only: which order stream the real round uses
  load: () => import('./GameScene.js'),
};
