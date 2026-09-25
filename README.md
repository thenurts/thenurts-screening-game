# The Nurts – candidate screening game

Mobile-first Phaser 4 + Vite web game. Each minigame measures one trait through play and logs every interaction to Google Sheets (Apps Script backend). Specs live in the Claude Project docs (`claude/01-architecture-spec.md`, `claude/02-module-registry.md`).

## Develop
```bash
npm ci
npm run dev            # http://localhost:5173/?mock=1&debug=1&seedbench=1
npm run build          # dist/ (fails if a module's assets exceed 3 MB)
npx playwright test    # full-flow smoke test on the mock backend (mobile + desktop)
```
URL flags: `mock=1` browser-local fake backend (auto when no API URL is configured, shows a red TEST MODE badge) · `debug=1` live event log · `seedbench=1` (mock) adds fake players so medians show · `env=staging` use the staging API.

## Add / remove / reorder a minigame
1. Create `src/modules/<id>/index.js` (manifest) + `GameScene.js` (extends `core/ModuleScene`). See `src/modules/sample-tap/`.
2. List the id in `src/modules.config.js`. That is the only core file you touch.

## Deploy
Push to `main` → GitHub Actions builds and publishes to Pages. Set repo **Variables** `VITE_API_URL` (and `VITE_API_URL_STAGING`) to the Apps Script web-app URLs. Shopify embeds via `shopify/` (one-time theme setup, see those files).

Privacy: never commit or log a raw NRIC; tests use synthetic IDs only.
