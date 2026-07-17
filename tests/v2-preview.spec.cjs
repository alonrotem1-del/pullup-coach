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
  await page.goto('/v2.html');
  await page.evaluate((legacy) => {
    localStorage.clear();
    if (legacy) Object.keys(legacy).forEach(k => localStorage.setItem(k, JSON.stringify(legacy[k])));
  }, withLegacy ? LEGACY : null);
  await page.reload();
}

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

test('Home shows curated goal focus, not incidental nodes, and no false-precise % readiness', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  // V5 primary support structure (issue #6).
  await expect(page.locator('text=Finger Strength / Grip')).toBeVisible();
  await expect(page.locator('text=Explosive Pull').first()).toBeVisible();
  await expect(page.locator('text=High Step / Single-Leg Strength')).toBeVisible();
  await expect(page.locator('text=Technique / Route Reading / Fear')).toBeVisible();
  // Muscle-Up central branches (issue #7).
  await expect(page.locator('text=Dips / Straight-Bar Support')).toBeVisible();
  await expect(page.locator('text=Transition Practice')).toBeVisible();
  // No headline "NN%" readiness number anywhere on Home (issue #8).
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).not.toMatch(/\d+%/);
  // Branch-level readiness label present instead.
  await expect(page.locator('text=Readiness by area').first()).toBeVisible();
});

test('skill map node detail shows prerequisites, unlocks and a why-status explanation', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#btn-map');
  await expect(page.locator('text=🗺️ Skill Map')).toBeVisible();
  // Hangboard shows the frozen lock marker and stays Locked on the map (issue #5).
  await expect(page.locator('text=Hangboard Assessment 🔒')).toBeVisible();
  // The dependency cue is visible on downstream nodes ("needs: …").
  await expect(page.locator('.node-needs', { hasText: 'needs: Chest-to-Bar Pull-Up' }).first()).toBeVisible();
  // Open a specific node and verify the detail sections (issue #9).
  await page.locator('.node[data-node="exp.c2b"]').click();
  await expect(page.locator('h3', { hasText: 'Why this status' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'Prerequisites' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'What it unlocks' })).toBeVisible();
});

test('completing a Max Test lesson updates skill status and shows an unlock moment', async ({ page }) => {
  await openPreview(page, true);
  // Fast path through migration + review.
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  // Start Max Test, do warmup, skip rest, log a big max set.
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
