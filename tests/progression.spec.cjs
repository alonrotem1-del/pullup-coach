// Characterization tests for progression-suggestion logic.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => { await openApp(page); });

test('two easy strength sessions → level-up suggestion; a hard session resets the counter', async ({ page }) => {
  const out = await page.evaluate(() => {
    markSessionEasy('strength', true);
    const afterOne = getProgressionSuggestions().filter(s => s.type === 'strength').length;
    markSessionEasy('strength', true);
    const afterTwo = getProgressionSuggestions().filter(s => s.type === 'strength').length;
    markSessionEasy('strength', false);
    const afterHard = getProgressionSuggestions().filter(s => s.type === 'strength').length;
    return { afterOne, afterTwo, afterHard, easyCount: DB.getProgression().strength.easySessions };
  });
  expect(out).toEqual({ afterOne: 0, afterTwo: 1, afterHard: 0, easyCount: 0 });
});

test('two easy volume sessions → add-a-round suggestion', async ({ page }) => {
  const out = await page.evaluate(() => {
    markSessionEasy('volume', true);
    markSessionEasy('volume', true);
    const s = getProgressionSuggestions().find(x => x.type === 'volume');
    return s ? s.msg : null;
  });
  expect(out).toContain('4 rounds');
});

test('max test of 10+ reps → weighted pull-up suggestion, dismissible once', async ({ page }) => {
  const out = await page.evaluate(() => {
    DB.set('puc_log', [{ id: 1, date: new Date().toISOString(), sessionType: 'max_test', setType: 'max', reps: 10 }]);
    const before = getProgressionSuggestions().filter(s => s.type === 'weighted').length;
    const p = DB.getProgression();
    p.suggestedWeighted = true;
    DB.setProgression(p);
    const after = getProgressionSuggestions().filter(s => s.type === 'weighted').length;
    return { before, after };
  });
  expect(out).toEqual({ before: 1, after: 0 });
});

test('performance drop detected after 3 declining sessions', async ({ page }) => {
  const out = await page.evaluate(() => {
    const d = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    DB.set('puc_log', [
      { id: 1, date: `${d(6)}T07:00:00.000Z`, sessionType: 'strength', setType: 'working', reps: 15 },
      { id: 2, date: `${d(4)}T07:00:00.000Z`, sessionType: 'strength', setType: 'working', reps: 12 },
      { id: 3, date: `${d(2)}T07:00:00.000Z`, sessionType: 'strength', setType: 'working', reps: 9 },
    ]);
    return checkPerformanceDrop();
  });
  expect(out).toBe(true);
});
