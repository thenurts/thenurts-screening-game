// Lucky Dip · risk appetite (style: Cautious ↔ Bold). Brief: ./README.md · build pack: claude_11-game-concepts.md
import bagNormal from './assets/bag-normal.webp';
import pepper from './assets/pepper.webp';
import jar from './assets/jar.webp';

export default {
  id: 'lucky-dip',
  version: 1,
  title: 'Lucky Dip',
  tagline: 'Fill your jar with sweets from Mia’s lucky bags. Just watch out for the pepper!',
  trait: 'risk',
  host: 'mia',
  hostLine: 'My lucky bags! Keep the sweets you’ve got, or dip for more?',
  estMinutes: 2,
  logEvents: [], // v1.8 policy: every choice goes to the round trace + raw decision list in metrics
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['riskScore', 'riskBand', 'riskCalibration', 'consistency', 'stakeShift', 'flags'],
  howTo: [
    { title: 'Mia dips first', body: 'Each bag holds 5 sweets and 1 pepper. The strip shows what’s left inside.', img: bagNormal },
    { title: 'Keep or Dip', body: 'Tap Keep to put the tray in your jar, or Dip to draw again. Every sweet makes the tray worth more.', img: jar },
    { title: 'Mind the pepper', body: 'The pepper spoils that bag’s tray. Gold bags are worth ×3. Free bags have no pepper at all.', img: pepper },
  ],
  practice: { durationSec: 60, showTimer: false, scored: false },
  round: { durationSec: 180, showTimer: false }, // decision budget of 20 bags; 180 s is only an idle cap
  metrics: [
    { key: 'points', label: 'Sweets haul', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'bagsBanked', label: 'Bags kept', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.riskScore ?? 50), // style scale: shown as a Cautious ↔ Bold spectrum
  load: () => import('./GameScene.js'),
};
