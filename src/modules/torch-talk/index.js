// Torch Talk · effective communication (Noah). Brief: ./README.md · build pack: 11-game-concepts.md (C1 v1.1)
import h0 from './assets/howto-0.webp';
import h1 from './assets/howto-1.webp';

export default {
  id: 'torch-talk',
  version: 4, // how-to v3 (try-it steps) + no flashback; v3 = the v2.2 patch: item bank v2.2 with clarifier points, no round cap (itemBankVersion 3)
  title: 'Torch Talk',
  tagline: 'Flash Noah’s messages across the garden. Every word costs a flash!',
  trait: 'communication',
  host: 'noah',
  hostLine: 'Help me flash messages to my friends. Short ones, but they have to make sense!',
  estMinutes: 4,
  logEvents: [], // v1.8 policy: comm_message / comm_ask / comm_repair / comm_setback_next go to the round trace + turnLog
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['commScore', 'meaningRate', 'efficiency', 'adaptation', 'askScore', 'repairQuality', 'form', 'flags'],
  // How-to v3 (request #17): one opening picture + the recap card; the learning happens in the try-it steps (Practice).
  howTo: [
    { title: 'Your goal', body: 'Pass Noah’s note to a friend by torch. Tap words to build a message, then tap Send. Every word = 1 flash: send the shortest message your friend will get right.', shot: h0 },
    { title: 'Remember', body: '✂ Short · 🎯 Clear: say what to do · 👤 Who’s reading? · ❓ Ask if something’s missing. No timer. Right but long = fewer points. Wrong = 0. Tap Practice to try it step by step.', shot: h1 },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // the 5 try-it steps (6 notes); no cap
  round: { durationSec: null, showTimer: false }, // v2.2: no timer at all; the round ends after turn 10 (idleMs is logged)
  metrics: [
    { key: 'messageScore', label: 'Message score', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'understood', label: 'Messages understood', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.commScore ?? 0),
  devOptions: { form: ['A', 'B', 'C', 'random'] }, // developer mode only: which form the real round uses
  load: () => import('./GameScene.js'),
};
