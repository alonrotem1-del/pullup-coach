// Skill-graph engine tests.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const G = require('../v2/graph.js');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'skills.json'), 'utf8'));

// Earned map from proposed statuses (what the review screen would confirm).
function proposedEarned() {
  const e = {};
  content.nodes.forEach(n => { if (n.proposed) e[n.id] = n.proposed.status; });
  return e;
}

test('AND prerequisites: pull.10 available because pull.8 is stabilizing (≥ first_success)', () => {
  const { statusById } = G.compute(content, proposedEarned());
  // pull.8 earned stabilizing → satisfies pull.10's prereq (needs first_success)
  expect(G.rank(statusById['pull.8'])).toBeGreaterThanOrEqual(G.rank('first_success'));
  // pull.10 earned in_progress, which outranks the available floor
  expect(statusById['pull.10']).toBe('in_progress');
});

test('locked when prerequisites unmet: exp.highpull-band needs c2b first_success', () => {
  const { statusById } = G.compute(content, proposedEarned());
  expect(statusById['exp.highpull-band']).toBe('locked'); // c2b only "available"
});

test('assessment unlock does not grant the skill: mu.first stays locked (prereqs unmet)', () => {
  const { statusById } = G.compute(content, proposedEarned());
  // high pull + dips prereqs unmet → mu.first locked despite OR-group existing
  expect(statusById['mu.first']).toBe('locked');
});

test('OR-group assessment unlock opens mu.first when a branch is satisfied', () => {
  const earned = proposedEarned();
  // Satisfy both hard prereqs and one assessment branch (band MU stabilizing).
  earned['exp.highpull'] = 'first_success';
  earned['push.dips'] = 'mastered';
  earned['mu.band'] = 'stabilizing';
  const { statusById } = G.compute(content, earned);
  expect(statusById['mu.first']).toBe('assessment_unlocked');
});

test('climb.v5 is readiness-only: never locked, no prerequisites', () => {
  const { statusById } = G.compute(content, proposedEarned());
  expect(statusById['climb.v5']).not.toBe('locked');
  const prereqIntoV5 = content.edges.filter(e => e.to === 'climb.v5' && e.type === 'prereq');
  expect(prereqIntoV5.length).toBe(0);
});

test('weighted split: prep assessment-unlocked at pull.8 stabilizing; programmed work still locked', () => {
  const { statusById } = G.compute(content, proposedEarned());
  expect(statusById['pull.weighted-prep']).toBe('assessment_unlocked'); // 7a satisfied
  expect(statusById['pull.weighted-first']).toBe('locked');             // needs pull.10 stabilizing
});

test('readiness score is an indicator aggregate in 0..100', () => {
  const { readinessByGoal } = G.compute(content, proposedEarned());
  const v5 = readinessByGoal['goal.v5'];
  expect(v5.indicatorOnly).toBe(true);
  expect(v5.score).toBeGreaterThanOrEqual(0);
  expect(v5.score).toBeLessThanOrEqual(100);
  expect(v5.contributors.length).toBeGreaterThan(0);
});

test('lesson evidence: a 10-rep max flips pull.10 to first_success and fires an unlock', () => {
  const earned = proposedEarned();
  earned['pull.10'] = null; // start unearned to observe the transition
  const r1 = G.applyLessonEvidence(content, earned, {}, 10, '2026-07-20T09:00:00Z');
  expect(r1.earnedById['pull.10']).toBe('first_success');
  expect(r1.newEvidence.some(e => e.nodeId === 'pull.10')).toBe(true);
  // Repeat to stabilizing then mastered.
  const r2 = G.applyLessonEvidence(content, r1.earnedById, r1.occurrencesById, 10, '2026-07-23T09:00:00Z');
  expect(r2.earnedById['pull.10']).toBe('stabilizing');
  const r3 = G.applyLessonEvidence(content, r2.earnedById, r2.occurrencesById, 10, '2026-07-26T09:00:00Z');
  expect(r3.earnedById['pull.10']).toBe('mastered');
});

test('manual/earned status outranks the gated floor (override wins)', () => {
  const earned = proposedEarned();
  // pull.active-hang is mastered by review even though it has an incoming prereq path start
  expect(G.compute(content, earned).statusById['pull.active-hang']).toBe('mastered');
});

test('stub node (hangboard) stays locked even when its prerequisite is met', () => {
  const earned = proposedEarned();
  earned['grip.deadhang'] = 'mastered'; // would otherwise open the assessment
  const { statusById } = G.compute(content, earned);
  expect(statusById['grip.hangboard-assess']).toBe('locked');
});

test('content integrity: every edge endpoint references a real node', () => {
  const ids = new Set(content.nodes.map(n => n.id));
  content.edges.forEach(e => {
    if (e.from != null) expect(ids.has(e.from), `from ${e.from}`).toBe(true);
    expect(ids.has(e.to), `to ${e.to}`).toBe(true);
  });
  expect(content.nodes.length).toBe(41);
});
