// Smoke tests on the mock backend with synthetic identities (never real data).
import { test, expect } from '@playwright/test';

const EMAIL = 'test.player@example.com';
const PHONE = '+60170000000';
const DB = 'thenurts_mock_db_v3';
// LIVE=1 → the build talks to the Apps Script harness (tests/gas-harness) over real HTTP instead of the mock.
const LIVE = process.env.LIVE === '1';
const GAS = 'http://localhost:8787';
const shots = process.env.SHOTS === '1';
const Q = LIVE ? '?' : '?mock=1&';

async function reset(page) {
  if (LIVE) await fetch(GAS + '/__reset', { method: 'POST' });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}
// Normalised view of the backend tables: { interactions: [13-col rows], users: [{currentRun}] }
async function backend(page) {
  if (LIVE) {
    const { sheets } = await (await fetch(GAS + '/__dump')).json();
    return {
      raw: sheets, interactions: sheets.Interactions.slice(1),
      users: sheets.Users.slice(1).map((r) => ({ currentRun: r[5], phone: r[2] })),
      rounds: sheets.Rounds.slice(1).map((r) => ({ status: r[10], mode: r[7], roundNo: r[6] })),
      traces: sheets.RoundTraces.slice(1).map((r) => ({ status: r[8], roundNo: r[6], partial: r[13] ? JSON.parse(r[13]) : null, items: r[14] ? String(r[14]).split('\n') : [] })),
    };
  }
  const d = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB));
  return { raw: d, interactions: d.interactions, users: Object.values(d.users), rounds: d.rounds.filter((r) => !r.key.startsWith('fake')), traces: Object.values(d.traces) };
}

// Plays the current round with a bot. Lucky Dip: 'keep' | 'dip' | 't3' (dip while k < 3).
// Torch Talk: 'ideal' (asks the gap question, sends the ideal message, sends a targeted fix on T6).
async function playRound(page, strategy = 't3') {
  await page.waitForFunction(() => window.__tnGame?.scene.getScenes(true).some((x) => x.scene.key.startsWith('mod:')), null, { timeout: 30_000 });
  for (;;) {
    const state = await page.evaluate((strat) => {
      const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:'));
      if (!s) return 'gone';
      if (s.ended) return 'ending';
      if (s.manifest.id === 'torch-talk') {
        if (!s.running || !s.item) return 'wait';
        const it = s.item;
        if (s.phase === 'compose') {
          if (it.gap && !s.answerShown && strat !== 'noask') { s.ask(it.gap.question); return 'chose'; }
          s.msg = strat === 'cap' ? [...it.ideal, ...it.fillers.filter((f) => f !== 'not')].slice(0, it.cap) : [...it.ideal];
          s.send(); return 'chose';
        }
        if (s.phase === 'fix') { s.msg = [it.slots.find((x) => x.id === it.mixup.fixSlot).accept[0]]; s.send(); return 'chose'; }
        return 'wait';
      }
      if (s.running && !s.locked && s.cur) {
        const k = s.cur.k;
        const dip = strat === 'dip' ? true : strat === 'keep' ? false : s.cur.type === 'free' ? k < 3 : k < 3;
        s.choose(dip ? 'dip' : 'keep');
        return 'chose';
      }
      return 'wait';
    }, strategy);
    if (state === 'gone' || state === 'ending') break;
    await page.waitForTimeout(state === 'chose' ? 60 : 120);
  }
}
const botFor = async (page) => ((await page.textContent('h1')).includes('Torch') ? 'ideal' : 't3');
// From the post-game screen: play every remaining game for real, then land on the report.
async function playRest(page) {
  for (;;) {
    await page.click('#btn-continue');
    await expect(page.locator('#btn-start, #btn-restart, #btn-casual-apply').first()).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#btn-start').count())) return;
    const bot = await botFor(page);
    await page.click('#btn-start');
    await playRound(page, bot);
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  }
}

test('applicant: register → how to → practice → real round → report → restart → login resumes', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'seedbench=1&debug=1&speed=10');
  await reset(page);

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
  while (await page.locator('.tn-modal').count()) await page.click('#btn-howto-next');
  await expect(page.locator('.tn-modal')).toHaveCount(0);

  // Practice round (10 s)
  const bot1 = await botFor(page);
  await page.click('#btn-practice');
  await playRound(page, bot1);
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-4-gameplay.png` });
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 20_000 });

  // Real round
  await page.click('#btn-start');
  await playRound(page, bot1);
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-5-postgame.png`, fullPage: true });
  await playRest(page); // the other game(s), in this run's shuffled order
  await expect(page.locator('#btn-restart')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-6-report.png`, fullPage: true });

  // Log integrity: standard events present, raw NRIC never stored
  await page.waitForTimeout(3500); // let the log batch flush
  const dbj = await backend(page);
  expect(JSON.stringify(dbj.raw).toLowerCase()).not.toContain('nric');
  expect(dbj.interactions.every((r) => r[1] === `${EMAIL}|${PHONE}` && r[2] === EMAIL && r[3] === PHONE)).toBeTruthy();
  const rows = dbj.interactions.map((r) => r[6]);
  for (const ev of ['register', 'session_start', 'howto']) expect(rows).toContain(ev);
  // Event policy v1.8: no navigation or round-lifecycle rows (rounds live in Rounds / RoundTraces)
  for (const ev of ['home_view', 'howto_page', 'pregame_view', 'round_start', 'round_complete', 'practice_start', 'postgame_view']) expect(rows).not.toContain(ev);
  expect(dbj.rounds.filter((r) => r.mode === 'practice')).toHaveLength(1);
  expect(dbj.rounds.filter((r) => r.mode === 'real' && r.status === 'completed')).toHaveLength(2);
  // Tier C: fine detail lives in one trace record per round, not in Interactions rows
  expect(rows.some((r) => r.startsWith('g:'))).toBeFalsy();
  expect(dbj.traces.some((t) => t.items.length > 0 && t.partial)).toBeTruthy();
  console.log(`[${info.project.name}] Interactions rows for register→practice→round→report: ${dbj.interactions.length}`);

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
  const users = (await backend(page)).users;
  expect(users[0].currentRun).toBe(2);
  expect(users[0].phone).toBe(PHONE); // stays text in Sheets, '+' kept

  expect(errors).toEqual([]);
});

test('casual: play for fun → straight to games, logged as Casual User with no PII', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'seedbench=1&speed=10');
  await reset(page);
  await page.click('#btn-casual');
  await expect(page.locator('#btn-start')).toBeVisible();
  const bot = await botFor(page);
  await page.click('#btn-start');
  await playRound(page, bot);
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.tn-notice')).toContainText('playing for fun');
  await playRest(page);
  await expect(page.locator('#btn-casual-apply')).toBeVisible();
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-7-casual-report.png`, fullPage: true });
  await page.waitForTimeout(3500); // let the log batch flush
  const dbj = await backend(page);
  expect(dbj.users).toHaveLength(0);
  expect(dbj.interactions.length).toBeGreaterThanOrEqual(2);
  expect(dbj.interactions.every((r) => r[1] === 'Casual User' && r[2] === '' && r[3] === '')).toBeTruthy();
  expect(dbj.interactions.map((r) => r[6])).toEqual(expect.arrayContaining(['casual_start', 'session_start']));
  expect(dbj.rounds.some((r) => r.status === 'completed')).toBeTruthy();
  expect(errors).toEqual([]);
});

test('abandon: closing the page mid-round leaves an abandoned round with its live trace', async ({ page }) => {
  await page.goto('/' + Q + 'speed=10&first=lucky-dip');
  await reset(page);
  await page.click('#btn-casual');
  await page.click('#btn-start');
  let n = 0;
  while (n < 6) { // make a few choices, then leave mid-round
    const chose = await page.evaluate(() => {
      const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:'));
      if (s && s.running && !s.locked) { s.choose('dip'); return true; } return false;
    });
    if (chose) n++;
    await page.waitForTimeout(150);
  }
  await page.goto('about:blank'); // player closes the tab mid-round
  await page.waitForTimeout(1500);
  if (!LIVE) await page.goto('/' + Q);
  const dbj = await backend(page);
  const real = dbj.rounds.filter((r) => r.mode === 'real');
  expect(real).toHaveLength(1);
  expect(real[0].status).toBe('abandoned');
  const t = dbj.traces.find((x) => x.status === 'abandoned');
  expect(t).toBeTruthy();
  expect(t.partial).toBeTruthy(); // score-so-far at the moment they left
  expect(t.items.length).toBeGreaterThan(0);
});

test('lucky dip bots: always-Keep / always-Dip / threshold-3 score 0 / 100 / 50', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  await page.goto('/' + Q + 'speed=10&first=lucky-dip');
  const want = { keep: 0, dip: 100, t3: 50 };
  for (const strat of ['keep', 'dip', 't3']) {
    await reset(page); // a fresh casual session each time → run 1 → sequence A
    await page.click('#btn-casual');
    await page.click('#btn-start');
    await playRound(page, strat);
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    const dbj = await backend(page);
    const done = LIVE
      ? dbj.raw.Rounds.slice(1).filter((r) => r[10] === 'completed' && r[7] === 'real').map((r) => JSON.parse(r[12]))
      : dbj.rounds.filter((r) => r.status === 'completed' && r.mode === 'real').map((r) => r.metrics);
    const m = done[done.length - 1];
    expect(m.riskScore, strat).toBe(want[strat]);
    expect(m.sequenceId).toBe('A');
    if (strat === 'keep') expect(m.flags).toMatch(/disengaged/); // instant identical choices → disengaged overrides frozen
  }
});

test('torch talk: Form A first; ideal bot scores 100, filler bot less; order + position logged', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'speed=10&first=torch-talk');
  const got = {};
  for (const strat of ['ideal', 'cap']) {
    await reset(page);
    await page.click('#btn-casual');
    await page.click('#btn-start');
    await playRound(page, strat);
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(1500);
    const dbj = await backend(page);
    const r = LIVE
      ? dbj.raw.Rounds.slice(1).filter((x) => x[10] === 'completed' && x[7] === 'real').map((x) => ({ m: JSON.parse(x[12]), pos: x[17], order: x[18] })).at(-1)
      : dbj.rounds.filter((x) => x.status === 'completed' && x.mode === 'real').map((x) => ({ m: x.metrics, pos: x.positionInRun, order: x.moduleOrder })).at(-1);
    expect(r.m.form).toBe('A');
    expect(r.m.itemIds.split(' ')[0]).toBe('A-01');
    expect(r.m.turnLog).toHaveLength(10);
    expect(Number(r.pos)).toBe(1);
    expect(r.order).toMatch(/^torch-talk>/);
    got[strat] = r.m;
  }
  expect(got.ideal.commScore).toBe(100);
  expect(got.ideal.meaningRate).toBe(1);
  expect(got.cap.meaningRate).toBe(1);
  expect(got.cap.commScore).toBeLessThan(got.ideal.commScore);
  expect(got.cap.messageScore).toBeLessThan(got.ideal.messageScore);
  expect(errors).toEqual([]);
});

test('module order: shuffled per run, stable when resumed', async ({ page }) => {
  await page.goto('/' + Q);
  const orders = await page.evaluate(async () => {
    const out = new Set();
    for (let i = 0; i < 40; i++) out.add((await window.__tnOrder(`key${i}`, 1)).join('>'));
    return { distinct: [...out], same: (await window.__tnOrder('k', 1)).join() === (await window.__tnOrder('k', 1)).join() };
  });
  expect(orders.distinct.length).toBeGreaterThan(1); // both orders occur
  expect(orders.same).toBeTruthy();
});
