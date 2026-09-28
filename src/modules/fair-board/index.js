// Fair Board · critical thinking (Zoey). Brief: ./README.md · build pack: 11-game-concepts.md (CT2 v1)
import h0 from './assets/howto-0.webp';
import h1 from './assets/howto-1.webp';
import h2 from './assets/howto-2.webp';

export default {
  id: 'fair-board',
  version: 2, // v1.1 patch: the button says Disagree (stored response stays 'doubt')
  title: 'Fair Board',
  tagline: 'Everyone at the fair is quoting the noticeboard. Are they right?',
  trait: 'critical',
  host: 'zoey',
  hostLine: 'People keep quoting our fair noticeboard. Help me check who’s right!',
  estMinutes: 3,
  logEvents: [], // v1.8 policy: fb_claim and fb_bump_next go to the round trace + the claim log in metrics
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['fbScore', 'correct', 'claimAccuracy', 'checkCalibration', 'cueSway', 'postBumpDelta', 'form', 'flags'],
  // Suite standard #19: goal first, real-UI screenshots with callouts (node tools/make-howto-shots.mjs fair-board), explicit controls
  howTo: [
    { title: 'Your goal', body: 'People at the fair keep quoting the noticeboard. Tap Agree if the board shows it’s true, Disagree if not. Get as many right as you can.', shot: h0 },
    { title: 'Only if the board shows it', body: 'Agree only if the board shows it. If the board doesn’t say why, disagree with “because…”.', shot: h1 },
    { title: 'No rush. Check it', body: 'Tap Check to zoom in on the board. It’s free. “Next to” means side by side, not corner to corner.', shot: h2 },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // 3 claims with feedback
  round: { durationSec: null, showTimer: false }, // 24 claims, no timer (idle time is logged as idleMs)
  metrics: [
    { key: 'correct', label: 'Claims called right', unit: '', primary: true, higherIsBetter: true },
    { key: 'checkedClaims', label: 'Claims checked', unit: '' },
  ],
  traitScore: (m) => Number(m.fbScore ?? 0),
  devOptions: { form: ['A', 'B'] }, // developer mode only: which form the real round uses
  load: () => import('./GameScene.js'),
};
