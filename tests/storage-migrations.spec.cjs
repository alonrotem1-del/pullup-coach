// Characterization tests for the existing ad-hoc read-time storage migrations.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => { await openApp(page); });

test('in-flight strength session migrates old targetSets schema to adaptive currentTarget', async ({ page }) => {
  const out = await page.evaluate(() => {
    localStorage.setItem('puc_session', JSON.stringify({
      type: 'strength', phase: 'active', sets: [], targetSets: [5, 4, 3, 2, 1], setIndex: 2,
    }));
    const s = DB.getSession();
    const persisted = JSON.parse(localStorage.getItem('puc_session'));
    return { migrated: s.currentTarget, persisted: persisted.currentTarget };
  });
  expect(out.migrated).toBe(3);
  expect(out.persisted).toBe(3); // migration is written back
});

test('stale ring-support icon migrates from 💍 to ◎', async ({ page }) => {
  const out = await page.evaluate(() => {
    localStorage.setItem('puc_secondary', JSON.stringify({
      skills: [{ id: 'ring-support', name: 'Ring Support Hold', icon: '💍', unit: 'seconds', frequency: 2, log: [] }],
    }));
    return DB.getSecondary().skills[0].icon;
  });
  expect(out).toBe('◎');
});

test('settings merge over defaults (missing fields fall back)', async ({ page }) => {
  const out = await page.evaluate(() => {
    localStorage.setItem('puc_settings', JSON.stringify({ maxReps: 9 }));
    const s = DB.getSettings();
    return { maxReps: s.maxReps, sound: s.soundEnabled, topSet: s.pyramid.topSet };
  });
  expect(out).toEqual({ maxReps: 9, sound: true, topSet: 5 });
});
