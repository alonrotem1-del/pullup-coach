/*
 * Skill Progression Coach Preview — UI glue.
 * STRICTLY ADDITIVE (spec §I.1 requirement B):
 *  - reads puc_* only through SPCStore.readLegacy (read-only; guarded)
 *  - writes only spc_* keys
 *  - registers NO service worker
 *  - removable with zero effect on Pull-Up Coach
 */
(function () {
  'use strict';

  // ---- Storage: spc_* writable, puc_* read-only (hard guarded) ------------
  var SPC_KEYS = ['spc_meta', 'spc_sessions', 'spc_secondary_sessions', 'spc_goals', 'spc_state', 'spc_progress'];
  var Store = {
    readLegacy: function () {
      var keys = ['puc_log', 'puc_plan', 'puc_settings', 'puc_session', 'puc_progression', 'puc_secondary'];
      var out = {};
      keys.forEach(function (k) {
        var raw = localStorage.getItem(k);
        try { out[k] = raw == null ? null : JSON.parse(raw); } catch (e) { out[k] = null; }
      });
      return out;
    },
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) {
      if (k.indexOf('spc_') !== 0) throw new Error('Preview may only write spc_* keys, refused: ' + k);
      localStorage.setItem(k, JSON.stringify(v));
    },
    del: function (k) {
      if (k.indexOf('spc_') !== 0) throw new Error('Preview may only delete spc_* keys, refused: ' + k);
      localStorage.removeItem(k);
    },
    resetV2: function () { SPC_KEYS.forEach(function (k) { localStorage.removeItem(k); }); }
  };
  window.SPCStore = Store;

  var CONTENT = null;
  var UI = { view: 'boot' };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function rankOf(s) { return SPCGraph.rank(s); }

  var STATUS_META = {
    locked:              { label: 'Locked',            color: '#5b5b72', tier: 'Locked' },
    available:           { label: 'Available',         color: '#3498db', tier: 'Available' },
    in_progress:         { label: 'In Progress',       color: '#6c63ff', tier: 'Working on it' },
    assessment_unlocked: { label: 'Assessment Ready',  color: '#f39c12', tier: 'Working on it' },
    first_success:       { label: 'First Success',     color: '#2ecc71', tier: 'Achieved' },
    stabilizing:         { label: 'Stabilizing',       color: '#27ae60', tier: 'Achieved' },
    mastered:            { label: 'Mastered',          color: '#f1c40f', tier: 'Achieved' }
  };

  // ---- Boot ----------------------------------------------------------------
  function boot() {
    fetch('../content/skills.json').then(function (r) { return r.json(); }).then(function (c) {
      CONTENT = c;
      var meta = Store.get('spc_meta');
      if (meta && Store.get('spc_state')) renderHome();
      else renderWelcome();
    }).catch(function (e) {
      el('app').innerHTML = '<div class="pad"><h2>Could not load skill content</h2><p class="muted">' + esc(e.message) + '</p></div>';
    });
  }

  // ---- Welcome / migration wizard -----------------------------------------
  function renderWelcome() {
    var legacy = Store.readLegacy();
    var hasData = legacy.puc_log && legacy.puc_log.length;
    el('app').innerHTML =
      '<div class="pad">' +
      '<div class="hero"><div class="hero-badge">PREVIEW</div><h1>Skill Progression Coach</h1>' +
      '<p class="muted">A skill-tree view of your training. Your Pull-Up Coach app and data are untouched.</p></div>' +
      (hasData
        ? '<div class="card"><h3>Found your Pull-Up Coach data</h3><p class="muted">' + legacy.puc_log.length + ' log entries in this browser. We\'ll build your skill graph from it — nothing is changed or deleted.</p>' +
          '<button class="btn primary" id="btn-migrate">Preview migration →</button></div>'
        : '<div class="card"><h3>No local Pull-Up Coach data here</h3><p class="muted">Import a backup export to load your history into the Preview.</p>' +
          '<button class="btn" id="btn-import">Import backup…</button><input type="file" id="imp" accept=".json,application/json" style="display:none"></div>') +
      '<div class="footnote">Preview writes only to <code>spc_*</code> storage and registers no service worker. Remove it anytime with no effect on Pull-Up Coach.</div>' +
      '</div>';
    if (hasData) el('btn-migrate').onclick = function () { startMigration(Store.readLegacy()); };
    else {
      el('btn-import').onclick = function () { el('imp').click(); };
      el('imp').onchange = function () {
        var f = this.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          try { var exp = JSON.parse(rd.result); if (!exp.data) throw new Error('Not an export file'); startMigration(exp.data); }
          catch (e) { alert('Invalid file: ' + e.message); }
        };
        rd.readAsText(f);
      };
    }
  }

  var PENDING = null; // { result, legacy }

  function startMigration(legacy) {
    var result = SPCMigrate.runMigration(legacy, CONTENT);
    PENDING = { result: result, legacy: legacy };
    renderMigrationPreview();
  }

  function renderMigrationPreview() {
    var p = PENDING.result.preview, rec = PENDING.result.reconciliation;
    var byKind = Object.keys(p.sessionsByKind).map(function (k) { return p.sessionsByKind[k] + ' ' + k; }).join(' · ');
    var prs = Object.keys(p.secondaryPRs).map(function (k) { return k + ': ' + p.secondaryPRs[k]; }).join(', ') || '—';
    el('app').innerHTML =
      '<div class="pad">' +
      '<h2>Migration preview</h2><p class="muted">Nothing is written until you confirm. Your <code>puc_*</code> data is never modified.</p>' +
      '<div class="card"><table class="kv">' +
      row('Sessions found', p.sessionsFound + ' (' + byKind + ')') +
      row('Sets found', p.setsFound + ' (' + p.workingSets + ' working)') +
      row('Total pull-up reps', p.totalReps) +
      row('Date range', p.dateRange ? (p.dateRange.first.slice(0, 10) + ' → ' + p.dateRange.last.slice(0, 10)) : '—') +
      row('Max-test PB', p.maxTestPB == null ? '—' : p.maxTestPB) +
      row('Secondary records', p.secondaryRecords) +
      row('Secondary PRs', esc(prs)) +
      row('Could not map cleanly', p.unmapped.length ? p.unmapped.map(esc).join('<br>') : 'none') +
      '</table></div>' +
      '<div class="card ' + (rec.ok ? 'ok' : 'bad') + '"><h3>' + (rec.ok ? '✅ Reconciliation passed' : '⛔ Reconciliation FAILED') + '</h3>' +
      '<table class="kv">' + rec.checks.map(function (c) {
        return '<tr><td>' + (c.ok ? '✓' : '✗') + ' ' + esc(c.name) + '</td><td class="mono">' +
          (typeof c.legacy === 'object' ? 'legacy=obj' : c.legacy) + ' → ' + (typeof c.migrated === 'object' ? 'migrated=obj' : c.migrated) + '</td></tr>';
      }).join('') + '</table></div>' +
      (rec.ok
        ? '<button class="btn primary" id="btn-confirm">Confirm & review my skill statuses →</button>'
        : '<div class="footnote">Migration will not proceed while reconciliation fails.</div>') +
      '<button class="btn" id="btn-cancel">Cancel</button>' +
      '</div>';
    el('btn-cancel').onclick = renderWelcome;
    if (rec.ok) el('btn-confirm').onclick = function () {
      // Persist the migrated data (not statuses yet — that comes from review).
      var spc = PENDING.result.spc;
      Store.set('spc_meta', spc.spc_meta);
      Store.set('spc_sessions', spc.spc_sessions);
      Store.set('spc_secondary_sessions', spc.spc_secondary_sessions);
      Store.set('spc_goals', spc.spc_goals);
      renderReview();
    };
  }
  function row(k, v) { return '<tr><td>' + esc(k) + '</td><td class="mono">' + v + '</td></tr>'; }

  // ---- Status review (grouped, pre-approved high-confidence) ---------------
  var REVIEW = null; // { statusById }

  function renderReview() {
    if (!REVIEW) {
      var proposed = PENDING.result.spc.spc_state_proposed;
      var statusById = {};
      CONTENT.nodes.forEach(function (n) { statusById[n.id] = proposed[n.id] ? proposed[n.id].status : (n.stub ? 'locked' : null); });
      REVIEW = { statusById: statusById };
    }
    var proposedMap = PENDING.result.spc.spc_state_proposed;
    var html = '<div class="pad"><h2>Review your starting statuses</h2>' +
      '<p class="muted">High-confidence statuses are pre-approved. Only the highlighted ones need a look. Edit anything, then confirm.</p>';

    CONTENT.branches.forEach(function (b) {
      var nodes = CONTENT.nodes.filter(function (n) { return n.branch === b.id && (proposedMap[n.id] && proposedMap[n.id].status); });
      if (!nodes.length) return;
      html += '<div class="section">' + esc(b.icon + ' ' + b.name) + '</div>';
      nodes.forEach(function (n) {
        var pr = proposedMap[n.id];
        var needsLook = pr.review === 'confirm';
        html += '<div class="review-row ' + (needsLook ? 'attention' : '') + '">' +
          '<div class="rr-main"><div class="rr-name">' + esc(n.name) + (needsLook ? ' <span class="chip warn">review</span>' : ' <span class="chip ok">pre-approved</span>') + '</div>' +
          (pr.evidence ? '<div class="rr-ev muted">' + esc(pr.evidence) + '</div>' : '') + '</div>' +
          '<select class="status-sel" data-node="' + n.id + '">' +
          SPCGraph.RANKS.map(function (s) { return '<option value="' + s + '"' + (REVIEW.statusById[n.id] === s ? ' selected' : '') + '>' + STATUS_META[s].label + '</option>'; }).join('') +
          '</select></div>';
      });
    });
    html += '<button class="btn primary" id="btn-review-summary">See summary →</button></div>';
    el('app').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.status-sel'), function (sel) {
      sel.onchange = function () { REVIEW.statusById[this.getAttribute('data-node')] = this.value; };
    });
    el('btn-review-summary').onclick = renderReviewSummary;
  }

  function renderReviewSummary() {
    var counts = {};
    Object.keys(REVIEW.statusById).forEach(function (id) { var s = REVIEW.statusById[id]; if (s) counts[s] = (counts[s] || 0) + 1; });
    var changed = [];
    var proposedMap = PENDING.result.spc.spc_state_proposed;
    Object.keys(REVIEW.statusById).forEach(function (id) {
      if (proposedMap[id] && proposedMap[id].status !== REVIEW.statusById[id]) {
        var node = CONTENT.nodes.find(function (n) { return n.id === id; });
        changed.push(node.name + ': ' + proposedMap[id].status + ' → ' + REVIEW.statusById[id]);
      }
    });
    el('app').innerHTML = '<div class="pad"><h2>Final summary</h2>' +
      '<div class="card"><table class="kv">' +
      SPCGraph.RANKS.slice().reverse().filter(function (s) { return counts[s]; }).map(function (s) {
        return '<tr><td><span class="dot" style="background:' + STATUS_META[s].color + '"></span>' + STATUS_META[s].label + '</td><td class="mono">' + counts[s] + '</td></tr>';
      }).join('') + '</table></div>' +
      '<div class="card"><h3>Your edits</h3>' + (changed.length ? '<ul>' + changed.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '<p class="muted">No changes from the proposed statuses.</p>') + '</div>' +
      '<button class="btn primary" id="btn-confirm-review">Confirm & open my skill map →</button>' +
      '<button class="btn" id="btn-back-review">← Back to edit</button></div>';
    el('btn-back-review').onclick = renderReview;
    el('btn-confirm-review').onclick = function () {
      Store.set('spc_state', { statusById: REVIEW.statusById, confirmedAt: new Date().toISOString() });
      Store.set('spc_progress', { occurrencesById: {} });
      // Fold any migrated max-test PB into evidence occurrences so lessons build on it.
      renderHome();
    };
  }

  // ---- Home ----------------------------------------------------------------
  function currentGraph() {
    var state = Store.get('spc_state') || { statusById: {} };
    return SPCGraph.compute(CONTENT, state.statusById);
  }

  function renderHome() {
    UI.view = 'home';
    var g = currentGraph();
    var state = Store.get('spc_state');
    var html = '<div class="topbar"><div class="brand">🧗 Skill Progression Coach <span class="chip">Preview</span></div></div><div class="pad">';

    CONTENT.goals.forEach(function (goal) {
      var readiness = g.readinessByGoal[goal.id];
      var focus = focusNodes(goal, g.statusById);
      html += '<div class="goal-card"><div class="goal-h"><div class="goal-t">' + esc(goal.icon + ' ' + goal.name) + '</div>' +
        (readiness && readiness.score != null ? '<div class="ready"><div class="ready-n">' + readiness.score + '%</div><div class="ready-l">readiness*</div></div>' : '') + '</div>' +
        '<div class="muted small">Current focus</div><div class="focus">' +
        focus.map(function (n) { return '<span class="focus-chip" style="border-color:' + STATUS_META[g.statusById[n.id]].color + '">' + esc(n.name) + ' · ' + STATUS_META[g.statusById[n.id]].label + '</span>'; }).join('') +
        '</div></div>';
    });
    html += '<div class="footnote">*Readiness is an indicator aggregate of supporting skills — not a guarantee that the goal is achievable yet.</div>';

    html += '<div class="section">Today — Pull Strength lessons</div><div class="lesson-grid">' +
      CONTENT.lessonTemplates.map(function (t) {
        return '<button class="lesson-btn" data-t="' + t.id + '"><div class="lb-icon">' + t.icon + '</div><div class="lb-name">' + esc(t.name) + '</div></button>';
      }).join('') + '</div>';

    html += '<button class="btn" id="btn-map">🗺️ Open skill map</button>';
    html += '<div class="footnote">Migrated ' + (Store.get('spc_sessions') || []).length + ' sessions from Pull-Up Coach. <a href="#" id="lnk-settings">Preview settings</a></div>';
    html += '</div>';
    el('app').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.lesson-btn'), function (btn) {
      btn.onclick = function () { startLesson(this.getAttribute('data-t')); };
    });
    el('btn-map').onclick = renderMap;
    el('lnk-settings').onclick = function (e) { e.preventDefault(); renderSettings(); };
  }

  function focusNodes(goal, statusById) {
    // Nodes in this goal's branches that are actionable now (available..stabilizing), capped.
    var out = CONTENT.nodes.filter(function (n) {
      return goal.branchIds.indexOf(n.branch) >= 0 &&
        rankOf(statusById[n.id]) >= rankOf('available') && rankOf(statusById[n.id]) < rankOf('mastered');
    });
    out.sort(function (a, b) { return rankOf(statusById[b.id]) - rankOf(statusById[a.id]); });
    return out.slice(0, 3);
  }

  // ---- Skill map -----------------------------------------------------------
  function renderMap() {
    UI.view = 'map';
    var g = currentGraph();
    var html = '<div class="topbar"><div class="brand">🗺️ Skill Map</div><button class="link" id="btn-home">Home</button></div><div class="pad">';
    CONTENT.branches.forEach(function (b) {
      var nodes = CONTENT.nodes.filter(function (n) { return n.branch === b.id; });
      html += '<div class="section">' + esc(b.icon + ' ' + b.name) + '</div><div class="map-lane">';
      nodes.forEach(function (n) {
        var st = g.statusById[n.id];
        var goals = goalBadges(n);
        html += '<div class="node" data-node="' + n.id + '" style="border-color:' + STATUS_META[st].color + '">' +
          '<div class="node-dot" style="background:' + STATUS_META[st].color + '"></div>' +
          '<div class="node-name">' + esc(n.name) + '</div>' +
          '<div class="node-status" style="color:' + STATUS_META[st].color + '">' + STATUS_META[st].label + '</div>' +
          (goals ? '<div class="node-goals">' + goals + '</div>' : '') + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
    Array.prototype.forEach.call(document.querySelectorAll('.node'), function (nd) {
      nd.onclick = function () { openNode(this.getAttribute('data-node')); };
    });
  }

  function goalBadges(n) {
    return CONTENT.goals.filter(function (goal) { return goal.branchIds.indexOf(n.branch) >= 0; })
      .map(function (goal) { return '<span class="gb">' + goal.icon + '</span>'; }).join('');
  }

  function openNode(nodeId) {
    var n = CONTENT.nodes.find(function (x) { return x.id === nodeId; });
    var g = currentGraph();
    var st = g.statusById[nodeId];
    var sessions = (Store.get('spc_sessions') || []);
    var related = sessions.filter(function (s) { return s.branchId === n.branch; }).length;
    var msg = '';
    var incoming = CONTENT.edges.filter(function (e) { return e.to === nodeId && e.from; });
    var body = STATUS_META[st].tier + ' — ' + STATUS_META[st].label + '\n\n' + (n.description || '') +
      '\n\nIncoming relationships:\n' + incoming.map(function (e) {
        return '• ' + e.type + ' from ' + e.from + (e.requiredStatus ? ' (needs ' + e.requiredStatus + ')' : '') + ' [' + e.confidence + ']';
      }).join('\n');
    alert(n.name + '\n\n' + body);
  }

  // ---- Lesson flow ---------------------------------------------------------
  var LESSON = null;
  function startLesson(templateId) {
    LESSON = SPCLesson.build(templateId);
    renderLesson();
  }
  function renderLesson() {
    var s = LESSON, info = SPCLesson.nextInfo(s);
    var tmpl = CONTENT.lessonTemplates.find(function (t) { return t.id === s.templateId; });
    var html = '<div class="topbar"><div class="brand">' + tmpl.icon + ' ' + esc(tmpl.name) + '</div><button class="link" id="btn-quit">Quit</button></div><div class="pad">';
    if (s.phase === 'complete' || s.phase === 'ladder_complete') {
      var total = s.sets.reduce(function (a, e) { return a + (e.reps || 0); }, 0);
      html += '<div class="complete"><div class="big">💪</div><h2>Lesson complete</h2><p class="muted">' + total + ' total reps · ' + s.sets.length + ' sets</p>' +
        '<button class="btn primary" id="btn-save">Save & update skills</button></div>';
    } else if (s.phase === 'resting') {
      var remaining = Math.max(0, Math.ceil((new Date(s.timerEnd).getTime() - Date.now()) / 1000));
      html += '<div class="timer"><div class="tnum" id="tnum">' + remaining + 's</div><div class="muted">rest</div></div>' +
        '<button class="btn" id="btn-skip">Skip rest →</button>';
    } else {
      html += '<div class="lesson-card"><div class="muted">' + esc(info.label) + '</div><div class="target">' + (info.isMax ? '∞' : info.targetReps) + '</div><div class="muted">target reps</div></div>' +
        '<div class="stepper"><button class="rnd" id="dec">−</button><span id="repval">' + (info.isMax ? 0 : info.targetReps) + '</span><button class="rnd" id="inc">+</button></div>' +
        '<button class="btn primary" id="btn-log">✓ Done</button>';
    }
    html += '</div>';
    el('app').innerHTML = html;
    el('btn-quit') && (el('btn-quit').onclick = function () { LESSON = null; renderHome(); });
    if (s.phase === 'complete' || s.phase === 'ladder_complete') {
      el('btn-save').onclick = saveLesson;
    } else if (s.phase === 'resting') {
      el('btn-skip').onclick = function () { LESSON = SPCLesson.onTimerComplete(LESSON); renderLesson(); };
      var iv = setInterval(function () {
        var rem = Math.max(0, Math.ceil((new Date(LESSON.timerEnd).getTime() - Date.now()) / 1000));
        if (el('tnum')) el('tnum').textContent = rem + 's';
        if (rem <= 0) { clearInterval(iv); if (LESSON && LESSON.phase === 'resting') { LESSON = SPCLesson.onTimerComplete(LESSON); renderLesson(); } }
      }, 500);
    } else {
      var val = info.isMax ? 0 : info.targetReps;
      el('dec').onclick = function () { val = Math.max(0, val - 1); el('repval').textContent = val; };
      el('inc').onclick = function () { val = val + 1; el('repval').textContent = val; };
      el('btn-log').onclick = function () {
        LESSON = SPCLesson.advance(LESSON, { reps: val, setType: info.isMax ? 'max' : info.isWarmup ? 'warmup' : 'working' });
        renderLesson();
      };
    }
  }

  function saveLesson() {
    var s = LESSON;
    var maxReps = SPCLesson.maxRepsInSets(s.sets);
    var state = Store.get('spc_state');
    var progress = Store.get('spc_progress') || { occurrencesById: {} };
    var res = SPCGraph.applyLessonEvidence(CONTENT, state.statusById, progress.occurrencesById, maxReps, new Date().toISOString());
    state.statusById = res.earnedById;
    progress.occurrencesById = res.occurrencesById;
    Store.set('spc_state', state);
    Store.set('spc_progress', progress);
    // Append the lesson as an spc session (does not touch puc_*).
    var sessions = Store.get('spc_sessions') || [];
    sessions.push({ id: 'live_' + Date.now(), date: new Date().toISOString(), day: new Date().toISOString().slice(0, 10),
      kind: 'lesson', sessionType: s.templateId, lessonTemplateId: s.templateId, branchId: 'pull',
      sets: s.sets.map(function (e, i) { return { migId: 'live_' + Date.now() + '_' + i, reps: e.reps, setType: e.setType, isWorking: e.setType !== 'skip' && e.reps > 0, date: new Date().toISOString() }; }),
      legacy: { source: 'preview-live' } });
    Store.set('spc_sessions', sessions);
    LESSON = null;
    if (res.newEvidence.length) renderUnlock(res.newEvidence);
    else renderHome();
  }

  function renderUnlock(evidence) {
    var g = currentGraph();
    // Newly opened downstream nodes as a result of this evidence.
    var lines = evidence.map(function (ev) {
      var n = CONTENT.nodes.find(function (x) { return x.id === ev.nodeId; });
      return '<div class="unlock-line"><span class="dot" style="background:' + STATUS_META[ev.status].color + '"></span>' + esc(n.name) + ' → <strong>' + STATUS_META[ev.status].label + '</strong></div>';
    }).join('');
    var opened = g.unlocks.map(function (u) {
      var n = CONTENT.nodes.find(function (x) { return x.id === u.nodeId; });
      return '<div class="unlock-line">🔓 ' + esc(n.name) + ' — ' + (u.via === 'assessment' ? 'assessment ready' : 'now available') + '</div>';
    }).join('');
    el('app').innerHTML = '<div class="pad"><div class="unlock"><div class="big">🎉</div><h2>Skill update</h2>' +
      lines + (opened ? '<div class="section">Newly opened</div>' + opened : '') +
      '<button class="btn primary" id="btn-ok">Continue</button></div></div>';
    el('btn-ok').onclick = renderHome;
  }

  // ---- Settings ------------------------------------------------------------
  function renderSettings() {
    var meta = Store.get('spc_meta');
    el('app').innerHTML = '<div class="topbar"><div class="brand">⚙️ Preview settings</div><button class="link" id="btn-home">Home</button></div><div class="pad">' +
      '<div class="card"><h3>Data</h3><p class="muted small">Migrated at ' + (meta ? esc(meta.migratedAt) : '—') + '. Source hash ' + (meta ? esc(meta.sourceHash) : '—') + '.</p>' +
      '<p class="muted small">This Preview never modifies your Pull-Up Coach (<code>puc_*</code>) data.</p>' +
      '<button class="btn" id="btn-remigrate">Re-run migration (no duplicates)</button>' +
      '<button class="btn danger" id="btn-reset">Reset Preview data (spc_* only)</button></div>' +
      '<div class="footnote">Removing this Preview page or clearing spc_* leaves Pull-Up Coach exactly as it was.</div></div>';
    el('btn-home').onclick = renderHome;
    el('btn-remigrate').onclick = function () { REVIEW = null; startMigration(Store.readLegacy()); };
    el('btn-reset').onclick = function () { if (confirm('Delete Preview (spc_*) data only? Pull-Up Coach is unaffected.')) { Store.resetV2(); REVIEW = null; renderWelcome(); } };
  }

  window.SPCApp = { boot: boot, _store: Store };
  boot();
})();
