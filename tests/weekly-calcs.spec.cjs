// Characterization tests for weekly statistics, PB derivation, and
// anchor-day consistency logic.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => { await openApp(page); });

test('getWeekStats counts only working reps this week; skips/summaries excluded', async ({ page }) => {
  const out = await page.evaluate(() => {
    const now = new Date().toISOString();
    const lastWeek = new Date(Date.now() - 8 * 86400000).toISOString();
    DB.set('puc_log', [
      { id: 1, date: now, sessionType: 'strength', setType: 'working', setNumber: 1, reps: 5 },
      { id: 2, date: now, sessionType: 'strength', setType: 'working', setNumber: 2, reps: 4 },
      { id: 3, date: now, sessionType: 'strength', setType: 'summary', reps: 0 },
      { id: 4, date: now, sessionType: 'volume', setType: 'skip', reps: 0, skipReason: 'fatigue' },
      { id: 5, date: lastWeek, sessionType: 'volume', setType: 'working', setNumber: 1, reps: 3 },
    ]);
    const w = getWeekStats();
    return { totalReps: w.totalReps, sessions: w.sessions };
  });
  expect(out).toEqual({ totalReps: 9, sessions: 1 });
});

test('getPersonalBest derives PB from max_test max sets only', async ({ page }) => {
  const out = await page.evaluate(() => {
    const now = new Date().toISOString();
    DB.set('puc_log', [
      { id: 1, date: now, sessionType: 'max_test', setType: 'warmup', reps: 2 },
      { id: 2, date: now, sessionType: 'max_test', setType: 'max', reps: 8 },
      { id: 3, date: now, sessionType: 'max_test', setType: 'max', reps: 9 },
      { id: 4, date: now, sessionType: 'strength', setType: 'working', reps: 12 },
    ]);
    return getPersonalBest();
  });
  expect(out).toBe(9);
});

test('anchor consistency: done / today / upcoming / missed', async ({ page }) => {
  const out = await page.evaluate(() => {
    const today = new Date().getDay();
    const r = {};

    // scheduled today, completed today → done
    const plan = { 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' };
    plan[today] = 'strength';
    DB.setPlan(plan);
    DB.set('puc_log', [{ id: 1, date: new Date().toISOString(), sessionType: 'strength', setType: 'working', reps: 5 }]);
    r.done = getAnchorConsistency().pyramid;

    // scheduled today, no log → today
    DB.set('puc_log', []);
    r.today = getAnchorConsistency().pyramid;

    // scheduled on a future weekday → upcoming (only testable before Saturday)
    if (today < 6) {
      const plan2 = { ...plan };
      plan2[today] = 'rest';
      plan2[today + 1] = 'strength';
      DB.setPlan(plan2);
      r.upcoming = getAnchorConsistency().pyramid;
    }

    // scheduled on a past weekday, not done → missed + warning (only after Sunday)
    if (today > 0) {
      const plan3 = { 0: 'strength', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' };
      DB.setPlan(plan3);
      r.missed = getAnchorConsistency().pyramid;
      r.missedWarnings = getMissedAnchorWarnings().length;
    }
    return { ...r, today0to6: today };
  });
  expect(out.done).toBe('done');
  expect(out.today).toBe('today');
  if (out.today0to6 < 6) expect(out.upcoming).toBe('upcoming');
  if (out.today0to6 > 0) {
    expect(out.missed).toBe('missed');
    expect(out.missedWarnings).toBe(1);
  }
});

test('pain in the last 48h triggers the danger warning', async ({ page }) => {
  const out = await page.evaluate(() => {
    DB.set('puc_log', [{ id: 1, date: new Date().toISOString(), sessionType: 'strength', setType: 'summary', reps: 0, pain: true }]);
    const withPain = getOvertTrainingWarning('strength');
    DB.set('puc_log', [{ id: 1, date: new Date(Date.now() - 3 * 86400000).toISOString(), sessionType: 'strength', setType: 'summary', reps: 0, pain: true }]);
    const oldPain = getOvertTrainingWarning('strength');
    return { withPainLevel: withPain?.level ?? null, oldPain };
  });
  expect(out.withPainLevel).toBe('danger');
  expect(out.oldPain).toBeNull();
});
