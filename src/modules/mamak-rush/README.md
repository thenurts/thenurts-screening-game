# The Nurts Mamak (`mamak-rush`) · v1 (build pack O1 v1.1) · built 2026-09-28

**Trait:** `organisation` (MIB 0–100), both facets: **planning** (valueDone, expiredHigh, halfDone) and **under pressure** (parkedReturn, errorsUnderLoad). Passive: `resilience` (the gas runs out), `learning` (practice → real). **Host:** Liam at the counter. **Customers:** Mia, Noah, Zoey, Raj, Amira (existing busts).
**Source:** Game Ideas build pack O1 v1.1 (`11-game-concepts.md`) + `mamak-reference.py` (copied to `tests/mamak-reference.py`, minus its unreachable lines after `sys.exit`).

## How it plays
A 7:00–7:36 pm shift on a wall clock that moves **one minute per action** and never on its own (no real-time timer anywhere; players never see the word "tick"). Order cards show the customer, the dish, ★ value, **⏳ minutes left** and one step dot per station (the next step is ringed). Tap a card, then a station (**Urn · Griddle · Rice pot · Counter**): 1 minute, one step. A wrong station costs the minute ("Oops, that's the griddle!"). **Wait** lets 1 minute pass. ☆ pins a card to the top (planning tool, logged). At 7:09 Amira orders a **roti canai tapau**; after that only a small 📌 7:20 pin shows (tap it to cook, and tap it again at 7:20–7:28 to hand it over; earlier taps just get "I'll be back at 7:20!"). At 7:17 **the gas runs out**: the griddle is greyed out for 7:17–7:19. The shift ends after 36 actions with "You served ★ N of 33".

**Practice = learn by doing (3 steps, the real rules engine):** 1 Tap order, then station (teh tarik; 2 wrong stations → fail-safe tip) · 2 ★ worth more, ⏳ due soon (teh vs a nasi lemak due in 3; losing the nasi → retry) · 3 Don't forget the pin (a teh tarik tapau, back at 7:05). After 2 tries a step shows the right move. **? button** reopens the recap card; the helper strip stays at the top in the real round.
**Forms:** A = the first real attempt of run 1 (official); restarts and later runs = B. Developer mode can force A or B.

## Files
| File | What |
|---|---|
| `rules.js` | port of the reference: `act`, `metrics`, `orgScore`, facets, the careful bot; parity-tested against `tests/fixtures/mamak-parity.json` (130 runs, regenerate with `python3 tools/mk_parity_fixture.py`) |
| `tutorial.js` | the 3 practice scenarios |
| `GameScene.js` | cards, stations, pin, clock, bubbles, end card |
| `assets/` | `bg-mamak.webp` + 12 icons keyed out of Adrian's sheet (6 dishes, tapau bag, gas tong, 4 stations), ≈ 300 KB |

## Scoring (build pack §5; weights = ScoringConfig `o1.*` later)
- **orgScore** = 100 × (0.30 × min(1, valueDone ÷ 0.80) + 0.20 × (1 − expiredHigh) + 0.20 × (1 − halfDone) + 0.15 × parkedReturn + 0.15 × (1 − min(1, 4 × errorsUnderLoad))). Careful plan 98.4 on both forms (checked through the real buttons in Playwright).
- **planScore** = the first three terms re-weighted to 100; **pressureScore** = the last two.
- Logged only: `planToolUse` (pins), `waits`, `postSetbackDelta` (useful-action rate 7:17–7:22 minus 7:11–7:16), `actionsBeforeRecover`.
- Flags: `disengaged` (≥ 20 Waits or ≥ 50% wrong stations), `tutorialStruggle` (≥ 2 practice fail-safes on this page), `repeatAttempt`.

## Data recorded
- **Rounds `metrics_json`:** all of the above + `starsServed` (primary, shown), `starsAvailable`, `served`, `expired`, `errors`, `tapauHanded`, `form`, `minutesPlayed`, `actionLog` ("tick target station ok load" per minute, for re-scoring), `idleNudges`, `idleMs`.
- **Summary columns:** orgScore, planScore, pressureScore, valueDone, expiredHigh, halfDone, parkedReturn, errorsUnderLoad, form, flags.
- **RoundTraces:** `o1_action`, `o1_order_end`, `o1_tapau`, `o1_plan`, `o1_setback_next`, `o1_tutorial`, `o1_end`, `help_open`, `idle`.

## Deviations from the build pack (for Adrian / Game Ideas thread)
1. Events go to the round trace, not Interactions rows (event policy v1.8).
2. **Planning tool:** ☆ pin-to-top only; long-press drag to reorder isn't built (the pin gives the same "I'm deciding the order" signal with less fiddly touch handling).
3. More than 5 open orders: ▲ ▼ buttons page the queue.
4. The hand-over is accepted only at 7:20–7:28 in the UI (the reference also accepts early hand-overs and scores them 0.5); nothing else differs, so the parity fixture still holds.
5. The practice's pre-game message counts completed steps as ★ ("You got 3 ★").
6. Open questions answered with the recommended defaults: no extra "uncle" customer; keep the short Manglish lines ("Boss, one roti canai tapau!").
