// Torch Talk scoring (build pack v2.2 §9). Pure: takes the raw turn log, returns metrics. Weights → ScoringConfig later.
export const WEIGHTS = { meaning: 0.40, adaptation: 0.20, ask: 0.15, efficiency: 0.15, repair: 0.10 };
export const TURNS = 10;
// Reactions depend on the outcome only (never on message length or on asking). Build pack §8.
export const REACTIONS = {
  pass: { friend: 'happy', noah: 'happy', sfx: 'good' },
  fail: { friend: 'worried', noah: 'worried', sfx: 'bad' },
  echo: { friend: 'worried', noah: 'threequarter', sfx: 'tick' },
  end: { friend: 'excited', noah: 'excited', sfx: 'fanfare' },
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Shown points for one turn: the message's points (checker.points: clarifiers count) minus 1 per ask, floored at 0. */
export function turnPoints(t) {
  const base = t.base ?? (t.pass ? Math.round((10 * t.ideal) / t.used) : 0); // `base` is set by the game (v2.2)
  return Math.max(0, base - (t.asks?.length || 0));
}

export function repairOf(first = [], fix) {
  if (!fix || !fix.pass) return 0;
  if (fix.words.length <= 2) return 1; // targeted
  const shared = fix.words.filter((w) => first.includes(w)).length;
  if (first.length && shared / first.length >= 0.8) return 0.25; // resend
  return 0.5;
}

/**
 * turns: [{ turn, itemId, words[], ideal, used, pass, failReason, shorthandTile?, contextTile?, known[], asks[{q, correct}], gap, fix?{words, pass} }]
 * Unplayed turns (time cap) are simply absent: they count as failures in meaningRate.
 */
export function score({ turns = [], idleNudges = 0, restartedAfterSetback = false, nTurns = TURNS }) {
  const byTurn = Object.fromEntries(turns.map((t) => [t.turn, t]));
  const passed = turns.filter((t) => t.pass);
  const meaningRate = passed.length / nTurns;
  const efficiency = mean(passed.map((t) => t.ratio ?? Math.min(1, t.ideal / t.used))); // v2.2: same ratio as the points, unrounded

  // audience adaptation: the Casual Acquaintance turns (T4, T7, T8), skipping the known fact on T2,
  // and the curse-of-knowledge pair (T3 code word with a Close Friend → T7 with an acquaintance)
  const adaptParts = [4, 7, 8].map((n) => (byTurn[n]?.pass ? 1 : 0));
  const t2 = byTurn[2];
  const knownSkip = t2 && t2.known?.length ? (t2.pass && !t2.words.some((w) => t2.known.includes(w)) ? 1 : 0) : 'n/a';
  if (knownSkip !== 'n/a') adaptParts.push(knownSkip);
  const t3 = byTurn[3], t7 = byTurn[7];
  let shorthandAdaptation = 'n/a';
  if (t3 && t3.shorthandTile && t3.words.includes(t3.shorthandTile)) {
    if (t7?.pass) shorthandAdaptation = 1;
    else if (t7 && t7.contextTile && t7.words.includes(t7.contextTile)) shorthandAdaptation = 0;
  }
  const adaptation = mean(shorthandAdaptation === 'n/a' ? adaptParts : [...adaptParts, shorthandAdaptation]);

  // asking: the right question on gap turns, and no questions when the note already has everything
  const gapTurns = [5, 9].map((n) => byTurn[n]);
  const gapScores = gapTurns.map((t) => {
    if (!t) return 0;
    const k = (t.asks || []).findIndex((a) => a.correct);
    return k < 0 ? 0 : k === 0 ? 1 : 0.5;
  });
  const unneededAsks = turns.filter((t) => !t.gap).reduce((s, t) => s + (t.asks?.length || 0), 0);
  const askScore = 0.7 * mean(gapScores) + 0.3 * Math.max(0, 1 - unneededAsks / 8);

  const t6 = byTurn[6];
  // alpha #36: the friend only asks back ("front?") when the T6 message was understood; when it wasn't, there was no mix-up to
  // repair, so repair is n/a and its weight is shared out (older rounds always had a fix and score as before)
  const repairNa = !!t6 && !t6.pass && t6.fix == null;
  const repairQuality = repairNa ? null : t6 ? repairOf(t6.words, t6.fix) : 0;
  const parts = WEIGHTS.meaning * meaningRate + WEIGHTS.adaptation * adaptation + WEIGHTS.ask * askScore + WEIGHTS.efficiency * efficiency;
  const commScore = Math.round(100 * (repairNa ? parts / (1 - WEIGHTS.repair) : parts + WEIGHTS.repair * repairQuality));
  const flags = [];
  if (idleNudges >= 3) flags.push('idle'); // no round cap since v2.2: idle is only flagged, never cut short
  if (restartedAfterSetback) flags.push('restartedAfterSetback');
  return {
    commScore, meaningRate: r3(meaningRate), efficiency: r3(efficiency), adaptation: r3(adaptation), shorthandAdaptation,
    knownSkip, askScore: r3(askScore), gapAsk: gapScores.join('/'), unneededAsks, repairQuality,
    messageScore: turns.reduce((s, t) => s + turnPoints(t), 0), understood: passed.length,
    flags: flags.join(' '),
  };
}
