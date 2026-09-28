import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.js', // unit tests (*.unit.test.mjs) run with npm run test:unit
  timeout: 600_000, // a full run now plays 5 games; slow CI machines need the room
  use: { baseURL: 'http://localhost:4173', launchOptions: exe ? { executablePath: exe } : {} },
  // LIVE=1 also starts the Apps Script harness; build first with VITE_API_URL=http://localhost:8787
  webServer: [
    { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
    ...(process.env.LIVE === '1' ? [{ command: 'node tests/gas-harness/server.mjs', port: 8787, reuseExistingServer: true }] : []),
  ],
  workers: process.env.LIVE === '1' ? 1 : undefined, // one shared fake Sheet
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, browserName: 'chromium' } },
  ],
});
