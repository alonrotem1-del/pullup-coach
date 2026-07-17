/*
 * Skill Progression Coach — Weekly Coach engine (pure, UMD). No DOM, no storage.
 * Two-stage decision: (1) hard safety/fatigue/schedule GATES eliminate
 * ineligible activities; (2) eligible activities are RANKED by weekly priority,
 * progression value, schedule fit and recovery comfort. Top → Today + CTA.
 *
 * Recovery windows are internal GUIDANCE defaults (not user settings). Current
 * pain, the active plan and recent load override them.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SPCCoach = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PULL_RECOVERY_H = 20;   // heavy pulling ≈ 20–24h guidance
  var GRIP_RECOVERY_H = 24;   // climbing / grip load ≈ 24h guidance
  var PAIN_LOOKBACK_H = 48;   // legacy boolean pain considered "recent" within 48h

  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Areas each activity loads → used for activity-specific pain gating.
  var LOADS = {
    pyramid:  ['elbow', 'shoulder', 'forearm'],
    ladder:   ['elbow', 'shoulder', 'forearm'],
    light:    ['elbow', 'shoulder'],
    max_test: ['elbow', 'shoulder', 'forearm'],
    climbing: ['fingers', 'forearm', 'shoulder'],
    'push.ring-support': ['shoulder'],
    'push.dips':         ['shoulder', 'elbow', 'wrist'],
    'grip.deadhang':     ['fingers', 'forearm', 'wrist'],
    'pull.scap-pullup':  ['shoulder'],
    'grip.wrist-roller': ['forearm', 'wrist']
  };
  // Pain area → the load areas it should gate.
  var PAIN_BLOCKS = {
    fingers:  ['fingers', 'forearm'],
    wrist:    ['wrist', 'forearm'],
    elbow:    ['elbow'],
    shoulder: ['shoulder'],
    other:    [],      // unknown location → gate by in-progress activity type instead
    unknown:  []
  };
  // Pulling session types — template names (pyramid/ladder/…) AND the legacy
  // Pull-Up Coach type names (strength/volume/…) that migrated sessions carry.
  var PULL_TYPES = { pyramid: 1, ladder: 1, light: 1, max_test: 1, strength: 1, volume: 1 };

  function dayKey(d) {
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function weekStart(now) { var s = new Date(now); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - s.getDay()); return s; }
  function hoursBetween(a, b) { return (a.getTime() - b.getTime()) / 3600000; }

  function planType(plan, date) {
    if (!plan) return 'rest';
    return plan[date.getDay()] || 'rest';
  }

  // ---- Gather what happened this week + fatigue signals --------------------
  function summarize(sessions, now) {
    var ws = weekStart(now), wsk = dayKey(ws);
    var out = {
      completedByType: {}, climbingDays: [], gymDays: [], supportDone: {},
      lastPull: null, lastClimb: null, painEntries: [], sessionsThisWeek: []
    };
    (sessions || []).forEach(function (s) {
      var d = s.date ? new Date(s.date) : (s.day ? new Date(s.day + 'T12:00:00') : null);
      if (!d) return;
      var inWeek = dayKey(d) >= wsk;
      if (s.kind === 'lesson' && PULL_TYPES[s.sessionType || s.lessonTemplateId]) {
        if (!out.lastPull || d > out.lastPull) out.lastPull = d;
      }
      if (s.kind === 'climbing') { if (!out.lastClimb || d > out.lastClimb) out.lastClimb = d; }
      if (s.pain) out.painEntries.push({ date: d, area: s.painArea || 'unknown', sourceType: s.sessionType || s.kind });
      if (!inWeek) return;
      out.sessionsThisWeek.push(s);
      if (s.kind === 'lesson') {
        var t = s.sessionType || s.lessonTemplateId; out.completedByType[t] = (out.completedByType[t] || 0) + 1;
      } else if (s.kind === 'climbing') { out.climbingDays.push(dayKey(d)); }
      else if (s.kind === 'gym') { out.gymDays.push(dayKey(d)); }
      else if (s.kind === 'practice') {
        var id = s.nodeId || s.legacySkillId; if (id) out.supportDone[id] = (out.supportDone[id] || 0) + 1;
      }
    });
    return out;
  }

  // ---- Current pain (activity-specific) -----------------------------------
  function derivePain(summary, painOverride, now) {
    if (painOverride && painOverride.resolved) return { active: false };
    if (painOverride && painOverride.active) {
      return { active: true, area: painOverride.area || 'unknown', sourceType: painOverride.sourceType || null, source: 'clarified' };
    }
    // Otherwise the most recent pain entry within the lookback window.
    var recent = null;
    summary.painEntries.forEach(function (p) {
      if (hoursBetween(now, p.date) <= PAIN_LOOKBACK_H && (!recent || p.date > recent.date)) recent = p;
    });
    if (!recent) return { active: false };
    return { active: true, area: recent.area, sourceType: recent.sourceType, source: recent.area === 'unknown' ? 'legacy' : 'reported' };
  }

  function painBlocksActivity(pain, activity) {
    if (!pain.active) return false;
    var blocked = PAIN_BLOCKS[pain.area] || [];
    if (blocked.length) {
      var loads = activity.loads || [];
      return loads.some(function (a) { return blocked.indexOf(a) >= 0; });
    }
    // Unknown/other location → gate only the activity TYPE that was in progress
    // when pain was logged (e.g. pain during a pulling lesson → caution pulling).
    if (pain.sourceType && PULL_TYPES[pain.sourceType]) return !!activity.isPull;
    if (pain.sourceType === 'climbing') return (activity.loads || []).indexOf('forearm') >= 0;
    return false;
  }

  // ---- Weekly targets: derived from the plan + support frequencies ---------
  function buildTargets(plan, supportTargets, now) {
    var t = { pyramid: 0, ladder: 0, light: 0, climbing: 0, support: {} };
    for (var i = 0; i < 7; i++) {
      var type = (plan && plan[i]) || 'rest';
      if (type === 'strength') t.pyramid++;
      else if (type === 'volume') t.ladder++;
      else if (type === 'light') t.light++;
      else if (type === 'bouldering') t.climbing++;
      // max_test intentionally excluded — manual / progression-triggered only.
    }
    (supportTargets || []).forEach(function (s) { if (s.freq > 0) t.support[s.nodeId || s.id] = s.freq; });
    return t;
  }

  // ---- Candidate activities ------------------------------------------------
  function buildCandidates(targets, summary, supportTargets, content, todayType) {
    var list = [];
    function pullActivity(id, template, icon, label) {
      return { id: id, kind: 'lesson', templateId: template, icon: icon, label: label,
        loads: LOADS[template] || [], isPull: !!PULL_TYPES[template] };
    }
    var pyramidRemaining = Math.max(0, targets.pyramid - (summary.completedByType.pyramid || summary.completedByType.strength || 0));
    var ladderRemaining  = Math.max(0, targets.ladder  - (summary.completedByType.ladder  || summary.completedByType.volume  || 0));
    var lightRemaining   = Math.max(0, targets.light   - (summary.completedByType.light || 0));
    var climbRemaining   = Math.max(0, targets.climbing - summary.climbingDays.length);

    if (targets.pyramid > 0 && pyramidRemaining > 0) list.push(Object.assign(pullActivity('pyramid', 'pyramid', '💪', 'Pyramid Day'), { anchor: true, remaining: pyramidRemaining }));
    if (targets.ladder > 0 && ladderRemaining > 0)   list.push(Object.assign(pullActivity('ladder', 'ladder', '🔄', 'Ladder Day'), { anchor: true, remaining: ladderRemaining }));
    if (targets.light > 0 && lightRemaining > 0)     list.push(Object.assign(pullActivity('light', 'light', '🌱', 'Light Practice'), { light: true, remaining: lightRemaining }));

    // Climbing (only meaningful on / near a planned climbing day).
    if (climbRemaining > 0) {
      var loggedToday = summary.climbingDays.indexOf(dayKey(new Date())) >= 0;
      list.push({ id: 'climbing', kind: 'climbing', icon: '🧗', label: 'Climbing', loads: LOADS.climbing, remaining: climbRemaining, loggedToday: loggedToday });
    }

    // Support skills behind their weekly target.
    (supportTargets || []).forEach(function (s) {
      var nid = s.nodeId || s.id;
      var done = summary.supportDone[nid] || 0;
      var rem = (targets.support[nid] || 0) - done;
      if (rem > 0) list.push({ id: nid, kind: 'support', nodeId: nid, icon: s.icon || '◎', label: s.name, loads: LOADS[nid] || [], remaining: rem, isPull: false });
    });

    return list;
  }

  // ---- Stage 1: hard gates -------------------------------------------------
  function gate(candidate, ctx) {
    var reasons = [];
    // Pain (activity-specific)
    if (painBlocksActivity(ctx.pain, candidate)) reasons.push({ code: 'pain', text: painGateText(ctx.pain) });
    // Schedule (plan) gates
    if (ctx.todayType === 'rest') { if (candidate.kind !== 'recovery') reasons.push({ code: 'rest_day', text: 'rest day in your plan' }); }
    if (ctx.todayType === 'bouldering' && candidate.isPull) reasons.push({ code: 'climb_day', text: "climbing day — don't stack pulling" });
    // Recovery gates
    if (candidate.isPull && ctx.hoursSincePull != null && ctx.hoursSincePull < PULL_RECOVERY_H)
      reasons.push({ code: 'pull_recovery', text: 'recent pulling — recover first' });
    var gripHeavy = (candidate.loads || []).indexOf('fingers') >= 0 || (candidate.loads || []).indexOf('forearm') >= 0;
    if (gripHeavy && candidate.kind !== 'climbing' && ctx.hoursSinceClimb != null && ctx.hoursSinceClimb < GRIP_RECOVERY_H)
      reasons.push({ code: 'grip_recovery', text: 'forearms still loaded from climbing' });
    return reasons;
  }
  function painGateText(pain) {
    var where = pain.area && pain.area !== 'unknown' ? pain.area : 'a recent';
    return where + ' pain flagged — holding off on the affected work';
  }

  // ---- Stage 2: ranking ----------------------------------------------------
  function score(candidate, ctx) {
    var weekly = candidate.anchor ? 3 : candidate.kind === 'climbing' ? 3 : candidate.kind === 'support' ? 2 : candidate.light ? 1 : 0;
    var progression = 2; // every eligible candidate advances an active goal in this slice
    var schedule = matchesToday(candidate, ctx.todayType) ? 1 : 0;
    var recovery = candidate.isPull && ctx.hoursSincePull != null && ctx.hoursSincePull < PULL_RECOVERY_H * 1.5 ? 0 : 1;
    return [weekly, progression, schedule, recovery];
  }
  function matchesToday(c, todayType) {
    return (c.templateId === 'pyramid' && todayType === 'strength') ||
           (c.templateId === 'ladder' && todayType === 'volume') ||
           (c.templateId === 'light' && todayType === 'light') ||
           (c.kind === 'climbing' && todayType === 'bouldering');
  }
  function cmpScore(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return b[i] - a[i]; } return 0; }

  // ---- CTA + why for the chosen activity ----------------------------------
  function ctaFor(c) {
    if (!c) return { label: 'Log recovery day', action: 'recovery' };
    if (c.kind === 'climbing') return c.loggedToday ? { label: 'Complete check-in', action: 'climb_checkin' } : { label: 'Log climbing', action: 'log_climbing' };
    if (c.kind === 'support') return { label: 'Start ' + c.label, action: 'start_support', arg: c.nodeId };
    if (c.templateId === 'light') return { label: 'Start Light Practice', action: 'start_lesson', arg: 'light' };
    if (c.templateId === 'pyramid') return { label: 'Start Pyramid', action: 'start_lesson', arg: 'pyramid' };
    if (c.templateId === 'ladder') return { label: 'Start Ladder', action: 'start_lesson', arg: 'ladder' };
    return { label: 'Start ' + c.label, action: 'start_lesson', arg: c.templateId };
  }

  // ---- Public: full weekly recommendation ---------------------------------
  function recommend(input) {
    var now = input.now ? new Date(input.now) : new Date();
    var summary = summarize(input.sessions, now);
    var pain = derivePain(summary, input.painOverride, now);
    var todayType = planType(input.plan, now);
    var targets = buildTargets(input.plan, input.supportTargets, now);
    var candidates = buildCandidates(targets, summary, input.supportTargets, input.content, todayType);

    var ctx = {
      todayType: todayType, pain: pain,
      hoursSincePull: summary.lastPull ? hoursBetween(now, summary.lastPull) : null,
      hoursSinceClimb: summary.lastClimb ? hoursBetween(now, summary.lastClimb) : null
    };

    // Stage 1
    var eligible = [], dropped = [];
    candidates.forEach(function (c) {
      var r = gate(c, ctx);
      if (r.length) dropped.push({ activity: c, reasons: r }); else eligible.push(c);
    });

    // Stage 2
    eligible.sort(function (a, b) { return cmpScore(score(a, ctx), score(b, ctx)); });
    var top = eligible[0] || null;

    // Today card
    var today;
    if (pain.active && !top) {
      today = { kind: 'pain', icon: '🩹', label: 'Take it easy', detail: '', why: painWhy(pain), cta: { label: 'Update pain check-in', action: 'pain_checkin' } };
    } else if (!top) {
      today = { kind: 'recovery', icon: '😌', label: 'Recovery day', detail: todayType === 'rest' ? 'Rest is in your plan today.' : 'Nothing required today.',
        why: recoveryWhy(ctx, todayType), cta: { label: 'Log recovery day', action: 'recovery' } };
    } else {
      today = { kind: top.kind, activity: top, icon: top.icon, label: top.label, detail: detailFor(top),
        why: whyFor(top, ctx, targets, summary), cta: ctaFor(top) };
    }

    return {
      today: today,
      progress: weeklyProgress(targets, summary),
      completed: buildCompleted(summary),
      remaining: buildRemaining(targets, summary, input.supportTargets, eligible, top),
      skipNow: buildSkipNow(dropped, summary, targets, ctx, pain).slice(0, 3),
      pain: pain,
      _debug: { todayType: todayType, eligible: eligible.map(function (e) { return e.id; }), dropped: dropped.map(function (d) { return d.activity.id; }) }
    };
  }

  // Derived weekly-progress summary (presentation only). Counts ONLY real
  // weekly targets from the plan + support frequencies — never Max Test,
  // frozen skills, or optional extra work. Completed is capped at target.
  function weeklyProgress(targets, summary) {
    var pairs = [
      [targets.pyramid, (summary.completedByType.pyramid || summary.completedByType.strength || 0)],
      [targets.ladder,  (summary.completedByType.ladder  || summary.completedByType.volume  || 0)],
      [targets.light,   (summary.completedByType.light || 0)],
      [targets.climbing, summary.climbingDays.length]
    ];
    Object.keys(targets.support).forEach(function (nid) { pairs.push([targets.support[nid], summary.supportDone[nid] || 0]); });
    var total = 0, done = 0;
    pairs.forEach(function (p) { total += p[0]; done += Math.min(p[1], p[0]); });
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function detailFor(c) {
    if (c.templateId === 'pyramid') return 'Start target: 5 — following sets adapt to your actual performance.';
    if (c.templateId === 'ladder') return 'Ladder rungs × rounds, no failure.';
    if (c.templateId === 'light') return 'Easy technique mini-sets.';
    if (c.kind === 'climbing') return 'Climbing session — high grip and pulling load.';
    if (c.kind === 'support') return 'Support skill.';
    return '';
  }
  function whyFor(c, ctx, targets, summary) {
    if (c.anchor) {
      var fresh = ctx.hoursSincePull == null ? 'no recent pulling' : ('last pull ' + Math.round(ctx.hoursSincePull) + 'h ago');
      return 'Your ' + c.label + ' anchor is still open this week and you\'re recovered (' + fresh + ', no current pain).';
    }
    if (c.kind === 'climbing') return 'A climbing session is on your plan and not logged yet this week.';
    if (c.kind === 'support') return c.label + ' is behind its weekly target and doesn\'t conflict with today.';
    if (c.light) return 'A light technique day fits — you\'re fresh and anchors are handled.';
    return 'Best fit for today given your plan and recovery.';
  }
  function painWhy(pain) {
    var where = pain.area && pain.area !== 'unknown' ? ('Your ' + pain.area) : 'A recent';
    return where + ' pain is flagged. Affected work is on hold; unaffected areas (e.g. legs, core) are fine. Update the check-in when it settles.';
  }
  function recoveryWhy(ctx, todayType) {
    if (todayType === 'rest') return 'Your plan schedules rest today.';
    if (ctx.hoursSincePull != null && ctx.hoursSincePull < PULL_RECOVERY_H) return 'You pulled recently — giving it time to recover.';
    return 'Anchors are done and nothing else is due — a lighter day is fine.';
  }

  function buildCompleted(summary) {
    var out = [];
    if (summary.completedByType.pyramid || summary.completedByType.strength) out.push({ icon: '💪', label: 'Pyramid' });
    if (summary.completedByType.ladder || summary.completedByType.volume) out.push({ icon: '🔄', label: 'Ladder' });
    if (summary.completedByType.light) out.push({ icon: '🌱', label: 'Light' });
    if (summary.completedByType.max_test) out.push({ icon: '🏆', label: 'Max Test' });
    summary.climbingDays.forEach(function () { out.push({ icon: '🧗', label: 'Climb' }); });
    summary.gymDays.forEach(function () { out.push({ icon: '🏋️', label: 'Gym' }); });
    Object.keys(summary.supportDone).forEach(function (id) { out.push({ icon: '◎', label: 'Support' }); });
    return out;
  }
  function buildRemaining(targets, summary, supportTargets, eligible, top) {
    var out = [];
    var pRem = Math.max(0, targets.pyramid - (summary.completedByType.pyramid || summary.completedByType.strength || 0));
    var lRem = Math.max(0, targets.ladder - (summary.completedByType.ladder || summary.completedByType.volume || 0));
    var cRem = Math.max(0, targets.climbing - summary.climbingDays.length);
    if (pRem) out.push({ icon: '💪', label: 'Pyramid' + (top && top.id === 'pyramid' ? ' ← today' : '') });
    if (lRem) out.push({ icon: '🔄', label: 'Ladder' + (top && top.id === 'ladder' ? ' ← today' : '') });
    if (cRem) out.push({ icon: '🧗', label: 'Climb ×' + cRem });
    (supportTargets || []).forEach(function (s) {
      var nid = s.nodeId || s.id; var rem = (targets.support[nid] || 0) - (summary.supportDone[nid] || 0);
      if (rem > 0) out.push({ icon: s.icon || '◎', label: s.name + ' ×' + rem });
    });
    return out;
  }
  function buildSkipNow(dropped, summary, targets, ctx, pain) {
    var out = [];
    // Max Test is never scheduled — surface it as a "not now" with the freshest reason.
    out.push({ icon: '🏆', label: 'Max Test', reason: ctx.hoursSincePull != null && ctx.hoursSincePull < 48 ? 'not fresh' : 'only when you choose it' });
    // Hangboard is frozen.
    out.push({ icon: '🪝', label: 'Hangboard', reason: 'frozen' });
    // Over-cap: if the ladder anchor is already done this week, an extra round is over cap.
    if ((summary.completedByType.ladder || summary.completedByType.volume) && targets.ladder > 0)
      out.push({ icon: '➕', label: 'Extra Ladder round', reason: 'over weekly cap' });
    // Pulling held back for pain/recovery (dedup with a single line).
    var pullHeld = dropped.some(function (d) { return d.activity.isPull && d.reasons.some(function (r) { return r.code === 'pain' || r.code === 'pull_recovery'; }); });
    if (pullHeld) out.unshift({ icon: '💪', label: 'More pulling', reason: pain.active ? 'pain flagged' : 'recover first' });
    return out;
  }

  return {
    PULL_RECOVERY_H: PULL_RECOVERY_H, GRIP_RECOVERY_H: GRIP_RECOVERY_H,
    recommend: recommend,
    _summarize: summarize, _derivePain: derivePain, _buildTargets: buildTargets, _painBlocksActivity: painBlocksActivity, _weeklyProgress: weeklyProgress
  };
});
