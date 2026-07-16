// Data Preservation Contract tests (§C3.3): export validation, counts,
// round-trip fidelity, tamper detection, reminder logic.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers.cjs');

// Known dataset with hand-computed expected counts.
function seedKnownData() {
  DB.set('puc_log', [
    { id: 1, date: '2026-07-01T07:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 1, reps: 5, pain: false, notes: 'felt strong' },
    { id: 2, date: '2026-07-01T07:03:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 2, reps: 4, pain: false },
    { id: 3, date: '2026-07-01T07:10:00.000Z', sessionType: 'strength', setType: 'summary', reps: 0, pain: false },
    { id: 4, date: '2026-07-03T09:00:00.000Z', sessionType: 'max_test', setType: 'max', setNumber: 1, reps: 9 },
    { id: 5, date: '2026-07-05T09:00:00.000Z', sessionType: 'volume', setType: 'skip', reps: 0, skipReason: 'pain', pain: true },
  ]);
  DB.setPlan({ 0: 'bouldering', 1: 'light', 2: 'light', 3: 'strength', 4: 'volume', 5: 'rest', 6: 'max_test' });
  const s = DB.getSettings(); s.maxReps = 9; DB.setSettings(s);
  DB.setProgression({ strength: { level: 1, easySessions: 1 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 }, suggestedWeighted: false });
  DB.set('puc_secondary', { skills: [
    { id: 'dips', name: 'Dips', unit: 'reps', icon: '⬇️', frequency: 1, log: [
      { date: '2026-06-20T10:00:00.000Z', value: 6 }, { date: '2026-07-02T10:00:00.000Z', value: 7 },
    ]},
    { id: 'custom-1', name: 'L-Sit', unit: 'seconds', icon: '⭐', frequency: 0, custom: true, log: [] },
  ]});
}

test.beforeEach(async ({ page }) => { await openApp(page); });

test('export counts are correct and validation passes against live storage', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    (${seedKnownData.toString()})();
    const exp = buildExportObject();
    const v = validateExportObject(exp, 'live');
    return { ok: v.ok, errors: v.errors, counts: exp.counts, format: exp.formatVersion };
  })()`);
  expect(out.ok).toBe(true);
  expect(out.format).toBe(1);
  expect(out.counts).toMatchObject({
    logEntries: 5,
    workingSets: 3,          // ids 1, 2, 4 (summary and skip excluded)
    totalReps: 18,           // 5 + 4 + 9
    sessionDays: 2,          // 2026-07-01 and 2026-07-03
    skippedSessions: 1,
    painEntries: 1,
    maxTestPB: 9,
    secondarySkills: 2,
    customSecondarySkills: 1,
    secondaryLogEntries: 2,
    secondaryPRs: { dips: 7 },
  });
  expect(out.counts.dateRange.first).toBe('2026-07-01T07:00:00.000Z');
  expect(out.counts.dateRange.last).toBe('2026-07-05T09:00:00.000Z');
});

test('round-trip: export → clear → import restores every key byte-identically', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    (${seedKnownData.toString()})();
    const exp = buildExportObject();
    const before = {};
    EXPORT_KEYS.forEach(k => { before[k] = localStorage.getItem(k); });
    localStorage.clear();
    const res = applyImportObject(JSON.parse(JSON.stringify(exp)));
    const after = {};
    EXPORT_KEYS.forEach(k => { after[k] = localStorage.getItem(k); });
    return { ok: res.ok, identical: JSON.stringify(before) === JSON.stringify(after) };
  })()`);
  expect(out.ok).toBe(true);
  expect(out.identical).toBe(true);
});

test('tampered counts block fails import validation and writes nothing', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    (${seedKnownData.toString()})();
    const exp = buildExportObject();
    exp.counts.totalReps += 1;
    localStorage.clear();
    const res = applyImportObject(exp);
    return { ok: res.ok, errors: res.errors, wroteAnything: EXPORT_KEYS.some(k => localStorage.getItem(k) !== null) };
  })()`);
  expect(out.ok).toBe(false);
  expect(out.errors.join(' ')).toContain('Counts block does not match');
  expect(out.wroteAnything).toBe(false);
});

test('export validation fails if live storage changed after building the export', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    (${seedKnownData.toString()})();
    const exp = buildExportObject();
    DB.addLog({ date: new Date().toISOString(), sessionType: 'light', setType: 'working', reps: 2 });
    const v = validateExportObject(exp, 'live');
    return { ok: v.ok, errors: v.errors };
  })()`);
  expect(out.ok).toBe(false);
  expect(out.errors.join(' ')).toContain('puc_log does not match live storage');
});

test('missing key and wrong app are rejected', async ({ page }) => {
  const out = await page.evaluate(`(() => {
    (${seedKnownData.toString()})();
    const exp = buildExportObject();
    delete exp.data.puc_plan;
    const missingKey = validateExportObject(exp, 'file');
    const wrongApp = validateExportObject({ app: 'other', formatVersion: 1, data: {}, counts: {} }, 'file');
    return { missingOk: missingKey.ok, missingErr: missingKey.errors.join(' '), wrongOk: wrongApp.ok };
  })()`);
  expect(out.missingOk).toBe(false);
  expect(out.missingErr).toContain('puc_plan');
  expect(out.wrongOk).toBe(false);
});

test('export reminder: shown when never exported (with data), cleared after export timestamp', async ({ page }) => {
  const out = await page.evaluate(() => {
    const r = {};
    r.noData = getExportReminder();
    DB.addLog({ date: new Date().toISOString(), sessionType: 'strength', setType: 'working', reps: 5 });
    r.neverExported = getExportReminder()?.text ?? null;
    const s = DB.getSettings(); s.lastExportAt = new Date().toISOString(); DB.setSettings(s);
    r.justExported = getExportReminder();
    const s2 = DB.getSettings(); s2.lastExportAt = new Date(Date.now() - 31 * 86400000).toISOString(); DB.setSettings(s2);
    r.stale = getExportReminder()?.text ?? null;
    return r;
  });
  expect(out.noData).toBeNull();
  expect(out.neverExported).toContain('never backed up');
  expect(out.justExported).toBeNull();
  expect(out.stale).toContain('31 days ago');
});
