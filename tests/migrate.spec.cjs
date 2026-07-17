// Migration engine tests (Data Preservation Contract §C3).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const M = require('../v2/migrate.js');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'skills.json'), 'utf8'));

// Synthetic fixture with DUPLICATE legacy ids (same ms), summaries, a skip,
// a max test, secondary logs, and an unmapped custom skill.
function fixture() {
  return {
    puc_log: [
      { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 1, reps: 5 },
      { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 2, reps: 4 },
      { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 3, reps: 3 },
      { id: 101, date: '2026-05-04T12:05:00.000Z', sessionType: 'strength', setType: 'summary', reps: 0, pain: true, mystery: 'keepme' },
      { id: 200, date: '2026-05-06T09:00:00.000Z', sessionType: 'max_test', setType: 'warmup', reps: 2 },
      { id: 201, date: '2026-05-06T09:05:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 },
      { id: 300, date: '2026-05-08T18:00:00.000Z', sessionType: 'volume', setType: 'skip', reps: 0, skipReason: 'fatigue' },
    ],
    puc_plan: { 0: 'rest', 1: 'light', 2: 'light', 3: 'strength', 4: 'volume', 5: 'rest', 6: 'max_test' },
    puc_settings: { maxReps: 9 },
    puc_session: null,
    puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
    puc_secondary: { skills: [
      { id: 'ring-support', name: 'Ring Support Hold', unit: 'seconds', icon: '◎', frequency: 2, log: [
        { date: '2026-05-01T10:00:00.000Z', value: 25 }, { date: '2026-05-10T10:00:00.000Z', value: 30 },
      ]},
      { id: 'my-thing', name: 'Custom Thing', unit: 'reps', icon: '⭐', frequency: 1, custom: true, log: [
        { date: '2026-05-02T10:00:00.000Z', value: 12 },
      ]},
    ]},
  };
}

test('duplicate legacy ids are all preserved — nothing deduped', () => {
  const puc = fixture();
  const { spc } = M.runMigration(puc, content);
  const totalSets = spc.spc_sessions.reduce((a, s) => a + s.sets.length, 0);
  expect(totalSets).toBe(puc.puc_log.length); // all 7 entries kept
  // The three id=100 rows survive as three distinct sets with unique migIds.
  const migIds = spc.spc_sessions.flatMap(s => s.sets.map(x => x.migId));
  expect(new Set(migIds).size).toBe(migIds.length);
  const id100 = spc.spc_sessions.flatMap(s => s.sets).filter(x => x.legacyId === 100);
  expect(id100.length).toBe(3);
  expect(id100.map(x => x.reps)).toEqual([5, 4, 3]);
});

test('unknown legacy fields preserved in set.legacy', () => {
  const { spc } = M.runMigration(fixture(), content);
  const summarySet = spc.spc_sessions.flatMap(s => s.sets).find(x => x.setType === 'summary');
  expect(summarySet.legacy).toEqual({ mystery: 'keepme' });
});

test('complete legacy snapshot stored in spc_meta', () => {
  const puc = fixture();
  const { spc } = M.runMigration(puc, content);
  expect(spc.spc_meta.legacySnapshot).toEqual(puc);
});

test('reconciliation passes and matches legacy counts', () => {
  const { reconciliation, counts } = M.runMigration(fixture(), content);
  expect(reconciliation.ok).toBe(true);
  expect(counts.workingSets).toBe(5);   // 5,4,3 + warmup 2 + max 9 (warmup counts, matching legacy logic)
  expect(counts.totalReps).toBe(23);
  expect(counts.maxTestPB).toBe(9);
  reconciliation.checks.forEach(c => expect(c.ok).toBe(true));
});

test('skip entry becomes a kind:skip session with its reason', () => {
  const { spc } = M.runMigration(fixture(), content);
  const skip = spc.spc_sessions.find(s => s.kind === 'skip');
  expect(skip.skipReason).toBe('fatigue');
});

test('secondary logs become practice sessions; PR preserved; unmapped flagged', () => {
  const { spc, preview } = M.runMigration(fixture(), content);
  const ring = spc.spc_secondary_sessions.filter(r => r.legacySkillId === 'ring-support');
  expect(ring.length).toBe(2);
  expect(ring.map(r => r.nodeId)[0]).toBe('push.ring-support');
  expect(preview.secondaryPRs['ring-support']).toBe(30);
  expect(preview.unmapped.join(' ')).toContain('my-thing');
});

test('idempotent: re-running yields identical sessions (no duplication)', () => {
  const puc = fixture();
  const a = M.runMigration(puc, content).spc.spc_sessions;
  const b = M.runMigration(puc, content).spc.spc_sessions;
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(M.hashSnapshot(puc)).toBe(M.hashSnapshot(puc));
});

test('migration is pure — does not mutate the input puc object', () => {
  const puc = fixture();
  const snapshot = JSON.stringify(puc);
  M.runMigration(puc, content);
  expect(JSON.stringify(puc)).toBe(snapshot);
});

test('weekly totals reconcile per week', () => {
  const { counts, reconciliation } = M.runMigration(fixture(), content);
  const weekCheck = reconciliation.checks.find(c => c.name === 'weeklyTotals');
  expect(weekCheck.ok).toBe(true);
  expect(Object.keys(counts.weeklyTotals).length).toBeGreaterThan(0);
});

// Verified locally against the user's REAL export when present. The file is
// personal data and is NOT committed; the test skips if it is absent.
const REAL = process.env.REAL_EXPORT_PATH;
test('real export migrates and reconciles cleanly', () => {
  test.skip(!REAL || !fs.existsSync(REAL), 'real export not provided');
  const exp = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  const { reconciliation, counts, spc } = M.runMigration(exp.data, content);
  expect(counts.logEntries).toBe(175);
  expect(counts.workingSets).toBe(151);
  expect(counts.totalReps).toBe(373);
  expect(counts.maxTestPB).toBe(9);
  expect(reconciliation.ok).toBe(true);
  const totalSets = spc.spc_sessions.reduce((a, s) => a + s.sets.length, 0);
  expect(totalSets).toBe(175);
});
