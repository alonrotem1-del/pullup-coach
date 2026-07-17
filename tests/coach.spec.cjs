// Weekly Coach engine tests (two-stage: gates → ranking).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const C = require('../v2/coach.js');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'skills.json'), 'utf8'));
const PLAN = { 0: 'bouldering', 1: 'light', 2: 'light', 3: 'strength', 4: 'volume', 5: 'rest', 6: 'max_test' };
const SUPPORT = [{ id: 'ring-support', nodeId: 'push.ring-support', name: 'Ring Support', icon: '◎', freq: 2 }];

// A Wednesday (plan = strength). Build dates relative to a known week.
function wed() { const d = new Date('2026-07-15T08:00:00'); /* 2026-07-15 is a Wednesday */ return d; }
function dayOffset(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d.toISOString(); }

test('anchor due on its plan day ranks first → Start Pyramid', () => {
  const now = wed();
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now,
    sessions: [ { kind: 'climbing', date: dayOffset(now, -3) }, { kind: 'lesson', sessionType: 'ladder', date: dayOffset(now, -2) } ] });
  expect(r.today.cta.action).toBe('start_lesson');
  expect(r.today.cta.arg).toBe('pyramid');
  expect(r.today.detail).toContain('Start target: 5');
  expect(r.today.detail).not.toContain('5, 4, 3, 2, 1'); // no fixed sequence
});

test('Pyramid card never shows a guaranteed fixed sequence', () => {
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now: wed(), sessions: [] });
  expect(JSON.stringify(r.today)).not.toMatch(/5\s*,\s*4\s*,\s*3\s*,\s*2\s*,\s*1/);
});

test('recent heavy pull gates further pulling → not a pulling recommendation', () => {
  const now = wed();
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now,
    sessions: [ { kind: 'lesson', sessionType: 'pyramid', date: dayOffset(now, 0) } ] }); // pulled today
  // Pulling lessons that remain (ladder/light) are gated out for recovery,
  // so today is never a fresh pulling recommendation.
  expect(r._debug.dropped).toContain('ladder');
  expect(r.today.cta.action).not.toBe('start_lesson');
});

test('activity-specific pain: elbow pain gates pulling but not legs/grip differently', () => {
  const elbow = C._painBlocksActivity({ active: true, area: 'elbow' }, { loads: ['elbow', 'shoulder'], isPull: true });
  const fingersOnPull = C._painBlocksActivity({ active: true, area: 'elbow' }, { loads: ['shoulder'], isPull: false });
  expect(elbow).toBe(true);
  expect(fingersOnPull).toBe(false); // shoulder-only support not blocked by elbow pain
});

test('finger pain gates grip work (dead hang) but not shoulder-only support', () => {
  expect(C._painBlocksActivity({ active: true, area: 'fingers' }, { loads: ['fingers', 'forearm', 'wrist'] })).toBe(true);
  expect(C._painBlocksActivity({ active: true, area: 'fingers' }, { loads: ['shoulder'] })).toBe(false);
});

test('legacy boolean pain (unknown area) gates only the in-progress activity type', () => {
  const pain = { active: true, area: 'unknown', sourceType: 'pyramid' };
  expect(C._painBlocksActivity(pain, { loads: ['elbow'], isPull: true })).toBe(true);   // pulling was the source
  expect(C._painBlocksActivity(pain, { loads: ['shoulder'], isPull: false })).toBe(false); // non-pull support ok
});

test('resolved pain override clears the gate', () => {
  const now = wed();
  const p = C._derivePain(C._summarize([{ kind: 'lesson', sessionType: 'pyramid', pain: true, painArea: 'elbow', date: dayOffset(now, -1) }], now), { resolved: true }, now);
  expect(p.active).toBe(false);
});

test('weekly targets come from the plan, not hard-coded ones', () => {
  const twoPyramid = { 0: 'strength', 1: 'strength', 2: 'rest', 3: 'volume', 4: 'rest', 5: 'rest', 6: 'rest' };
  const t = C._buildTargets(twoPyramid, SUPPORT, wed());
  expect(t.pyramid).toBe(2);
  expect(t.ladder).toBe(1);
  expect(t.climbing).toBe(0);
  expect(t.support['push.ring-support']).toBe(2);
});

test('climbing day recommends climbing, not pulling', () => {
  const sun = new Date('2026-07-12T08:00:00'); // Sunday = bouldering in PLAN
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now: sun, sessions: [] });
  expect(['log_climbing', 'climb_checkin']).toContain(r.today.cta.action);
});

test('rest day recommends recovery with a matching CTA', () => {
  const fri = new Date('2026-07-17T08:00:00'); // Friday = rest in PLAN
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now: fri,
    sessions: [ { kind: 'lesson', sessionType: 'pyramid', date: dayOffset(fri, -1) } ] });
  expect(r.today.cta.action).toBe('recovery');
});

test('skip-now always includes Max Test (manual only) and Hangboard (frozen); capped at 3', () => {
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now: wed(), sessions: [] });
  const labels = r.skipNow.map(s => s.label);
  expect(labels).toContain('Max Test');
  expect(labels).toContain('Hangboard');
  expect(r.skipNow.length).toBeLessThanOrEqual(3);
});

test('weekly progress counts only real targets — not Max Test / frozen / extra', () => {
  // Plan: 1 strength (pyramid), 1 volume (ladder), 1 bouldering (climb), 1 max_test.
  const plan = { 0: 'bouldering', 3: 'strength', 4: 'volume', 6: 'max_test' };
  const support = [{ id: 'ring-support', nodeId: 'push.ring-support', name: 'Ring Support', icon: '◎', freq: 2 }];
  const targets = C._buildTargets(plan, support, wed());
  // total required = pyramid1 + ladder1 + light0 + climb1 + ring2 = 5 (max_test excluded)
  const summary = C._summarize([
    { kind: 'lesson', sessionType: 'pyramid', date: dayOffset(wed(), -2) },
    { kind: 'climbing', date: dayOffset(wed(), -3) },
    { kind: 'lesson', sessionType: 'max_test', date: dayOffset(wed(), -1) }, // must NOT count
  ], wed());
  const p = C._weeklyProgress(targets, summary);
  expect(p.total).toBe(5);           // max_test not a target
  expect(p.done).toBe(2);            // pyramid + climb (max test ignored)
  expect(p.pct).toBe(40);
});

test('completed reflects the sessions logged this week', () => {
  const now = wed();
  const r = C.recommend({ content, plan: PLAN, supportTargets: SUPPORT, now,
    sessions: [ { kind: 'climbing', date: dayOffset(now, -3) }, { kind: 'lesson', sessionType: 'ladder', date: dayOffset(now, -2) },
                { kind: 'practice', nodeId: 'push.ring-support', date: dayOffset(now, -2) } ] });
  const labels = r.completed.map(c => c.label);
  expect(labels).toContain('Ladder');
  expect(labels).toContain('Climb');
});
