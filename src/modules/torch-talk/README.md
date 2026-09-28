# Torch Talk (`torch-talk`) · v4 (build pack v2.2 + how-to v3) · patched 2026-09-28

**Trait:** `communication` (MIB 0–100) · **Host:** Noah · **Close Friends:** Liam, Mia, Zoey · **Casual Acquaintances:** Raj, Amira (busts only).
**Source:** Game Ideas build pack C1 v2.2 (`11-game-concepts.md`) + item bank v2.2 (`items.json`, 38 items). `itemBankVersion`: absent/1 = v1 (update 8), 2 = v2.1 (update 9), 3 = v2.2 (update 10); versions aren't compared with each other.

## How it plays
Each of 10 turns: read Noah's note → tap words (18-tile tray, each used once; tap a bar word to remove, drag to reorder) → **Send**, or **Ask** first (When? · Where? · Who? · What? · How many?, −1 point each, max 3 a turn). The recipient strip shows the friend and a tag pill: **Close Friend** (two hearts) or **Casual Acquaintance** (one person). Close Friends understand every nickname and code word, which appear in *italics* in the note and the tray; Casual Acquaintances understand none. Gap turns (T5, T9) hide the answer tile until the right question is asked; any other question gets "It's in the note!" and a highlight. T6 is the scripted mix-up (echo + a fix of up to 6 words). **No timers at all (v2.2):** the round always ends after turn 10; a 20 s idle nudge remains and time spent past it is logged as `idleMs`.

**Points (v2.2):** a passing message scores min(10, round(10 × ideal ÷ (words used + 2.5 × missing clarifiers))), else 0; each Ask −1. Clarifiers are optional words that make a message clearer (e.g. *fair* in A-10), so the ideal (required words + every clarifier) scores 10 and dropping a clarifier costs about as much as 1.5 extra words. Rounding matches Python (halves to even).

**How-to v3 (request #17, v4):** the How to play button shows 2 cards (the opening picture and the recap). **Practice = 5 try-it steps** scored by the real checker (`tutorial.json`, built and persona-checked by `python3 tools/tt_build_tutorial.py`): 1 Short wins (a full sentence passes but needs a retry at ≤ 6 words) · 2 Say what to do (`tape school tomorrow` → "Tape… and what do I do?") · 3 Your own words work (`drink plants…` → "Plants don't drink juice!", the *water* tile pulses) · 4 Who's reading? (the *Rocket* note to Liam, then to Raj → "What's the Rocket?") · 5 Missing something? Ask (a guessed time fails; Ask pulses). After 2 wrong tries the ideal message is put in the bar and the player sends it. A yellow headline strip shows the step. In the real round a **helper strip** (✂ Short · 🎯 Say what to do · 👤 Who's reading? · ❓ Ask) sits above the note, and **?** reopens the recap. The v2.1 practice items P-01…P-08 stay in `items.json`, unused.
**Fix (request #15, v4):** after a turn's reaction the ended panel no longer slides back up; the next note and tray are set first and slide in from the side (Playwright frame check).

## Files
| File | What |
|---|---|
| `items.json` | item bank v2.2 (regenerate with `python3 tools/tt_build_items.py`; validate with `python3 tests/torch-talk-validate.py`) |
| `checker.js` | meaning checker v2.2 (phrases, not + breaker, not + one filler + breaker, order, bind, between) and `points()` / `ratio()`, parity-tested against the Python reference on 3,903 cases |
| `forms.js` | round composition (Form A / B / slot-random / 3-turn practice) + fixed per-item tray order |
| `scoring.js` | meaningRate, efficiency, adaptation (T4/T7/T8 + knownSkip + shorthandAdaptation), askScore, repairQuality → `commScore` |
| `GameScene.js` | layout, input, italics, tag pill, send animation, reactions |

## Data recorded
- **Rounds `metrics_json`:** all scores, `itemBankVersion` (3), `idleMs`, `form`, `itemIds`, `turnLog` (turn, itemId, message, pass, failReason, asks, points, fix, ms).
- **Summary columns:** commScore, meaningRate, efficiency, adaptation, askScore, repairQuality, form, flags.
- **Practice rounds:** `tt_tutorial {step, itemId, tries, firstMessage, usedFailSafe}` per step; metrics `failSafes`, `tries`, `flags: tutorialStruggle` (≥ 3 fail-safes).
- **Real round:** `tutorialDone`, `tutorialFailSafes`, and the `tutorialStruggle` flag when that page's practice needed ≥ 3 fail-safes (shown in the Candidate Summary's flags column, not to the player).
- **RoundTraces:** `comm_message` (with `tag`), `ask`, `comm_repair`, `comm_setback_next`, `coach`, tile add/remove/reorder, note expands, idle nudges.

## Deviations from the build pack (for Adrian / Game Ideas thread)
1. **Events go to the round trace, not Interactions rows** (event policy v1.8); `comm_ask` is traced as `ask`.
2. **Later runs:** slot-random from Forms B and C (Form A excluded, since everyone saw it in run 1), rather than looking up exactly which versions this person has seen.
3. **Restart rule:** any second real attempt in run 1 uses Form B.
4. **How-to card 1** is a still picture (torch) rather than an animation; cards 2–6 are live.
5. **Reorder:** drag works immediately (no long-press needed); a plain tap still removes the word.
6. **"It's in the note!" highlight** is best-effort by slot name, so a few asks may show the reply without a highlight.
7. **Capped v2.1 rounds** (the 300 s cap existed in updates 8–9): the scoring layer should mark those with the `idle` flag and fewer than 10 turns as `truncated: true`; the game itself no longer truncates.
8. `idleMs` = time spent past the 20 s nudge point with no input, summed over the round.
9. Message-bar words are under 48 CSS px on phones (up to 10 words must fit); the tray, Ask and Send meet 48 px.
10. Raj and Amira use their `happy` bust as the resting pose (they have no full-body art).
