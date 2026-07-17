// Characterization tests for the session-runner state machine.
// These pin CURRENT behavior of the unmodified app; they must pass
// unchanged after any future restructuring.
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers.cjs');

test.beforeEach(async ({ page }) => { await openApp(page); });

test('strength (adaptive pyramid): first target from settings, next = actual reps − 1, done at 1', async ({ page }) => {
  const out = await page.evaluate(() => {
    let s = buildNewSession('strength');
    const r = { firstTarget: s.currentTarget, firstInfo: getNextSetInfo(s) };
    s = advanceSession(s, { reps: 5 });
    r.afterFive = { target: s.currentTarget, phase: s.phase, restType: s.restType };
    s = onTimerComplete(s);
    r.afterRest = { phase: s.phase, restType: s.restType };
    s = advanceSession(s, { reps: 3 }); // fewer than target → adaptive drop
    r.afterThree = { target: s.currentTarget, phase: s.phase };
    s = onTimerComplete(s);
    r.midInfo = getNextSetInfo(s);
    s = advanceSession(s, { reps: 1 }); // 1 rep ends the pyramid
    r.final = { phase: s.phase, setsLogged: s.sets.length };
    return r;
  });
  expect(out.firstTarget).toBe(5);
  expect(out.firstInfo).toMatchObject({ label: 'Set 1 of 5', targetReps: 5, totalSets: 5 });
  expect(out.afterFive).toEqual({ target: 4, phase: 'resting', restType: 'between_sets' });
  expect(out.afterRest).toEqual({ phase: 'active', restType: null });
  expect(out.afterThree).toEqual({ target: 2, phase: 'resting' });
  expect(out.midInfo).toMatchObject({ targetReps: 2, label: 'Set 3 of 4' });
  expect(out.final).toEqual({ phase: 'complete', setsLogged: 3 });
});

test('volume (ladder): steps, mini/round rests, ladder_complete after all rounds', async ({ page }) => {
  const out = await page.evaluate(() => {
    let s = buildNewSession('volume');
    const r = { ladder: s.ladder, rounds: s.totalRounds, transitions: [] };
    while (s.phase !== 'ladder_complete') {
      const info = getNextSetInfo(s);
      s = advanceSession(s, { reps: info.targetReps });
      r.transitions.push({ phase: s.phase, restType: s.restType, round: s.round, step: s.stepIndex });
      if (s.phase === 'resting') s = onTimerComplete(s);
      if (r.transitions.length > 30) break; // safety
    }
    r.totalSets = s.allSets.length;
    return r;
  });
  expect(out.ladder).toEqual([1, 2, 3]);
  expect(out.rounds).toBe(3);
  expect(out.transitions[0]).toMatchObject({ phase: 'resting', restType: 'mini_rest', round: 0, step: 1 });
  expect(out.transitions[2]).toMatchObject({ phase: 'resting', restType: 'round_rest', round: 1, step: 0 });
  expect(out.transitions[out.transitions.length - 1].phase).toBe('ladder_complete');
  expect(out.totalSets).toBe(9); // 3 steps × 3 rounds
});

test('light practice: light_break between mini-sets, complete after all', async ({ page }) => {
  const out = await page.evaluate(() => {
    let s = buildNewSession('light');
    const r = { targets: s.targetSets.slice(), phases: [] };
    for (const reps of s.targetSets) {
      s.phase = 'active';
      s = advanceSession(s, { reps });
      r.phases.push(s.phase);
    }
    return r;
  });
  expect(out.targets).toEqual([2, 2, 2]);
  expect(out.phases).toEqual(['light_break', 'light_break', 'complete']);
});

test('max test: warmup → 3min rest → max sub-phase → complete', async ({ page }) => {
  const out = await page.evaluate(() => {
    let s = buildNewSession('max_test');
    const r = { start: s.subPhase, warmupInfo: getNextSetInfo(s) };
    s = advanceSession(s, { reps: 2 });
    r.afterWarmup = { subPhase: s.subPhase, phase: s.phase, restType: s.restType, timerTotal: s.timerTotal };
    s = onTimerComplete(s);
    r.afterRest = { subPhase: s.subPhase, phase: s.phase };
    r.maxInfo = getNextSetInfo(s);
    s = advanceSession(s, { reps: 9 });
    r.final = s.phase;
    return r;
  });
  expect(out.start).toBe('warmup');
  expect(out.warmupInfo).toMatchObject({ targetReps: 2, isWarmup: true });
  expect(out.afterWarmup).toMatchObject({ subPhase: 'resting_before_max', phase: 'resting', restType: 'warmup_rest', timerTotal: 180 });
  expect(out.afterRest).toEqual({ subPhase: 'max', phase: 'active' });
  expect(out.maxInfo).toMatchObject({ isMax: true });
  expect(out.final).toBe('complete');
});

test('rest durations come from editable settings', async ({ page }) => {
  const out = await page.evaluate(() => {
    const s = DB.getSettings();
    s.pyramid.restSeconds = 99;
    s.ladder.miniRestSeconds = 11;
    s.ladder.roundRestSeconds = 222;
    DB.setSettings(s);
    return {
      strength: getRestDuration('strength', 'between_sets'),
      mini: getRestDuration('volume', 'mini_rest'),
      round: getRestDuration('volume', 'round_rest'),
      warmup: getRestDuration('max_test', 'warmup_rest'),
    };
  });
  expect(out).toEqual({ strength: 99, mini: 11, round: 222, warmup: 180 });
});
