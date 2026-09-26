// Smoke tests on the mock backend with synthetic identities (never real data).
import { test, expect } from '@playwright/test';

const EMAIL = 'test.player@example.com';
const PHONE = '+60170000000';
const DB = 'thenurts_mock_db_v2';
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

test('applicant: register → how to → practice → real round → report → restart → login resumes', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?mock=1&seedbench=1&debug=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('#btn-apply')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-1-home.png` });
  await page.click('#btn-apply');
  await page.click('#btn-new');

  // Validation fires on empty submit
  await page.click('#btn-register');
  await expect(page.locator('.tn-field.is-bad').first()).toBeVisible();

  await page.fill('#f-name', 'Test Player');
  await page.fill('#f-email', 'not-an-email');
  await page.fill('#f-phone', '0170000000'); // no country code → rejected
  await page.click('#f-type >> text=Full-time');
  await page.click('#f-dept >> text=Marketing');
  await page.click('#btn-register');
  await expect(page.locator('#f-phone')).toHaveCSS('border-top-color', 'rgb(237, 86, 65)');
  await page.fill('#f-email', EMAIL);
  await page.fill('#f-phone', '+60 17-000 0000'); // spaces/dashes are stripped as they type
  await expect(page.locator('#f-phone')).toHaveValue(PHONE);
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
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-5-postgame.png`, fullPage: true });
  await page.click('#btn-continue');

  // Only one module → report
  await expect(page.locator('#btn-restart')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-6-report.png`, fullPage: true });

  // Log integrity: standard events present, raw NRIC never stored
  const dbj = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB));
  expect(JSON.stringify(dbj).toLowerCase()).not.toContain('nric');
  expect(dbj.interactions.every((r) => r[1] === `${EMAIL}|${PHONE}` && r[2] === EMAIL && r[3] === PHONE)).toBeTruthy();
  const rows = dbj.interactions.map((r) => r[6]);
  for (const ev of ['register', 'howto_open', 'howto_page', 'howto_close', 'practice_start', 'practice_end', 'round_start', 'round_complete', 'postgame_view']) expect(rows).toContain(ev);
  expect(rows.some((r) => r.startsWith('g:'))).toBeTruthy();

  // New run, then log in fresh and resume at module 1 of run 2
  await page.click('#btn-restart');
  await page.click('#btn-restart-yes');
  await expect(page.locator('#btn-start')).toBeVisible();
  await page.reload();
  await page.click('#btn-apply');
  await page.click('#btn-returning');
  await page.fill('#l-email', EMAIL);
  await page.fill('#l-phone', '+60179999999');
  await page.click('#btn-login');
  await expect(page.locator('.tn-toast')).toContainText('couldn’t find');
  await page.fill('#l-phone', PHONE);
  await page.click('#btn-login');
  await expect(page.locator('#btn-start')).toBeVisible();
  const users = await page.evaluate((k) => Object.values(JSON.parse(localStorage.getItem(k)).users), DB);
  expect(users[0].currentRun).toBe(2);

  expect(errors).toEqual([]);
});

test('casual: play for fun → straight to games, logged as Casual User with no PII', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?mock=1&seedbench=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#btn-casual');
  await expect(page.locator('#btn-start')).toBeVisible();
  await page.click('#btn-start');
  await playRound(page);
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.tn-notice')).toContainText('playing for fun');
  await page.click('#btn-continue');
  await expect(page.locator('#btn-casual-apply')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-7-casual-report.png`, fullPage: true });
  await page.waitForTimeout(3500); // let the log batch flush
  const dbj = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB));
  expect(Object.keys(dbj.users)).toHaveLength(0);
  expect(dbj.interactions.length).toBeGreaterThan(5);
  expect(dbj.interactions.every((r) => r[1] === 'Casual User' && r[2] === '' && r[3] === '')).toBeTruthy();
  expect(dbj.interactions.map((r) => r[6])).toEqual(expect.arrayContaining(['home_view', 'choose_casual', 'round_start', 'round_complete']));
  expect(errors).toEqual([]);
});
