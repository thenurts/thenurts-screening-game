# Lucky Dip (`lucky-dip`) · design brief v1 · trait `risk` (style: Cautious 0 ↔ Bold 100)

Source: Game Ideas build pack v1 (`claude_11-game-concepts.md`, A · Lucky Dip), approved by Adrian 2026-09-26 (he supplied the art). This brief records only what the build follows and the Builder's deviations.

**Loop.** A bag holds 5 sweets and 1 pepper, and the peek strip shows what's left. Mia makes the first dip. Then **Keep** (bank the tray) or **Dip** (draw again). A sweet grows the tray along the ladder 12 · 15 · 20 · 30 · 60 (gold ×3). The pepper spoils that bag's tray. After 5 sweets the bag auto-banks. **Free bags** hold 3 sweets and no pepper; each dip is +5, and after 3 dips the bag auto-banks. Keep and Dip have equal EV at every state, so no strategy scores more on average (see `tests/lucky-dip.balance.test.mjs`).

**Round.** 20 bags (18 scored + 2 free) from fixed sequence A. Repeat real attempts in the same run use sequence B (`repeatAttempt` flag). Practice: `N5 G2 N4 Free`. There's no visible clock, but a 180 s cap auto-keeps the remaining bags (`idle` flag). Mia's "Still there?" bubble appears after 15 s idle. Fixed animation budget (bag 0.9 s · Mia's dip 0.6 s · reveal 0.5 s · bank 0.8 s · spoil 1.0 s). Buttons lock during animations. Button side (Keep left or right) is counterbalanced per player and logged.

**Metrics** (computed by `scoring.js` from the raw decision list; thresholds in `SCORING`, the future ScoringConfig):

| key | meaning | shown to player? |
|---|---|---|
| `points` (PRIMARY) | sweets haul, EV-neutral, "your haul vs median" | yes |
| `bagsBanked` | bags that ended with points | yes |
| `intendedStop` | censoring-corrected stop depth 1–5 | no |
| `riskScore` | 100 × (intendedStop − 1) ÷ 4 → **traitScore** | report spectrum only |
| `riskBand` | C / B / Bo, or "B/Bo borderline" from the bootstrap 80% interval | no |
| `riskPrecisionLo/Hi`, `consistency`, `stakeShift`, `riskCalibration` (yes / partly / no / n/a-low), `postSetbackDelta`, `flags` (reckless / frozen / disengaged / idle / repeatAttempt), `sequenceId`, `buttonSide`, `decisions` (raw list) | as in build pack §6 | no |

**Builder deviations (for Adrian to note):**
1. **No tier B rows.** Following the v1.8 event policy, every choice (`dip_choice`, `bag_end`, `free_bag`, `setback_next`) goes into the round's live RoundTraces row, and the full raw decision list is saved in the round's metrics. Interactions stays clean.
2. **Scores are computed in the game for now**, from the raw decisions, with every threshold in one config block. The Sheet-side ScoringConfig tab and "Recompute all scores" (framework request 7) are the next core unit. They'll reuse the saved raw decisions, so nothing is lost.
3. **Seq B trigger:** any repeat real attempt in the run gets B, not only "after abandoning at bag 4". It's simpler and fairer, and it's logged.
4. **§13 open questions, defaults taken:** pepper (matches the supplied art); 3 unavoidable losses (needed for balance); results screen shows the haul vs the median.

**Hooks:** resilience = behaviour after the bag-4 setback (`setback_next` in the trace, `postSetbackDelta`, and quits/abandons in Rounds); learning = practice → real (derived later).
