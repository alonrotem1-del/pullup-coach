/*
 * Skill Progression Coach — workout duration calculator (pure, UMD, testable).
 *
 * Calculates workout duration from the actual template structure (sets, reps,
 * rest times, transitions) instead of using hardcoded values. Also exports
 * genSets (set generation from block definitions) so the UI and tests share
 * the same deterministic logic.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoachDuration = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEC_PER_REP = 4;
  var AMRAP_ESTIMATE_SECS = 60;
  var TRANSITION_SECS = 60;
  var WARMUP_SECS = 180;

  function genSets(block) {
    var out = [], i;
    if (block.scheme === 'sets') {
      for (i = 0; i < block.sets; i++) out.push({ target: block.reps, unit: 'reps', actual: block.reps });
    } else if (block.scheme === 'hold') {
      for (i = 0; i < block.sets; i++) out.push({ target: block.seconds, unit: 'sec', actual: block.seconds });
    } else if (block.scheme === 'ladder') {
      var seq = [1, 2, 3];
      for (i = 0; i < block.rounds; i++) out.push({ target: seq[i % 3], unit: 'reps', actual: seq[i % 3], label: 'Round ' + (i + 1) });
    } else if (block.scheme === 'pyramid') {
      var p = [1, 2, 3, 2, 1];
      for (i = 0; i < p.length; i++) out.push({ target: p[i], unit: 'reps', actual: p[i] });
    } else if (block.scheme === 'amrap') {
      out.push({ target: null, unit: 'reps', actual: 0, amrap: true });
    } else {
      for (i = 0; i < (block.sets || 3); i++) out.push({ target: block.reps || 5, unit: 'reps', actual: block.reps || 5 });
    }
    return out;
  }

  function restForType(type) {
    if (type === 'power' || type === 'integration') return 150;
    if (type === 'light') return 60;
    return 120;
  }

  function calcDuration(template) {
    if (!template.blocks || !template.blocks.length) return null;
    var totalSecs = WARMUP_SECS;
    var rest = restForType(template.type);
    for (var bi = 0; bi < template.blocks.length; bi++) {
      var sets = genSets(template.blocks[bi]);
      for (var si = 0; si < sets.length; si++) {
        var s = sets[si];
        if (s.unit === 'sec') totalSecs += s.target || 0;
        else if (s.amrap) totalSecs += AMRAP_ESTIMATE_SECS;
        else totalSecs += (s.target || 0) * SEC_PER_REP;
        var isLast = (bi === template.blocks.length - 1) && (si === sets.length - 1);
        if (!isLast) totalSecs += rest;
      }
      if (bi < template.blocks.length - 1) totalSecs += TRANSITION_SECS;
    }
    return Math.round(totalSecs / 60);
  }

  return {
    genSets: genSets,
    restForType: restForType,
    calcDuration: calcDuration,
    SEC_PER_REP: SEC_PER_REP,
    AMRAP_ESTIMATE_SECS: AMRAP_ESTIMATE_SECS,
    TRANSITION_SECS: TRANSITION_SECS,
    WARMUP_SECS: WARMUP_SECS
  };
});
