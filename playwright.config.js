import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  use: { baseURL: 'http://localhost:4173', launchOptions: exe ? { executablePath: exe } : {} },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, browserName: 'chromium' } },
  ],
});
