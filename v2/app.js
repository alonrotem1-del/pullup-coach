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
  var SPC_KEYS = ['spc_meta', 'spc_sessions', 'spc_secondary_sessions', 'spc_goals', 'spc_state', 'spc_progress', 'spc_pain', 'spc_ui'];
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
  var ASSET_VER = '20260718a';

  function boot() {
    // Resolve content relative to THIS page (v2.html sits at the project root,
    // content/ is its sibling). A bare '../content' escapes the GitHub Pages
    // project path (/pullup-coach/) and 404s — use a document-relative URL.
    // The version query defeats stale HTTP-cache copies served via the
    // Pull-Up Coach service worker.
    var contentUrl = new URL('content/skills.json?v=' + ASSET_VER, document.baseURI).href;
    fetch(contentUrl, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + contentUrl);
      return r.json();
    }).then(function (c) {
      CONTENT = c;
      var meta = Store.get('spc_meta');
      if (meta && Store.get('spc_state')) renderHome();
      else renderWelcome();
    }).catch(function (e) {
      el('app').innerHTML = '<div class="pad"><h2>Could not load skill content</h2>' +
        '<p class="muted">' + esc(e.message) + '</p>' +
        '<p class="muted small">If this persists, clear the site data or open this page in a private tab, then reload.</p></div>';
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

  // ---- Weekly Coach inputs (reads puc_* READ-ONLY, spc_* for state) --------
  function gatherCoachInput() {
    var legacy = Store.readLegacy();
    var map = CONTENT.secondarySkillNodeMap || {};
    var skills = (legacy.puc_secondary && legacy.puc_secondary.skills) || [];
    var supportTargets = skills.filter(function (s) { return s.frequency > 0 && map[s.id]; })
      .map(function (s) { return { id: s.id, nodeId: map[s.id], name: s.name, icon: s.icon, freq: s.frequency }; });
    return {
      content: CONTENT, plan: legacy.puc_plan || null,
      sessions: Store.get('spc_sessions') || [],
      supportTargets: supportTargets,
      statusById: (Store.get('spc_state') || {}).statusById || {},
      painOverride: Store.get('spc_pain') || null,
      now: new Date()
    };
  }

  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function chip(c) { return '<span class="mini">' + esc(c.icon + ' ' + c.label) + '</span>'; }

  function renderHome() {
    UI.view = 'home';
    var rec = SPCCoach.recommend(gatherCoachInput());
    var t = rec.today;
    var html = '<div class="topbar"><div class="brand">🧗 Skill Progression Coach <span class="chip">Preview</span></div></div><div class="pad">';

    // TODAY — the only section with full reasoning.
    html += '<div class="section">TODAY · ' + WD[new Date().getDay()] + '</div>';
    html += '<div class="today-card">' +
      '<div class="tc-title">' + esc(t.icon + ' ' + t.label) + (t.activity && t.activity.anchor ? ' <span class="chip">anchor</span>' : '') + '</div>' +
      (t.detail ? '<div class="tc-detail">' + esc(t.detail) + '</div>' : '') +
      '<div class="tc-why muted small">' + esc(t.why) + '</div>' +
      '<button class="btn primary" id="tc-cta">' + esc(t.cta.label) + '</button>' +
      '</div>';

    // Compact Done / Left / Skip.
    html += '<div class="wk-line"><span class="wk-k">✅ Done</span> ' + (rec.completed.length ? rec.completed.map(chip).join(' ') : '<span class="muted">—</span>') + '</div>';
    html += '<div class="wk-line"><span class="wk-k">🎯 Left</span> ' + (rec.remaining.length ? rec.remaining.map(chip).join(' ') : '<span class="muted">nothing left</span>') + '</div>';
    if (rec.skipNow.length) {
      html += '<div class="wk-line skip"><span class="wk-k">⛔ Skip now</span> ' + rec.skipNow.map(function (s) {
        return '<span class="mini">' + esc(s.icon + ' ' + s.label) + (s.reason ? ' <span class="muted">(' + esc(s.reason) + ')</span>' : '') + '</span>';
      }).join(' ') + '</div>';
    }

    // Secondary quick actions.
    html += '<div class="quick"><button class="btn" id="qa-climb">🧗 Log climbing</button><button class="btn" id="qa-gym">🏋️ Log gym/group</button></div>';
    html += '<button class="btn linklike" id="qa-lessons">＋ Start another lesson</button>' +
      '<div id="lessons-x" style="display:none"><div class="lesson-grid">' +
      CONTENT.lessonTemplates.map(function (l) { return '<button class="lesson-btn" data-t="' + l.id + '"><div class="lb-icon">' + l.icon + '</div><div class="lb-name">' + esc(l.name) + '</div></button>'; }).join('') +
      '</div></div>';

    // Slim goals strip (secondary) + map / settings.
    html += '<div class="goals-strip">Goals · ' +
      CONTENT.goals.map(function (goal) { return '<a href="#" class="goal-lnk" data-goal="' + goal.id + '">' + esc(goal.name) + '</a>'; }).join(' · ') +
      ' <span class="strip-actions"><button class="link" id="btn-map">🗺️</button> <button class="link" id="lnk-settings">⚙️</button></span></div>';
    html += '</div>';

    el('app').innerHTML = html;
    el('tc-cta').onclick = function () { dispatchCTA(t.cta); };
    el('qa-climb').onclick = function () { openClimbCheckin(); };
    el('qa-gym').onclick = function () { openGymLog(); };
    el('qa-lessons').onclick = function () { var x = el('lessons-x'); x.style.display = x.style.display === 'none' ? 'block' : 'none'; };
    Array.prototype.forEach.call(document.querySelectorAll('.lesson-btn'), function (btn) { btn.onclick = function () { startLesson(this.getAttribute('data-t')); }; });
    el('btn-map').onclick = function () { renderMap(); };
    el('lnk-settings').onclick = function (e) { e.preventDefault(); renderSettings(); };
    Array.prototype.forEach.call(document.querySelectorAll('.goal-lnk'), function (a) { a.onclick = function (e) { e.preventDefault(); renderMap(this.getAttribute('data-goal')); }; });
  }

  function dispatchCTA(cta) {
    switch (cta.action) {
      case 'start_lesson': startLesson(cta.arg); break;
      case 'start_support': openSupportLog(cta.arg); break;
      case 'log_climbing': openClimbCheckin(); break;
      case 'climb_checkin': openClimbCheckin(); break;
      case 'recovery': logRecovery(); break;
      case 'pain_checkin': openPainClarifier(); break;
      default: startLesson('pyramid');
    }
  }

  // ---- Climbing check-in (minimum: grade · limitation · pain area) ---------
  var LIMITATIONS = ['finger/grip', 'forearms pumped', 'explosive power', 'high step', 'technique', 'fear', 'endurance'];
  var PAIN_AREAS = ['none', 'fingers', 'wrist', 'elbow', 'shoulder', 'other'];
  var _climb = null;

  function openClimbCheckin() {
    _climb = { grade: 3, limitation: null, pain: 'none' };
    var html = '<div class="topbar"><div class="brand">🧗 Climbing check-in</div><button class="link" id="btn-home">Cancel</button></div><div class="pad">' +
      '<p class="muted small">Quick — logs the session even if you skip fields. Nothing is invented from blanks.</p>' +
      '<div class="section">Highest grade completed</div>' +
      '<div class="stepper"><button class="rnd" id="g-dec">−</button><span id="g-val">V3</span><button class="rnd" id="g-inc">+</button></div>' +
      '<div class="section">Main limitation (optional)</div><div class="opts" id="lim-opts">' +
      LIMITATIONS.map(function (l) { return '<button class="opt" data-v="' + l + '">' + l + '</button>'; }).join('') + '</div>' +
      '<div class="section">Any pain? (optional)</div><div class="opts" id="pain-opts">' +
      PAIN_AREAS.map(function (p) { return '<button class="opt' + (p === 'none' ? ' on' : '') + '" data-v="' + p + '">' + p + '</button>'; }).join('') + '</div>' +
      '<button class="btn primary" id="save-climb">Save climbing</button></div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
    el('g-dec').onclick = function () { _climb.grade = Math.max(0, _climb.grade - 1); el('g-val').textContent = 'V' + _climb.grade; };
    el('g-inc').onclick = function () { _climb.grade = _climb.grade + 1; el('g-val').textContent = 'V' + _climb.grade; };
    optPicker('lim-opts', function (v) { _climb.limitation = v; });
    optPicker('pain-opts', function (v) { _climb.pain = v; });
    el('save-climb').onclick = saveClimb;
  }
  function optPicker(id, cb) {
    Array.prototype.forEach.call(document.querySelectorAll('#' + id + ' .opt'), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(document.querySelectorAll('#' + id + ' .opt'), function (x) { x.classList.remove('on'); });
        b.classList.add('on'); cb(b.getAttribute('data-v'));
      };
    });
  }
  function saveClimb() {
    var sessions = Store.get('spc_sessions') || [];
    var painArea = _climb.pain && _climb.pain !== 'none' ? _climb.pain : null;
    sessions.push({ id: 'live_' + Date.now(), date: new Date().toISOString(), day: todayKey(), kind: 'climbing',
      checkin: { grade: _climb.grade, limitation: _climb.limitation, painArea: painArea, reported: true },
      pain: !!painArea, painArea: painArea, legacy: { source: 'preview-live' } });
    Store.set('spc_sessions', sessions);
    if (painArea) Store.set('spc_pain', { active: true, area: painArea, sourceType: 'climbing', at: new Date().toISOString() });
    renderHome();
  }

  // ---- Gym / group check-in (minimum marker: type · intensity, ≤2 taps) ----
  var GYM_TYPES = ['push', 'pull', 'legs', 'full', 'group class', 'other'];
  var _gymType = null;
  function openGymLog() {
    _gymType = null;
    var html = '<div class="topbar"><div class="brand">🏋️ Log gym / group</div><button class="link" id="btn-home">Cancel</button></div><div class="pad">' +
      '<p class="muted small">A marker only — not a full gym tracker. Tap a type, then an intensity.</p>' +
      '<div class="section">Session type</div><div class="opts" id="gt-opts">' +
      GYM_TYPES.map(function (g) { return '<button class="opt" data-v="' + g + '">' + g + '</button>'; }).join('') + '</div>' +
      '<div class="section">Intensity <span class="muted">(saves on tap)</span></div><div class="opts" id="gi-opts">' +
      ['easy', 'moderate', 'hard'].map(function (i) { return '<button class="opt" data-v="' + i + '">' + i + '</button>'; }).join('') + '</div></div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
    optPicker('gt-opts', function (v) { _gymType = v; });
    Array.prototype.forEach.call(document.querySelectorAll('#gi-opts .opt'), function (b) {
      b.onclick = function () { saveGym(_gymType || 'other', b.getAttribute('data-v')); };
    });
  }
  function saveGym(type, intensity) {
    var sessions = Store.get('spc_sessions') || [];
    sessions.push({ id: 'live_' + Date.now(), date: new Date().toISOString(), day: todayKey(), kind: 'gym', gymType: type, intensity: intensity, legacy: { source: 'preview-live' } });
    Store.set('spc_sessions', sessions);
    renderHome();
  }

  // ---- Recovery day + pain clarifier --------------------------------------
  function logRecovery() {
    var sessions = Store.get('spc_sessions') || [];
    sessions.push({ id: 'live_' + Date.now(), date: new Date().toISOString(), day: todayKey(), kind: 'rest', legacy: { source: 'preview-live' } });
    Store.set('spc_sessions', sessions);
    renderHome();
  }
  function openPainClarifier() {
    var html = '<div class="topbar"><div class="brand">🩹 Pain check-in</div><button class="link" id="btn-home">Cancel</button></div><div class="pad">' +
      '<p class="muted">You noted pain recently. Is it still bothering you, and where? Only the affected work is held back.</p>' +
      '<div class="opts">' +
      '<button class="opt" data-v="resolved">✓ Resolved — clear it</button>' +
      ['fingers', 'wrist', 'elbow', 'shoulder', 'other'].map(function (a) { return '<button class="opt" data-v="' + a + '">Still sore · ' + a + '</button>'; }).join('') +
      '</div></div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
    Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (b) {
      b.onclick = function () {
        var v = b.getAttribute('data-v');
        if (v === 'resolved') Store.set('spc_pain', { active: false, resolved: true, at: new Date().toISOString() });
        else Store.set('spc_pain', { active: true, area: v, resolved: false, at: new Date().toISOString() });
        renderHome();
      };
    });
  }

  // ---- Minimal support-skill log (records a practice session) --------------
  function openSupportLog(nodeId) {
    var n = CONTENT.nodes.find(function (x) { return x.id === nodeId; }) || { name: nodeId, unit: 'reps' };
    var state = Store.get('spc_state') || {};
    var pr = ((state.evidenceById || {})[nodeId] || {}).bestValue;
    var val = pr || (n.unit === 'seconds' ? 20 : 5);
    var html = '<div class="topbar"><div class="brand">' + esc(n.icon || '◎') + ' ' + esc(n.name) + '</div><button class="link" id="btn-home">Cancel</button></div><div class="pad">' +
      '<div class="section">Log result (' + esc(n.unit || 'reps') + ')</div>' +
      '<div class="stepper"><button class="rnd" id="s-dec">−</button><span id="s-val">' + val + '</span><button class="rnd" id="s-inc">+</button></div>' +
      '<button class="btn primary" id="s-save">Save</button></div>';
    el('app').innerHTML = html;
    var step = n.unit === 'seconds' ? 5 : 1;
    el('btn-home').onclick = renderHome;
    el('s-dec').onclick = function () { val = Math.max(0, val - step); el('s-val').textContent = val; };
    el('s-inc').onclick = function () { val = val + step; el('s-val').textContent = val; };
    el('s-save').onclick = function () {
      var sessions = Store.get('spc_sessions') || [];
      sessions.push({ id: 'live_' + Date.now(), date: new Date().toISOString(), day: todayKey(), kind: 'practice', nodeId: nodeId, unit: n.unit, value: val, legacy: { source: 'preview-live' } });
      Store.set('spc_sessions', sessions);
      var st = Store.get('spc_state') || { statusById: {}, evidenceById: {} };
      st.evidenceById = st.evidenceById || {};
      var prev = (st.evidenceById[nodeId] || {}).bestValue;
      st.evidenceById[nodeId] = Object.assign({}, st.evidenceById[nodeId], { bestValue: prev == null ? val : Math.max(prev, val) });
      Store.set('spc_state', st);
      renderHome();
    };
  }

  // ---- Skill map -----------------------------------------------------------
  function prereqSources(nodeId) {
    return CONTENT.edges.filter(function (e) { return e.to === nodeId && e.type === 'prereq' && e.from; });
  }
  function nodeName(id) { var n = CONTENT.nodes.find(function (x) { return x.id === id; }); return n ? n.name : id; }

  // Is this node shared by both goals (appears in both goals' branch sets)?
  function sharedByBothGoals(n) {
    return CONTENT.goals.filter(function (goal) { return goal.branchIds.indexOf(n.branch) >= 0; }).length >= 2;
  }

  // Compute Now / Next / Later / Foundation for one goal (hard prereqs only).
  function computeZones(goal, statusById) {
    // The active skill per branch comes from the explicit focus-tier rule in
    // the graph engine (active progression target › in-progress › assessment ›
    // available › other) — see SPCGraph.selectActiveNode.
    var now = [], foundation = [], usedNow = {};
    goal.branchIds.forEach(function (bid) {
      var id = SPCGraph.selectActiveNode(CONTENT, bid, statusById);
      if (id) { now.push(CONTENT.nodes.find(function (x) { return x.id === id; })); usedNow[id] = true; }
    });
    CONTENT.nodes.forEach(function (n) {
      if (goal.branchIds.indexOf(n.branch) < 0) return;
      if (statusById[n.id] === 'mastered') foundation.push(n);
    });
    // Next = locked nodes whose remaining unmet hard-prereqs are all "Now" nodes (one hop away).
    var next = [], later = [], frozen = [];
    CONTENT.nodes.forEach(function (n) {
      if (goal.branchIds.indexOf(n.branch) < 0) return;
      if (usedNow[n.id] || statusById[n.id] === 'mastered') return;
      if (n.readinessOnly) return;            // the readiness grade is the target, not a step
      if (n.frozen || n.stub) { frozen.push(n); return; }
      if (n.goalNode) { later.push(n); return; } // the goal node is always the final target
      if (statusById[n.id] === 'locked') {
        var unmet = prereqSources(n.id).filter(function (e) { return rankOf(statusById[e.from]) < rankOf(e.requiredStatus); });
        var allFromNow = unmet.length > 0 && unmet.every(function (e) { return usedNow[e.from]; });
        if (allFromNow) next.push(n); else later.push(n);
      } else {
        // available/in-progress but not chosen as the branch's Now → also coming up.
        next.push(n);
      }
    });
    return { now: now, next: next, later: later, frozen: frozen, foundation: foundation };
  }

  // Nearest concrete unlock: a Now node with an outgoing hard-prereq / assessment
  // edge into a locked node. Names the relationship; criterion deferred to skill.
  function nextUnlock(zones, statusById) {
    for (var i = 0; i < zones.now.length; i++) {
      var src = zones.now[i];
      var edge = CONTENT.edges.find(function (e) {
        if (e.from !== src.id) return false;
        if (e.type !== 'prereq' && e.type !== 'unlock:assessment') return false;
        if (statusById[e.to] !== 'locked') return false;
        var target = CONTENT.nodes.find(function (x) { return x.id === e.to; });
        // Never present a frozen/stub node as something that unlocks (e.g. Hangboard).
        return target && !target.frozen && !target.stub;
      });
      if (edge) return { from: src, to: CONTENT.nodes.find(function (x) { return x.id === edge.to; }), type: edge.type };
    }
    return null;
  }

  function renderMap(goalId) {
    UI.view = 'map';
    var ui = Store.get('spc_ui') || {};
    goalId = goalId || ui.mapGoal || CONTENT.goals[0].id;
    var filter = ui.mapFilter || 'active';
    Store.set('spc_ui', Object.assign({}, ui, { mapGoal: goalId, mapFilter: filter }));

    var goal = CONTENT.goals.find(function (x) { return x.id === goalId; });
    var other = CONTENT.goals.find(function (x) { return x.id !== goalId; });
    var g = currentGraph();
    var zones = computeZones(goal, g.statusById);
    var unlock = nextUnlock(zones, g.statusById);

    function nodeLine(n, opts) {
      opts = opts || {};
      var st = g.statusById[n.id];
      return '<button class="zn" data-node="' + n.id + '">' +
        '<span class="zn-dot" style="background:' + STATUS_META[st].color + '"></span>' +
        '<span class="zn-name">' + esc(n.name) + (n.frozen ? ' 🔒' : '') + '</span>' +
        (sharedByBothGoals(n) ? '<span class="zn-shared" title="shared by both goals">🔁</span>' : '') +
        (opts.status ? '<span class="zn-status" style="color:' + STATUS_META[st].color + '">' + STATUS_META[st].label + '</span>' : '') +
        '</span>';
    }
    function branchLabel(bid) { var b = CONTENT.branches.find(function (x) { return x.id === bid; }); return b ? b.icon + ' ' + b.name : bid; }

    var html = '<div class="topbar"><div class="brand">🗺️ ' + esc(goal.name) + '</div>' +
      '<button class="link" id="btn-swap">⇄ ' + esc(other.name) + '</button></div><div class="pad">';
    // Home + filter
    html += '<div class="map-top"><button class="link" id="btn-home">← Home</button>' +
      '<div class="filters">' + ['active', 'locked', 'completed', 'all'].map(function (f) {
        return '<button class="fchip' + (f === filter ? ' on' : '') + '" data-f="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + '</button>';
      }).join('') + '</div></div>';

    if (goal.readinessOnly === undefined && goal.targetNodeId === 'climb.v5') { /* keep */ }
    var isV5 = goal.id === 'goal.v5';
    if (isV5) html += '<div class="note muted small">ℹ️ No single unlock path — V5 is readiness-based. Strengthen the areas below.</div>';

    var showActive = filter === 'active' || filter === 'all';
    var showLocked = filter === 'locked' || filter === 'all';
    var showCompleted = filter === 'completed' || filter === 'all';

    if (showActive && unlock) {
      html += '<div class="unlock-card"><div class="uc-h">🔓 Next unlock</div>' +
        '<div class="uc-body">' + esc(unlock.from.name) + ' → ' + esc(unlock.to.name) + '</div>' +
        '<div class="muted small">Criterion: see skill (to be defined)</div></div>';
    }

    if (showActive) {
      html += '<div class="zone-h">▶ NOW — ' + (isV5 ? 'build these areas (one each)' : 'active next skill per branch') + '</div>';
      zones.now.forEach(function (n) {
        html += '<div class="now-row"><div class="now-branch muted small">' + esc(branchLabel(n.branch)) + '</div>' + nodeLine(n, { status: true }) + '</div>';
      });
      if (!zones.now.length) html += '<div class="muted small">Nothing active right now.</div>';

      if (zones.next.length) {
        html += '<div class="zone-h">⏭️ NEXT — coming up</div><div class="chips">' +
          zones.next.map(function (n) { return nodeLine(n); }).join('') + '</div>';
      }
      if (isV5) {
        html += '<div class="zone-h">🧗 ON THE WALL — not app-tracked yet</div>' +
          '<div class="muted small">Technique · route reading · fear exposure — captured by the climbing check-in.</div>';
      }
    }

    if ((showActive || showLocked) && zones.frozen.length) {
      html += '<div class="zone-h">🔒 FROZEN</div>';
      zones.frozen.forEach(function (n) {
        html += '<div class="frozen-row">' + nodeLine(n) + '<div class="muted small">needs: board type · hold depth · grip type · climbing frequency · finger capacity · pain history</div></div>';
      });
    }

    if (showLocked && zones.later.length) {
      html += '<div class="zone-h">🔒 LATER</div><div class="chips">' + zones.later.map(function (n) { return nodeLine(n); }).join('') + '</div>';
    }

    // Foundation completed (collapsed by default; expanded in Completed/All).
    html += '<div class="zone-h">✅ Foundation completed (' + zones.foundation.length + ') ' +
      (showCompleted ? '' : '<button class="link" id="btn-found">▸ expand</button>') + '</div>';
    if (showCompleted || ui.foundOpen) {
      html += '<div class="chips">' + (zones.foundation.length ? zones.foundation.map(function (n) { return nodeLine(n); }).join('') : '<span class="muted small">none yet</span>') + '</div>';
    }

    html += '</div>';
    el('app').innerHTML = html;
    el('btn-home').onclick = renderHome;
    el('btn-swap').onclick = function () { renderMap(other.id); };
    if (el('btn-found')) el('btn-found').onclick = function () { Store.set('spc_ui', Object.assign({}, Store.get('spc_ui') || {}, { foundOpen: true })); renderMap(goalId); };
    Array.prototype.forEach.call(document.querySelectorAll('.fchip'), function (b) {
      b.onclick = function () { Store.set('spc_ui', Object.assign({}, Store.get('spc_ui') || {}, { mapFilter: b.getAttribute('data-f') })); renderMap(goalId); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.zn'), function (b) {
      b.onclick = function () { renderNode(this.getAttribute('data-node')); };
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
      html += '<div class="complete"><div class="big">💪</div><h2>Lesson complete</h2><p class="muted">' + total + ' total reps · ' + s.sets.length + ' sets</p></div>' +
        '<div class="section">Any pain? (optional)</div><div class="opts" id="lesson-pain">' +
        PAIN_AREAS.map(function (p) { return '<button class="opt' + (p === 'none' ? ' on' : '') + '" data-v="' + p + '">' + (p === 'none' ? 'No pain' : p) + '</button>'; }).join('') + '</div>' +
        '<button class="btn primary" id="btn-save">Save & update skills</button>';
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
      LESSON._painArea = 'none';
      optPicker('lesson-pain', function (v) { LESSON._painArea = v; });
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
    var painArea = s._painArea && s._painArea !== 'none' ? s._painArea : null;
    var sessions = Store.get('spc_sessions') || [];
    sessions.push({ id: 'live_' + Date.now(), date: new Date().toISOString(), day: new Date().toISOString().slice(0, 10),
      kind: 'lesson', sessionType: s.templateId, lessonTemplateId: s.templateId, branchId: 'pull',
      pain: !!painArea, painArea: painArea,
      sets: s.sets.map(function (e, i) { return { migId: 'live_' + Date.now() + '_' + i, reps: e.reps, setType: e.setType, isWorking: e.setType !== 'skip' && e.reps > 0, date: new Date().toISOString() }; }),
      legacy: { source: 'preview-live' } });
    Store.set('spc_sessions', sessions);
    // Activity-specific pain: record the area so the Coach gates only affected work.
    if (painArea) Store.set('spc_pain', { active: true, area: painArea, sourceType: s.templateId, at: new Date().toISOString() });
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
