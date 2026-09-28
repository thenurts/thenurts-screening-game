# Lucky Dip (`lucky-dip`) · design brief v1.2 · trait `risk` (style: Cautious 0 ↔ Bold 100)

Source: Game Ideas build pack v1.1 (`11-game-concepts.md`, R1 · A · Lucky Dip). v1 went live 2026-09-26; v1.1 is a patch (2026-09-27); v1.2 removes the round timer (Game Ideas request #11, Adrian 2026-09-27). This brief records only what the build follows and the Builder's deviations.

**Loop.** A bag holds 5 sweets and 1 chilli. **Mia pops a starter sweet onto the tray** (the chilli is never the first draw), so the peek strip shows 4 sweets + 1 chilli. Then **Keep** (bank the tray) or **Dip** (draw again). The tray grows along the ladder 12 (starter) · 15 · 20 · 30 · 60 (gold ×3). The chilli spoils that bag's tray. After 4 dips only the chilli is left, so the bag auto-banks. **Free bags** hold 3 sweets and no chilli; each dip is +5, and after 3 dips the bag auto-banks. Keep and Dip have equal EV at every state.

**Round.** 17 bags: 15 scored (10 normal with the chilli on player dip 1–5 twice each, 5 gold with 1–5 once each) + free bags after scored bags 5 and 10.
- **Official round** (run 1, first attempt): shared **sequence A** `G2 N5 G5 N1 N5 G4 G3 N2 N2 N3 N4 G1 N3 N4 N1`.
- **Restart after leaving it, and every later run:** a freshly generated order of the same 15 bags that passes the order rules (`rules.js › orderOk`), flagged `sequenceId: generated` with the order in `sequence`. Config `CONFIG.firstRunRandom` (= `ld.firstRunRandom`) makes the official round generated too.
- Every order: perfect-play maximum **685**, every fixed-stop strategy **300**. Sequence A's pull-back vs chase bot gap is 6.7% (rule: ≤ 15%).
- Practice: `N4 G2 N5 Free`. **No timer (v1.2):** the round always ends after 17 bags, so every candidate's score rests on all their own decisions. Mia's "Still there?" after 15 s idle; time past that point is logged as `idleMs`. Fixed animation budget; buttons lock during animations; Keep/Dip side counterbalanced per player.

**Metrics** (`scoring.js`, from the raw decision list; thresholds in `SCORING`, the future ScoringConfig):

| key | meaning | shown to player? |
|---|---|---|
| `points` (PRIMARY) | sweets haul, "your haul vs median" | yes |
| `bagsBanked` | bags that ended with points | yes |
| `intendedStop` | censoring-corrected stop depth 1–5 over player states k = 0–3 | no |
| `riskScore` | 100 × (intendedStop − 1) ÷ 4 → **traitScore** | report spectrum only |
| `riskBand`, `riskPrecisionLo/Hi`, `consistency`, `stakeShift`, `riskCalibration`, `postSetbackDelta`, `flags`, `sequenceVersion` (2), `sequenceId` (A / generated / P), `sequence`, `buttonSide`, `decisions` (raw), `bagLog` | as in build pack §6 | no |

Raw decisions are `[bag, N|G, k = player dips so far (0–3), 0 keep | 1 dip, ms]`; v1 rounds (`sequenceVersion` absent) counted Mia's dip, so their k is one higher and they aren't compared with v1.1.

**Builder deviations (for Adrian to note):**
1. **No tier B rows** (event policy v1.8): `dip_choice`, `bag_end`, `free_bag`, `setback_next` go into the round's RoundTraces row; the raw decision list is in the metrics.
2. **Scores are computed in the game for now**; the Sheet-side scoring layer is the next core unit and will reuse the raw decisions.
3. **`postSetbackDelta`** (not defined for v1.1 in the build pack): mean dips on the 3 scored bags after the player's first chilli minus the mean before it; blank if they never met one.
4. **Restart rule:** any second real attempt in run 1 gets a generated order and the `repeatAttempt` flag.
5. `lucky-dip-balance-check.py` v2 wasn't in the project, so the balance rules were ported from build pack §3/§9 into `rules.js` and `tests/lucky-dip.unit.test.mjs` (sequence A reproduces the pack's 685 / 300 / 6.7% figures exactly).

**Hooks:** resilience = behaviour after the player's first chilli (`setback_next`, `none` if they never meet one, plus quits/abandons in Rounds); learning = practice → real (derived later).

## Update 13 (suite how-to standard #19, 2026-09-28)
Card 1 now states the goal; all 3 cards are real-UI screenshots with callouts. Practice starts with 2 guided choices (only Dip, then only Keep, is tappable, with a 👉 prompt), then plays freely. A spoiled tray shows "−N spoiled". The **?** in play reopens the cards. The real round is unchanged (version stays 3, so benchmarks carry on).
