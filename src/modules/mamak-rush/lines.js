// Manglish speech-bubble lines (build pack O1 v1.2 §12; Adrian: yes, flavour only). Every piece of information a player
// needs is also on the order card, the Later ticket or the notice bar. Picks are seeded (same key → same line for everyone).
export const BANK = {
  'order:teh': ['Boss, one teh tarik!'], 'order:roti': ['Boss, roti canai satu!'], 'order:nasi': ['Nasi lemak, please ah!'],
  'order:kopi': ['Kopi ais, kurang manis!'], 'order:murtabak': ['One murtabak, boss!'], 'order:mee': ['Mee goreng, can ah?'],
  served: ['Sedap!', 'Terbaik, boss!', 'Wah, fast!'],
  leaves: ['Aiyo, too long lah…', 'Never mind, next time.'],
  wrong: ['Alamak, wrong one!'],
};
export const LINES = {
  tapau: 'Boss, one roti canai tapau! Back at 7:20.',
  tapauCollected: 'Wah, ready already! Thanks boss!',
  tapauWaiting: 'Boss, my tapau ah?',
  gasNotice: 'Gas almost habis! Griddle off 7:17.',
  end: 'Fuh, what a shift!',
};
function hash32(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export function pickLine(kind, key) { const b = BANK[kind] || ['']; return b[hash32(`${kind}|${key}`) % b.length]; }
