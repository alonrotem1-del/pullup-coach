// End-to-end smoke for the Skill Progression Coach Preview, plus the
// strictly-additive guarantees (spec §I.1 requirement B).
const { test, expect } = require('@playwright/test');

const LEGACY = {
  puc_log: [
    { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 1, reps: 5 },
    { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 2, reps: 4 },
    { id: 200, date: '2026-05-06T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 },
  ],
  puc_plan: { 0: 'rest', 3: 'strength' },
  puc_settings: { maxReps: 9 },
  puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
  puc_secondary: { skills: [{ id: 'ring-support', name: 'Ring Support Hold', unit: 'seconds', icon: '◎', frequency: 2, log: [{ date: '2026-05-10T10:00:00.000Z', value: 30 }] }] },
};

async function openPreview(page, withLegacy) {
  await page.goto('v2.html'); // base-relative → /pullup-coach/v2.html (matches production depth)
  await page.evaluate((legacy) => {
    localStorage.clear();
    if (legacy) Object.keys(legacy).forEach(k => localStorage.setItem(k, JSON.stringify(legacy[k])));
  }, withLegacy ? LEGACY : null);
  await page.reload();
}

test('boots under the GitHub Pages project base — skill content loads (no path escape)', async ({ page }) => {
  // Regression for the deployed "Could not load skill content" error: the app
  // must fetch content relative to its own page, not escape /pullup-coach/.
  await openPreview(page, true);
  await expect(page.locator('text=Could not load skill content')).toHaveCount(0);
  await expect(page.locator('text=Found your Pull-Up Coach data')).toBeVisible();
});

test('welcome → migration preview → reconciliation passes → review → home', async ({ page }) => {
  await openPreview(page, true);
  await expect(page.locator('text=Found your Pull-Up Coach data')).toBeVisible();
  await page.click('#btn-migrate');
  await expect(page.locator('text=Migration preview')).toBeVisible();
  await expect(page.locator('text=✅ Reconciliation passed')).toBeVisible();
  await page.click('#btn-confirm');
  await expect(page.locator('text=Review your starting statuses')).toBeVisible();
  await page.click('#btn-review-summary');
  await expect(page.locator('text=Final summary')).toBeVisible();
  await page.click('#btn-confirm-review');
  await expect(page.locator('text=First V5')).toBeVisible();
  await expect(page.locator('text=First Muscle-Up')).toBeVisible();
});

test('additive: puc_* is unchanged and only spc_* keys are written', async ({ page }) => {
  await openPreview(page, true);
  const before = await page.evaluate(() => JSON.stringify({
    puc_log: localStorage.getItem('puc_log'),
    puc_settings: localStorage.getItem('puc_settings'),
    puc_secondary: localStorage.getItem('puc_secondary'),
  }));
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  const after = await page.evaluate(() => JSON.stringify({
    puc_log: localStorage.getItem('puc_log'),
    puc_settings: localStorage.getItem('puc_settings'),
    puc_secondary: localStorage.getItem('puc_secondary'),
  }));
  expect(after).toBe(before); // legacy data byte-identical
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('spc_')).sort());
  expect(keys).toContain('spc_meta');
  expect(keys).toContain('spc_sessions');
  expect(keys).toContain('spc_state');
});

test('additive: the Preview registers no service worker', async ({ page }) => {
  await openPreview(page, true);
  const regs = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 0;
    const r = await navigator.serviceWorker.getRegistrations();
    return r.length;
  });
  expect(regs).toBe(0);
});

test('store guard throws if anything tries to write a puc_* key', async ({ page }) => {
  await openPreview(page, true);
  const threw = await page.evaluate(() => {
    try { window.SPCStore.set('puc_log', []); return false; } catch (e) { return /only write spc_/.test(e.message); }
  });
  expect(threw).toBe(true);
});

async function toHome(page) {
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  await expect(page.locator('text=First V5')).toBeVisible();
}

test('Home is a Weekly Coach: Today card with a primary CTA, compact Done/Left/Skip, slim goals', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await expect(page.locator('.today-card')).toBeVisible();
  await expect(page.locator('#tc-cta')).toBeVisible();           // one primary action
  // Unified Weekly progress section with a bar + done/left.
  await expect(page.locator('text=WEEKLY PROGRESS')).toBeVisible();
  await expect(page.locator('.wk-bar')).toBeVisible();
  await expect(page.locator('text=✅ Done')).toBeVisible();
  await expect(page.locator('text=🎯 Left')).toBeVisible();
  // Renamed section (no longer "Skip now").
  await expect(page.locator('text=⛔ Not recommended today')).toBeVisible();
  await expect(page.locator('text=⛔ Skip now')).toHaveCount(0);
  await expect(page.locator('.wk-line.skip')).toContainText('Max Test');
  await expect(page.locator('.wk-line.skip')).toContainText('Hangboard');
  // Order: Goals strip sits above the Today card.
  const goalsY = await page.locator('.goals-strip').first().boundingBox();
  const todayY = await page.locator('.today-card').boundingBox();
  expect(goalsY.y).toBeLessThan(todayY.y);
  await expect(page.locator('.goals-strip')).toContainText('First V5');
  await expect(page.locator('.goals-strip')).toContainText('First Muscle-Up');
  // Pyramid recommendation must never show a fixed sequence (adaptive).
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).not.toMatch(/5\s*,\s*4\s*,\s*3\s*,\s*2\s*,\s*1/);
});

test('guided map: goal switch, Now/Next zones, frozen Hangboard, node detail preserved', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#btn-map');
  await expect(page.locator('text=▶ NOW').first()).toBeVisible();
  // Frozen Hangboard is shown frozen, never as unlockable.
  await expect(page.locator('.frozen-row', { hasText: 'Hangboard Assessment' })).toBeVisible();
  // The "Next unlock" callout must never imply Hangboard becomes unlocked.
  const unlock = page.locator('.unlock-card');
  if (await unlock.count()) {
    await expect(unlock).not.toContainText('Hangboard');
    // Wording fixed: no unfinished "(to be defined)" criterion line.
    await expect(unlock).not.toContainText('to be defined');
    await expect(unlock).toContainText('Details inside the skill');
  }
  // NEXT is capped with a "Show more" control when there are many upcoming skills.
  const nextChips = page.locator('.zone-h', { hasText: 'NEXT' });
  if (await page.locator('#btn-next-more').count()) {
    const before = await page.locator('.chips .zn').count();
    await page.click('#btn-next-more');
    const after = await page.locator('.chips .zn').count();
    expect(after).toBeGreaterThan(before);   // more skills revealed
    await expect(page.locator('#btn-next-less')).toBeVisible();
  }
  await expect(page.locator('text=Foundation completed')).toBeVisible();
  // Switch to the other goal.
  await page.click('#btn-swap');
  await expect(page.locator('.topbar')).toContainText('First');
  // Node detail page is preserved (prereqs / unlocks / why). Reveal all NEXT
  // first so the target chip isn't hidden behind the "Show more" cap.
  if (await page.locator('#btn-next-more').count()) await page.click('#btn-next-more');
  await page.locator('.zn[data-node="exp.c2b"]').first().click();
  await expect(page.locator('h3', { hasText: 'Why this status' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'Prerequisites' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'What it unlocks' })).toBeVisible();
});

test('Muscle-Up map Now = active mainline (10 Pull-Ups), not assessment-ready Weighted-Prep', async ({ page }) => {
  // Seed 8,8,9 so pull.8 is mastered → Weighted-Prep becomes assessment-ready.
  const legacy = {
    puc_log: [
      { id: 1, date: '2026-05-02T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 8 },
      { id: 2, date: '2026-05-16T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 8 },
      { id: 3, date: '2026-06-20T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 },
    ],
    puc_plan: { 0: 'rest', 3: 'strength' }, puc_settings: { maxReps: 9 },
    puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
    puc_secondary: { skills: [] },
  };
  // Seed this specific dataset directly (openPreview only loads the default LEGACY).
  await page.goto('v2.html');
  await page.evaluate((l) => { localStorage.clear(); Object.keys(l).forEach(k => localStorage.setItem(k, JSON.stringify(l[k]))); }, legacy);
  await page.reload();
  await page.click('#btn-migrate'); await page.click('#btn-confirm');
  await page.click('#btn-review-summary'); await page.click('#btn-confirm-review');
  await page.click('#btn-map');
  // Ensure we're on the Muscle-Up map.
  if (!/Muscle-Up/.test(await page.locator('.brand').first().innerText())) await page.click('#btn-swap');
  const pullNow = page.locator('.now-row', { hasText: 'Pull Strength' });
  await expect(pullNow).toContainText('10 Pull-Ups');
  await expect(pullNow).not.toContainText('Weighted Pull-Up Preparation');
  // Weighted-Prep is demoted to the Next zone, not Now.
  const nowZone = page.locator('.now-row');
  await expect(nowZone.filter({ hasText: 'Weighted Pull-Up Preparation' })).toHaveCount(0);
});

test('climbing check-in records the session without inventing blank fields', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#qa-climb');
  await expect(page.locator('text=Climbing check-in')).toBeVisible();
  await page.click('#save-climb'); // save with defaults (grade V3, no limitation/pain)
  await expect(page.locator('.today-card')).toBeVisible();
  const climb = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).find(s => s.kind === 'climbing' && s.legacy && s.legacy.source === 'preview-live'));
  expect(climb).toBeTruthy();
  expect(climb.checkin.limitation).toBeNull(); // not fabricated
});

test('gym/group marker logs in two taps (type then intensity)', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#qa-gym');
  await page.click('#gt-opts .opt[data-v="push"]');
  await page.click('#gi-opts .opt[data-v="moderate"]'); // saves on intensity tap
  await expect(page.locator('.today-card')).toBeVisible();
  const gym = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).find(s => s.kind === 'gym'));
  expect(gym).toMatchObject({ gymType: 'push', intensity: 'moderate' });
});

test('completing a Max Test lesson updates skill status and shows an unlock moment', async ({ page }) => {
  await openPreview(page, true);
  // Fast path through migration + review.
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  // Start Max Test via the "start another lesson" expander.
  await page.click('#qa-lessons');
  await page.click('.lesson-btn[data-t="max_test"]');
  await page.click('#btn-log');            // warmup (default 2)
  await page.click('#btn-skip');           // skip warmup rest → max phase
  for (let i = 0; i < 10; i++) await page.click('#inc'); // 0 → 10
  await page.click('#btn-log');
  await expect(page.locator('text=Lesson complete')).toBeVisible();
  await page.click('#btn-save');
  await expect(page.locator('text=Skill update')).toBeVisible();
  // pull.10 should now be recorded as at least first_success in spc_state.
  const status = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_state')).statusById['pull.10']));
  expect(['first_success', 'stabilizing', 'mastered']).toContain(status);
});
