# Skill Progression Coach — Audit & Migration Specification

Status: **proposal for review — no implementation yet**
Source material: full `pullup-coach` codebase (commit `b78741f`) + `אימונים.xlsx` progression workbook.

---

## A. Current application audit

### A1. Architecture

| Aspect | Current state |
|---|---|
| Structure | Single-file vanilla-JS PWA: `index.html` (3,698 lines — CSS + HTML shells + ~3,350 lines of JS) |
| Framework / build | None. No bundler, no modules, no tests, no lint. Only dependency: Chart.js 4.4.0 from CDN |
| Storage | `localStorage` only, 6 keys: `puc_log`, `puc_plan`, `puc_settings`, `puc_session`, `puc_progression`, `puc_secondary` |
| Rendering | Imperative `innerHTML` template strings per view; global functions wired via inline `onclick` |
| Views | 5 views (Home, Session, History*, Secondary, Progress) + 6 modals. *History has no nav button; reachable only via "View all history" |
| Offline | `sw.js`: cache-first for assets, network-first for HTML. Notifications scheduled via `setTimeout` inside the SW |
| Deploy | GitHub Pages on push to `main` (`.github/workflows/pages.yml`) |

### A2. Current data model (as implemented)

**Log entry** (`puc_log`, append-only array):
```js
{ id: Date.now(), date: ISO, sessionType: 'strength'|'volume'|'light'|'max_test'|'bouldering'|'rest',
  setType: 'working'|'warmup'|'max'|'summary'|'skip'|'session',
  setNumber, reps, forearmFatigue /* always 0 — vestigial */, pain, skipReason?, notes }
```

**Weekly plan** (`puc_plan`): `{ 0..6: sessionType }` — one protocol per weekday.

**Settings** (`puc_settings`): sound/volume/notifications, `maxReps`, and per-protocol parameters — `pyramid{topSet, restSeconds}`, `ladder{maxRung, rounds, miniRestSeconds, roundRestSeconds}`, `light{repsPerSet, setsPerDay, firstReminderHour, intervalHours}`. **Training parameters are already editable data, not hardcoded** — a big plus.

**In-flight session** (`puc_session`): a genuine state machine — `phase: active|resting|light_break|ladder_complete|complete`, adaptive pyramid target (`currentTarget = actual reps − 1`), ladder round/step cursors, max-test sub-phases, absolute-time rest timers (`timerEnd` ISO) that survive backgrounding, with schema migration on read.

**Progression** (`puc_progression`): `strength{level, easySessions}`, `volume{ladderLevel, rounds, easySessions}`, `suggestedWeighted` — "2 easy sessions → suggest level-up" rules.

**Secondary skills** (`puc_secondary`): `skills[] { id, name, desc, unit(reps|seconds|cycles), icon, frequency(×/week), target, custom?, log[{date, value}] }` — Ring Support Hold, Dips, Dead Hang, Scapular Pull-ups, Ring Rows, Push-ups, Wrist Roller, plus user-created custom skills.

### A3. Current workout & coaching logic

- **Adaptive Pyramid**: first target from settings; each next target = actual reps − 1; session ends at 1 rep. Live preview when adjusting reps mid-set.
- **Ladder**: rungs 1..maxRung × N rounds, mini-rest / round-rest, "add another round?" extension at completion.
- **Light Practice**: mini-sets spread across the day with SW-scheduled reminders.
- **Max Test**: warm-up 2 → 3-min rest → single max set; PB derived from log, never stored redundantly.
- **Safety layer**: pain reported → 48h "no pull-ups" gate; skip requires a reason; performance-drop detection (3 declining sessions); anchor-day concept (Pyramid + Ladder are weekly must-dos with week-status pills and missed-anchor warnings).
- **Insights**: PB milestone journey, 8-week stacked volume chart with per-week drill-down, consistency %, and a *correlational* "what helped most" card (average Pyramid vs Ladder sessions in the 2 weeks before each PB). Notably, the app already says "correlate", not "cause" — aligned with the new product's philosophy.

### A4. Reusable components (high value — keep)

1. **Session runner state machine** (`buildNewSession` / `advanceSession` / `getNextSetInfo` / rest timers / SW notifications) — this *is* the future "Lesson player". ~90% reusable as-is.
2. **Secondary Skills** — already a proto skill-node system: per-skill value log, PR detection, weekly frequency targets, custom skill creation. Direct ancestor of "practice logging on a skill node".
3. **Design system** — the CSS (cards, badges, set-dots, timer ring, mission cards, anchor pills, modals, toggles) is coherent and mobile-first; keep it wholesale.
4. **Weekly plan editor + anchor consistency + skip-reason flow** — becomes the planner's foundation.
5. **History editing / past-session logging / delete** — satisfies MVP item 15 ("edit incorrect session data") already.
6. **Insights engine** (`analyzeProgress`) — the pattern for readiness/correlation analytics.
7. **PWA plumbing** — SW, install banner, notifications, Pages deploy.

### A5. Technical debt & risks

| # | Issue | Severity | Notes |
|---|---|---|---|
| 1 | Single 3,700-line file, global namespace | **High for v2** | Fine at current scope; v2 roughly triples surface area → ~10k lines in one file is unmaintainable |
| 2 | No data export/backup | **High** | localStorage is the only copy; browser data clear = total loss. Must fix before any migration |
| 3 | Inconsistent date handling | Medium | Some code uses `getLocalDateKey()` (local TZ), some `date.slice(0,10)` (UTC): `renderHistory`, `checkPerformanceDrop`, `analyzeProgress` milestones. Edit-save writes `T12:00:00.000Z`. Works in practice for one user in one TZ; will bite around midnight sessions |
| 4 | Unescaped user text in `innerHTML` | Medium | `notes`, custom skill names/descriptions are injected without HTML-escaping — self-XSS / layout breakage |
| 5 | Chart.js from CDN not cached by SW | Medium | Offline PWA loses charts entirely offline |
| 6 | SW `setTimeout` notifications | Known limitation | SW can be terminated (esp. iOS) and the timer dies; already mitigated by state-driven advance on foreground |
| 7 | Dead / vestigial code | Low | `renderWeeklyChart` never called; `forearmFatigue` always 0; `selectScale` relies on deprecated global `event`; `pendingLogCallback` unused |
| 8 | Mixed languages | Low | UI English, `PLAN_HELP` Hebrew — fine for you, but a decision for v2 copy |
| 9 | No tests | Medium | Progression/unlock logic in v2 genuinely needs unit tests; today nothing is testable in isolation |
| 10 | `id: Date.now()` for log entries | Low | Collision-safe enough at human logging speed |

### A6. The Excel workbook (`אימונים.xlsx`)

One sheet, three linear progression chains, each node with an entry/advance threshold:

1. **Pull-up path**: Hang from bar 30s → Scapular rows ×10 → Scapular pull-ups ×10 → Australian rows ×10 → Jackknife pull-ups ×10 → Jackknife top hold 10s → Band-assisted pull-ups ×5 → Band-assisted top hold 10s → Negative pull-ups ×5 → **Pull-up ×1**
2. **Toes-to-Bar path**: Grab toes 10s → Knee raises ×10 → Negative leg raises ×10 → High knee raises ×10 → Leg raises ×10 → Negative toes-to-bar ×5 → **Toes-to-Bar ×1**
3. **Pullover path**: Pull-ups ×5 → Leg raises ×5 → Pull-up top hold 10s → Very high knee raises ×10 → Toes-to-bar ×5 → Top-hold leg raises ×5 → Negative pullover ×5 → Kick-up pullover ×5 → **Pullover ×1**

Observations: (a) these are exactly the "node + editable threshold" pattern the new product needs; (b) they're strictly linear — the v2 model must generalize them to a graph (e.g., the Pullover chain's "Toes-to-bar ×5" is *the same node* as the Toes-to-Bar chain's terminal node → a shared-node edge, not a duplicate); (c) thresholds are seed values, to be stored as editable data.

---

## B. Product migration recommendation

### B1. Verdict: extend, don't rewrite

The existing architecture **can** support a skill graph at MVP scale (20–40 nodes, one user, localStorage). Nothing about the current design blocks it:

- The session state machine is protocol-agnostic enough to become a parameterized Lesson player.
- Secondary Skills already proves the "node with its own log, PR and schedule" concept.
- localStorage comfortably holds years of one user's data (current log is a few hundred KB max vs ~5MB quota).

What does **not** survive contact with v2 is the *single-file* packaging. A skill graph + assessments + climbing check-ins + gym layer + planner in one 10k-line file with one global namespace would be the real risk. So:

| Category | Decision |
|---|---|
| **Keep unchanged** | Vanilla JS (no framework), localStorage persistence, PWA/SW/deploy pipeline, design-system CSS, session state machine core, skip/pain safety logic, plan editor, history editing, charts |
| **Extend** | Secondary Skills → Skill Nodes; Protocols (Pyramid/Ladder/Light/Max) → Lesson Templates attached to Pull Strength nodes; Progression suggestions → Assessment/unlock engine; Insights → readiness & climbing-trend analytics; Weekly plan → planner v2; log schema → superset (`spc_*` keys, versioned, migrated from `puc_*`) |
| **Redesign** | File structure (split into native ES modules — still zero-build, GitHub Pages-friendly); Home screen (two-goal layout); navigation (5 tabs re-cut); date handling (one canonical local-date utility); HTML escaping helper |
| **Add new** | Skill graph content + engine, skill map screen, goal screens, assessments, climbing check-in, gym layer, export/import backup |

### B2. Framework question (pre-empting it)

I recommend **staying vanilla**. Reasons: one real user, working PWA, no build step to break, and the team (you + AI assistance) iterates fastest on what exists. The one screen where a framework would help — the skill map — is well served by generated SVG. If v3 ever goes multi-user/server, that's the natural re-platform point, not now. Adopting React/Svelte now would be a de-facto rewrite, which you've correctly forbidden without cause.

### B3. Branch strategy

Sufficient, with one addition. `main` stays the stable Pull-Up Coach; all v2 work happens on the v2 branch (`skill-progression-v2` — currently provisioned in this session as `claude/vibrant-lamport-0qtoin`; it can be renamed/retargeted when implementation starts). Because both versions share the same origin URL and the same localStorage when deployed to the same Pages site, the migration must be **non-destructive**: v2 reads `puc_*`, writes `spc_*`, and never deletes `puc_*` — so the stable app keeps working even after v2 has run. Deploy v2 previews to a different path or repo (e.g., Pages from the branch under `/v2/`) so both are installable side by side during the transition.

---

## C. Proposed data model

Two strictly separated layers — this is the most important structural decision:

- **Content layer** (what a coach would author): goals, branches, skill nodes, edges, lesson templates, assessments, thresholds. Shipped as versioned JSON data files, editable without touching engine code. User-tunable overrides stored separately.
- **User-state layer** (what the athlete does): node statuses, session logs, check-ins, gym logs, plans. All records carry a `userId` (constant `'local'` for now) so multi-user is a storage swap later, not a remodel.

### C1. Content entities

```
Goal            { id, name, icon, description, branchIds[], targetNodeId, notes }
Branch          { id, name, icon, description }               // Pull Strength, Explosive Pull, …
SkillNode       { id, name, branchId, unit: reps|seconds|grade|bool,
                  description, cues, equipment[],
                  practiceTarget,                              // e.g. "3×8–10"
                  masteryCriteria: { type, threshold, occurrences, windowDays },  // editable
                  tags[] }                                     // grip, core, push, …
SkillEdge       { id, fromNodeId, toNodeId,
                  type: prerequisite | readiness_indicator | supporting | accessory | experimental,
                  confidence: high | medium | experimental,
                  unlock: { kind: 'assessment'|'availability', criteria } | null,
                  source }                                     // "Coach 3", "Excel", "own experience"
LessonTemplate  { id, name, nodeIds[], protocol: pyramid|ladder|light|max_test|sets_reps|hold|custom,
                  params { … same shape as today's settings.pyramid/ladder/light … },
                  restSchema, coachingCues[] }
Assessment      { id, nodeId, name, criteria { unit, threshold, cleanFormRequired },
                  grants: [{ nodeId, newStatus }] }            // unlock ≠ mastery
```

Edge semantics (Section 5 & 14 of the brief, encoded):
- `prerequisite` — target stays **Locked** until source reaches required status.
- `readiness_indicator` — never locks; feeds a readiness score shown on the target.
- `supporting` / `accessory` — planner weighting only.
- `experimental` — visible but flagged; excluded from unlock logic.
- `unlock.kind = 'assessment'` — meeting criteria flips the target to **Assessment Unlocked**, never straight to achieved. "5 Toes-to-Bar → Pullover *assessment unlocked*", exactly per the brief.

All thresholds live in these JSON records (plus a `spc_content_overrides` store for your personal edits), never in code.

### C2. User-state entities

```
SkillState      { userId, nodeId,
                  status: locked | available | in_progress | assessment_unlocked
                        | first_success | stabilizing | mastered,
                  statusHistory[{ status, date, evidenceRef }],
                  bestValue, lastPracticed, manualOverride? }
GoalState       { userId, goalId, active: bool, activatedAt }   // engine enforces max 2 active
SessionLog      { id, userId, date, kind: lesson | assessment | climbing | gym | rest | skip,
                  lessonTemplateId?, nodeId?, sets[{ n, value, unit, isMax?, notes }],
                  pain?, painLocation?, skipReason?, notes,
                  legacy?: originalPucEntryIds[] }              // audit trail for migrated data
ClimbingCheckIn { id, userId, date, highestCompleted, highestAttempted,
                  wallTypes[], mainLimitation, repeatedFailMove?, 
                  pain { fingers, wrist, elbow, shoulder }, note? }
GymExercise     { id, userId, name, primaryPurpose, supportTags[], unit, notes }
GymSet / GymSession { id, userId, date, exerciseId, weight, reps, sets, rpe?, notes }
WeeklyPlan      { userId, weekTemplate { 0..6: dayPlan }, dayPlan: { anchors[], lessons[], flags } }
Settings        (superset of today's — sound, notifications, per-lesson overrides)
```

Storage: same `DB` wrapper pattern, new namespaced keys (`spc_state`, `spc_sessions`, `spc_checkins`, `spc_gym`, `spc_plan`, `spc_settings`, `spc_content_overrides`, `spc_meta{schemaVersion}`), each with a `schemaVersion` and forward-migration functions — formalizing what `DB.getSession()` already does ad hoc.

### C3. Migration of existing data (concrete mapping)

| Pull-Up Coach data | Skill Progression Coach target |
|---|---|
| `puc_log` strength/volume/light/max_test entries | `SessionLog{kind:'lesson'}` bound to Lesson Templates *Pyramid / Ladder / Light Practice / Max Test* under the **Pull Strength** branch; per-day grouping into one session record; `legacy` ids retained |
| `puc_log` bouldering entries | `SessionLog{kind:'climbing'}` (no check-in data — left empty, not fabricated) |
| Max-test PB (currently 9) | Evidence for Pull Strength ladder: *First Pull-Up* → mastered, *5 Pull-Ups* → mastered, *8 Pull-Ups* → first_success/stabilizing, *10 Pull-Ups* → in_progress — **proposed, then confirmed by you in a one-time onboarding review, not silently assumed** |
| `puc_secondary` skills + logs | Matching Skill Nodes (Dips → Push&Support, Dead Hang/Wrist Roller → Grip, Scapular Pull-ups/Ring Rows → Pull Strength, Ring Support → Push&Support, Push-ups → Push&Support); logs → `SessionLog{kind:'lesson'}` practice entries; PRs → `SkillState.bestValue` |
| Custom secondary skills | Custom Skill Nodes (unattached accessory nodes) |
| `puc_plan`, `puc_settings`, `puc_progression` | Planner v2 week template; lesson-template params; pyramid/ladder levels → template params |
| `puc_*` keys themselves | **Never deleted.** Migration is copy-and-transform with a `spc_meta.migratedAt` stamp; re-runnable; stable app unaffected |

---

## D. Skill graph representation

**Structure**: node list + typed edge list (adjacency via index built at load). No graph database needed — 20–40 nodes, <100 edges; everything recomputes in microseconds.

**Status derivation** is a pure function, unit-testable:
```
computeStatus(node, edges, states, logs, overrides) →
  locked               if any prerequisite edge unsatisfied
  available            all prerequisites satisfied, no practice yet
  in_progress          practice logged
  assessment_unlocked  an assessment-unlock edge's criteria met (explicit event, with UI moment)
  first_success        assessment passed once / mastery threshold hit once
  stabilizing          success repeated but mastery window not yet satisfied
  mastered             masteryCriteria met (default: threshold hit ≥3 times across ≥14 days — editable per node)
  + manualOverride always wins (you are the ground truth, the app is the assistant)
```

- **Multiple prerequisites**: N `prerequisite` edges into a node → AND semantics; `requireAny` group id on edges gives OR when needed (e.g., Muscle-Up: band-assisted MU *or* strict negatives path).
- **Shared skills**: a node is global, not per-goal — Weighted Pull-Up has outgoing `supporting` edges into both Explosive Pull (V5) and Muscle-Up branches. The map renders it once with multi-goal badges.
- **First success ≠ mastery**: two distinct statuses with distinct celebration moments, and only `mastered` (or explicitly configured `first_success`) satisfies downstream prerequisite edges — configurable per edge (`requiredStatus`).
- **Editable thresholds**: content JSON + `spc_content_overrides`; an "Edit node" sheet in the UI exposes threshold/mastery fields (no full graph-editor UI in MVP — the JSON file is the editor of record).
- **Readiness, not causation**: `readiness_indicator` edges aggregate into a 0–100 readiness display on goals ("V5 readiness: finger strength ▲, explosive pull ▬, high-step ▼") always labeled as *indicators*, never as guarantees. Climbing check-in limitations feed the same display ("grip named as main limitation in 6 of last 8 overhang sessions").
- **Multi-user later**: content is shared; every user-state record already carries `userId`; swapping localStorage for a synced backend touches only the `DB` module.

**Initial content (~34 nodes)**, sourced from the Excel + your brief + coach material classified per Section 8:

- *Pull Strength (9)*: Active Hang, Scapular Pull-Up, Australian Row, Negative Pull-Up, First Pull-Up, 5 / 8 / 10 Pull-Ups, First Weighted Pull-Up. (Existing Pyramid/Ladder/Light/Max become **lesson templates** on this branch, not nodes.)
- *Explosive Pull (5)*: Fast Pull-Up, Band-Assisted Explosive Pull, Chest-to-Bar, High Pull (band), High Pull (free).
- *Push & Support (5)*: Push-Ups, Ring Support Hold, Parallel-Bar Dips 3×8, Straight-Bar Support, Straight-Bar Dips.
- *Muscle-Up Transition (6)*: Low-Bar Jump Transition, Low-Bar Transition, Low-Bar Negative MU, Full Negative MU, Band-Assisted MU, **First Muscle-Up** (goal node). Russian Push-Up enters as `accessory` (per your note: *not* a Chest-to-Bar prerequisite).
- *Core & Bar Control (6)*: Hanging Knee Raise, Leg Raise, Toes-to-Bar, Hollow Hold, Top Hold, L-Sit — thresholds from the Excel Toes-to-Bar chain.
- *Pullover (3)*: Negative Pullover, Kick-Up Pullover, **Pullover** — prerequisites/readiness edges from Pull-ups ×5, Toes-to-Bar ×5, Top Hold per the Excel chain.
- *Grip (4)*: Dead Hang, Farmer Walk, Wrist Roller, **Hangboard Assessment** (a deliberate stub — see Open Decisions; no protocol invented before board/holds/pain status are known). Climbing sessions log as grip+pull load automatically.
- *High Step / Single Leg (4)*: Step-Up, High Step-Up, Bulgarian Split Squat, Pistol progression (assisted → controlled → full as one node with stages).
- *Goal nodes (2)*: First V5 (readiness-only — **no** prerequisite edges can "unlock" a boulder grade; it's marked achieved from a climbing check-in), First Muscle-Up.

Coach material classification (Section 8): Coach 3's numeric ladder becomes mostly `readiness_indicator` edges with `confidence: medium` and `source:"Coach 3"`; Coach 2's "10 clean pull-ups" a `readiness_indicator` into Explosive Pull (`confidence: medium` — your 9 PB shows MU work needn't wait for 10); the shared items (kipping high pull, band work, negatives) converge into the transition chain with `prerequisite` edges only where physically necessary (can't do negative MU without dip support strength).

---

## E. UX and screen structure

Bottom nav re-cut to five tabs (currently Home / Session / Secondary / Progress + hidden History):

1. **Home** — answers the six questions in Section 13, in order: two active goal cards (current focus nodes + readiness deltas), "Today" card (recommended session + *why* + *what it unlocks*), recovery strip (last climbing/gym load, pain gate — reusing the existing anchor pills/warning components), quick actions (start lesson / log climb / log gym).
2. **Path** (new) — skill map: vertical per-branch lanes with SVG edge connectors, nodes colored by status (locked/available/in-progress/assessment-unlocked/first-success/stabilizing/mastered), shared nodes badged with both goal icons; tap → node sheet (status, history, thresholds *editable*, start lesson, log attempt, request assessment). Goal detail view = filtered map + readiness panel.
3. **Train** — today's lesson queue; the existing session runner UI nearly unchanged (dots, timer ring, adaptive targets, coaching messages), now parameterized by Lesson Template; assessment mode (single-attempt flow with pass/fail and honest-form prompt); end-of-session pain check as today.
4. **Log** — unified history (lessons, assessments, climbing check-ins, gym sessions), edit/delete as today; "+ past session" covering all kinds; gym exercise list with PRs and per-exercise trend.
5. **Progress** — PB journey and weekly load (existing charts) + per-goal readiness trends + climbing check-in patterns ("main limitation" frequency by wall type) + milestone feed (Skill Unlocked / First Success / Mastered events).

**Climbing check-in**: a ≤30-second modal fired when a climbing session is logged (and offered from Home the evening of a planned bouldering day): 7 fields from Section 9, all tap-only except the optional note. Data-first, insights appear only after ≥5 check-ins.

**Game layer** (Section 12): status colors + connective paths + milestone moments ("Assessment available", "First success", "Mastered" full-screen flashes reusing the complete-screen pattern). No XP, no streaks, no currencies. The pain gate stays authoritative — a locked "do not train" state can never be overridden by gamification.

---

## F. Migration plan — implementation phases

Each phase lands on the v2 branch, is independently shippable, and never touches `puc_*` destructively.

**Phase 0 — Safety net & scaffold** *(no behavior change)*
- Features: Export/Import all data as JSON file (added to *both* main and v2 — this ships to stable `main` too, it's pure win); split `index.html` into native ES modules (`js/db.js`, `js/session-engine.js`, `js/views/*.js`, `css/app.css`) with identical behavior; add an HTML-escape helper; unify date handling on `getLocalDateKey`; cache Chart.js locally in SW.
- Affected: everything structurally, nothing functionally.
- Risk: **medium** (big diff, zero intended behavior change) — mitigated by a manual smoke checklist (start/finish each session type, timers, edit history, plan, settings) before merging.
- Acceptance: app behaves identically; export→clear→import round-trips all six `puc_*` keys; deployed preview passes the checklist on your phone.

**Phase 1 — Content schema + graph engine + migration** *(engine before UI)*
- Features: content JSON (~34 nodes, edges, thresholds from Excel + brief); `graph.js` (status computation, unlock evaluation, readiness aggregation) with unit tests; `spc_*` stores + versioning; one-time migration from `puc_*` with an **onboarding review screen** where you confirm/adjust proposed initial node statuses (seeded from PB 9, Ring Support 39s, Dips 3×6, Dead Hang 60s, Top Hold 10s×3, ≥1 T2B, V3–V4 climbing).
- Risk: **low** (additive; old app untouched).
- Acceptance: unit tests green for edge semantics (AND-prereqs, OR-groups, assessment-unlock, first-success vs mastery, manual override); migration idempotent; every legacy log entry accounted for.

**Phase 2 — Skill map + lessons + assessments + two goals + Home v2**
- Features: Path screen (SVG map, node sheet, threshold editing); Pyramid/Ladder/Light/Max converted to Lesson Templates driving the existing runner; assessment flow; GoalState with the two-goal cap; Home v2. Secondary Skills tab retired — its data now lives on nodes (read-only legacy view kept for one release).
- Affected: nav, home, session views; session-engine parameterization.
- Risk: **medium-high** (largest UX phase) — mitigated by keeping the session runner's internals intact and only changing what feeds it.
- Acceptance: you can run a normal training week entirely in v2 — start/finish all four legacy session types via lessons, see statuses move, pass an assessment, watch an unlock fire.

**Phase 3 — Climbing check-in + patterns**
- Features: check-in modal wired to climbing logs; limitation/wall-type/pain trend cards in Progress; readiness display on V5 goal consuming check-in data. Language stays correlational ("selected in 6 of last 8 overhang sessions").
- Risk: **low**.
- Acceptance: check-in ≤30s to complete; trends appear only at ≥5 check-ins; pain answers feed the existing pain gate.

**Phase 4 — Gym strength layer**
- Features: exercise catalog with primary purpose + support tags (Deadlift, Hip Thrust, Incline Smith Press, T-Bar Row, … as seed); fast set logging; PRs & recent trend; gym sessions count into weekly load/fatigue; **not** rendered as skill-map nodes.
- Risk: **low** (isolated).
- Acceptance: log a full gym session in under a minute; PRs and trends correct; load appears in Home recovery strip.

**Phase 5 — Weekly planner v2**
- Features: extend the day-type plan to day-plans (anchor lesson + 0–2 supporting practices), built from: active goals' current focus nodes, per-node weekly frequencies (the Secondary Skills mechanic, generalized), climbing/gym days, pain state. **Recommendation engine, not a constraint solver** — it proposes, you accept/edit. Caps active supporting skills (default 4, editable).
- Risk: **medium** — this is the easiest place to over-engineer; scope is deliberately "suggest + explain why", nothing more.
- Acceptance: Monday morning shows a sane, executable week respecting the two-goal cap and your real schedule (3–4 gym + 1 climb); every recommendation shows its reason.

**Phase 6 — Game-layer polish + identity**
- Features: milestone animations, unlock moments, app rename/manifest/icon ("Skill Progression Coach"), install/update flow for existing PWA users.
- Risk: **low**.
- Acceptance: renaming doesn't orphan the installed PWA or its data (same origin/start_url discipline).

Cut line: Phases 0–2 are the true MVP core. 3–4 are fast follows. 5 can ship as "manual planner + suggestions" and iterate. 6 is polish.

---

## G. MVP recommendation & scope challenges

**Build first (Phases 0–2)**: export/backup, module split, graph engine with the ~34-node content set, migration + onboarding review, skill map, lessons, assessments, two goals, Home v2.

**Deliberately deferred**:
- Automatic weekly plan generation (Phase 5) — the existing manual plan works today; a bad auto-planner would be worse than none.
- Correlation analytics ("weighted pull-up progress correlates with V5 attempts") — needs months of data that doesn't exist yet. Build the *capture* now (check-ins, gym logs), the analytics later. Anything shipped earlier would be noise presented as insight.
- Hangboard protocol — blocked on real-world facts (board, holds, pain status). Ships as an assessment stub node.
- Graph-editor UI — the content JSON file is the editor; a UI editor is v3 material.
- Multi-user, accounts, sync — data model is shaped for it; zero UI/backend now.

**Where the brief risks overcomplication (challenged)**:
1. *Six-state node lifecycle* is right conceptually but heavy visually. UI collapses to four visual tiers (Locked / Available / Working on it / Achieved-with-sublabel); the full state lives in the node sheet. All six states exist in data from day one.
2. *"The app builds a practical weekly schedule considering fatigue, pain, equipment…"* — a real fatigue model is a research project. MVP fatigue = the heuristics that already exist (pain gate, recent load counting, performance-drop detection) applied more broadly. Honest and shippable.
3. *Readiness scores* — must stay visibly labeled as indicator aggregates. The number is a conversation starter, not a verdict; the brief demands this and the implementation will enforce it in copy.
4. *Two goals cap* — enforce softly (activating a third asks which to pause), don't hard-block.

**Where the existing app already solves the problem** (don't rebuild): rest timers & notifications, adaptive pyramid, session persistence across app kills, history editing, skip/pain discipline, PB tracking, weekly charts, PWA install/update.

---

## H. Open decisions (genuinely need your input)

1. **Backup expectations.** MVP ships manual Export/Import (JSON file). Is losing-phone-day acceptable with manual backups, or do you want automatic sync (e.g., periodic export reminder, or a cloud option) prioritized earlier? *Recommendation: manual export + a monthly reminder; revisit after MVP.*
2. **Initial statuses at migration.** The onboarding review will propose statuses from your stated PRs (e.g., "8 Pull-Ups: stabilizing"). Do you want strict mode (everything starts one level lower and you re-prove it in-app — cleaner data, mildly annoying) or trust mode (accept proposals — recommended)?
3. **Hangboard branch facts** (needed before Phase 3 content, not before implementation starts): board type available, hold depths, any current finger/pulley pain history, whether you want hangboard work at all this season vs climbing volume only.
4. **Deployment of v2 during transition**: separate Pages path (`/v2/`) on the same repo (shares localStorage — enables live migration; slight risk of both apps being open simultaneously) vs separate repo/URL (fully isolated; migration via export/import file). *Recommendation: same repo `/v2/` path, guarded by the never-delete-`puc_*` rule.*
5. **Language**: keep English UI with Hebrew training help (status quo), or unify? *Recommendation: keep as is for MVP; it's your app.*
6. **Terminology sign-off**: Goal / Branch / Skill / Lesson / Assessment (dropping "Course" — "Goal" is more honest for First V5, which no course can guarantee). OK?

Everything else (module structure, storage keys, node list, edge classifications, phase order, planner scope) is recommended above and will proceed as specified unless you object.
