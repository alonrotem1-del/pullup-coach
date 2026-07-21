/*
 * Skill Progression Coach — content/seed layer (data-driven, UMD, pure data).
 *
 * The whole product is rendered from this configuration. Adding a new world
 * later means adding another entry to WORLDS — no renderer/engine change.
 *
 * A world has branches (visual/logical groupings) and nodes. Each node carries
 * its own curated map coordinates (col = horizontal stage, row = vertical lane),
 * its prerequisites (with AND/OR semantics), mastery criteria, and the session
 * templates that train it. Connectors are generated from prerequisites + the
 * optional `supports` edges — nothing about the graph is hardcoded in the UI.
 *
 * Thresholds are editable PRODUCT DEFAULTS, not scientific truth.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoachData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // A criterion is real, checkable progress: current/target of some unit.
  // Node is "complete" when every criterion reaches its target.
  function crit(id, label, target, unit) {
    return { id: id, label: label, target: target, unit: unit || '' };
  }

  // ---- WORLD 1 — BAR MUSCLE-UP -------------------------------------------
  // col: 0=foundation … 6=integration.  row: 0..4 lanes (branches).
  var MUSCLEUP = {
    id: 'muscleup',
    slug: 'bar-muscle-up',
    name: 'מתח מקורי (Bar Muscle-Up)',
    subtitle: 'Bar Muscle-Up',
    goal: 'מתח-על נקי ומבוקר על מוט',
    order: 1,
    theme: { accent: '#38bdf8', glow: '#7dd3fc' }, // electric blue
    icon: 'muscleup',
    branches: [
      { id: 'found', name: 'בסיס משיכה', type: 'foundation', mainline: true },
      { id: 'strength', name: 'כוח משיכה', type: 'strength', mainline: true },
      { id: 'highpull', name: 'משיכה נפיצה', type: 'power', mainline: true },
      { id: 'transition', name: 'מעבר', type: 'skill', mainline: true },
      { id: 'dip', name: 'דחיפה ותמיכה', type: 'support' },
      { id: 'core', name: 'ליבה ושליטת גוף', type: 'support' },
      { id: 'integration', name: 'שילוב', type: 'milestone', mainline: true }
    ],
    nodes: [
      // Foundation
      { id: 'mu_deadhang', branchId: 'found', name: 'תליה פעילה', subtitle: 'Active Dead Hang',
        col: 0, row: 1, type: 'foundation', prereq: null,
        why: 'בריאות כתף וכוח אחיזה — הבסיס לכל משיכה.',
        criteria: [crit('hold', 'תליה יציבה', 30, 'שנ')],
        seed: { fromBench: 'deadhang_secs', completeIfBench: { key: 'pullup_max', gte: 4 } }, templates: ['mu_light'] },
      { id: 'mu_scap', branchId: 'found', name: 'משיכת שכמות', subtitle: 'Scapular Pull-Up',
        col: 0, row: 2, type: 'foundation', prereq: null,
        why: 'שליטה בשכמות — מפעילה נכון את הגב לפני כיפוף מרפק.',
        criteria: [crit('reps', 'חזרות נקיות', 8, 'חזרות')],
        seed: { completeIfBench: { key: 'pullup_max', gte: 6 } }, templates: ['mu_light'] },
      { id: 'mu_pull1', branchId: 'found', name: 'מתח ראשון', subtitle: 'First Strict Pull-Up',
        col: 1, row: 1, type: 'foundation', prereq: { all: ['mu_deadhang', 'mu_scap'] },
        why: 'אבן דרך ראשונה במסלול המשיכה.',
        criteria: [crit('reps', 'מתח נקי אחד', 1, 'חזרה')],
        seed: { fromBench: 'pullup_max', asReps: true }, templates: ['mu_strength'] },
      { id: 'mu_pull5', branchId: 'found', name: '5 מתחים', subtitle: '5 Strict Pull-Ups',
        col: 2, row: 1, type: 'strength', prereq: { all: ['mu_pull1'] },
        why: 'בסיס כוח לפני נפח וסף המעבר.',
        criteria: [crit('reps', 'מתח רצוף', 5, 'חזרות')],
        seed: { fromBench: 'pullup_max', asReps: true }, templates: ['mu_strength', 'mu_volume'] },
      // Strength / high pull
      { id: 'mu_pull10', branchId: 'strength', name: '10 מתחים', subtitle: '10 Strict Pull-Ups',
        col: 3, row: 1, type: 'strength', prereq: { all: ['mu_pull5'] },
        why: 'עתודת כוח־סבולת שמאפשרת משיכה גבוהה חוזרת.',
        criteria: [crit('reps', 'מתח רצוף', 10, 'חזרות')],
        seed: { fromBench: 'pullup_max', asReps: true }, templates: ['mu_strength', 'mu_volume'] },
      { id: 'mu_fastpull', branchId: 'highpull', name: 'מתח נפיץ', subtitle: 'Explosive Pull-Up',
        col: 3, row: 0, type: 'power', prereq: { all: ['mu_pull5'] },
        why: 'עוצמת המשיכה הראשונית שדוחפת את החזה גבוה.',
        criteria: [crit('reps', 'חזרות נפיצות נקיות', 5, 'חזרות')], templates: ['mu_highpull'] },
      { id: 'mu_c2b', branchId: 'highpull', name: 'חזה-למוט', subtitle: 'Strict Chest-to-Bar',
        col: 4, row: 0, type: 'power', prereq: { all: ['mu_fastpull', 'mu_pull10'] },
        why: 'טווח המשיכה שנדרש כדי לעבור מעל המוט.',
        criteria: [crit('reps', 'חזה-למוט נקי', 3, 'חזרות')], templates: ['mu_highpull'] },
      // Support / dip
      { id: 'mu_support', branchId: 'dip', name: 'תמיכה על מוט', subtitle: 'Straight-Bar Support',
        col: 1, row: 3, type: 'support', prereq: null,
        why: 'המצב שאליו נוחתים אחרי המעבר — חייב להיות יציב.',
        criteria: [crit('hold', 'תמיכה יציבה', 15, 'שנ')],
        seed: { fromBench: 'ring_support_secs' }, templates: ['mu_dip'] },
      { id: 'mu_dip5', branchId: 'dip', name: '5 מקבילים במוט', subtitle: '5 Straight-Bar Dips',
        col: 2, row: 3, type: 'support', prereq: { all: ['mu_support'] },
        why: 'כוח הדחיפה שמסיים את המתח-על מעל המוט.',
        criteria: [crit('reps', 'מקבילים נקיים', 5, 'חזרות')],
        seed: { fromBench: 'dips_max', asReps: true }, templates: ['mu_dip'] },
      // Core
      { id: 'mu_hollow', branchId: 'core', name: 'אחזקת גוף חלול', subtitle: 'Hollow Body Hold',
        col: 1, row: 4, type: 'support', prereq: null,
        why: 'קו גוף אסוף מפחית נדנוד ומבזבז פחות אנרגיה.',
        criteria: [crit('hold', 'אחזקה יציבה', 30, 'שנ')], templates: ['mu_light'] },
      { id: 'mu_knee', branchId: 'core', name: 'הרמת ברכיים בשליטה', subtitle: 'Controlled Knee Raise',
        col: 2, row: 4, type: 'support', prereq: { all: ['mu_hollow'] },
        why: 'שליטה בפלג גוף תחתון תוך כדי משיכה.',
        criteria: [crit('reps', 'חזרות בשליטה', 10, 'חזרות')], templates: ['mu_light'] },
      // Transition
      { id: 'mu_lowtrans', branchId: 'transition', name: 'תרגיל מעבר נמוך', subtitle: 'Low-Bar Transition Drill',
        col: 3, row: 2, type: 'skill', prereq: { all: ['mu_dip5'] },
        why: 'לומדים את תחושת המעבר בגובה בטוח.',
        criteria: [crit('sessions', 'אימוני מעבר', 3, 'אימונים')], templates: ['mu_transition'] },
      { id: 'mu_negmu', branchId: 'transition', name: 'מתח-על שלילי בשליטה', subtitle: 'Controlled Negative Muscle-Up',
        col: 4, row: 2, type: 'skill', prereq: { all: ['mu_lowtrans', 'mu_pull10'] },
        why: 'בונה את מסלול המעבר המלא בירידה מבוקרת.',
        criteria: [crit('reps', 'שליליים בשליטה', 3, 'חזרות')], templates: ['mu_transition'] },
      // Integration
      { id: 'mu_bandmu', branchId: 'integration', name: 'מתח-על בגומיה', subtitle: 'Banded Bar Muscle-Up',
        col: 5, row: 1, type: 'milestone', prereq: { all: ['mu_c2b', 'mu_negmu', 'mu_dip5'] },
        why: 'חיבור כל השרשרת בסיוע קל.',
        criteria: [crit('reps', 'חזרות בגומיה', 3, 'חזרות')], templates: ['mu_integrate'] },
      { id: 'mu_firstmu', branchId: 'integration', name: 'מתח-על ראשון', subtitle: 'First Bar Muscle-Up',
        col: 6, row: 1, type: 'milestone',
        // AND/OR: needs pulling pathway AND transition AND dip — but NOT every optional node.
        prereq: { all: ['mu_bandmu'], any: ['mu_c2b', 'mu_negmu'], noPain: true },
        why: 'אבן הדרך המרכזית של העולם הזה.',
        criteria: [crit('reps', 'מתח-על נקי אחד', 1, 'חזרה')], templates: ['mu_integrate', 'mu_test'] },
      { id: 'mu_reps', branchId: 'integration', name: 'שלושה סינגלים נקיים', subtitle: 'Three Clean Singles',
        col: 6, row: 0, type: 'maintenance', prereq: { all: ['mu_firstmu'] },
        why: 'הפיכת ההישג לחזרתי ואמין.',
        criteria: [crit('reps', 'סינגלים נקיים', 3, 'חזרות')], templates: ['mu_integrate'] }
    ],
    // optional supporting (dashed) edges beyond hard prerequisites
    supports: [
      ['mu_knee', 'mu_negmu'], ['mu_hollow', 'mu_firstmu'], ['mu_support', 'mu_bandmu']
    ]
  };

  // ---- WORLD 2 — BOULDERING: PATH TO V5 ----------------------------------
  var BOULDER = {
    id: 'boulder',
    slug: 'bouldering-v5',
    name: 'באולדרינג — הדרך ל-V5',
    subtitle: 'Bouldering · Path to V5',
    goal: 'לשלוח בעקביות בעיות V5 בכמה סגנונות',
    order: 2,
    theme: { accent: '#22d3a6', glow: '#6ee7c7' }, // teal-green
    icon: 'boulder',
    note: 'דירוגי קיר מקורה משתנים בין חדרי כושר — התייחס אליהם כהערכה.',
    branches: [
      { id: 'grade', name: 'ביסוס דרגות', type: 'milestone', mainline: true },
      { id: 'foot', name: 'עבודת רגליים ומיקום גוף', type: 'skill' },
      { id: 'move', name: 'אוצר תנועה', type: 'skill' },
      { id: 'tension', name: 'כוח ומתח גוף', type: 'strength' },
      { id: 'tactics', name: 'טקטיקה ופרויקטים', type: 'foundation' }
    ],
    nodes: [
      // Grade consolidation lane (row 1)
      { id: 'b_v0', branchId: 'grade', name: 'כמה בעיות V0', subtitle: 'Several V0 Problems',
        col: 0, row: 1, type: 'foundation', prereq: null,
        why: 'היכרות עם תנועה בסיסית וביטחון על הקיר.',
        criteria: [crit('sends', 'בעיות שהושלמו', 5, 'בעיות')], templates: ['b_volume'] },
      { id: 'b_v1', branchId: 'grade', name: 'ביסוס V1', subtitle: 'Consolidate V1',
        col: 1, row: 1, type: 'strength', prereq: { all: ['b_v0'] },
        why: 'לא שליחה בודדת — כמה בעיות בכמה סגנונות.',
        criteria: [crit('sends', 'בעיות V1', 4, 'בעיות'), crit('styles', 'סגנונות שונים', 2, 'סגנונות')],
        templates: ['b_volume', 'b_consolidate'] },
      { id: 'b_v2', branchId: 'grade', name: 'ביסוס V2', subtitle: 'Consolidate V2',
        col: 2, row: 1, type: 'strength', prereq: { all: ['b_v1'] },
        why: 'העמקת אוצר התנועה בדרגה בינונית.',
        criteria: [crit('sends', 'בעיות V2', 4, 'בעיות'), crit('styles', 'סגנונות שונים', 2, 'סגנונות')],
        templates: ['b_consolidate'] },
      { id: 'b_v3', branchId: 'grade', name: 'ביסוס V3', subtitle: 'Consolidate V3',
        col: 3, row: 1, type: 'strength', prereq: { all: ['b_v2'] },
        why: 'הדרגה שבה טכניקה מתחילה להכריע מעל כוח.',
        criteria: [crit('sends', 'בעיות V3', 3, 'בעיות'), crit('styles', 'סגנונות שונים', 2, 'סגנונות')],
        templates: ['b_consolidate', 'b_project'] },
      { id: 'b_v4', branchId: 'grade', name: 'V4 ראשון', subtitle: 'First V4',
        col: 4, row: 1, type: 'milestone', prereq: { all: ['b_v3'], any: ['b_flag', 'b_lockoff'] },
        why: 'קפיצת מדרגה שדורשת רגליים טובות ומתח גוף.',
        criteria: [crit('sends', 'שליחת V4', 1, 'בעיה')], templates: ['b_project'] },
      { id: 'b_v5proj', branchId: 'grade', name: 'פרויקט V5 ראשון', subtitle: 'First V5 Project',
        col: 5, row: 1, type: 'milestone', prereq: { all: ['b_v4'] },
        why: 'לבחור בעיית V5 ולהגיע לקרוקס.',
        criteria: [crit('crux', 'הגעה לקרוקס', 1, 'פעם'), crit('sessions', 'אימוני פרויקט', 2, 'אימונים')],
        templates: ['b_project'] },
      { id: 'b_v5', branchId: 'grade', name: 'שליחת V5', subtitle: 'First V5 Send',
        col: 6, row: 1, type: 'milestone',
        prereq: { all: ['b_v5proj'], any: ['b_multisession', 'b_overhang'], noPain: true },
        why: 'אבן הדרך המרכזית של העולם.',
        criteria: [crit('sends', 'שליחת V5', 1, 'בעיה')], templates: ['b_project', 'b_test'] },
      // Footwork lane (row 2)
      { id: 'b_silentfeet', branchId: 'foot', name: 'רגליים שקטות', subtitle: 'Silent Feet',
        col: 1, row: 2, type: 'skill', prereq: null,
        why: 'דיוק בהנחת רגל — הבסיס לטכניקה יעילה.',
        criteria: [crit('sessions', 'אימונים עם מיקוד', 2, 'אימונים')], templates: ['b_technique'] },
      { id: 'b_flag', branchId: 'foot', name: 'דגל (Flag)', subtitle: 'Flagging',
        col: 2, row: 2, type: 'skill', prereq: { all: ['b_silentfeet'] },
        why: 'איזון בלי אחיזת רגל נוספת — חוסך כוח.',
        criteria: [crit('sessions', 'שימוש מכוון', 2, 'אימונים')], templates: ['b_technique'] },
      { id: 'b_dropknee', branchId: 'foot', name: 'דרופ-ני', subtitle: 'Drop Knee',
        col: 3, row: 2, type: 'skill', prereq: { all: ['b_flag'] },
        why: 'מקרב את הגוף לקיר ומאריך הישג יד.',
        criteria: [crit('sessions', 'שימוש מכוון', 2, 'אימונים')], templates: ['b_technique'] },
      // Movement lane (row 3)
      { id: 'b_deadpoint', branchId: 'move', name: 'דד-פוינט', subtitle: 'Deadpoint',
        col: 2, row: 3, type: 'skill', prereq: { all: ['b_v1'] },
        why: 'תפיסה דינמית בנקודת השיא של התנועה.',
        criteria: [crit('sessions', 'שימוש מכוון', 2, 'אימונים')], templates: ['b_power'] },
      { id: 'b_heelhook', branchId: 'move', name: 'היל-הוק', subtitle: 'Heel Hook',
        col: 3, row: 3, type: 'skill', prereq: { all: ['b_deadpoint'] },
        why: 'רגל כ"יד שלישית" בשיפועים.',
        criteria: [crit('sessions', 'שימוש מכוון', 2, 'אימונים')], templates: ['b_technique', 'b_power'] },
      // Tension lane (row 4)
      { id: 'b_activehang', branchId: 'tension', name: 'תליה פעילה', subtitle: 'Active Hang',
        col: 1, row: 4, type: 'foundation', prereq: null,
        why: 'כתפיים פעילות ואחיזה — בסיס לכוח על הקיר.',
        criteria: [crit('hold', 'תליה יציבה', 30, 'שנ')],
        seed: { fromBench: 'deadhang_secs' }, templates: ['b_strength'] },
      { id: 'b_lockoff', branchId: 'tension', name: 'לוק-אוף', subtitle: 'Lock-Off Control',
        col: 3, row: 4, type: 'strength', prereq: { all: ['b_activehang'] },
        why: 'החזקת מנעד תוך יישוג ליד הבאה.',
        criteria: [crit('hold', 'החזקה במרפק כפוף', 10, 'שנ')], templates: ['b_strength'] },
      { id: 'b_overhang', branchId: 'tension', name: 'מתח גוף בשיפוע', subtitle: 'Tension on Overhang',
        col: 4, row: 4, type: 'strength', prereq: { all: ['b_lockoff'] },
        why: 'לשמור רגליים על הקיר בקירות תלולים.',
        criteria: [crit('sessions', 'אימוני שיפוע', 3, 'אימונים')], templates: ['b_power', 'b_strength'] },
      // Tactics lane (row 0)
      { id: 'b_preview', branchId: 'tactics', name: 'קריאת מסלול וזיהוי קרוקס', subtitle: 'Preview + Crux',
        col: 3, row: 0, type: 'foundation', prereq: { all: ['b_v2'] },
        why: 'לתכנן לפני שמטפסים — חוסך ניסיונות.',
        criteria: [crit('sessions', 'תצוגות מקדימות', 3, 'אימונים')], templates: ['b_project'] },
      { id: 'b_project', branchId: 'tactics', name: 'אימון פרויקט מובנה', subtitle: 'Structured Project',
        col: 4, row: 0, type: 'foundation', prereq: { all: ['b_preview'] },
        why: 'לעבוד בעיה קשה בשיטתיות עם מנוחה נכונה.',
        criteria: [crit('sessions', 'אימוני פרויקט', 2, 'אימונים')], templates: ['b_project'] },
      { id: 'b_multisession', branchId: 'tactics', name: 'פרויקט רב-אימוני', subtitle: 'Multi-Session Send',
        col: 5, row: 0, type: 'milestone', prereq: { all: ['b_project'] },
        why: 'להחזיק פרויקט לאורך כמה אימונים עד שליחה.',
        criteria: [crit('sends', 'שליחת פרויקט', 1, 'בעיה')], templates: ['b_project'] }
    ],
    supports: [
      ['b_dropknee', 'b_v4'], ['b_heelhook', 'b_v5proj'], ['b_overhang', 'b_v5'],
      ['b_preview', 'b_v4']
    ]
  };

  // ---- SESSION TEMPLATES (produce real executable sessions) ---------------
  // kind:'strength' → live set/rep runner. kind:'climbing' → climbing logger.
  var TEMPLATES = {
    // Muscle-up world
    mu_strength: { id: 'mu_strength', worldId: 'muscleup', kind: 'strength', name: 'כוח משיכה', type: 'strength',
      duration: 45, difficulty: 'בינוני-גבוה',
      blocks: [
        { exId: 'pullup', label: 'מתח קפדני', scheme: 'ladder', rounds: 5, note: 'סולם 1-2-3, חזרות נקיות' },
        { exId: 'scap', label: 'משיכת שכמות', scheme: 'sets', sets: 3, reps: 8 }
      ] },
    mu_volume: { id: 'mu_volume', worldId: 'muscleup', kind: 'strength', name: 'נפח משיכה', type: 'volume',
      duration: 40, difficulty: 'בינוני',
      blocks: [{ exId: 'pullup', label: 'מתח — פירמידה', scheme: 'pyramid', rounds: 5 }] },
    mu_highpull: { id: 'mu_highpull', worldId: 'muscleup', kind: 'strength', name: 'משיכה גבוהה', type: 'power',
      duration: 40, difficulty: 'גבוה',
      blocks: [
        { exId: 'fastpull', label: 'מתח נפיץ', scheme: 'sets', sets: 5, reps: 3, note: 'עוצמה מקסימלית כלפי מעלה' },
        { exId: 'c2b', label: 'חזה-למוט', scheme: 'sets', sets: 4, reps: 3 }
      ] },
    mu_transition: { id: 'mu_transition', worldId: 'muscleup', kind: 'strength', name: 'טכניקת מעבר', type: 'skill',
      duration: 35, difficulty: 'בינוני',
      blocks: [
        { exId: 'lowtrans', label: 'תרגיל מעבר נמוך', scheme: 'sets', sets: 5, reps: 3 },
        { exId: 'negmu', label: 'מתח-על שלילי', scheme: 'sets', sets: 4, reps: 2 }
      ] },
    mu_dip: { id: 'mu_dip', worldId: 'muscleup', kind: 'strength', name: 'דחיפה ותמיכה', type: 'support',
      duration: 35, difficulty: 'בינוני',
      blocks: [
        { exId: 'support', label: 'אחזקת תמיכה', scheme: 'hold', sets: 4, seconds: 15 },
        { exId: 'dip', label: 'מקבילים במוט', scheme: 'sets', sets: 4, reps: 6 }
      ] },
    mu_integrate: { id: 'mu_integrate', worldId: 'muscleup', kind: 'strength', name: 'שילוב מתח-על', type: 'integration',
      duration: 45, difficulty: 'גבוה',
      blocks: [
        { exId: 'bandmu', label: 'מתח-על בגומיה', scheme: 'sets', sets: 4, reps: 3 },
        { exId: 'negmu', label: 'שליליים בשליטה', scheme: 'sets', sets: 3, reps: 2 }
      ] },
    mu_light: { id: 'mu_light', worldId: 'muscleup', kind: 'strength', name: 'תרגול קל', type: 'light',
      duration: 25, difficulty: 'קל',
      blocks: [
        { exId: 'deadhang', label: 'תליה פעילה', scheme: 'hold', sets: 3, seconds: 30 },
        { exId: 'scap', label: 'משיכת שכמות', scheme: 'sets', sets: 3, reps: 8 },
        { exId: 'hollow', label: 'גוף חלול', scheme: 'hold', sets: 3, seconds: 25 }
      ] },
    mu_test: { id: 'mu_test', worldId: 'muscleup', kind: 'strength', name: 'מבחן ביצוע', type: 'test',
      duration: 30, difficulty: 'מבחן',
      blocks: [{ exId: 'pullup', label: 'מבחן מקסימום מתח', scheme: 'amrap', sets: 1 }] },
    // Bouldering world
    b_volume: { id: 'b_volume', worldId: 'boulder', kind: 'climbing', name: 'נפח טכניקה', type: 'volume',
      duration: 60, difficulty: 'קל', targetGrade: 'V0–V1', focus: 'רגליים שקטות והנחת רגל מדויקת' },
    b_consolidate: { id: 'b_consolidate', worldId: 'boulder', kind: 'climbing', name: 'ביסוס דרגה', type: 'consolidation',
      duration: 70, difficulty: 'בינוני', targetGrade: 'V1–V3', focus: 'כמה בעיות באותה דרגה, סגנונות שונים' },
    b_project: { id: 'b_project', worldId: 'boulder', kind: 'climbing', name: 'אימון פרויקט', type: 'project',
      duration: 75, difficulty: 'גבוה', targetGrade: 'V3–V5', focus: 'בעיה אחת קשה, זיהוי קרוקס ומנוחה נכונה' },
    b_technique: { id: 'b_technique', worldId: 'boulder', kind: 'climbing', name: 'אוצר תנועה', type: 'movement',
      duration: 60, difficulty: 'בינוני', targetGrade: 'V1–V3', focus: 'תרגול תנועה ממוקדת (דגל / היל-הוק / דרופ-ני)' },
    b_power: { id: 'b_power', worldId: 'boulder', kind: 'climbing', name: 'כוח ותנועה דינמית', type: 'power',
      duration: 60, difficulty: 'גבוה', targetGrade: 'V2–V4', focus: 'דד-פוינט ותנועות נפיצות בשיפוע' },
    b_strength: { id: 'b_strength', worldId: 'boulder', kind: 'strength', name: 'כוח תומך', type: 'support',
      duration: 30, difficulty: 'בינוני',
      blocks: [
        { exId: 'activehang', label: 'תליה פעילה', scheme: 'hold', sets: 4, seconds: 30 },
        { exId: 'lockoff', label: 'לוק-אוף', scheme: 'hold', sets: 3, seconds: 10 }
      ] },
    b_test: { id: 'b_test', worldId: 'boulder', kind: 'climbing', name: 'אימון מבחן', type: 'test',
      duration: 60, difficulty: 'מבחן', targetGrade: 'V5', focus: 'ניסיון שליחה בדרגת יעד' }
  };

  var EXERCISES = {
    pullup: { id: 'pullup', name: 'מתח', category: 'pull', measure: 'reps',
      cues: 'טווח מלא — מהיד ישרה עד הסנטר מעל המוט.', related: ['mu_pull1', 'mu_pull5', 'mu_pull10'] },
    scap: { id: 'scap', name: 'משיכת שכמות', category: 'pull', measure: 'reps',
      cues: 'זרועות ישרות, מושכים כתפיים למטה ואחורה.', related: ['mu_scap'] },
    deadhang: { id: 'deadhang', name: 'תליה פעילה', category: 'grip', measure: 'seconds',
      cues: 'כתפיים פעילות, לא "שמוטות".', related: ['mu_deadhang', 'b_activehang'] },
    fastpull: { id: 'fastpull', name: 'מתח נפיץ', category: 'pull', measure: 'reps',
      cues: 'האצה מקסימלית כלפי מעלה, ירידה בשליטה.', related: ['mu_fastpull'] },
    c2b: { id: 'c2b', name: 'חזה-למוט', category: 'pull', measure: 'reps',
      cues: 'למשוך עד שהחזה נוגע במוט.', related: ['mu_c2b'] },
    support: { id: 'support', name: 'אחזקת תמיכה', category: 'push', measure: 'seconds',
      cues: 'זרועות ישרות ונעולות מעל המוט, גוף אסוף.', related: ['mu_support'] },
    dip: { id: 'dip', name: 'מקבילים במוט', category: 'push', measure: 'reps',
      cues: 'ירידה בשליטה, נעילה מלמעלה.', related: ['mu_dip5'] },
    hollow: { id: 'hollow', name: 'גוף חלול', category: 'core', measure: 'seconds',
      cues: 'גב תחתון צמוד לרצפה, אגן מעט מגולגל.', related: ['mu_hollow'] },
    lowtrans: { id: 'lowtrans', name: 'תרגיל מעבר נמוך', category: 'skill', measure: 'reps',
      cues: 'להעביר את פרק היד מעל המוט מהר, בלי "כנף עוף".', related: ['mu_lowtrans'] },
    negmu: { id: 'negmu', name: 'מתח-על שלילי', category: 'skill', measure: 'reps',
      cues: 'ירידה איטית דרך המעבר, לשלוט לאורך כל הטווח.', related: ['mu_negmu'] },
    bandmu: { id: 'bandmu', name: 'מתח-על בגומיה', category: 'skill', measure: 'reps',
      cues: 'גומיה לסיוע מינימלי, לשמור על מסלול נקי.', related: ['mu_bandmu'] },
    activehang: { id: 'activehang', name: 'תליה פעילה', category: 'grip', measure: 'seconds',
      cues: 'כתפיים פעילות ומחוברות.', related: ['b_activehang'] },
    lockoff: { id: 'lockoff', name: 'לוק-אוף', category: 'pull', measure: 'seconds',
      cues: 'להחזיק מרפק כפוף בזווית יציבה.', related: ['b_lockoff'] }
  };

  var WORLDS = [MUSCLEUP, BOULDER];

  // Climbing result outcomes shared by the climbing logger.
  var CLIMB_RESULTS = [
    { v: 'flash', label: 'פלאש' }, { v: 'send', label: 'שליחה' },
    { v: 'crux', label: 'הגעה לקרוקס' }, { v: 'progress', label: 'התקדמות' },
    { v: 'none', label: 'ללא התקדמות' }, { v: 'abandon', label: 'ויתור' }
  ];
  var CLIMB_STYLES = [
    { v: 'slab', label: 'סלאב (Slab)' }, { v: 'vertical', label: 'אנכי' },
    { v: 'overhang', label: 'שיפוע' }, { v: 'dyno', label: 'דינמי' },
    { v: 'crimp', label: 'קרימפ' }, { v: 'sloper', label: 'סלופר' }
  ];

  return {
    contentVersion: '2026-07-21',
    worlds: WORLDS,
    worldsById: WORLDS.reduce(function (o, w) { o[w.id] = w; return o; }, {}),
    templates: TEMPLATES,
    exercises: EXERCISES,
    climbResults: CLIMB_RESULTS,
    climbStyles: CLIMB_STYLES,
    // flat node lookup across all worlds
    nodeIndex: WORLDS.reduce(function (o, w) {
      w.nodes.forEach(function (n) { o[n.id] = { node: n, worldId: w.id }; });
      return o;
    }, {})
  };
});
