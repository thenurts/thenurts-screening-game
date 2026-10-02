// Lucky Dip · risk appetite (style: Cautious ↔ Bold). Brief: ./README.md · build pack: claude_11-game-concepts.md
import h0 from './assets/howto-0.webp';
import h1 from './assets/howto-1.webp';
import h2 from './assets/howto-2.webp';

export default {
  id: 'lucky-dip',
  version: 4, // v4: the reported haul and bag counts are the 15 scored bags only (alpha #35 A1; free-bag sweets still fill the jar, logged as freePoints); v3 = unchanged real round (how-to standard #19 changes only the cards and practice) · v1.2: no round timer (v1.1 = 2: chilli, starter sweet, 15 scored bags, sequenceVersion 2)
  title: 'Lucky Dip',
  tagline: 'Fill your jar with sweets from Mia’s lucky bags. Just watch out for the chilli!',
  trait: 'risk',
  host: 'mia',
  hostLine: 'My lucky bags! Keep the sweets you’ve got, or dip for more?',
  estMinutes: 2,
  logEvents: [], // v1.8 policy: every choice goes to the round trace + raw decision list in metrics
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['riskScore', 'riskBand', 'riskCalibration', 'consistency', 'stakeShift', 'flags'],
  // Suite standard #19: goal first, real-UI screenshots with callouts (node tools/make-howto-shots.mjs lucky-dip), explicit controls
  howTo: [
    { title: 'Your goal', body: 'Fill your jar with as many sweets as you can from Mia’s 17 lucky bags. Each bag, you choose when to stop.', shot: h0 },
    { title: 'Keep or Dip', body: 'Tap Keep to put the tray’s sweets in your jar. Tap Dip to draw one more: the tray is worth more, but…', shot: h1 },
    { title: 'Mind the chilli', body: 'The strip shows what’s left in the bag. Draw the chilli and that bag’s tray is spoiled. Gold bags pay ×3.', shot: h2 },
  ],
  practice: { durationSec: null, showTimer: false, scored: false },
  round: { durationSec: null, showTimer: false }, // no timer: the round ends after 17 bags (idle time is logged as idleMs)
  metrics: [
    { key: 'points', label: 'Sweets from the 15 scored bags', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'bagsBanked', label: 'Scored bags kept', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.riskScore ?? 50), // style scale: shown as a Cautious ↔ Bold spectrum
  devOptions: { sequence: ['A', 'generated'] }, // developer mode only: which bag order the real round uses
  load: () => import('./GameScene.js'),
};
