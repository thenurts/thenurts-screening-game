// Lucky Dip rules and fixed sequences (build pack v1 §2–3). Pure data + helpers: no Phaser, so tests can import it.
export const LADDER = [0, 12, 15, 20, 30, 60]; // tray value after dip k (normal bags); gold ×3
export const GOLD_X = 3;
export const FREE_STEP = 5;   // free bags: +5 per dip, 3 dips then auto-bank
export const FREE_DIPS = 3;

// Scored bags as "<N|G><j>" where j = the draw (1–6) that finds the pepper; "F" = free bag (no pepper).
const A = 'N6 N5 G3 G1 N3 N5 N4 F G2 N1 G4 N2 N3 G5 N4 F G6 N2 N1 N6';
const B = 'N4 N2 N3 G1 N4 N5 G5 F G4 N1 N5 G6 N3 G2 N1 F N6 G3 N6 N2';
const P = 'N5 G2 N4 F';
const parse = (s) => s.split(' ').map((t) => (t === 'F' ? { type: 'free' } : { type: t[0] === 'G' ? 'gold' : 'normal', j: Number(t[1]) }));
export const SEQUENCES = { A: parse(A), B: parse(B), P: parse(P) };
export const SETBACK_BAG = 4; // 1-based: gold bag lost on Mia's dip in sequence A (and B)

export const trayValue = (bag, k) => (bag.type === 'free' ? k * FREE_STEP : LADDER[k] * (bag.type === 'gold' ? GOLD_X : 1));
