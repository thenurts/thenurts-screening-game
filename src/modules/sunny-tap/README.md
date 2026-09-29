# Sunny Tap (`sunny-tap`) · v2 (build pack RS1 v1.1) · built 2026-09-29

**Trait:** `resilience` (MIB 0–100) · **Host:** Liam (outcome-only reactions: `happy` → `worried` after a wipeout that drained the score → `excited` at the end). **Always played last** (`playLast: true`, request #25), followed by the end-of-suite debrief (#24).
**Source:** Game Ideas build pack RS1 v1.1 + `sunny-tap-reference.py` (copied to `tests/sunny-tap-reference.py`). This folder replaces the retired "Sunny Tap" test module (`sample-tap`).

## How it plays
A 10 s unscored **warm-up** ("Warm-up · it doesn't count"), a 3-2-1, then one **1:50 round** on a visible clock over a beach sky: Fair 20 s · Wipeout 10 s · Fair 20 s · Wipeout 10 s · Fair 20 s · Wipeout 10 s · Fair 20 s. No phase labels, no retry. Tap a sun **+10** · a sun that fades **−3** · a cloud or the empty sky **−15** · the score never goes below 0. Each sun shows a shrinking blue ring and fades as its time runs out; floaters show every change.
- **Fair phases:** one fixed, seeded schedule for everyone (a sun every 0.5 s, 1.6 s life, a cloud every 4 s).
- **Wipeouts:** suns and clouds (30%) at max(4 per s, 2.5 × the player's own Fair-1 hit rate), 0.8 s life, so fast tappers are overwhelmed too. Built when Fair 1 ends; the Fair phases never change.
- **Practice:** 20 s at the fair pace (no wipeouts, a different seed).
- **Play-for-fun (casual) runs:** a calm version with **no wipeouts** and a different fair seed (request #26). Developer mode can switch wipeouts on or off (`devOptions.wipeouts`).

## Files
| File | What |
|---|---|
| `rules.js` | a bit-exact port of Python's `random.Random` (MT19937), `schedule`, `scoreRound`, the warm-up; parity-tested against `tests/fixtures/sunny-tap-parity.json` (10 schedules + 52 simulated players incl. quits; `python3 tools/st_parity_fixture.py`) |
| `GameScene.js` | stages (warm-up → ready → round), targets, taps (hit test from touch-start), clock, floaters, Liam, how-to staging |
| `assets/` | `bg-beach.webp` (Adrian's image) + `howto-0…2.webp` (real-UI screenshots: `node tools/make-howto-shots.mjs sunny-tap`) |

## Scoring (build pack §2; the Fair phases only, each player their own baseline)
resilienceScore = 100 × (0.25 accuracyShock + 0.50 speedShock + 0.25 hold), each capped at 1. speedShock = median reaction time in the rest of F2–F4 ÷ the first 8 s after each wipeout; accuracyShock = hit rate in those 8 s ÷ the rest; hold = F2–F4 hit rate ÷ F1. A quit before the end = "not enough evidence" (`notEnoughEvidence` flag). `panicCarry` = mis-taps up ≥ 15 points after the wipeouts (a flag, not scored). Reference: retest r ≈ 0.78, composure r ≈ 0.89, skill r ≈ −0.02.

## Data recorded
- **Rounds `metrics_json`:** the above + `points` (primary, shown), `hits`, `misTaps`, `fades`, `accuracy` per fair phase, `f1HitRate`, `wipeRate`, `seed`, `calm`, `tapLog` ("t h<spawn>" / "t m" per tap) and `fadeLog` (for re-scoring), `flags` (`panicCarry`, `notEnoughEvidence`, `calm`).
- **Summary columns:** resilienceScore, speedShock, accuracyShock, hold, errorCarryover, points, flags.
- **RoundTraces:** `st_tap {t, phase, kind, targetSpawnT, rt}`, `st_fade {t, phase}`, `st_phase {phase, start, end, spawnRate}`, `help_open`; a quit is the round's status (quit / abandoned) with the partial metrics at that moment.

## Deviations (for Adrian / Game Ideas thread)
1. Events go to the round trace, not Interactions rows (event policy v1.8); `st_quit` is covered by the round status + partial metrics.
2. The warm-up uses its own random stream (seed × 10 + 9), so it never shifts the scored schedule.
3. The **?** button pauses the clock (as in every game) and is logged; opening it mid-wipeout is visible in the trace.
