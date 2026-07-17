// Regression tests for the eight status/product-logic fixes raised in review.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const M = require('../v2/migrate.js');
const G = require('../v2/graph.js');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'skills.json'), 'utf8'));

function proposeFor(puc) { return M.proposeStates(content, puc).states; }
function base() {
  return { puc_log: [], puc_plan: {}, puc_settings: {}, puc_session: null, puc_progression: {}, puc_secondary: { skills: [] } };
}
function maxTestDay(date, reps) {
  return { id: date, date: date + 'T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: reps };
}

// Issue 4 — 8 Pull-Ups demonstrated 3× (8, 8, 9) → Mastered, from real data only.
test('8 Pull-Ups becomes mastered after three qualifying sessions (8,8,9)', () => {
  const puc = base();
  puc.puc_log = [maxTestDay('2026-05-01', 8), maxTestDay('2026-05-08', 8), maxTestDay('2026-05-15', 9)];
  const s = proposeFor(puc);
  expect(s['pull.8'].status).toBe('mastered');
  expect(s['pull.8'].review).toBe('preapproved');
  expect(s['pull.8'].bestValue).toBe(9);
  // 10 Pull-Ups was never demonstrated → no earned status asserted.
  expect(s['pull.10'].status).toBeNull();
  expect(s['pull.10'].review).toBe('confirm');
});

test('8 Pull-Ups is only first_success after a single qualifying session', () => {
  const puc = base();
  puc.puc_log = [maxTestDay('2026-05-01', 8)];
  const s = proposeFor(puc);
  expect(s['pull.8'].status).toBe('first_success');
  expect(s['pull.8'].review).toBe('confirm');
});

// Issue 2 — Scapular Pull-Up must NOT be mastered without logs.
test('Scapular Pull-Up is not mastered when no scapular logs exist', () => {
  const s = proposeFor(base());
  expect(s['pull.scap-pullup'].status).toBe('available');
  expect(s['pull.scap-pullup'].review).toBe('confirm');
  expect(s['pull.scap-pullup'].status).not.toBe('mastered');
});

// Issue 3 — Wrist Roller must NOT be in-progress without logs.
test('Wrist Roller is not in_progress when no wrist-roller logs exist', () => {
  const s = proposeFor(base());
  expect(s['grip.wrist-roller'].status).toBe('available');
  expect(s['grip.wrist-roller'].status).not.toBe('in_progress');
});

// Issue 1 — Ring Support PR reflects the real logged value, not a stale 39.
test('Ring Support PR comes from actual logs (30), never a hardcoded 39', () => {
  const puc = base();
  puc.puc_secondary = { skills: [{ id: 'ring-support', name: 'Ring Support Hold', unit: 'seconds', frequency: 2,
    log: [{ date: '2026-05-01T10:00:00.000Z', value: 25 }, { date: '2026-05-10T10:00:00.000Z', value: 30 }] }] };
  const s = proposeFor(puc);
  expect(s['push.ring-support'].bestValue).toBe(30);
  expect(String(s['push.ring-support'].evidence)).not.toContain('39');
  expect(String(s['push.ring-support'].evidence)).toContain('30');
});

test('secondary-log node with real logs keeps its informed status and gets a real PR', () => {
  const puc = base();
  puc.puc_secondary = { skills: [{ id: 'ring-support', name: 'Ring Support Hold', unit: 'seconds', frequency: 2,
    log: [{ date: '2026-05-10T10:00:00.000Z', value: 30 }] }] };
  const s = proposeFor(puc);
  expect(s['push.ring-support'].status).toBe('stabilizing'); // content-informed, logs present
});

// Issue 5 — Hangboard is frozen: locked in the proposed states AND after graph compute.
test('Hangboard Assessment is frozen-locked in proposal and stays locked in the graph', () => {
  const s = proposeFor(base());
  expect(s['grip.hangboard-assess'].status).toBe('locked');
  expect(s['grip.hangboard-assess'].frozen).toBe(true);
  expect(s['grip.hangboard-assess'].review).toBe('frozen');
  // Even with dead hang mastered (its prerequisite), compute keeps it locked.
  const earned = { 'grip.deadhang': 'mastered', 'grip.hangboard-assess': 'locked' };
  expect(G.compute(content, earned).statusById['grip.hangboard-assess']).toBe('locked');
});

// Issue 8 — readiness is branch-level; V5 has branches, MU (prereq-gated) has none.
test('readiness is exposed per contributing branch for V5', () => {
  const earned = {};
  content.nodes.forEach(n => { if (n.proposed && n.proposed.status) earned[n.id] = n.proposed.status; });
  const r = G.compute(content, earned).readinessByGoal;
  expect(r['goal.v5'].byBranch.length).toBeGreaterThan(0);
  r['goal.v5'].byBranch.forEach(b => {
    expect(['Not started', 'Building', 'On track', 'Ready']).toContain(b.label);
    expect(b.pips).toBeGreaterThanOrEqual(0);
    expect(b.pips).toBeLessThanOrEqual(4);
  });
  // First Muscle-Up target has no readiness edges → no branch readiness (it is prereq-gated).
  expect(r['goal.mu'].score).toBeNull();
  expect(r['goal.mu'].byBranch.length).toBe(0);
});

// Occurrence seed continuity: migration seeds occurrences so lessons build on history.
test('migration seeds lesson occurrences from real max-rep history', () => {
  const puc = base();
  puc.puc_log = [maxTestDay('2026-05-01', 8), maxTestDay('2026-05-08', 8), maxTestDay('2026-05-15', 9)];
  const { spc } = M.runMigration(puc, content);
  expect(spc.spc_progress_seed.occurrencesById['pull.8']).toBe(3);
  expect(spc.spc_progress_seed.occurrencesById['pull.10']).toBe(0);
});
