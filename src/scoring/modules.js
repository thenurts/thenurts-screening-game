// The scoring layer's view of each game: its trait and its pure adapter (src/modules/<id>/rescore.js). Adding a game with
// a new trait source means one line here (the game folder itself stays sealed).
import * as luckyDip from '../modules/lucky-dip/rescore.js';
import * as torchTalk from '../modules/torch-talk/rescore.js';
import * as fairBoard from '../modules/fair-board/rescore.js';
import * as mamak from '../modules/mamak-rush/rescore.js';
import * as fixIt from '../modules/fix-it-kit/rescore.js';
import * as bigCalls from '../modules/big-calls/rescore.js';
import * as sunnyTap from '../modules/sunny-tap/rescore.js';

export const ADAPTERS = {
  'lucky-dip': { trait: 'risk', title: 'Lucky Dip', ...luckyDip },
  'torch-talk': { trait: 'communication', title: 'Torch Talk', ...torchTalk },
  'fair-board': { trait: 'critical', title: 'Fair Board', ...fairBoard },
  'mamak-rush': { trait: 'organisation', title: 'The Nurts Mamak', ...mamak },
  'fix-it-kit': { trait: 'creative', title: 'Mia’s Fix-It Kit', ...fixIt },
  'big-calls': { trait: 'judgement', title: 'Zoey’s Big Calls', ...bigCalls },
  'sunny-tap': { trait: 'resilience', title: 'Sunny Tap', ...sunnyTap },
};
export const MODULE_OF = Object.fromEntries(Object.entries(ADAPTERS).map(([id, a]) => [a.trait, id]));
