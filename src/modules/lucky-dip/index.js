// Lucky Dip · risk appetite (style: Cautious ↔ Bold). Brief: ./README.md · build pack: claude_11-game-concepts.md
import bagNormal from './assets/bag-normal.webp';
import chilli from './assets/chilli.webp';
import jar from './assets/jar.webp';

export default {
  id: 'lucky-dip',
  version: 2, // v1.1 patch: chilli, starter sweet, 15 scored bags (sequenceVersion 2)
  title: 'Lucky Dip',
  tagline: 'Fill your jar with sweets from Mia’s lucky bags. Just watch out for the chilli!',
  trait: 'risk',
  host: 'mia',
  hostLine: 'My lucky bags! Keep the sweets you’ve got, or dip for more?',
  estMinutes: 2,
  logEvents: [], // v1.8 policy: every choice goes to the round trace + raw decision list in metrics
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['riskScore', 'riskBand', 'riskCalibration', 'consistency', 'stakeShift', 'flags'],
  howTo: [
    { title: 'Mia starts you off', body: 'Mia pops a starter sweet onto your tray. The strip shows what’s left in the bag: 4 sweets and 1 chilli.', img: bagNormal },
    { title: 'Keep or Dip', body: 'Tap Keep to put the tray in your jar, or Dip to draw again. Every sweet makes the tray worth more.', img: jar },
    { title: 'Mind the chilli', body: 'The chilli spoils that bag’s tray. Gold bags are worth ×3. Free bags have no chillies at all.', img: chilli },
  ],
  practice: { durationSec: 60, showTimer: false, scored: false },
  round: { durationSec: 180, showTimer: false }, // decision budget of 17 bags; 180 s is only an idle cap
  metrics: [
    { key: 'points', label: 'Sweets haul', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'bagsBanked', label: 'Bags kept', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.riskScore ?? 50), // style scale: shown as a Cautious ↔ Bold spectrum
  load: () => import('./GameScene.js'),
};
