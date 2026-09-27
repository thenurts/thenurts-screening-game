// Torch Talk · effective communication (Noah). Brief: ./README.md · build pack: 11-game-concepts.md (C1 v1.1)
import torchPng from './assets/torch.webp';

export default {
  id: 'torch-talk',
  version: 3, // v2.2 patch: item bank v2.2 with clarifier points, no round cap (itemBankVersion 3)
  title: 'Torch Talk',
  tagline: 'Flash Noah’s messages across the garden. Every word costs a flash!',
  trait: 'communication',
  host: 'noah',
  hostLine: 'Help me flash messages to my friends. Short ones, but they have to make sense!',
  estMinutes: 4,
  logEvents: [], // v1.8 policy: comm_message / comm_ask / comm_repair / comm_setback_next go to the round trace + turnLog
  // Staff-only values copied to the Candidate Summary (never shown to the player)
  summaryKeys: ['commScore', 'meaningRate', 'efficiency', 'adaptation', 'askScore', 'repairQuality', 'form', 'flags'],
  // 6 cards with live examples (build pack v2.1 §1). The how-to uses its own nickname (*Rocket*) so no real item is primed.
  howTo: [
    { title: 'Pass on Noah’s note', body: 'Noah gets a note. Flash it to a friend in as few words as you can.', img: torchPng },
    { title: 'Short, clear, right', body: 'Keep only what they need, including what to do. Wrong or unclear scores 0.',
      demo: { note: 'Mia, the picnic is on Sunday now, not Saturday. Please bring a blanket.', tiles: ['the', 'picnic', 'Saturday', 'Sunday', 'is', 'bring', 'please', 'blanket'],
        target: ['picnic', 'Sunday', 'bring', 'blanket'], result: '✓ 10',
        results: [{ msg: 'the picnic is on Sunday so please bring a blanket', ok: true, note: '4 (too long)' }, { msg: 'picnic Saturday bring blanket', ok: false, note: '0 (wrong day)' }, { msg: 'picnic Sunday blanket', ok: false, note: '0 (what should she do?)' }] } },
    { title: 'Your own words work', body: 'The note’s words aren’t always the best ones. Pick words that say what’s meant.',
      demo: { note: 'Can you give the plants a drink?', tiles: ['give', 'drink', 'water', 'the', 'plants', 'a'], target: ['water', 'plants'], result: '✓' } },
    { title: 'Close Friends know our nicknames', body: 'Close Friends know our nicknames and code words. They’re shown in italics.',
      demo: { tag: { who: 'Liam', label: 'Close Friend', face: 'liam-happy' }, note: 'Meet at the *Rocket* (our name for the big slide) at 3pm.', results: [{ msg: 'meet *Rocket* 3pm', ok: true, note: 'Liam knows it' }] } },
    { title: 'Others don’t', body: 'A Casual Acquaintance doesn’t know our nicknames, so spell it out.',
      demo: { tag: { who: 'Raj', label: 'Casual Acquaintance', face: 'raj-worried' }, note: 'Meet at the *Rocket* (our name for the big slide) at 3pm.', results: [{ msg: 'meet *Rocket* 3pm', ok: false, note: 'Raj looks puzzled' }, { msg: 'meet big slide 3pm', ok: true }] } },
    { title: 'Something missing? Ask', body: 'If the note leaves out something they need, tap Ask. Asking when it’s all there costs a point.',
      demo: { note: 'Liam, the kite day is on Saturday at the park. Mum will say what time.', chips: [{ label: '🕒 When?', reply: '“Mum says 4pm.” (it was missing)' }, { label: '📍 Where?', reply: '“It’s in the note!” (−1)' }, { label: '👤 Who?', reply: '“It’s in the note!” (−1)' }, { label: '📦 What?', reply: '“It’s in the note!” (−1)' }, { label: '🔢 How many?', reply: '“It’s in the note!” (−1)' }] } },
  ],
  practice: { durationSec: null, showTimer: false, scored: false }, // 3 turns; no cap
  round: { durationSec: null, showTimer: false }, // v2.2: no timer at all; the round ends after turn 10 (idleMs is logged)
  metrics: [
    { key: 'messageScore', label: 'Message score', unit: 'pts', primary: true, higherIsBetter: true },
    { key: 'understood', label: 'Messages understood', unit: '', higherIsBetter: true },
  ],
  traitScore: (m) => Number(m.commScore ?? 0),
  devOptions: { form: ['A', 'B', 'C', 'random'] }, // developer mode only: which form the real round uses
  load: () => import('./GameScene.js'),
};
