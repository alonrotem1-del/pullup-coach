/*
 * Skill Progression Coach — dynamic workout adaptation (pure, UMD, testable).
 *
 * After each set, the athlete rates difficulty (Easy / Appropriate / Hard / Failed).
 * This module deterministically adjusts the next set's target and rest duration,
 * returns a plain-language explanation, and allows user override.
 *
 * Rules are intentionally simple and transparent:
 *   Easy       → +1 rep (or +5 sec), −15 sec rest
 *   Appropriate → no change
 *   Hard       → +30 sec rest
 *   Failed     → −1 rep (or −5 sec), +30 sec rest
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoachAdapt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EASY = 'easy';
  var APPROPRIATE = 'appropriate';
  var HARD = 'hard';
  var FAILED = 'failed';

  function adaptNext(difficulty, currentSet) {
    var isHold = currentSet && currentSet.unit === 'sec';
    if (difficulty === EASY) {
      return {
        targetDelta: isHold ? 5 : 1,
        restDelta: -15,
        explanation: isHold
          ? 'Felt easy — added 5 sec to hold, shortened rest by 15 sec.'
          : 'Felt easy — added 1 rep, shortened rest by 15 sec.'
      };
    }
    if (difficulty === APPROPRIATE) {
      return { targetDelta: 0, restDelta: 0, explanation: 'Right on target — no adjustment.' };
    }
    if (difficulty === HARD) {
      return { targetDelta: 0, restDelta: 30, explanation: 'That was hard — added 30 sec rest before next set.' };
    }
    if (difficulty === FAILED) {
      return {
        targetDelta: isHold ? -5 : -1,
        restDelta: 30,
        explanation: isHold
          ? 'Could not complete — reduced hold by 5 sec, added 30 sec rest.'
          : 'Could not complete — reduced next set by 1 rep, added 30 sec rest.'
      };
    }
    return { targetDelta: 0, restDelta: 0, explanation: '' };
  }

  function applyTargetDelta(target, delta, unit) {
    if (target == null) return target;
    var min = unit === 'sec' ? 5 : 1;
    return Math.max(min, target + delta);
  }

  function applyRestDelta(restSecs, delta) {
    return Math.max(15, restSecs + delta);
  }

  return {
    EASY: EASY, APPROPRIATE: APPROPRIATE, HARD: HARD, FAILED: FAILED,
    adaptNext: adaptNext,
    applyTargetDelta: applyTargetDelta,
    applyRestDelta: applyRestDelta
  };
});
