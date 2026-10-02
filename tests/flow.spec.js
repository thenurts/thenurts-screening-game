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
// Fair Board: 'fb' (always right) | 'fb-check' (right, and Checks every flawed claim) | 'agree'.
// Torch Talk: 'ideal' (asks the gap question, sends the ideal message, sends a targeted fix on T6).
async function playRound(page, strategy = 't3') {
  await page.waitForFunction(() => window.__tnGame?.scene.getScenes(true).some((x) => x.scene.key.startsWith('mod:')), null, { timeout: 30_000 });
  for (;;) {
    const state = await page.evaluate((strat) => {
      const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:'));
      if (!s) return 'gone';
      if (s.ended) return 'ending';
      if (s.manifest.id === 'sunny-tap') return s.botStep() ? 'chose' : 'wait'; // taps the oldest live sun
      if (s.manifest.id === 'big-calls') { // the reference "wise" bot, through the same buttons
        return s.botStep() ? 'chose' : 'wait';
      }
      if (s.manifest.id === 'fix-it-kit') { // the reference explorer, through the same taps
        if (s.recapDone) { s.recapDone(); return 'chose'; }
        return s.botStep() ? 'chose' : 'wait';
      }
      if (s.manifest.id === 'mamak-rush') {
        if (s.shiftDone) { s.shiftDone(); return 'chose'; } // end-of-shift card
        return s.botStep() ? 'chose' : 'wait'; // the reference's careful plan, through the same buttons
      }
      if (s.manifest.id === 'fair-board') {
        if (s.waitingNext) { s.waitingNext(); return 'chose'; } // practice feedback
        if (s.recapDone) { s.recapDone(); return 'chose'; } // end recap
        if (!s.running || s.locked || !s.claim) return 'wait';
        const c = s.claim;
        if (strat === 'fb-check' && !s.checks && c.truth === 'flawed') s.check();
        s.answer(strat === 'agree' ? 'agree' : c.truth === 'sound' ? 'agree' : 'doubt');
        return 'chose';
      }
      if (s.manifest.id === 'torch-talk') {
        if (!s.running || !s.item) return 'wait';
        const it = s.item;
        if (s.phase === 'compose') {
          if (it.gap && !s.answerShown && strat !== 'noask') { s.ask(it.gap.question); return 'chose'; }
          s.msg = strat === 'cap' ? [...it.ideal, ...it.fillers.filter((f) => f !== 'not')].slice(0, it.cap) : [...it.ideal];
          s.send(); return 'chose';
        }
        if (s.phase === 'fix') { s.msg = it.slots.find((x) => x.id === it.mixup.fixSlot).accept[0].split(' '); s.send(); return 'chose'; }
        return 'wait';
      }
      if (s.running && !s.locked && s.cur) {
        const k = s.cur.k;
        // tray-bug regression (v1.1): at a bag's first decision the tray holds only this bag's sweets
        if (!s.cur.checked) { s.cur.checked = true; const want = s.cur.type === 'free' ? 0 : 1; if (s.trayItems.list.length > want) (window.__trayBad ||= []).push(`bag ${s.cur.bag}: ${s.trayItems.list.length}`); }
        const dip = strat === 'dip' ? true : strat === 'keep' ? false : s.cur.type === 'free' ? k < 3 : k < 3;
        s.choose(dip ? 'dip' : 'keep');
        return 'chose';
      }
      return 'wait';
    }, strategy);
    if (state === 'gone' || state === 'ending') break;
    await page.waitForTimeout(state === 'chose' ? 60 : 120);
  }
  expect(await page.evaluate(() => window.__trayBad || [])).toEqual([]);
}
const botFor = async (page) => { const t = await page.textContent('h1'); return t.includes('Torch') ? 'ideal' : t.includes('Fair') ? 'fb' : t.includes('Mamak') ? 'mk' : t.includes('Fix-It') ? 'fx' : t.includes('Big Calls') ? 'jd' : t.includes('Sunny') ? 'st' : 't3'; };
// From the post-game screen: play every remaining game for real, then land on the report.
async function playRest(page) {
  for (;;) {
    await page.click('#btn-continue');
    await expect(page.locator('#btn-start, #btn-restart, #btn-casual-apply, #btn-debrief').first()).toBeVisible({ timeout: 20_000 });
    if (await page.locator('#btn-debrief').count()) { // end-of-suite debrief (candidates only, request #24)
      await expect(page.locator('.tn-card')).toContainText('built to feel overwhelming');
      (page.__debriefs = (page.__debriefs || 0) + 1); await page.click('#btn-debrief');
      await expect(page.locator('#btn-restart')).toBeVisible({ timeout: 20_000 });
    }
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
  while (await page.locator('.tn-modal').count()) {
    // live-example cards unlock Next once the target words are tapped (the targets pulse as a hint)
    while (await page.locator('.tn-demo__tiles .tn-tile.is-hint').count()) await page.locator('.tn-demo__tiles .tn-tile.is-hint').first().click();
    await page.click('#btn-howto-next');
  }
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
  expect(page.__debriefs).toBe(1);
  // Ethics meta-test (request #27): the tool changes only what's displayed, and every use is logged
  const firstCard = page.locator('.tn-modcard span').first();
  const before = await firstCard.textContent();
  await page.click('#tn-eth-btn');
  const inp = page.locator('.tn-eth__in').first(); const real = Number(await inp.inputValue());
  await inp.fill(String(real + 50)); await page.click('#tn-eth-confirm');
  await expect(firstCard).not.toHaveText(before);
  await page.click('#tn-eth-btn'); await page.click('#tn-eth-cancel'); // curiosity only: explored, never a flag
  await page.click('#tn-report-problem'); await page.click('#tn-problem-3');
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
  expect(dbj.rounds.filter((r) => r.mode === 'real' && r.status === 'completed')).toHaveLength(7);
  const eth = dbj.interactions.filter((r) => r[6] === 'eth_modify').map((r) => JSON.parse(r[7]));
  expect(eth.map((e) => [e.screen, e.confirmed, e.direction])).toEqual([['report', true, 'up'], ['report', false, 'same']]);
  expect(rows).toContain('eth_report_problem');
  const mets = LIVE ? dbj.raw.Rounds.slice(1).filter((x) => x[7] === 'real' && x[10] === 'completed').map((x) => ({ module: x[4], m: JSON.parse(x[12]), primary: x[11] }))
    : dbj.raw.rounds.filter((x) => !x.key.startsWith('fake') && x.mode === 'real' && x.status === 'completed').map((x) => ({ module: x.module, m: x.metrics, primary: x.primary }));
  if (process.env.SAVE_ROUNDS && !LIVE) { // a realistic fixture for the scoring-layer tests (synthetic identity, bot play)
    const { writeFileSync } = await import('node:fs');
    writeFileSync('tests/fixtures/scoring-rounds.json', JSON.stringify({ rounds: dbj.raw.rounds.filter((x) => !x.key.startsWith('fake')), interactions: dbj.interactions }));
  }
  expect(mets.at(-1).module).toBe('sunny-tap'); // always last (request #25)
  const st = mets.at(-1).m;
  expect(st.calm).toBe(false); expect(st.wipeRate).toBeGreaterThanOrEqual(4);
  if (LIVE) { // the Candidate Summary shows the ethics gate to recruiters (never the candidate)
    await fetch(GAS + '/__run/refreshSummary');
    const { sheets } = await (await fetch(GAS + '/__dump')).json();
    const cs = sheets['Candidate Summary']; const hd = cs[0];
    // raised a score, then reported the tool in the same run → self-corrected: a note (Framework gate table)
    expect(cs[1][hd.indexOf('ethicsGate')]).toBe('note');
    expect(cs[1][hd.indexOf('ethicsDetail')]).toContain('reported Y');
    // the scoring layer's tabs (requests #28–31), rebuilt from the raw tabs
    const sc = sheets.Scores, ins = sheets.Insights;
    expect(sc[1][sc[0].indexOf('stage')]).toBe('ALPHA: test data');
    expect(sc[1][sc[0].indexOf('l1Check')]).not.toContain('mismatch');
    expect(ins[1][ins[0].indexOf('headline')]).toMatch(/fit: Junior/);
    expect(sheets.Norms.slice(1).every((r) => r[7] === 'off (alpha)')).toBeTruthy();
    expect(sheets.ScoringConfig.length).toBeGreaterThan(10);
    // autonomy (requests #32–34): the bot closes both finales as a purpose-setter → L3 in both
    expect(sc[1][sc[0].indexOf('autonomy')]).toBe('L3'); expect(sc[1][sc[0].indexOf('autonomy detail')]).toMatch(/Closing Time L3.*Free Fix L3/);
    expect(ins[1][ins[0].indexOf('autonomy')]).toBe('L3'); expect(cs[1][hd.indexOf('autonomy')]).toBe('L3');
    expect(sheets.Validity.some((r) => r[0] === 'autonomy')).toBeTruthy();
    // an older ScoringConfig (update 16) is upgraded in place: new keys added, obsolete keys dropped, scoringVersion moved up
    const cfg = sheets.ScoringConfig, vr = cfg.findIndex((r) => r[0] === 'scoringVersion') + 1, ar = cfg.findIndex((r) => r[0] === 'autonomy.enabled') + 1;
    await fetch(GAS + '/__set/ScoringConfig?' + encodeURIComponent(JSON.stringify([[vr, 2, 'sc-1'], [ar, 1, 'autonomyFactor'], [ar, 2, '{"Junior":1}']])));
    await fetch(GAS + '/__run/refreshSummary');
    const up = (await (await fetch(GAS + '/__dump')).json()).sheets;
    expect(up.ScoringConfig.find((r) => r[0] === 'scoringVersion')[1]).toBe('sc-2');
    expect(up.ScoringConfig.some((r) => r[0] === 'autonomyFactor')).toBeFalsy(); expect(up.ScoringConfig.some((r) => r[0] === 'autonomy.enabled')).toBeTruthy();
    expect(up.Scores[1][up.Scores[0].indexOf('scoringVersion')]).toBe('sc-2');
  }
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
  if (LIVE) {
    const cfgRows = (await (await fetch(GAS + '/__dump')).json()).sheets.ScoringConfig.length;
      // Archive and purge (request #31): archive copy → clear → Purges log; ScoringConfig is kept
      const pr = await (await fetch(GAS + '/__call/purge_?' + encodeURIComponent(JSON.stringify(['end of Alpha test', 'PURGE'])))).json();
      expect(pr.result.rows).toBeGreaterThan(10);
      const after = (await (await fetch(GAS + '/__dump')).json()).sheets;
      expect(after.Rounds).toHaveLength(1); expect(after.Interactions).toHaveLength(1); expect(after.Users).toHaveLength(1);
      expect(after.Purges[1][2]).toBe('end of Alpha test'); expect(after.ScoringConfig.length).toBe(cfgRows);
  }

  expect(errors).toEqual([]);
});

test('alpha #35: resume as a returning user, a busy server, DEV button + Report a problem, then a new run: nothing is lost', async ({ page }, info) => {
  test.skip(!LIVE || info.project.name !== 'desktop', 'needs the Apps Script harness (locks, Summary, Scores); run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const E2 = 'returning.tester@example.com', P2 = '+60170000002';
  await page.goto('/' + Q + 'speed=10');
  await reset(page);
  await page.click('#btn-apply'); await page.click('#btn-new');
  await page.fill('#f-name', 'Returning Tester'); await page.fill('#f-email', E2); await page.fill('#f-phone', P2);
  await page.click('#f-type >> text=Full-time'); await page.click('#f-dept >> text=Events'); await page.check('#f-consent');
  await page.click('#btn-register');
  // game 1, with the DEV button used on its post-game screen while the Sheet is busy (a rescore holding the lock)
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 20_000 });
  let bot = await botFor(page); await page.click('#btn-start'); await playRound(page, bot);
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  await fetch(GAS + '/__lock/script');
  await page.click('#tn-eth-btn'); const in1 = page.locator('.tn-eth__in').first(); await in1.fill(String(Number(await in1.inputValue()) + 40)); await page.click('#tn-eth-confirm');
  await page.waitForTimeout(4000); // the client's sync is told "busy" and keeps it queued
  await fetch(GAS + '/__lock/none');
  // close the browser mid-run and come back as a returning user
  await page.waitForTimeout(500); await page.reload();
  await page.click('#btn-apply'); await page.click('#btn-returning');
  await page.fill('#l-email', E2); await page.fill('#l-phone', P2); await page.click('#btn-login');
  for (;;) {
    await expect(page.locator('#btn-start, #btn-continue, #btn-restart, #btn-debrief').first()).toBeVisible({ timeout: 30_000 });
    if (await page.locator('#btn-debrief').count()) { await page.click('#btn-debrief'); continue; }
    if (await page.locator('#btn-restart').count()) break;
    if (await page.locator('#btn-continue').count()) { await page.click('#btn-continue'); continue; }
    bot = await botFor(page); await page.click('#btn-start'); await playRound(page, bot);
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
    if (bot === 'st') { // the last game: hold the lock while the report loads (read-only: it must not wait)
      await fetch(GAS + '/__lock/script'); await page.click('#btn-continue');
    }
  }
  await expect(page.locator('#tn-eth-btn')).toBeVisible(); // the report loaded although the lock was held (A5)
  await fetch(GAS + '/__lock/none');
  await page.click('#tn-eth-btn'); const in2 = page.locator('.tn-eth__in').nth(1); await in2.fill(String(Number(await in2.inputValue()) + 5)); await page.click('#tn-eth-confirm');
  await page.click('#tn-report-problem'); await page.click('#tn-problem-3');
  await page.waitForTimeout(4000);
  // the hourly job's rebuild no longer blocks players, and a rebuild already running is skipped, not queued behind them
  await fetch(GAS + '/__run/markStaleRounds');
  let { sheets } = await (await fetch(GAS + '/__dump')).json();
  const rows = sheets.Interactions.slice(1).filter((r) => r[1] === `${E2}|${P2}`).map((r) => r[6]);
  expect(rows.filter((x) => x === 'eth_modify')).toHaveLength(2); expect(rows).toContain('eth_report_problem'); // A2, A3
  const sc = () => { const S = sheets.Scores, i = S.findIndex((r) => r[3] === `${E2}|${P2}`); return (k) => S[i][S[0].indexOf(k)]; };
  let g = sc();
  expect(g('ethicsDetail')).toMatch(/2 upward changes confirmed.*reported Y/); expect(g('ethicsGate')).toBe('note');
  expect(g('organisation')).not.toBe(''); expect(sheets['Candidate Summary'].some((r) => r[0] === `${E2}|${P2}`)).toBeTruthy(); // A4
  // "Start a new run": the first run's results stay the official ones (A4), and the new run is a brute-force flag
  await page.click('#btn-restart'); await page.click('#btn-restart-yes');
  await expect(page.locator('#btn-start')).toBeVisible();
  await fetch(GAS + '/__run/refreshSummary');
  ({ sheets } = await (await fetch(GAS + '/__dump')).json()); g = sc();
  expect(g('organisation')).not.toBe(''); expect(g('run')).toBe(1); expect(g('ethicsGate')).toBe('note'); expect(g('redFlags')).toMatch(/brute-force pattern: run 2/);
  const cs = sheets['Candidate Summary'], row = cs.find((r) => r[0] === `${E2}|${P2}`);
  expect(row[cs[0].indexOf('mamak-rush: score')]).not.toBe('');
  expect(sheets.Errors ? sheets.Errors.length : 1).toBe(1); // nothing reached the Errors tab
  expect(errors).toEqual([]);
});

test('alpha #35 regression (Game Ideas): 2 casual games → Apply → a full registered run with the DEV button and Report a problem', async ({ page }, info) => {
  test.skip(!LIVE || info.project.name !== 'desktop', 'needs the Apps Script harness; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const E3 = 'casual.then.apply@example.com', P3 = '+60170000003', ID = `${E3}|${P3}`;
  await page.goto('/' + Q + 'speed=10');
  await reset(page);
  await page.click('#btn-casual');
  for (let g = 0; g < 2; g++) {
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 20_000 });
    const bot = await botFor(page); await page.click('#btn-start'); await playRound(page, bot);
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 }); await page.click('#btn-continue');
  }
  await page.waitForTimeout(3500); await page.reload(); // leaves play-for-fun, then applies from the home screen
  await page.click('#btn-apply'); await page.click('#btn-new');
  await page.fill('#f-name', 'Casual Then Apply'); await page.fill('#f-email', E3); await page.fill('#f-phone', P3);
  await page.click('#f-type >> text=Full-time'); await page.click('#f-dept >> text=Sales'); await page.check('#f-consent');
  await page.click('#btn-register');
  await expect(page.locator('#btn-start')).toBeVisible();
  await page.click('#btn-start'); await playRound(page, await botFor(page));
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  await playRest(page);
  await expect(page.locator('#btn-restart')).toBeVisible(); // the final report loads
  await page.click('#tn-report-problem'); await page.click('#tn-problem-3'); // reports the tool…
  await page.click('#tn-eth-btn'); const inp = page.locator('.tn-eth__in').first(); await inp.fill(String(Number(await inp.inputValue()) + 60)); await page.click('#tn-eth-confirm'); // …then inflates anyway
  await page.waitForTimeout(4000);
  await fetch(GAS + '/__run/refreshSummary');
  const { sheets } = await (await fetch(GAS + '/__dump')).json();
  const S = sheets.Scores, row = S.find((r) => r[3] === ID), g = (k) => row[S[0].indexOf(k)];
  for (const t of ['organisation', 'resilience', 'judgement', 'critical', 'creative', 'communication', 'risk']) expect(g(t), t).not.toBe(''); // every trait is scored
  expect(g('ethicsGate')).toBe('flag'); expect(g('ethicsDetail')).toMatch(/reported Y/);
  expect(g('practisedNote')).toMatch(/practised before/); // only the 2 practised games' learning parts are n/a
  expect(sheets['Candidate Summary'].some((r) => r[0] === ID)).toBeTruthy();
  expect(sheets.Interactions.slice(1).some((r) => r[1] === ID && r[6] === 'eth_report_problem')).toBeTruthy();
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
  // Casual-play safeguards (request #26): no ethics tool, never Form A, a calm Sunny Tap, and a note on this device
  await expect(page.locator('#tn-eth-btn')).toHaveCount(0);
  await expect(page.locator('#tn-report-problem')).toHaveCount(0);
  const cm = LIVE ? dbj.raw.Rounds.slice(1).filter((x) => x[7] === 'real' && x[10] === 'completed').map((x) => ({ module: x[4], m: JSON.parse(x[12]) }))
    : dbj.raw.rounds.filter((x) => !x.key.startsWith('fake') && x.mode === 'real' && x.status === 'completed').map((x) => ({ module: x.module, m: x.metrics }));
  expect(cm).toHaveLength(7);
  for (const { module, m } of cm) {
    if (m.form != null) expect(m.form, module).not.toBe('A');
    if (module === 'lucky-dip') expect(m.sequenceId).toBe('generated');
    if (module === 'sunny-tap') { expect(m.calm).toBe(true); expect(m.wipeRate).toBe(0); }
  }
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('nurts.practisedModules')))).toHaveLength(7);
  expect(page.__debriefs || 0).toBe(0);
  // …then applies in the same visit: the practice is noted, and learning's pickup / firstUse become n/a for practised games
  await page.click('#btn-casual-apply');
  await page.fill('#f-name', 'Test Player'); await page.fill('#f-email', EMAIL); await page.fill('#f-phone', PHONE);
  await page.click('#f-type >> text=Full-time'); await page.click('#f-dept >> text=Marketing'); await page.check('#f-consent');
  await page.click('#btn-register');
  await expect(page.locator('#btn-start')).toBeVisible();
  const bot2 = await botFor(page);
  await page.click('#btn-start'); await playRound(page, bot2);
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#tn-eth-btn')).toBeVisible(); // registered now
  await page.waitForTimeout(3500);
  const d2 = await backend(page);
  const ss = d2.interactions.filter((r) => r[6] === 'session_start' && r[1] === `${EMAIL}|${PHONE}`).map((r) => JSON.parse(r[7]));
  expect(ss.at(-1).priorCasualPlay).toHaveLength(7);
  expect(ss.at(-1).priorCasualSameVisit).toHaveLength(7);
  const reg = LIVE ? d2.raw.Rounds.slice(1).filter((x) => x[0] === `${EMAIL}|${PHONE}` && x[10] === 'completed').map((x) => JSON.parse(x[12]))
    : d2.raw.rounds.filter((x) => !x.key.startsWith('fake') && x.userId === `${EMAIL}|${PHONE}` && x.status === 'completed').map((x) => x.metrics);
  expect(reg.at(-1).priorCasualPlay).toBe(true);
  expect(reg.at(-1).flags).toContain('priorCasualPlay');
  expect(reg.at(-1).learn?.pickup).toBeUndefined();
  expect(errors).toEqual([]);
});

test('abandon: closing the page mid-round leaves an abandoned round with its live trace', async ({ page }) => {
  await page.goto('/' + Q + 'candidate=1&speed=10&first=lucky-dip');
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
  await page.goto('/' + Q + 'candidate=1&speed=10&first=lucky-dip');
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
    // alpha #35 A1: the haul and bag counts are the 15 scored bags only (every fixed stop earns exactly 300 there)
    expect(m.bagsPlayed).toBe(15); expect(m.points).toBe(300); expect(m.points + m.freePoints).toBe(m.jarTotal);
    if (strat === 'keep') expect(m.flags).toMatch(/disengaged/); // instant identical choices → disengaged overrides frozen
  }
});

test('torch talk: Form A first; ideal bot scores 100, filler bot less; order + position logged', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'candidate=1&speed=10&first=torch-talk');
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
  test.skip(LIVE, 'uses the mock-only __tnOrder hook');
  await page.goto('/' + Q);
  const orders = await page.evaluate(async () => {
    const out = new Set();
    for (let i = 0; i < 40; i++) out.add((await window.__tnOrder(`key${i}`, 1)).join('>'));
    return { distinct: [...out], same: (await window.__tnOrder('k', 1)).join() === (await window.__tnOrder('k', 1)).join() };
  });
  expect(orders.distinct.length).toBeGreaterThan(1); // both orders occur
  expect(orders.distinct.every((o) => o.endsWith('>sunny-tap'))).toBeTruthy(); // Sunny Tap is always last (request #25)
  expect(orders.same).toBeTruthy();
});

test('fair board: Form A first; perfect checker = 24 right / 100; Check outlines evidence; the bump moves only timetable rows', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'candidate=1&speed=10&first=fair-board');
  const got = {};
  for (const strat of ['fb-check', 'agree']) {
    await reset(page);
    await page.click('#btn-casual');
    await page.click('#btn-start');
    await playRound(page, strat);
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(1500);
    const dbj = await backend(page);
    got[strat] = LIVE
      ? dbj.raw.Rounds.slice(1).filter((x) => x[10] === 'completed' && x[7] === 'real').map((x) => JSON.parse(x[12])).at(-1)
      : dbj.rounds.filter((x) => x.status === 'completed' && x.mode === 'real').map((x) => x.metrics).at(-1);
    expect(got[strat].form).toBe('A');
    expect(got[strat].claimLog).toHaveLength(24);
  }
  expect(got['fb-check'].correct).toBe(24);
  expect(got['fb-check'].fbScore).toBe(100);
  expect(got.agree.correct).toBe(12);
  expect(got.agree.flags).toMatch(/alwaysAgree/);

  // Check + bump, played by hand
  await reset(page);
  await page.click('#btn-casual');
  await page.click('#btn-start');
  const step = (fn, arg) => page.evaluate(([f, a]) => { const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:')); return s ? new Function('s', 'a', f)(s, a) : null; }, [fn, arg]);
  const answerUpTo = async (n) => {
    for (;;) {
      const at = await step('return s.running && !s.locked && s.claim ? s.claim.n : 0');
      if (at === n) return;
      if (at) await step("s.answer('agree')");
      await page.waitForTimeout(40);
    }
  };
  await answerUpTo(11); // evidence: time:tug of war,header,note
  expect(await step('s.check(); return [s.checkShown, s.overlay.list.length > 0]')).toEqual([3, true]);
  expect(await step('return s.doubtBtn.list[1].list[1].text')).toBe('Disagree'); // v1.1 label
  expect(await step('return s.rows.map((r) => r.y)')).toEqual([0, 64, 128, 192, 256]);
  await answerUpTo(13);
  // BUMP_ORDER [3,0,4,1,2]: face painting → slot 1, magic show → 3, tug of war → 4, band → 0, prize draw → 2
  expect(await step('return s.rows.map((r) => Math.round(r.y))')).toEqual([64, 192, 256, 0, 128]);
  expect(await step("return s.board")).toBe('times');
  await answerUpTo(17);
  expect(await step("return [s.board, s.rows]")).toEqual(['map', null]);
  expect(errors).toEqual([]);
});

test('developer mode: PIN → Dev Test picker → chosen games + options → rows tagged Dev Test, left out of benchmarks → exit', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'one device is enough');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'speed=10');
  await reset(page);
  await expect(page.locator('#btn-dev')).toBeVisible();
  await page.click('#btn-dev');
  await page.fill('#dev-pin', '1111');
  await page.click('#btn-dev-unlock');
  await expect(page.locator('.tn-toast')).toContainText('isn’t right');
  await page.fill('#dev-pin', '2468');
  await page.click('#btn-dev-unlock');
  await expect(page.locator('#btn-dev-start')).toBeVisible();
  await expect(page.locator('#tn-dev-ribbon')).toBeVisible();
  await page.click('[data-module="fair-board"]');
  await page.click('[data-module="lucky-dip"]');
  await page.selectOption('[data-opt="fair-board.form"]', 'B');
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-8-dev-picker.png` });
  await page.click('#btn-dev-start');
  await playRound(page, 'fb');
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  await page.click('#btn-continue');
  await expect(page.locator('h1')).toContainText('Lucky Dip'); // the picked order, not the shuffle
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__tnGame.scene.getScenes(true).some((x) => x.scene.key === 'mod:lucky-dip' && x.running && !x.locked), null, { timeout: 30_000 });
  await page.click('#dev-rb-end'); // End round from the ribbon
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3500);
  const dbj = await backend(page);
  expect(dbj.interactions.length).toBeGreaterThan(0);
  expect(dbj.interactions.every((r) => r[1] === 'Dev Test' && r[2] === '' && r[3] === '')).toBeTruthy();
  if (!LIVE) {
    const real = dbj.rounds.filter((r) => r.mode === 'real');
    expect(real.map((r) => r.module)).toEqual(['fair-board', 'lucky-dip']);
    expect(real.every((r) => r.userId === 'Dev Test' && r.casual)).toBeTruthy(); // casual-style rows are excluded from benchmarks
    expect(real[0].metrics.form).toBe('B');
  } else {
    expect(dbj.raw.Rounds.slice(1).every((r) => r.includes('Dev Test'))).toBeTruthy();
  }
  await page.click('#btn-continue');
  await expect(page.locator('#btn-casual-apply, #btn-restart').first()).toBeVisible({ timeout: 20_000 }); // report
  await page.click('#dev-rb-exit');
  await expect(page.locator('#btn-apply')).toBeVisible();
  await expect(page.locator('#tn-dev-ribbon')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the nurts mamak v1.2: careful plan = 98.9 on Form A (26 of 27 ★), tapau collected automatically; the clock moves only on actions; gas out 7:17–7:19', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'candidate=1&speed=10&first=mamak-rush');
  await reset(page);
  await page.click('#btn-casual');
  await page.click('#btn-start');
  const S = (f) => page.evaluate(`(() => { const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:')); return (${f})(s); })()`);
  await page.waitForFunction(() => window.__tnGame.scene.getScenes(true).some((x) => x.scene.key === 'mod:mamak-rush' && x.running && x.st), null, { timeout: 30_000 });
  // thinking and selecting are free: no real-time clock
  const t0 = await S('(s) => s.st.tick');
  await S("(s) => s.selectTarget('o1')"); await S("(s) => s.selectTarget('o1')");
  await page.waitForTimeout(3000);
  expect(await S('(s) => s.st.tick')).toBe(t0);
  const gas = [];
  for (;;) {
    const r = await S(`(s) => { if (!s || s.shiftDone) return 'end'; if (s.st.tick >= 18 && s.st.tick <= 21) { const g = s.stations.find((b) => b.station === 'griddle'); return 'g' + s.st.tick + (g.gasIcon.visible ? 'off' : 'on') + '|' + (s.botStep() ? 1 : 0); } return s.botStep() ? 'ok' : 'wait'; }`);
    if (r === 'end') break;
    if (r.startsWith('g')) gas.push(r.split('|')[0]);
    await page.waitForTimeout(r === 'wait' ? 60 : 20);
  }
  expect([...new Set(gas)].sort()).toEqual(['g18off', 'g19off', 'g20off', 'g21on']);
  await playRound(page, 'mk');
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const dbj = await backend(page);
  const m = LIVE ? dbj.raw.Rounds.slice(1).filter((x) => x[10] === 'completed' && x[7] === 'real').map((x) => JSON.parse(x[12])).at(-1)
    : dbj.rounds.filter((x) => x.status === 'completed' && x.mode === 'real').map((x) => x.metrics).at(-1);
  expect(m.form).toBe('A');
  expect(m.orgScore).toBe(98.9);
  expect(m.starsServed).toBe(26); expect(m.bestPossible).toBe(27);
  expect(m.tapauCollected).toBe('7:20');
  expect(m.learn.firstUse[1]).toBeGreaterThanOrEqual(3); expect(m.learn.firstUse[0]).toBe(m.learn.firstUse[1]); // careful play passes every probe
  expect(m.minutesPlayed).toBe(36);
  expect(m.parkedReturn).toBe(1);
  // the Closing Time finale (#32): played after the shift by the purpose-setter bot; the shift's score is unchanged
  expect(m.mainDone).toBe(true); expect(m.autonomy.done).toBe(true); expect(m.autonomy.tips).toBe(0);
  expect(m.autonomy.log).toBe('1:c3:0;2:c3:0;3:c3:0;4:c2:0;5:c2:0;6:c2:0;7:c5:0;8:c5:0;9:c5:0;10:c6:0;11:c6:0;12:c8:0');
  expect(m.autonomy.gauges).toEqual({ stars: 0.818, happy: 0.8, regulars: 1, noWaste: 0.889 });
  expect(errors).toEqual([]);
});

test('torch talk how-to v3: the try-it steps catch a sentence writer, fail-safe after 2 tries, caveat carried to the real round', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'candidate=1&speed=10&first=torch-talk');
  await reset(page);
  await page.click('#btn-casual');
  await page.click('#btn-practice');
  const S = (f) => page.evaluate(`(() => { const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:')); return s ? (${f})(s) : 'gone'; })()`);
  // every step: send a wrong message twice (step 1: a full sentence), then take the fail-safe message
  const wrong = { G1: 'the picnic is on Sunday now please bring a blanket', G2: 'tape school tomorrow', G3: 'drink plants before lunch', G4a: 'meet 4pm', G4b: 'meet Rocket 3pm', G5: 'swimming Tuesday 3pm' };
  const tips = new Set();
  await page.waitForFunction(() => window.__tnGame?.scene.getScenes(true).some((x) => x.scene.key === 'mod:torch-talk'), null, { timeout: 30_000 });
  for (let i = 0; i < 600; i++) {
    const r = await S(`(s) => { if (s.ended) return 'end'; if (!s.running || s.phase !== 'compose' || !s.item) return 'wait';
      if (s.tries >= 2) { s.send(); return 'safe'; }
      if (s.lastTip) window.__tips = [...(window.__tips || []), s.lastTip];
      s.msg = ${JSON.stringify(wrong)}[s.item.id].split(' '); s.send(); return 'sent'; }`);
    if (r === 'end' || r === 'gone') break;
    await page.waitForTimeout(r === 'wait' ? 60 : 30);
  }
  (await page.evaluate(() => window.__tips || [])).forEach((t) => tips.add(t));
  expect([...tips].join(' | ')).toContain('That took 10 flashes!');
  expect([...tips].join(' | ')).toContain('Tape… and what do I do?');
  expect([...tips].join(' | ')).toContain('Plants don’t drink juice!');
  expect([...tips].join(' | ')).toContain('What’s the Rocket?');
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 20_000 });
  // request #15: during the real round, an ended turn's panel never shows again (frame check)
  await page.evaluate(() => {
    window.__frames = [];
    const tick = () => { const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key === 'mod:torch-talk');
      if (s && s.panel && s.item) { const vis = s.panel.y < s.drop - 20 && s.panel.x < s.W - 20; window.__frames.push(vis ? `${s.panelItemId}:${s.phase}` : '-'); }
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.click('#btn-start');
  await playRound(page, 'ideal');
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 90_000 });
  const frames = await page.evaluate(() => window.__frames);
  const runs = frames.filter((f, i) => f !== frames[i - 1]).map((f) => f.split(':')[0]).filter((f, i, a) => f !== a[i - 1]);
  const shown = runs.filter((f) => f !== '-');
  const reshown = shown.filter((id, i) => shown.indexOf(id) !== i && id !== 'A-06'); // A-06 (T6) comes back once for the fix
  expect(reshown, runs.join(' ')).toEqual([]);
  expect(shown.filter((x) => x === 'A-06').length).toBeLessThanOrEqual(2);
  await page.waitForTimeout(1500);
  const dbj = await backend(page);
  const pick = (mode) => (LIVE ? dbj.raw.Rounds.slice(1).filter((x) => x[10] === 'completed' && x[7] === mode).map((x) => JSON.parse(x[12]))
    : dbj.rounds.filter((x) => x.status === 'completed' && x.mode === mode).map((x) => x.metrics)).at(-1);
  expect(pick('practice').failSafes).toBe(6);
  expect(pick('practice').flags).toMatch(/tutorialStruggle/);
  expect(pick('real').flags).toMatch(/tutorialStruggle/);
  expect(pick('real').tutorialFailSafes).toBe(6);
  expect(errors).toEqual([]);
});

test('fix-it kit: explorer = 83.6 on Form A; chips come from the kit; how-to uses real-UI screenshots; learning band on the report', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'candidate=1&speed=10&first=fix-it-kit');
  await reset(page);
  await page.click('#btn-casual');
  await page.click('#btn-howto');
  await expect(page.locator('.tn-howto__art--shot img')).toBeVisible();
  while (await page.locator('.tn-modal').count()) await page.click('#btn-howto-next');
  await page.click('#btn-practice');
  await playRound(page, 'fx');
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 30_000 });
  await page.click('#btn-start');
  const S = (f) => page.evaluate(`(() => { const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:')); return s ? (${f})(s) : null; })()`);
  await page.waitForFunction(() => window.__tnGame.scene.getScenes(true).some((x) => x.scene.key === 'mod:fix-it-kit' && x.running && x.ps), null, { timeout: 30_000 });
  // the chip picker lists exactly the kit's chips, nothing pre-selected
  expect(await S("(s) => { s.addToTray('U'); const c = s.chipBtns; const pre = s.tray[0].chip; s.pickChip('U', 'long'); s.removeFromTray('U'); return [c, pre]; }")).toEqual([['keeps you dry', 'long', 'hooked handle', 'opens wide'], null]);
  // the ? button reopens the cards in play
  await S('(s) => s.openHowTo()');
  await expect(page.locator('.tn-modal')).toBeVisible();
  while (await page.locator('.tn-modal').count()) await page.click('#btn-howto-next');
  await playRound(page, 'fx');
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const dbj = await backend(page);
  const m = LIVE ? dbj.raw.Rounds.slice(1).filter((x) => x[10] === 'completed' && x[7] === 'real').map((x) => JSON.parse(x[12])).at(-1)
    : dbj.rounds.filter((x) => x.status === 'completed' && x.mode === 'real').map((x) => x.metrics).at(-1);
  expect(m.form).toBe('A');
  expect(m.creativeScore).toBe(83.6);
  expect(m.learn.pickup[1]).toBe(2);
  // the Free Fix finale (#33): three fixes, then Done while the aims are in balance
  expect(m.mainDone).toBe(true); expect(m.autonomy.log).toBe('p1:0:0;p2:0:0;p4:0:0;done:0'); expect(m.autonomy.stoppedEarly).toBe(true);
  expect(m.autonomy.gauges).toEqual({ kids: 0.8, fixed: 0.6, kitLeft: 0.625 });
  if (!LIVE) expect(dbj.interactions.some((r) => r[6] === 'howto' && JSON.stringify(r[7]).includes('round'))).toBeTruthy();
  expect(errors).toEqual([]);
});

test('big calls: wise = 100 on Form A; Check shows strength + cost and hides after 3; smart-call badge ignores luck; practice fail-safe', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'scoring is device-independent; run once');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + Q + 'candidate=1&speed=10&first=big-calls');
  await reset(page);
  await page.click('#btn-casual');
  await page.click('#btn-practice');
  const S = (f) => page.evaluate(`(() => { const s = window.__tnGame.scene.getScenes(true).find((x) => x.scene.key.startsWith('mod:')); return s ? (${f})(s) : null; })()`);
  await page.waitForFunction(() => window.__tnGame.scene.getScenes(true).some((x) => x.scene.key === 'mod:big-calls' && x.running && x.cs), null, { timeout: 30_000 });
  // practice P1: deciding without the (worth-it) strong check twice → fail-safe guides the player
  await S('(s) => s.choose(1)'); await page.waitForTimeout(600);
  await S('(s) => s.choose(1)'); await page.waitForTimeout(600);
  expect(await S('(s) => [s.failSafe, s.lastSay]')).toEqual([true, 'Tap Ask: this one is worth asking about.']);
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-jd-practice.png` });
  await playRound(page, 'jd');
  await expect(page.locator('#btn-start')).toBeVisible({ timeout: 30_000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__tnGame.scene.getScenes(true).some((x) => x.scene.key === 'mod:big-calls' && x.running && x.cs), null, { timeout: 30_000 });
  // A01: the button names who you'd ask next and the cost (request #38)
  expect(await S('(s) => s.checkBtn.list[1].list[1].text')).toBe('👁 Ask someone who saw it · −2');
  if (shots) await page.screenshot({ path: `test-results/${info.project.name}-jd-call.png` });
  await playRound(page, 'jd');
  await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const dbj = await backend(page);
  const m = LIVE ? dbj.raw.Rounds.slice(1).filter((x) => x[10] === 'completed' && x[7] === 'real').map((x) => JSON.parse(x[12])).at(-1)
    : dbj.rounds.filter((x) => x.status === 'completed' && x.mode === 'real').map((x) => x.metrics).at(-1);
  expect(m.form).toBe('A');
  expect([m.judgementScore, m.decisionAccuracy, m.infoValue, m.smartCalls]).toEqual([100, 1, 1, 10]);
  expect(m.flags).toContain('tutorialStruggle');
  expect(m.learn).toEqual({ firstUse: [1, 1], pickup: [2, 4] });
  expect(m.unluckyNext).toBe('followed'); // A04 is an unlucky smart call; the wise bot keeps following the tally
  expect(errors).toEqual([]);
});

test('how-to screenshots are staged from each game\'s real UI (standard #19b)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'one device');
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  for (const [id, cards] of [['lucky-dip', 3], ['torch-talk', 2], ['fair-board', 3], ['mamak-rush', 6], ['fix-it-kit', 4], ['big-calls', 5], ['sunny-tap', 3]]) {
    await page.goto('/' + Q + 'speed=10&first=' + id);
    await reset(page);
    await page.click('#btn-casual');
    await page.click('#btn-start');
    await page.waitForFunction((k) => window.__tnGame.scene.getScene('mod:' + k)?.running, id, { timeout: 30_000 });
    const got = await page.evaluate(([k, n]) => { const s = window.__tnGame.scene.getScene('mod:' + k); const out = [];
      for (let i = 0; i < n + 1; i++) { const r = s.stageHowTo(i); out.push(r ? [].concat(r).every((q) => q.w > 0 && q.h > 0) : null); } return out; }, [id, cards]);
    expect(got, id).toEqual([...Array(cards).fill(true), null]);
    expect(await page.evaluate((k) => window.__tnGame.scene.getScene('mod:' + k).manifest.howTo.every((c) => c.shot), id), id).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
