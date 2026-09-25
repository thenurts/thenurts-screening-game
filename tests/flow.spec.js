// Smoke test: full candidate flow on the mock backend with a synthetic NRIC (never real data).
import { test, expect } from '@playwright/test';

const TEST_NRIC = 'S1234567D'; // synthetic, checksum-valid
const shots = process.env.SHOTS === '1';

async function playRound(page) {
  // Wait out the countdown, then tap a few suns via Phaser's scene graph, plus one deliberate miss.
  await page.waitForTimeout(2800);
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const g = window.__tnGame; const s = g.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:'));
      const sun = s?.children.list.find((o) => o.type === 'Container' && o.input?.enabled && o.scale > 0.3);
      if (sun) sun.emit('pointerdown');
    });
    await page.waitForTimeout(450);
  }
}

test('register → how to → practice → real round → report → restart → login resumes', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?mock=1&seedbench=1&debug=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('#btn-new')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-1-home.png` });
  await page.click('#btn-new');

  // Validation fires on empty submit
  await page.click('#btn-register');
  await expect(page.locator('.tn-field.is-bad').first()).toBeVisible();

  await page.fill('#f-name', 'Test Player');
  await page.fill('#f-nric', TEST_NRIC);
  await page.fill('#f-email', 'test.player@example.com');
  await page.fill('#f-phone', '+65 9123 4567');
  await page.click('#f-dept >> text=Marketing');
  await page.click('#f-type >> text=Full-time');
  await page.click('.tn-lang >> text=Bahasa Melayu');
  await page.check('#f-consent');
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-2-register.png`, fullPage: true });
  await page.click('#btn-register');

  await expect(page.locator('#btn-start')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-3-pregame.png` });

  // How to play: page through and close
  await page.click('#btn-howto');
  await page.click('#btn-howto-next');
  await page.click('#btn-howto-next');
  await expect(page.locator('.tn-modal')).toHaveCount(0);

  // Practice round (10 s)
  await page.click('#btn-practice');
  await playRound(page);
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-4-gameplay.png` });
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 20_000 });

  // Real round (20 s)
  await page.click('#btn-start');
  await playRound(page);
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-5-postgame.png`, fullPage: true });
  await page.click('#btn-continue');

  // Only one module → report
  await expect(page.locator('#btn-restart')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-6-report.png`, fullPage: true });

  // Log integrity: standard events present, raw NRIC never stored
  const db = await page.evaluate(() => localStorage.getItem('thenurts_mock_db_v1'));
  expect(db).not.toContain(TEST_NRIC);
  const rows = JSON.parse(db).interactions.map((r) => r[6]);
  for (const ev of ['register', 'howto_open', 'howto_page', 'howto_close', 'practice_start', 'practice_end', 'round_start', 'round_complete', 'postgame_view']) expect(rows).toContain(ev);
  expect(rows.some((r) => r.startsWith('g:'))).toBeTruthy();

  // New run, then log in fresh and resume at module 1 of run 2
  await page.click('#btn-restart');
  await page.click('#btn-restart-yes');
  await expect(page.locator('#btn-start')).toBeVisible();
  await page.reload();
  await page.click('#btn-returning');
  await page.fill('#l-nric', TEST_NRIC);
  await page.fill('#l-email', 'wrong@example.com');
  await page.click('#btn-login');
  await expect(page.locator('.tn-toast')).toContainText('couldn’t find');
  await page.fill('#l-email', 'test.player@example.com');
  await page.click('#btn-login');
  await expect(page.locator('#btn-start')).toBeVisible();
  const users = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('thenurts_mock_db_v1')).users));
  expect(users[0].currentRun).toBe(2);

  expect(errors).toEqual([]);
});
