// Torch Talk · effective communication (Noah). Brief: ./README.md · build pack: 11-game-concepts.md (C1 v1.1)
import notePng from './assets/note.webp';
import torchPng from './assets/torch.webp';
import walkiePng from './assets/walkie.webp';

export default {
  id: 'torch-talk',
  version: 1,
  title: 'Torch Talk',
  tagline: 'Flash Noah’s messages across the garden. Every word costs a flash!',
  trait: 'communication',
  host: 'noah',
  hostLine: 'Help me flash messages to my friends. Short ones, but they have to make sense!',
  estMinutes: 4,
  logEvents: [], // v1.8 policy: comm_message / comm_ask / comm_repair / comm_setback_next go to the round trace + turnLog
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['commScore', 'meaningRate', 'efficiency', 'adaptation', 'askScore', 'repairQuality', 'form', 'flags'],
  howTo: [
    { title: 'Read Noah’s note', body: 'Each turn, Noah has a note for one friend. Old friends know our nicknames. New friends don’t.', img: notePng },
    { title: 'Build a short message', body: 'Tap words to build the shortest message that still gets the point across. Each word costs one flash. E.g. “Liam, the kite day is on Monday. Bring string.” → kite Monday string.', img: torchPng },
    { title: 'Missing something? Ask', body: 'If the note leaves out something your friend needs, tap Ask. Each question costs 1 point, so only ask when you need to.', img: walkiePng },
  ],
  practice: { durationSec: 120, showTimer: false, scored: false },
  round: { durationSec: 300, showTimer: false }, // 10 turns (~3–3.5 min); 300 s is only an idle cap
  metrics: [
    { key: 'messageScore', label: 'Message score', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'understood', label: 'Messages understood', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.commScore ?? 0),
  load: () => import('./GameScene.js'),
};
