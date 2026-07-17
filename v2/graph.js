/*
 * Skill Progression Coach — skill-graph engine (pure, UMD).
 * Status derivation, prerequisite gating, assessment unlocks, readiness.
 * No DOM, no storage.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SPCGraph = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RANKS = ['locked', 'available', 'in_progress', 'assessment_unlocked', 'first_success', 'stabilizing', 'mastered'];
  function rank(s) { var i = RANKS.indexOf(s); return i < 0 ? -1 : i; }
  function higher(a, b) { return rank(a) >= rank(b) ? a : b; }

  function activeEdges(content) {
    return content.edges.filter(function (e) { return !e.inactive && e.from != null; });
  }

  // Does a single edge's source satisfy its requiredStatus?
  function edgeSatisfied(edge, statusById) {
    if (!edge.requiredStatus) return false;
    var src = statusById[edge.from];
    return rank(src) >= rank(edge.requiredStatus);
  }

  // Compute displayed status for every node from earned statuses (review +
  // evidence) and prerequisite gating.
  //   earnedById: { nodeId: status }  — from review confirmation / evidence
  // Returns { statusById, unlocks: [{nodeId, via}], readinessByGoal }
  function compute(content, earnedById) {
    var edges = activeEdges(content);
    var earned = {};
    content.nodes.forEach(function (n) { earned[n.id] = earnedById[n.id] || null; });

    // Iterate to a fixed point: a node becoming available/earned can satisfy
    // downstream prerequisites.
    var statusById = {};
    content.nodes.forEach(function (n) { statusById[n.id] = earned[n.id] || 'locked'; });

    var prereqEdges = edges.filter(function (e) { return e.type === 'prereq'; });
    var assessEdges = edges.filter(function (e) { return e.type === 'unlock:assessment'; });
    var unlocks = [];

    for (var iter = 0; iter < content.nodes.length + 2; iter++) {
      var changed = false;
      content.nodes.forEach(function (node) {
        if (node.stub) { // e.g. hangboard: frozen placeholder, never opens until content is defined
          if (statusById[node.id] !== 'locked') { statusById[node.id] = 'locked'; changed = true; }
          return;
        }
        if (node.readinessOnly) { // e.g. climb.v5: never gated by prereqs
          var e0 = earned[node.id] || 'in_progress';
          if (statusById[node.id] !== higher(statusById[node.id], e0)) { statusById[node.id] = higher(statusById[node.id], e0); changed = true; }
          return;
        }
        // Prerequisite gating with OR-group support.
        var incoming = prereqEdges.filter(function (e) { return e.to === node.id; });
        var groups = {}; var singles = [];
        incoming.forEach(function (e) {
          if (e.orGroup) { (groups[e.orGroup] = groups[e.orGroup] || []).push(e); }
          else singles.push(e);
        });
        var prereqsMet = singles.every(function (e) { return edgeSatisfied(e, statusById); })
          && Object.keys(groups).every(function (g) {
            return groups[g].some(function (e) { return edgeSatisfied(e, statusById); });
          });
        var base = incoming.length === 0 ? 'available' : (prereqsMet ? 'available' : 'locked');

        // Assessment unlock (does not grant the skill, only opens the attempt).
        var aIncoming = assessEdges.filter(function (e) { return e.to === node.id; });
        var aGroups = {}; var aSingles = [];
        aIncoming.forEach(function (e) { if (e.orGroup) (aGroups[e.orGroup] = aGroups[e.orGroup] || []).push(e); else aSingles.push(e); });
        var assessMet = aIncoming.length > 0 && (
          aSingles.some(function (e) { return edgeSatisfied(e, statusById); }) ||
          Object.keys(aGroups).some(function (g) { return aGroups[g].some(function (e) { return edgeSatisfied(e, statusById); }); })
        );
        if (assessMet) base = higher(base, 'assessment_unlocked');

        var next = higher(base, earned[node.id] || 'locked');
        if (next !== statusById[node.id]) { statusById[node.id] = next; changed = true; }
      });
      if (!changed) break;
    }

    // Record which nodes are "newly opened" (available or assessment_unlocked
    // but not yet earned) — used for unlock moments.
    content.nodes.forEach(function (node) {
      var earnedRank = rank(earned[node.id] || 'locked');
      if (statusById[node.id] === 'assessment_unlocked' && earnedRank < rank('assessment_unlocked')) {
        unlocks.push({ nodeId: node.id, via: 'assessment' });
      } else if (statusById[node.id] === 'available' && earnedRank <= rank('locked')) {
        unlocks.push({ nodeId: node.id, via: 'available' });
      }
    });

    var readinessByGoal = computeReadiness(content, statusById);
    return { statusById: statusById, unlocks: unlocks, readinessByGoal: readinessByGoal };
  }

  // Readiness is an INDICATOR aggregate, never a guarantee. The UI shows it at
  // branch level (coarse label per contributing branch) rather than as a single
  // precise percentage from arbitrary weights (issue #8). `score` is retained
  // for internal/testing use only and is not surfaced as a headline number.
  function coarseLabel(avg) {
    if (avg <= 0) return 'Not started';
    if (avg < 0.5) return 'Building';
    if (avg < 1) return 'On track';
    return 'Ready';
  }
  function coarsePips(avg) { // 0..4 filled segments — deliberately low-resolution
    if (avg <= 0) return 0;
    if (avg < 0.34) return 1;
    if (avg < 0.67) return 2;
    if (avg < 1) return 3;
    return 4;
  }
  function computeReadiness(content, statusById) {
    var out = {};
    var branchName = {};
    content.branches.forEach(function (b) { branchName[b.id] = b.icon + ' ' + b.name; });
    var nodeBranch = {};
    content.nodes.forEach(function (n) { nodeBranch[n.id] = n.branch; });
    content.goals.forEach(function (goal) {
      var rEdges = content.edges.filter(function (e) {
        return e.type === 'readiness' && e.to === goal.targetNodeId && !e.inactive && e.from != null;
      });
      if (!rEdges.length) { out[goal.id] = { score: null, contributors: [], byBranch: [], indicatorOnly: true }; return; }
      var contributors = rEdges.map(function (e) {
        var need = e.requiredStatus ? rank(e.requiredStatus) : rank('first_success');
        var have = rank(statusById[e.from]);
        var sat = need <= 0 ? (have > 0 ? 1 : 0) : Math.max(0, Math.min(1, have / need));
        return { from: e.from, branch: nodeBranch[e.from], satisfied: sat,
                 requiredStatus: e.requiredStatus, currentStatus: statusById[e.from], confidence: e.confidence };
      });
      var score = Math.round(contributors.reduce(function (a, c) { return a + c.satisfied; }, 0) / contributors.length * 100);
      var groups = {};
      contributors.forEach(function (c) { (groups[c.branch] = groups[c.branch] || []).push(c); });
      var byBranch = Object.keys(groups).map(function (bid) {
        var cs = groups[bid];
        var avg = cs.reduce(function (a, c) { return a + c.satisfied; }, 0) / cs.length;
        return { branchId: bid, branchName: branchName[bid], avg: avg,
                 label: coarseLabel(avg), pips: coarsePips(avg), contributors: cs };
      });
      out[goal.id] = { score: score, contributors: contributors, byBranch: byBranch, indicatorOnly: true };
    });
    return out;
  }

  // Given a lesson result (max reps in any set) update earned status for pull
  // ladder nodes via their evidenceRule. Returns { earnedById, newEvidence: [] }.
  // occurrencesById tracks how many qualifying sessions each node has seen.
  function applyLessonEvidence(content, earnedById, occurrencesById, maxRepsInSet, dateISO) {
    var earned = Object.assign({}, earnedById);
    var occ = Object.assign({}, occurrencesById);
    var newEvidence = [];
    content.nodes.forEach(function (node) {
      if (!node.evidenceRule || node.evidenceRule.metric !== 'maxRepsInSet') return;
      if (maxRepsInSet >= node.evidenceRule.threshold) {
        occ[node.id] = (occ[node.id] || 0) + 1;
        var m = node.mastery || {};
        var target = m.occurrences || 3;
        var reached;
        if (occ[node.id] >= target) reached = 'mastered';
        else if (occ[node.id] >= 2) reached = 'stabilizing';
        else reached = 'first_success';
        if (rank(reached) > rank(earned[node.id] || 'locked')) {
          earned[node.id] = reached;
          newEvidence.push({ nodeId: node.id, status: reached, maxReps: maxRepsInSet, date: dateISO });
        }
      }
    });
    return { earnedById: earned, occurrencesById: occ, newEvidence: newEvidence };
  }

  return {
    RANKS: RANKS, rank: rank, higher: higher,
    compute: compute,
    computeReadiness: computeReadiness,
    applyLessonEvidence: applyLessonEvidence
  };
});
