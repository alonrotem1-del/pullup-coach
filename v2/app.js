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
    var proposedMap = PENDING.result.spc.spc_state_proposed;
    if (!REVIEW) {
      // Seed each node with its GATED status (compute from the proposed earned
      // statuses), so nothing is over-promoted past its prerequisites and
      // untouched rows stay consistent with the graph.
      var earned = {};
      CONTENT.nodes.forEach(function (n) { var pr = proposedMap[n.id]; if (pr && pr.status && !pr.frozen) earned[n.id] = pr.status; });
      var gated = SPCGraph.compute(CONTENT, earned).statusById;
      var statusById = {};
      CONTENT.nodes.forEach(function (n) {
        statusById[n.id] = (proposedMap[n.id] && proposedMap[n.id].frozen) ? 'locked' : gated[n.id];
      });
      REVIEW = { statusById: statusById };
    }
    var html = '<div class="pad"><h2>Review your starting statuses</h2>' +
      '<p class="muted">Pre-approved rows are high-confidence. <span class="chip warn">review</span> rows are derived from limited or missing data — please check them. Edit anything, then confirm.</p>';

    CONTENT.branches.forEach(function (b) {
      // Show a row for any node with a proposed starting status OR one flagged for review.
      var nodes = CONTENT.nodes.filter(function (n) {
        var pr = proposedMap[n.id];
        return pr && (pr.status || pr.review === 'confirm' || pr.frozen);
      });
      nodes = nodes.filter(function (n) { return n.branch === b.id; });
      if (!nodes.length) return;
      html += '<div class="section">' + esc(b.icon + ' ' + b.name) + '</div>';
      nodes.forEach(function (n) {
        var pr = proposedMap[n.id];
        if (pr.frozen) {
          // Locked and NOT editable until the user supplies the missing info (issue #5).
          html += '<div class="review-row frozen">' +
            '<div class="rr-main"><div class="rr-name">' + esc(n.name) + ' <span class="chip">🔒 frozen</span></div>' +
            '<div class="rr-ev muted">' + esc(pr.evidence || 'Frozen — pending info.') + '</div></div>' +
            '<div class="frozen-tag">Locked</div></div>';
          return;
        }
        var needsLook = pr.review === 'confirm';
        var prLine = pr.bestValue != null ? '<div class="rr-ev" style="color:var(--orange)">PR: ' + esc(pr.bestValue) + (n.unit === 'seconds' ? 's' : '') + '</div>' : '';
        html += '<div class="review-row ' + (needsLook ? 'attention' : '') + '">' +
          '<div class="rr-main"><div class="rr-name">' + esc(n.name) + (needsLook ? ' <span class="chip warn">review</span>' : ' <span class="chip ok">pre-approved</span>') + '</div>' +
          (pr.evidence ? '<div class="rr-ev muted">' + esc(pr.evidence) + '</div>' : '') + prLine + '</div>' +
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
      var pr = proposedMap[id];
      if (pr && pr.status && pr.status !== REVIEW.statusById[id]) {
        var node = CONTENT.nodes.find(function (n) { return n.id === id; });
        changed.push(node.name + ': ' + pr.status + ' → ' + REVIEW.statusById[id]);
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
      // Persist per-node evidence so the skill map can explain "why this status".
      var evidenceById = {};
      Object.keys(proposedMap).forEach(function (id) {
        evidenceById[id] = { evidence: proposedMap[id].evidence, bestValue: proposedMap[id].bestValue, source: proposedMap[id].source };
      });
      Store.set('spc_state', { statusById: REVIEW.statusById, evidenceById: evidenceById, confirmedAt: new Date().toISOString() });
      // Seed lesson-evidence occurrences from real migrated history (issue #4 continuity).
      Store.set('spc_progress', PENDING.result.spc.spc_progress_seed || { occurrencesById: {} });
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
      html += '<div class="goal-card"><div class="goal-h"><div class="goal-t">' + esc(goal.icon + ' ' + goal.name) + '</div></div>';

      // Curated current focus (issues #6, #7) — the defined support structure, not incidental nodes.
      html += '<div class="muted small">Current focus</div><div class="focus-list">';
      (goal.focus || []).forEach(function (f) {
        if (f.kind === 'later') {
          html += '<div class="focus-area later"><div class="fa-label">' + esc(f.label) + ' <span class="chip">later</span></div>' +
            '<div class="fa-note muted small">' + esc(f.note || '') + '</div></div>';
          return;
        }
        var rep = representativeNode(f.branchId, g.statusById);
        var color = rep ? STATUS_META[g.statusById[rep.id]].color : '#5b5b72';
        var lbl = rep ? esc(rep.name) + ' · ' + STATUS_META[g.statusById[rep.id]].label : '—';
        html += '<div class="focus-area' + (f.kind === 'support' ? ' support' : '') + '">' +
          '<div class="fa-label">' + esc(f.label) + (f.kind === 'support' ? ' <span class="chip">support</span>' : '') + '</div>' +
          '<div class="fa-node" style="color:' + color + '">' + lbl + '</div></div>';
      });
      html += '</div>';

      // Branch-level readiness (issue #8) — coarse indicator, no false-precise %.
      if (readiness && readiness.byBranch && readiness.byBranch.length) {
        html += '<div class="muted small" style="margin-top:10px">Readiness by area <span class="muted">(indicator only)</span></div><div class="ready-branches">';
        readiness.byBranch.forEach(function (bb) {
          html += '<div class="rb"><div class="rb-top"><span>' + esc(bb.branchName) + '</span><span class="rb-label">' + bb.label + '</span></div>' +
            '<div class="pips">' + [0, 1, 2, 3].map(function (i) { return '<span class="pip' + (i < bb.pips ? ' on' : '') + '"></span>'; }).join('') + '</div></div>';
        });
        html += '</div><button class="link small" data-goal="' + goal.id + '" id="why-' + goal.id + '">Why? contributing skills →</button>';
      } else {
        html += '<div class="muted small" style="margin-top:10px">Progress here is gated by prerequisites — open the skill map to see the path.</div>';
      }
      html += '</div>';
    });
    html += '<div class="footnote">Readiness is an indicator aggregate of supporting skills — never a guarantee that the goal is achievable yet.</div>';

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
    CONTENT.goals.forEach(function (goal) {
      var b = el('why-' + goal.id);
      if (b) b.onclick = function () { renderReadinessDetail(goal.id); };
    });
  }

  // The "leading edge" node of a branch: the highest non-mastered node currently
  // being worked, else the next locked node, else the top node. Used only to
  // give each curated focus area a concrete current anchor.
  function representativeNode(branchId, statusById) {
    var nodes = CONTENT.nodes.filter(function (n) { return n.branch === branchId && !n.frozen && !n.stub; });
    var working = nodes.filter(function (n) { var r = rankOf(statusById[n.id]); return r >= rankOf('available') && r < rankOf('mastered'); });
    if (working.length) { working.sort(function (a, b) { return rankOf(statusById[b.id]) - rankOf(statusById[a.id]); }); return working[0]; }
    var locked = nodes.filter(function (n) { return statusById[n.id] === 'locked'; });
    if (locked.length) return locked[0];
    if (nodes.length) { nodes.sort(function (a, b) { return rankOf(statusById[b.id]) - rankOf(statusById[a.id]); }); return nodes[0]; }
    return null;
  }

  function renderReadinessDetail(goalId) {
    var goal = CONTENT.goals.find(function (x) { return x.id === goalId; });
    var g = currentGraph();
    var r = g.readinessByGoal[goalId];
    var nameById = {}; CONTENT.nodes.forEach(function (n) { nameById[n.id] = n.name; });
    var html = '<div class="topbar"><div class="brand">' + esc(goal.icon + ' ' + goal.name) + ' — readiness</div><button class="link" id="btn-home">Home</button></div><div class="pad">' +
      '<p class="muted small">Readiness is an indicator aggregate of the supporting skills below — it does not predict or guarantee the goal. It only shows where support is strong or thin.</p>';
    (r.byBranch || []).forEach(function (bb) {
      html += '<div class="card"><div class="rb-top"><strong>' + esc(bb.branchName) + '</strong><span class="rb-label">' + bb.label + '</span></div>' +
        '<table class="kv">' + bb.contributors.map(function (c) {
          var met = rankOf(c.currentStatus) >= rankOf(c.requiredStatus || 'first_success');
          return '<tr><td>' + (met ? '✓' : '·') + ' ' + esc(nameById[c.from] || c.from) + '</td><td class="mono">' +
            esc(STATUS_META[c.currentStatus] ? STATUS_META[c.currentStatus].label : c.currentStatus) +
            ' / needs ' + esc(c.requiredStatus || 'first_success') + ' [' + esc(c.confidence || '') + ']</td></tr>';
        }).join('') + '</table></div>';
    });
    html += '</div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
  }

  // ---- Skill map -----------------------------------------------------------
  function prereqSources(nodeId) {
    return CONTENT.edges.filter(function (e) { return e.to === nodeId && e.type === 'prereq' && e.from; });
  }
  function nodeName(id) { var n = CONTENT.nodes.find(function (x) { return x.id === id; }); return n ? n.name : id; }

  function renderMap() {
    UI.view = 'map';
    var g = currentGraph();
    var html = '<div class="topbar"><div class="brand">🗺️ Skill Map</div><button class="link" id="btn-home">Home</button></div><div class="pad">' +
      '<p class="muted small">Tap any skill to see its prerequisites, supporting skills, what it unlocks, and why it has its current status. “needs:” shows the skills that gate it.</p>';
    CONTENT.branches.forEach(function (b) {
      var nodes = CONTENT.nodes.filter(function (n) { return n.branch === b.id; });
      html += '<div class="section">' + esc(b.icon + ' ' + b.name) + '</div><div class="map-lane">';
      nodes.forEach(function (n) {
        var st = g.statusById[n.id];
        var goals = goalBadges(n);
        var needs = prereqSources(n.id).map(function (e) { return nodeName(e.from); });
        html += '<div class="node" data-node="' + n.id + '" style="border-color:' + STATUS_META[st].color + '">' +
          '<div class="node-dot" style="background:' + STATUS_META[st].color + '"></div>' +
          '<div class="node-name">' + esc(n.name) + (n.frozen ? ' 🔒' : '') + '</div>' +
          '<div class="node-status" style="color:' + STATUS_META[st].color + '">' + STATUS_META[st].label + '</div>' +
          (needs.length ? '<div class="node-needs">needs: ' + esc(needs.join(', ')) + '</div>' : '') +
          (goals ? '<div class="node-goals">' + goals + '</div>' : '') + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
    Array.prototype.forEach.call(document.querySelectorAll('.node'), function (nd) {
      nd.onclick = function () { renderNode(this.getAttribute('data-node')); };
    });
  }

  function goalBadges(n) {
    return CONTENT.goals.filter(function (goal) { return goal.branchIds.indexOf(n.branch) >= 0; })
      .map(function (goal) { return '<span class="gb">' + goal.icon + '</span>'; }).join('');
  }

  // Human explanation of why a node currently holds its status.
  function explainStatus(n, st, statusById, ev) {
    if (n.frozen || n.stub) return (ev && ev.evidence) || 'Frozen until the required information is provided.';
    if (st === 'locked') {
      var unmet = prereqSources(n.id).filter(function (e) { return rankOf(statusById[e.from]) < rankOf(e.requiredStatus); });
      if (unmet.length) return 'Locked — waiting on: ' + unmet.map(function (e) { return nodeName(e.from) + ' (needs ' + e.requiredStatus + ', currently ' + (STATUS_META[statusById[e.from]] ? STATUS_META[statusById[e.from]].label : statusById[e.from]) + ')'; }).join('; ') + '.';
      return 'Locked.';
    }
    if (st === 'available') return 'Prerequisites met. Log a qualifying session to earn a status.' + (ev && ev.evidence ? ' (' + ev.evidence + ')' : '');
    if (st === 'assessment_unlocked') {
      var aedges = CONTENT.edges.filter(function (e) { return e.to === n.id && e.type === 'unlock:assessment' && rankOf(statusById[e.from]) >= rankOf(e.requiredStatus); });
      return 'Assessment ready — opened by ' + (aedges.map(function (e) { return nodeName(e.from); }).join(' or ') || 'an unlock') + '. Passing the assessment earns the skill; it is not granted automatically.';
    }
    // earned tiers
    return (ev && ev.evidence) ? ev.evidence + '.' : 'Confirmed during your one-time status review.';
  }

  function renderNode(nodeId) {
    var n = CONTENT.nodes.find(function (x) { return x.id === nodeId; });
    var g = currentGraph();
    var st = g.statusById[nodeId];
    var state = Store.get('spc_state') || {};
    var ev = (state.evidenceById || {})[nodeId] || {};
    var incoming = CONTENT.edges.filter(function (e) { return e.to === nodeId && e.from; });
    var prereqs = incoming.filter(function (e) { return e.type === 'prereq'; });
    var supporting = incoming.filter(function (e) { return e.type === 'supporting' || e.type === 'accessory' || e.type === 'readiness'; });
    var outgoing = CONTENT.edges.filter(function (e) { return e.from === nodeId; });

    function edgeRow(e, useSource) {
      var otherId = useSource ? e.from : e.to;
      var other = STATUS_META[g.statusById[otherId]];
      var met = useSource ? (rankOf(g.statusById[e.from]) >= rankOf(e.requiredStatus)) : null;
      return '<tr><td>' + (useSource && e.requiredStatus ? (met ? '✓ ' : '✗ ') : '') + esc(nodeName(otherId)) + '</td>' +
        '<td class="mono">' + esc(e.type) + (e.requiredStatus ? ' · needs ' + esc(e.requiredStatus) : '') +
        (useSource ? ' · now ' + esc(other ? other.label : g.statusById[otherId]) : '') + ' · [' + esc(e.confidence || '?') + ']</td></tr>';
    }

    var html = '<div class="topbar"><div class="brand">' + esc(n.name) + '</div><button class="link" id="btn-back">← Map</button></div><div class="pad">' +
      '<div class="card" style="border-color:' + STATUS_META[st].color + '">' +
      '<div class="node-status" style="color:' + STATUS_META[st].color + ';font-size:14px">' + STATUS_META[st].tier + ' — ' + STATUS_META[st].label + '</div>' +
      (n.description ? '<p class="muted small" style="margin-top:6px">' + esc(n.description) + '</p>' : '') +
      (ev.bestValue != null ? '<p class="small" style="color:var(--orange);margin-top:6px">PR: ' + esc(ev.bestValue) + (n.unit === 'seconds' ? 's' : '') + '</p>' : '') +
      '</div>' +
      '<div class="card"><h3>Why this status</h3><p class="small">' + esc(explainStatus(n, st, g.statusById, ev)) + '</p></div>' +
      '<div class="card"><h3>Prerequisites</h3>' + (prereqs.length ? '<table class="kv">' + prereqs.map(function (e) { return edgeRow(e, true); }).join('') + '</table>' : '<p class="muted small">None — no hard prerequisites.</p>') + '</div>' +
      '<div class="card"><h3>Supporting skills</h3>' + (supporting.length ? '<table class="kv">' + supporting.map(function (e) { return edgeRow(e, true); }).join('') + '</table>' : '<p class="muted small">None recorded.</p>') + '</div>' +
      '<div class="card"><h3>What it unlocks</h3>' + (outgoing.length ? '<table class="kv">' + outgoing.map(function (e) { return edgeRow(e, false); }).join('') + '</table>' : '<p class="muted small">Nothing downstream yet.</p>') + '</div>' +
      '</div>';
    el('app').innerHTML = html;
    el('btn-back').onclick = renderMap;
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
