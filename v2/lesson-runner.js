/*
 * Lesson runner for the Preview — a self-contained port of the proven
 * Pull-Up Coach session state machine, driven by lesson-template params
 * instead of puc_settings. Behavior is pinned to match the root app's
 * engine (see tests/lesson-runner.spec.cjs). Pure/UMD; no DOM, no storage.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SPCLesson = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Default params per lesson template — editable data, mirrors legacy defaults.
  var DEFAULTS = {
    pyramid:  { topSet: 5, restSeconds: 150 },
    ladder:   { maxRung: 3, rounds: 3, miniRestSeconds: 25, roundRestSeconds: 150 },
    light:    { repsPerSet: 2, setsPerDay: 3 },
    max_test: { warmupReps: 2, warmupRest: 180 }
  };

  function strengthSets(topSet) {
    return Array.from({ length: topSet }, function (_, i) { return topSet - i; });
  }
  function ladderRungs(maxRung) {
    return Array.from({ length: maxRung }, function (_, i) { return i + 1; });
  }

  function build(templateId, paramsIn) {
    var p = Object.assign({}, DEFAULTS[templateId], paramsIn || {});
    var s = { templateId: templateId, params: p, phase: 'active', sets: [], startTime: new Date().toISOString(), timerTotal: 0, restType: null };
    if (templateId === 'pyramid') { s.setIndex = 0; s.currentTarget = strengthSets(p.topSet)[0]; }
    else if (templateId === 'ladder') { s.round = 0; s.stepIndex = 0; s.ladder = ladderRungs(p.maxRung); s.totalRounds = p.rounds; s.allSets = []; }
    else if (templateId === 'light') { s.setIndex = 0; s.targetSets = Array(p.setsPerDay).fill(p.repsPerSet); }
    else if (templateId === 'max_test') { s.subPhase = 'warmup'; }
    return s;
  }

  function nextInfo(s) {
    if (s.templateId === 'pyramid') {
      var total = s.setIndex + s.currentTarget;
      return { label: 'Set ' + (s.setIndex + 1) + ' of ' + total, targetReps: s.currentTarget, totalSets: total };
    }
    if (s.templateId === 'light') {
      if (s.setIndex >= s.targetSets.length) return null;
      return { label: 'Set ' + (s.setIndex + 1) + ' of ' + s.targetSets.length, targetReps: s.targetSets[s.setIndex], totalSets: s.targetSets.length };
    }
    if (s.templateId === 'ladder') {
      var reps = s.ladder[s.stepIndex];
      return { label: 'Round ' + (s.round + 1) + '/' + s.totalRounds + ' • ' + reps + ' reps', targetReps: reps, round: s.round + 1, totalRounds: s.totalRounds };
    }
    if (s.templateId === 'max_test') {
      if (s.subPhase === 'warmup') return { label: 'Warmup', targetReps: s.params.warmupReps, isWarmup: true };
      if (s.subPhase === 'max') return { label: 'MAX SET', targetReps: '?', isMax: true };
    }
    return null;
  }

  function restDuration(s, phaseType) {
    if (s.templateId === 'pyramid') return s.params.restSeconds;
    if (s.templateId === 'ladder') return phaseType === 'mini_rest' ? s.params.miniRestSeconds : s.params.roundRestSeconds;
    if (s.templateId === 'max_test') return s.params.warmupRest;
    return 150;
  }

  function advance(s, entry) {
    s.sets.push(entry);
    function rest(type, dur) { s.phase = 'resting'; s.restType = type; s.timerTotal = dur; s.timerEnd = new Date(Date.now() + dur * 1000).toISOString(); }
    if (s.templateId === 'pyramid') {
      s.setIndex++;
      if (entry.reps <= 1) s.phase = 'complete';
      else { s.currentTarget = entry.reps - 1; rest('between_sets', restDuration(s, 'between_sets')); }
    } else if (s.templateId === 'light') {
      s.setIndex++;
      s.phase = s.setIndex >= s.targetSets.length ? 'complete' : 'light_break';
    } else if (s.templateId === 'ladder') {
      s.allSets.push(entry); s.stepIndex++;
      if (s.stepIndex >= s.ladder.length) {
        s.stepIndex = 0; s.round++;
        if (s.round >= s.totalRounds) s.phase = 'ladder_complete';
        else rest('round_rest', restDuration(s, 'round_rest'));
      } else rest('mini_rest', restDuration(s, 'mini_rest'));
    } else if (s.templateId === 'max_test') {
      if (s.subPhase === 'warmup') { s.subPhase = 'resting_before_max'; rest('warmup_rest', restDuration(s, 'warmup_rest')); }
      else if (s.subPhase === 'max') s.phase = 'complete';
    }
    return s;
  }

  function onTimerComplete(s) {
    if (s.restType === 'warmup_rest') s.subPhase = 'max';
    s.phase = 'active'; s.timerEnd = null; s.restType = null;
    return s;
  }

  function maxRepsInSets(sets) {
    return sets.reduce(function (m, e) { return Math.max(m, e.reps || 0); }, 0);
  }

  return {
    DEFAULTS: DEFAULTS, strengthSets: strengthSets, ladderRungs: ladderRungs,
    build: build, nextInfo: nextInfo, advance: advance, onTimerComplete: onTimerComplete,
    restDuration: restDuration, maxRepsInSets: maxRepsInSets
  };
});
