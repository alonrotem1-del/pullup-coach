// End-to-end UI smoke: a full pyramid session through the real interface,
// plus the backup controls. Complements the engine-level characterization tests.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers.cjs');

test('full pyramid session via the UI: start → log sets → rest → complete → save', async ({ page }) => {
  await openApp(page);
  // Make today a Pyramid day, then re-render the dashboard.
  await page.evaluate(() => {
    const plan = {}; for (let i = 0; i < 7; i++) plan[i] = 'strength';
    DB.setPlan(plan);
    renderDashboard();
  });
  await page.click('text=▶ Start Session');
  await expect(page.locator('#pyramid-set-label')).toHaveText('Set 1 of 5');

  // Log set 1 at target (5 reps) → rest screen appears.
  await page.click('button:has-text("✓ Done")');
  await expect(page.locator('#timer-number')).toBeVisible();
  await page.click('text=Skip Rest');

  // Adjust set 2 down to 1 rep (four taps on −) → logging it ends the pyramid.
  await expect(page.locator('#pyramid-reps-display')).toHaveText('4');
  for (let i = 0; i < 3; i++) await page.click('button:has-text("−")');
  await expect(page.locator('#pyramid-reps-display')).toHaveText('1');
  await page.click('button:has-text("✓ Done")');

  await expect(page.locator('.complete-screen h2')).toHaveText('Session Complete!');
  await expect(page.locator('.complete-screen')).toContainText('6'); // 5 + 1 total reps
  await page.click('text=Save & Done');

  // Data landed in the log: 2 working sets + 1 summary.
  const log = await page.evaluate(() => DB.getLog());
  expect(log.filter(e => e.setType === 'working').map(e => e.reps)).toEqual([5, 1]);
  expect(log.filter(e => e.setType === 'summary').length).toBe(1);
});

test('settings modal exposes export and import controls', async ({ page }) => {
  await openApp(page);
  await page.click('button[title="Settings"]');
  await expect(page.locator('text=⬇ Export All Data (JSON)')).toBeVisible();
  await expect(page.locator('text=⬆ Import Backup…')).toBeVisible();
});

test('export button downloads a validated file whose counts match the data', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    DB.set('puc_log', [
      { id: 1, date: '2026-07-10T07:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 1, reps: 7 },
    ]);
  });
  page.on('dialog', d => d.accept());
  await page.click('button[title="Settings"]');
  const downloadPromise = page.waitForEvent('download');
  await page.click('text=⬇ Export All Data (JSON)');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pullup-coach-export-\d{4}-\d{2}-\d{2}\.json$/);
  const fs = require('fs');
  const filePath = await download.path();
  const exp = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  expect(exp.counts.totalReps).toBe(7);
  expect(exp.data.puc_log.length).toBe(1);
  // lastExportAt recorded → reminder cleared
  const reminder = await page.evaluate(() => getExportReminder());
  expect(reminder).toBeNull();
});
