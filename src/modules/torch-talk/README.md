# Torch Talk (`torch-talk`) · v1 · built 2026-09-27

**Trait:** `communication` (MIB 0–100) · **Host:** Noah · recipients Liam, Mia ("Old friend") and Zoey ("New friend · first day").
**Source:** Game Ideas build pack C1 v1.1 (`11-game-concepts.md`) + item bank v1.0 (`items.json`, 38 items).

## How it plays
Each of 10 turns: read Noah's note → tap words (18-tile tray, each used once; tap a bar word to remove, drag to reorder) → **Send** (torch flashes one burst per word to the friend, who decodes it in the notebook and shows ✓ or ✗) or **Ask** (When? / Where? / Bring what?, −1 point each, max 3 a turn). Gap turns (T5, T9) hide the answer tile until the right question is asked. T6 is the scripted mix-up: the friend echoes a wrong word ("8pm?") and the player sends a fix of up to 6 words. No turn timer; idle nudge at 20 s; 300 s cap.

## Files
| File | What |
|---|---|
| `items.json` | the item bank (regenerate with `python3 tools/tt_build_items.py`; validate with `python3 tests/torch-talk-validate.py`) |
| `checker.js` | meaning checker, a line-for-line port of the validator's `check()` (parity fixture: 2,212 cases) + T6 fix rule |
| `forms.js` | round composition (Form A / B / slot-random / practice) + fixed per-item tray order |
| `scoring.js` | meaningRate, efficiency, adaptation, askScore, repairQuality → `commScore`; shown points; reaction map |
| `GameScene.js` | layout, input, send animation, reactions |

## Data recorded
- **Rounds `metrics_json`:** all scores above plus `form`, `itemIds`, `turnLog` (per turn: turn, itemId, message, pass, failReason, asks, points, fix, ms) so everything can be re-scored later.
- **Summary columns (`summaryKeys`):** commScore, meaningRate, efficiency, adaptation, askScore, repairQuality, form, flags (`idle`, `restartedAfterSetback`).
- **RoundTraces:** `comm_message`, `ask`, `comm_repair`, `comm_setback_next`, tile add/remove/reorder, note expands, idle nudges.

## Deviations from the build pack (for Adrian / Game Ideas thread)
1. **Events go to the round trace, not Interactions rows** (event policy v1.8, same as Lucky Dip); `comm_ask` is traced as `ask`.
2. **Later runs:** slot-random from Forms B and C (Form A is excluded because everyone has seen it in run 1), rather than looking up exactly which versions this person has seen.
3. **Restart rule:** any second real attempt in run 1 uses Form B (a second attempt only happens after leaving the first one).
4. **How-to:** 3 static pages with a worked example (a made-up note, not from the bank) instead of the animated example.
5. **Reorder:** drag works immediately (no long-press needed); a plain tap still removes the word.
6. **Note card:** drawn in code with the tape from the note sprite, so it fits any note length; the paper sprite is used on the how-to page.
7. Message-bar words are smaller than 48 CSS px on phones (up to 10 words must fit); the tray, Ask and Send meet 48 px.
