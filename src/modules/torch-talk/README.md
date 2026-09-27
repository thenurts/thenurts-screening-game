# Torch Talk (`torch-talk`) · v2 (build pack v2.1) · patched 2026-09-27

**Trait:** `communication` (MIB 0–100) · **Host:** Noah · **Close Friends:** Liam, Mia, Zoey · **Casual Acquaintances:** Raj, Amira (busts only).
**Source:** Game Ideas build pack C1 v2.1 (`11-game-concepts.md`) + item bank v2.1 (`items.json`, 38 items). v1 went live 2026-09-27 (update 8); rounds played on it carry no `itemBankVersion` (= 1) and aren't compared with v2.

## How it plays
Each of 10 turns: read Noah's note → tap words (18-tile tray, each used once; tap a bar word to remove, drag to reorder) → **Send**, or **Ask** first (When? · Where? · Who? · What? · How many?, −1 point each, max 3 a turn). The recipient strip shows the friend and a tag pill: **Close Friend** (two hearts) or **Casual Acquaintance** (one person). Close Friends understand every nickname and code word, which appear in *italics* in the note and the tray; Casual Acquaintances understand none. Gap turns (T5, T9) hide the answer tile until the right question is asked; any other question gets "It's in the note!" and a highlight. T6 is the scripted mix-up (echo + a fix of up to 6 words). No turn timer; idle nudge at 20 s; 300 s cap.

**How-to:** 6 cards with live examples (cards 2–3 need the player to tap the right tiles before Next unlocks; cards 4–5 use the how-to-only nickname *Rocket*; card 6 has tappable Ask chips). **Practice:** 3 turns (a normal item, a Casual Acquaintance nickname item, a gap item with a one-time "Something missing? Tap Ask." bubble); the ideal message is shown after each.

## Files
| File | What |
|---|---|
| `items.json` | item bank v2.1 (regenerate with `python3 tools/tt_build_items.py`; validate with `python3 tests/torch-talk-validate.py`) |
| `checker.js` | meaning checker v2.1 (phrases, not + breaker, order, bind, between), parity-tested against the Python reference on 3,111 cases |
| `forms.js` | round composition (Form A / B / slot-random / 3-turn practice) + fixed per-item tray order |
| `scoring.js` | meaningRate, efficiency, adaptation (T4/T7/T8 + knownSkip + shorthandAdaptation), askScore, repairQuality → `commScore` |
| `GameScene.js` | layout, input, italics, tag pill, send animation, reactions |

## Data recorded
- **Rounds `metrics_json`:** all scores, `itemBankVersion` (2), `form`, `itemIds`, `turnLog` (turn, itemId, message, pass, failReason, asks, points, fix, ms).
- **Summary columns:** commScore, meaningRate, efficiency, adaptation, askScore, repairQuality, form, flags.
- **RoundTraces:** `comm_message` (with `tag`), `ask`, `comm_repair`, `comm_setback_next`, `coach`, tile add/remove/reorder, note expands, idle nudges.

## Deviations from the build pack (for Adrian / Game Ideas thread)
1. **Events go to the round trace, not Interactions rows** (event policy v1.8); `comm_ask` is traced as `ask`.
2. **Later runs:** slot-random from Forms B and C (Form A excluded, since everyone saw it in run 1), rather than looking up exactly which versions this person has seen.
3. **Restart rule:** any second real attempt in run 1 uses Form B.
4. **How-to card 1** is a still picture (torch) rather than an animation; cards 2–6 are live.
5. **Reorder:** drag works immediately (no long-press needed); a plain tap still removes the word.
6. **"It's in the note!" highlight** is best-effort by slot name, so a few asks may show the reply without a highlight.
7. Message-bar words are under 48 CSS px on phones (up to 10 words must fit); the tray, Ask and Send meet 48 px.
8. Raj and Amira use their `happy` bust as the resting pose (they have no full-body art).
