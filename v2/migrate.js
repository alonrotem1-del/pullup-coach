/*
 * Skill Progression Coach — non-destructive migration (pure, UMD).
 * Transforms a snapshot of the six puc_* values into the spc_* model.
 *
 * Guarantees (Data Preservation Contract §C3):
 *  - Never reads or writes localStorage itself — callers pass a plain object.
 *  - Never dedupes or drops entries by legacy id (ids are known-duplicated).
 *  - Every legacy entry gets a fresh unique migration id (mig_<n>) and keeps
 *    its original id + array index in legacy metadata.
 *  - Any field without a v2 home is retained verbatim inside `legacy`.
 *  - A complete legacy snapshot is stored in spc_meta.
 *  - Pure & idempotent: same input → same output; applying replaces spc_*.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SPCMigrate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  function dayKey(iso) { return String(iso).slice(0, 10); }

  function isWorking(e) {
    return (e.reps || 0) > 0 && e.setType !== 'summary' && e.setType !== 'skip';
  }

  // Sunday-based week start key, matching the legacy app's getWeekStats.
  function weekKey(iso) {
    var d = new Date(iso);
    var s = new Date(d);
    s.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return s.toISOString().slice(0, 10);
  }

  function computeLegacyCounts(puc) {
    var log = Array.isArray(puc.puc_log) ? puc.puc_log : [];
    var working = log.filter(isWorking);
    var byType = {};
    log.forEach(function (e) { byType[e.sessionType] = (byType[e.sessionType] || 0) + 1; });
    var days = {};
    working.forEach(function (e) { days[dayKey(e.date)] = true; });
    var weeks = {};
    working.forEach(function (e) { weeks[weekKey(e.date)] = (weeks[weekKey(e.date)] || 0) + e.reps; });
    var maxSets = log.filter(function (e) {
      return e.sessionType === 'max_test' && e.setType === 'max' && (e.reps || 0) > 0;
    });
    var skills = (puc.puc_secondary && puc.puc_secondary.skills) || [];
    var secByPR = {};
    var secByCount = {};
    skills.forEach(function (s) {
      if (s.log && s.log.length) {
        secByPR[s.id] = Math.max.apply(null, s.log.map(function (e) { return e.value; }));
        secByCount[s.id] = s.log.length;
      }
    });
    var dates = log.map(function (e) { return e.date; }).filter(Boolean).sort();
    return {
      logEntries: log.length,
      workingSets: working.length,
      totalReps: working.reduce(function (a, e) { return a + e.reps; }, 0),
      sessionDays: Object.keys(days).length,
      entriesBySessionType: byType,
      weeklyTotals: weeks,
      skippedSessions: log.filter(function (e) { return e.setType === 'skip'; }).length,
      painEntries: log.filter(function (e) { return e.pain; }).length,
      maxTestPB: maxSets.length ? Math.max.apply(null, maxSets.map(function (e) { return e.reps; })) : null,
      secondarySkills: skills.length,
      secondaryLogEntries: skills.reduce(function (a, s) { return a + ((s.log && s.log.length) || 0); }, 0),
      secondaryPRs: secByPR,
      secondaryCounts: secByCount,
      dateRange: dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null
    };
  }

  var KIND_BY_TYPE = {
    strength: 'lesson', volume: 'lesson', light: 'lesson', max_test: 'lesson',
    bouldering: 'climbing', rest: 'rest'
  };
  var LESSON_TEMPLATE_BY_TYPE = {
    strength: 'pyramid', volume: 'ladder', light: 'light', max_test: 'max_test'
  };

  // Build migrated session records. Group per (day, sessionType). Every legacy
  // entry becomes a set item with a unique migration id; nothing is dropped or
  // merged. Skip entries become their own kind:'skip' record.
  function buildSessions(log) {
    var groups = {};
    var order = [];
    log.forEach(function (e, idx) {
      var isSkip = e.setType === 'skip';
      var kind = isSkip ? 'skip' : (KIND_BY_TYPE[e.sessionType] || 'other');
      var gkey = dayKey(e.date) + '|' + e.sessionType + '|' + kind;
      if (!groups[gkey]) {
        groups[gkey] = {
          id: 'migsess_' + order.length,
          date: e.date,
          day: dayKey(e.date),
          kind: kind,
          sessionType: e.sessionType,
          lessonTemplateId: LESSON_TEMPLATE_BY_TYPE[e.sessionType] || null,
          branchId: 'pull',
          sets: [],
          pain: false,
          notes: [],
          skipReason: null,
          legacy: { originalEntryIds: [], originalIndexes: [] }
        };
        order.push(gkey);
      }
      var g = groups[gkey];
      g.sets.push({
        migId: 'mig_' + idx,
        setType: e.setType,
        setNumber: e.setNumber != null ? e.setNumber : null,
        reps: e.reps || 0,
        isWorking: isWorking(e),
        date: e.date,
        legacyId: e.id != null ? e.id : null,
        legacyIndex: idx,
        // Preserve any field without an explicit v2 home.
        legacy: (function () {
          var known = { id: 1, date: 1, sessionType: 1, setType: 1, setNumber: 1, reps: 1, pain: 1, notes: 1, skipReason: 1, forearmFatigue: 1 };
          var extra = {};
          Object.keys(e).forEach(function (k) { if (!known[k]) extra[k] = e[k]; });
          return Object.keys(extra).length ? extra : undefined;
        })()
      });
      if (e.pain) g.pain = true;
      if (e.notes) g.notes.push(e.notes);
      if (e.skipReason) g.skipReason = e.skipReason;
      g.legacy.originalEntryIds.push(e.id != null ? e.id : null);
      g.legacy.originalIndexes.push(idx);
    });
    return order.map(function (k) {
      var g = groups[k];
      g.notes = g.notes.join(' • ');
      return g;
    });
  }

  // Secondary-skill logs → practice sessions, mapped to graph nodes.
  function buildSecondarySessions(secondary, nodeMap) {
    var out = [];
    var skills = (secondary && secondary.skills) || [];
    skills.forEach(function (s) {
      (s.log || []).forEach(function (entry, i) {
        out.push({
          id: 'migsec_' + s.id + '_' + i,
          kind: 'practice',
          date: entry.date,
          day: dayKey(entry.date),
          nodeId: nodeMap[s.id] || null,
          legacySkillId: s.id,
          unit: s.unit,
          value: entry.value,
          legacy: { skillId: s.id, skillName: s.name, custom: !!s.custom }
        });
      });
    });
    return out;
  }

  // Reconcile migrated data against legacy counts. Blocking: any failed check
  // means the run must be rolled back.
  function reconcile(legacyCounts, sessions, secondarySessions) {
    var workingSets = [];
    sessions.forEach(function (s) {
      s.sets.forEach(function (st) { if (st.isWorking) workingSets.push(st); });
    });
    var days = {};
    workingSets.forEach(function (st) { days[dayKey(st.date)] = true; });
    var weeks = {};
    workingSets.forEach(function (st) { weeks[weekKey(st.date)] = (weeks[weekKey(st.date)] || 0) + st.reps; });
    var allSets = 0;
    sessions.forEach(function (s) { allSets += s.sets.length; });
    var maxReps = null;
    sessions.forEach(function (s) {
      if (s.sessionType === 'max_test') s.sets.forEach(function (st) {
        if (st.setType === 'max' && st.reps > 0) maxReps = Math.max(maxReps == null ? -1 : maxReps, st.reps);
      });
    });
    var secCounts = {};
    var secPRs = {};
    secondarySessions.forEach(function (r) {
      secCounts[r.legacySkillId] = (secCounts[r.legacySkillId] || 0) + 1;
      secPRs[r.legacySkillId] = Math.max(secPRs[r.legacySkillId] == null ? -Infinity : secPRs[r.legacySkillId], r.value);
    });

    var checks = [];
    function check(name, legacy, migrated) {
      checks.push({ name: name, legacy: legacy, migrated: migrated, ok: JSON.stringify(legacy) === JSON.stringify(migrated) });
    }
    check('logEntries (all sets preserved)', legacyCounts.logEntries, allSets);
    check('workingSets', legacyCounts.workingSets, workingSets.length);
    check('totalReps', legacyCounts.totalReps, workingSets.reduce(function (a, st) { return a + st.reps; }, 0));
    check('sessionDays', legacyCounts.sessionDays, Object.keys(days).length);
    check('weeklyTotals', legacyCounts.weeklyTotals, weeks);
    check('maxTestPB', legacyCounts.maxTestPB, maxReps);
    check('secondaryCounts', legacyCounts.secondaryCounts, secCounts);
    check('secondaryPRs', legacyCounts.secondaryPRs,
      Object.keys(secPRs).reduce(function (o, k) { o[k] = secPRs[k]; return o; }, {}));
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks };
  }

  // Propose node states from content + legacy evidence. Review confirms later.
  function proposeStates(content, puc) {
    var counts = computeLegacyCounts(puc);
    var states = {};
    content.nodes.forEach(function (node) {
      var proposed = node.proposed || null;
      states[node.id] = {
        nodeId: node.id,
        status: proposed ? proposed.status : (node.stub ? 'locked' : null),
        review: proposed ? proposed.review : 'none',
        evidence: proposed ? proposed.evidence : null,
        bestValue: null,
        source: 'proposed'
      };
    });
    // Reinforce with hard evidence from the log (PB) where a rule exists.
    var pb = counts.maxTestPB;
    if (pb != null) {
      content.nodes.forEach(function (node) {
        if (node.evidenceRule && node.evidenceRule.metric === 'maxRepsInSet') {
          if (pb >= node.evidenceRule.threshold) states[node.id].bestValue = pb;
        }
      });
    }
    // Secondary PRs → bestValue on mapped nodes.
    var map = content.secondarySkillNodeMap || {};
    var skills = (puc.puc_secondary && puc.puc_secondary.skills) || [];
    skills.forEach(function (s) {
      var nid = map[s.id];
      if (nid && states[nid] && s.log && s.log.length) {
        states[nid].bestValue = Math.max.apply(null, s.log.map(function (e) { return e.value; }));
      }
    });
    return states;
  }

  function buildPreview(counts, sessions, secondarySessions) {
    var byKind = {};
    sessions.forEach(function (s) { byKind[s.kind] = (byKind[s.kind] || 0) + 1; });
    var unmapped = [];
    secondarySessions.forEach(function (r) {
      if (!r.nodeId) unmapped.push('Secondary "' + r.legacySkillId + '" has no mapped node (preserved as practice record)');
    });
    return {
      sessionsFound: sessions.length,
      sessionsByKind: byKind,
      setsFound: counts.logEntries,
      workingSets: counts.workingSets,
      totalReps: counts.totalReps,
      dateRange: counts.dateRange,
      maxTestPB: counts.maxTestPB,
      secondaryRecords: counts.secondaryLogEntries,
      secondaryPRs: counts.secondaryPRs,
      unmapped: unmapped
    };
  }

  // Simple deterministic hash of the legacy snapshot for idempotency checks.
  function hashSnapshot(puc) {
    var str = JSON.stringify(puc);
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16) + '_' + str.length;
  }

  // Full run — pure. Returns everything a caller needs to preview, reconcile,
  // and persist. Does not touch storage.
  function runMigration(puc, content) {
    var counts = computeLegacyCounts(puc);
    var sessions = buildSessions(Array.isArray(puc.puc_log) ? puc.puc_log : []);
    var secondarySessions = buildSecondarySessions(puc.puc_secondary, content.secondarySkillNodeMap || {});
    var reconciliation = reconcile(counts, sessions, secondarySessions);
    var proposedStates = proposeStates(content, puc);
    var preview = buildPreview(counts, sessions, secondarySessions);
    var spc = {
      spc_meta: {
        schemaVersion: SCHEMA_VERSION,
        migratedAt: new Date().toISOString(),
        sourceHash: hashSnapshot(puc),
        contentVersion: content.contentVersion,
        legacySnapshot: JSON.parse(JSON.stringify(puc)),
        reconciliation: reconciliation
      },
      spc_sessions: sessions,
      spc_secondary_sessions: secondarySessions,
      spc_goals: content.goals.map(function (g) { return { goalId: g.id, active: true }; }),
      spc_state_proposed: proposedStates
    };
    return { spc: spc, preview: preview, reconciliation: reconciliation, counts: counts };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    computeLegacyCounts: computeLegacyCounts,
    buildSessions: buildSessions,
    buildSecondarySessions: buildSecondarySessions,
    reconcile: reconcile,
    proposeStates: proposeStates,
    runMigration: runMigration,
    hashSnapshot: hashSnapshot,
    _weekKey: weekKey
  };
});
