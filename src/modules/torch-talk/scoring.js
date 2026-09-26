// Torch Talk scoring (build pack §9). Pure: takes the raw turn log, returns metrics. Weights → ScoringConfig later.
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

/** Shown points for one turn: pass → round(10 × ideal ÷ used); fail → 0; each ask −1; floored at 0. */
export function turnPoints(t) {
  const base = t.pass ? Math.round((10 * t.ideal) / t.used) : 0;
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
 * turns: [{ turn, itemId, probe, words[], ideal, used, pass, failReason, shorthandTile?, contextTile?, asks[{q, correct}], gap, fix?{words, pass} }]
 * Unplayed turns (time cap) are simply absent: they count as failures in meaningRate.
 */
export function score({ turns = [], idleNudges = 0, timedOut = false, restartedAfterSetback = false, nTurns = TURNS }) {
  const byTurn = Object.fromEntries(turns.map((t) => [t.turn, t]));
  const passed = turns.filter((t) => t.pass);
  const meaningRate = passed.length / nTurns;
  const efficiency = mean(passed.map((t) => t.ideal / t.used));

  // audience adaptation: new-friend turns + the curse-of-knowledge pair (T3 shorthand with Liam → T7 with Zoey)
  const adaptParts = [4, 7, 8].map((n) => (byTurn[n]?.pass ? 1 : 0));
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
  const repairQuality = t6 ? repairOf(t6.words, t6.fix) : 0;

  const commScore = Math.round(100 * (WEIGHTS.meaning * meaningRate + WEIGHTS.adaptation * adaptation + WEIGHTS.ask * askScore + WEIGHTS.efficiency * efficiency + WEIGHTS.repair * repairQuality));
  const flags = [];
  if (timedOut || idleNudges >= 3) flags.push('idle');
  if (restartedAfterSetback) flags.push('restartedAfterSetback');
  return {
    commScore, meaningRate: r3(meaningRate), efficiency: r3(efficiency), adaptation: r3(adaptation), shorthandAdaptation,
    askScore: r3(askScore), gapAsk: gapScores.join('/'), unneededAsks, repairQuality,
    messageScore: turns.reduce((s, t) => s + turnPoints(t), 0), understood: passed.length,
    flags: flags.join(' '),
  };
}
