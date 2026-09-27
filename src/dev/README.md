# Developer mode (`src/dev/`) · request #14 · 2026-09-27

A hidden 🔧 button in the top-right corner of Home. After the PIN, the tester can:
- pick any games (including ones not yet switched on in `modules.config.js`, marked "(off)") in any order;
- start in a real round, practice, or the game's intro screen;
- force a version per game (Lucky Dip bag order, Torch Talk form, Fair Board form), from each manifest's `devOptions`;
- open the report, start a fresh dev run, and use the red **DEV** ribbon (Games · End round · Exit) on every screen.

**What gets saved.** Everything is saved like a casual player but with user id **`Dev Test`**. The server only accepts it with a
token from `devAuth`, which needs the PIN kept in the Apps Script **Script Property `DEV_PIN`** (no property = developer mode refused).
Dev Test rows are left out of benchmarks and the Candidate Summary. To clear them: Sheet menu **The Nurts → Delete Dev Test rows**.
10 wrong PINs lock it for 10 minutes; a token lasts 6 hours.

## Switch it off (keep the code)
Open `src/dev.config.js` and change `true` to `false`. The wrench disappears and the dev code is never downloaded.
To also stop the server accepting it, delete the `DEV_PIN` Script Property.

## Remove it completely
1. Delete the `src/dev/` folder and `src/dev.config.js`.
2. In `src/main.js`, delete the two lines that mention `DEV_MODE` (the import and the `if (DEV_MODE)` line).
3. Optional: delete `devOptions` from the module `index.js` files (harmless if left).
Core keeps only generic hooks (`homeExtras`, `app`, `api.raw`, `session.authExtra` / `moduleOptions`, `allModules`), which do nothing on their own.
`tests/dev-isolation.unit.test.mjs` checks that nothing outside `src/dev/` depends on this folder.
