// The Preview lesson runner must match the root app's proven engine behavior.
const { test, expect } = require('@playwright/test');
const L = require('../v2/lesson-runner.js');

test('pyramid: adaptive next = actual − 1, done at 1', () => {
  let s = L.build('pyramid');
  expect(s.currentTarget).toBe(5);
  s = L.advance(s, { reps: 5 }); expect(s.currentTarget).toBe(4); expect(s.phase).toBe('resting');
  s = L.onTimerComplete(s);
  s = L.advance(s, { reps: 3 }); expect(s.currentTarget).toBe(2);
  s = L.onTimerComplete(s);
  s = L.advance(s, { reps: 1 }); expect(s.phase).toBe('complete');
  expect(s.sets.length).toBe(3);
});

test('ladder: 9 sets over 3 rounds, mini/round rests', () => {
  let s = L.build('ladder');
  const rests = [];
  let guard = 0;
  while (s.phase !== 'ladder_complete' && guard++ < 40) {
    const info = L.nextInfo(s);
    s = L.advance(s, { reps: info.targetReps });
    if (s.phase === 'resting') { rests.push(s.restType); s = L.onTimerComplete(s); }
  }
  expect(s.allSets.length).toBe(9);
  expect(rests.filter(r => r === 'round_rest').length).toBe(2);
});

test('light: break between sets, complete at end', () => {
  let s = L.build('light');
  const phases = [];
  for (const reps of s.targetSets.slice()) { s.phase = 'active'; s = L.advance(s, { reps }); phases.push(s.phase); }
  expect(phases).toEqual(['light_break', 'light_break', 'complete']);
});

test('max test: warmup → 180s rest → max → complete; evidence = max reps', () => {
  let s = L.build('max_test');
  s = L.advance(s, { reps: 2 });
  expect(s.restType).toBe('warmup_rest'); expect(s.timerTotal).toBe(180);
  s = L.onTimerComplete(s);
  expect(s.subPhase).toBe('max');
  s = L.advance(s, { reps: 9 });
  expect(s.phase).toBe('complete');
  expect(L.maxRepsInSets(s.sets)).toBe(9);
});

test('params are editable (custom pyramid top set / rest)', () => {
  const s = L.build('pyramid', { topSet: 6, restSeconds: 99 });
  expect(s.currentTarget).toBe(6);
  expect(L.restDuration(s, 'between_sets')).toBe(99);
});
