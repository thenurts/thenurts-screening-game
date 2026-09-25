// The Nurts brand tokens (official palette, 2026-09-25). See claude/03-brand-kit.md.
export const C = {
  // Primary (brand)
  sun: '#FED33C', ink: '#0B0B0B', white: '#FFFFFF', cream: '#FFFBEF',
  // Secondary (brand)
  orange: '#ED9F41', butter: '#FFF5DA', teal: '#61CBD8', charcoal: '#544D4D', sage: '#617C74', red: '#ED5641',
  // Children's IP palette
  sky: '#B4DCF8', blue: '#004AAD', mint: '#CDEDD3', green: '#428232', peach: '#FDDDAB', amber: '#F19502', lilac: '#F1D5FA', purple: '#937EB9',
};

// Feedback states: always paired with an icon/text, never colour alone.
export const STATE = { good: C.green, warn: C.amber, bad: C.red };

// 0xRRGGBB for Phaser
export const hex = (css) => parseInt(css.slice(1), 16);

export const FONT = {
  head: '"Scripter", "Montserrat", system-ui, sans-serif', // Scripter used when licensed web font files are added
  body: '"Montserrat", system-ui, sans-serif',
};

// Host characters: dossier personality ↔ trait. `main` = strong accent, `soft` = tinted panel.
export const HOSTS = {
  zoey: { name: 'Zoey', main: C.blue, soft: C.sky },
  liam: { name: 'Liam', main: C.amber, soft: C.peach },
  mia: { name: 'Mia', main: C.purple, soft: C.lilac },
  noah: { name: 'Noah', main: C.green, soft: C.mint },
};
export const POSES = ['front', 'threequarter', 'side', 'happy', 'excited', 'worried', 'cross'];

// Design resolution (portrait-first, spec §1)
export const W = 720, H = 1280;
