# Skill Progression Coach — Audit & Migration Specification

Status: **rev 2 — direction approved; adjustments incorporated; no implementation yet**
Source material: full `pullup-coach` codebase (commit `b78741f`) + `אימונים.xlsx` progression workbook.

Rev 2 changes (per review): Phase 0 re-ordered — safety net (export/import, regression checklist, automated characterization tests) **before** the ES-module split; concrete dual-version deployment design added (§F0); minimal Gym Data Capture pulled forward into Phase 2; skill-graph content extracted to a reviewable document (`docs/skill-graph-content.md`) that gates the graph engine; all open decisions resolved (§H).

Rev 3 changes (per review): **Data Preservation Contract** added (§C3) — complete carry-over of all real user history from `puc_*` is a top-level acceptance criterion for the whole project. Includes the definitive localStorage key inventory, export validation, migration preview and post-migration reconciliation, idempotent re-run/rollback semantics, legacy-field preservation, and the answer to whether `/v2/` can read `puc_*` directly (it can — localStorage is origin-scoped, see §C3.2). Phase 0/1 acceptance criteria amended accordingly. **The ZIP is code only; real user data exists solely in the browser's `puc_*` keys and is never assumed to match any demo/seed data.**

Clarification recorded: the Excel workbook is a **source and early example** of progression logic, not the complete or final skill library. The initial content set merges it with the product brief's paths (A–I) and classified coach material.

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

Sufficient, with one addition. `main` stays the stable Pull-Up Coach; all v2 work happens on the v2 branch (`skill-progression-v2` — currently provisioned in this session as `claude/vibrant-lamport-0qtoin`; it can be renamed/retargeted when implementation starts). Because both versions share the same origin URL and the same localStorage when deployed to the same Pages site, the migration must be **non-destructive**: v2 reads `puc_*`, writes `spc_*`, and never deletes `puc_*` — so the stable app keeps working even after v2 has run. The complete dual-version deployment design (Service-Worker scope, cache isolation, stale-asset strategy, rollback) is specified in **§F0** and must be validated at the end of Phase 0 before any v2 feature ships.

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

### C3. Data Preservation Contract (top-level acceptance criterion)

**Preserving the user's real pull-up history is a primary acceptance criterion for the entire project.** The ZIP contains code only; real user data exists solely in the browser's `puc_*` localStorage on the production origin, and no assumption is made about its contents beyond the schema.

#### C3.1 Definitive localStorage key inventory (verified against code — all reads/writes audited)

| Key | Contains | Written by |
|---|---|---|
| `puc_log` | Every logged set/session entry: `{ id, date(ISO timestamp), sessionType(strength\|volume\|light\|max_test\|bouldering\|rest), setType(working\|warmup\|max\|summary\|skip\|session), setNumber, reps, forearmFatigue, pain, skipReason?, notes }` — Pyramid/Ladder/Light/Max sets with reps and timestamps, warm-ups, max-test results (PR history is *derived* from `setType:'max'` entries), pain flags, skips with reasons, notes, edited past sessions | `DB.addLog`, `deleteSession`, `saveEditSession`, demo seeder |
| `puc_plan` | Weekly plan `{ 0..6: sessionType }` | `savePlan` |
| `puc_settings` | Sound/volume/notifications, `maxReps`, pyramid `{topSet, restSeconds}`, ladder `{maxRung, rounds, miniRestSeconds, roundRestSeconds}`, light `{repsPerSet, setsPerDay, firstReminderHour, intervalHours}` | `saveSettings` |
| `puc_session` | In-flight session state machine (phase, cursors, timer) — transient | session flow |
| `puc_progression` | `strength{level, easySessions}`, `volume{ladderLevel, rounds, easySessions}`, `suggestedWeighted` — progression/level-up state | progression logic |
| `puc_secondary` | `skills[] { id, name, desc, unit, icon, frequency, target, custom?, log[{date, value}] }` — Ring Support Hold, Dips, Dead Hang, Scapular Pull-ups, Ring Rows, Push-ups, Wrist Roller, and any user-created custom skills, each with full timestamped value history (PRs derived) | secondary-skills flows |

There are **no other storage locations**: every write in the codebase goes through `DB.set`/`DB.del` with these six keys (`clearAllData` enumerates exactly the same six); no IndexedDB, no cookies. The inventory is re-verified at Phase 0A by an automated scan and shipped as `docs/data-inventory.md`.

#### C3.2 Can `/v2/` read `puc_*` directly? — **Yes.**

`localStorage` is scoped to the **origin** (`https://<user>.github.io`), not the path. `/pullup-coach/` and `/pullup-coach/v2/` share the same localStorage, so v2 reads the live `puc_*` keys directly and migration runs in place — no file transfer required. The export file is still mandatory, for three reasons: (a) backup against browser-data loss (decision #1); (b) the fallback deployment on a **separate origin** (§F0.8) cannot see `puc_*` and must import the file; (c) it is the reconciliation reference. If the fallback URL is ever invoked, the flow becomes: open current app → Export → open v2 → Import → migrate. v2's migration accepts either source (live keys or imported file) through the same code path.

#### C3.3 Export & validation (ships in Phase 0A, on stable `main`)

- One file: `pullup-coach-export-YYYY-MM-DD.json` = `{ formatVersion, exportedAt, appVersion, data: { all six puc_* values verbatim }, counts }`.
- `counts` block computed at export time: log entries, distinct session days, per-`sessionType` totals, total reps, date range (first/last entry), max-test PR, secondary skills count, secondary log entries per skill, custom skills count.
- **Validation** at export: recompute `counts` from `data` and compare against live localStorage independently (entry-by-entry equality on all six keys, not just counts); refuse to produce a file that fails. Import performs the same validation before writing anything.

#### C3.4 Migration mapping (`puc_*` → `spc_*`) — set-level fidelity, never aggregates-only

| Pull-Up Coach data | Skill Progression Coach target |
|---|---|
| `puc_log` strength/volume/light/max_test entries | `SessionLog{kind:'lesson'}` bound to Lesson Templates *Pyramid / Ladder / Light Practice / Max Test* under **Pull Strength**. Entries grouped per day into session records **retaining every individual set** (`sets[]` keeps set number, reps, setType incl. warm-up vs working vs max, and each set's original timestamp). Weekly totals/day counts are *recomputed* from migrated sets and must equal legacy values (§C3.6) — they are never stored as a replacement for the sets |
| `puc_log` skip entries | `SessionLog{kind:'skip'}` with original `skipReason` and timestamp |
| `puc_log` bouldering/rest entries | `SessionLog{kind:'climbing'\|'rest'}` (no check-in data fabricated) |
| Pain flags, notes | Carried on the migrated session/set records verbatim |
| Max-test history | Every max entry preserved as a set; PR history derived identically in v2 (assert equal, §C3.6); PB seeds proposed Pull Strength statuses — **confirmed via the onboarding review screen, never silently applied** |
| `puc_secondary` skills + logs | Matching Skill Nodes (Dips, Ring Support → Push&Support; Dead Hang, Wrist Roller → Grip; Scapular Pull-ups, Ring Rows → Pull Strength; Push-ups → Push&Support accessory); every `log[{date,value}]` entry becomes a practice `SessionLog` with its original timestamp; PRs → `SkillState.bestValue` (derived, asserted equal) |
| Custom secondary skills | Custom Skill Nodes (accessory), full history retained |
| `puc_plan` | Planner v2 week template |
| `puc_settings` | Lesson-template parameters (rest times, pyramid top set, ladder shape, light schedule) + app settings |
| `puc_progression` | Lesson-template levels + a preserved progression-history record |
| `puc_session` (in-flight) | Not migrated (transient); if a session is in progress, migration asks to finish/discard it first |
| **Any field with no exact v2 equivalent** | Preserved verbatim in `legacy: { originalEntries: [...] }` on the migrated record — **nothing is discarded**. In addition, `spc_meta.legacySnapshot` stores a complete copy of all six `puc_*` values as-of migration time, so even a mapping bug loses nothing |

#### C3.5 Migration preview (before anything is written)

The migration wizard's first screen shows, computed from the live `puc_*` data (or imported file):
sessions found (by type), sets found, total pull-up reps, date range, PRs found (max-test PB + per-secondary-skill PRs), secondary-skill records found (per skill), custom skills found, and an explicit list of **records that could not be mapped cleanly** (destined for `legacy` fields). Nothing is written until the user confirms. Statuses additionally pass through the onboarding review screen (decision #2).

#### C3.6 Post-migration reconciliation (automatic, blocking)

Immediately after migration, v2 recomputes from `spc_*` and compares against the legacy data: session count, set count, total reps, per-week totals (every week in the date range), training-day counts, max-test PR value and PR-milestone sequence, per-secondary-skill entry counts and PR values. Any mismatch → the run is marked **failed**, a diff report is shown, and `spc_*` from that run is rolled back. The reconciliation report is stored in `spc_meta.reconciliation` and re-viewable from Settings.

#### C3.7 Idempotency, re-run, rollback

- Every migrated record carries `legacy.originalEntryIds`; re-running migration against the same snapshot hash is a no-op, and against a changed `puc_*` it prompts for an explicit re-import which **replaces** previously-migrated legacy-derived records by id (never duplicates them; v2-native records are untouched).
- Rollback = delete migration-derived `spc_*` records (or all `spc_*` via "Reset v2 data"); `puc_*` was never modified (§F0.6 read-only guard + runtime throw + automated zero-mutation test), so the stable app and a fresh migration both remain fully possible at any time.

#### C3.8 Import

JSON import (same file format as export) restores the complete history when browser data is lost or when v2 runs on a different origin (§C3.2). Import validates the file (§C3.3), writes the six values, then offers migration with the same preview/reconciliation flow.

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

**Initial content: see `docs/skill-graph-content.md`** — the reviewable node/edge document (40 nodes, 50 typed edges, every edge carrying source skill, target, relationship type, required status, threshold, confidence, and source/rationale). That document is the **review gate**: the graph engine is not implemented until it is approved, and no training assumption may exist in application code that is not traceable to a row in it. The Excel is one of its sources, not its boundary — the brief's paths (Explosive Pull, Push & Support, Muscle-Up Transition, Grip, High Step, etc.) are equally represented. Summary of branches for orientation:

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

## F0. Dual-version deployment design

Baseline facts: GitHub Pages currently deploys the repo root of `main` via `.github/workflows/pages.yml`; the app lives at `https://<user>.github.io/pullup-coach/`; the SW is registered at `./sw.js` → scope `/pullup-coach/`; cache name `pullup-coach-v4`. **Pages allows one deployment per repo**, so the dual-version site is composed in the workflow.

### F0.1 How the current app remains usable
`main` remains the only source of the site root. v2 development never merges to `main` except three explicitly-reviewed Phase-0 changes (export/import feature, root-SW fixes below, workflow update), each covered by the regression checklist and tests before deploy. Everything else lives under `/v2/`, built from the v2 branch.

### F0.2 How `/v2/` is deployed
`pages.yml` is extended to: checkout `main` → artifact root; checkout the v2 branch → `./v2/`; inject the build SHA into `v2/sw.js` and `v2/version.js` (placeholder substitution); upload the combined artifact; deploy. Triggers: push to `main` **or** the v2 branch. Result: one Pages deployment, two independently-updatable apps at `/pullup-coach/` and `/pullup-coach/v2/`.

### F0.3 Service-Worker scope isolation
- Root SW: registered at `/pullup-coach/sw.js`, scope `/pullup-coach/` — which **by default also covers `/v2/`**. Two mitigations: (a) the browser rule that the most-specific registration controls a page means `/v2/` clients are controlled by the v2 SW from its first registration onward; (b) belt-and-braces, the root SW's fetch handler gets a guard added on `main`: any request whose path contains `/v2/` is passed through untouched (no caching, no interception). This closes the only gap — the very first `/v2/` navigation before v2's SW registers (harmless anyway, since the root SW is network-first for navigations).
- v2 SW: registered at `/pullup-coach/v2/sw.js`, scope `/pullup-coach/v2/`. Per spec it **cannot** control root pages (max scope = its directory; no `Service-Worker-Allowed` header on Pages), so isolation in that direction is guaranteed by the platform.

### F0.4 Cache names & versions
- Root keeps `pullup-coach-vN`.
- **Bug found in audit, must fix on `main` first**: the current root SW's `activate` handler deletes *every* cache whose key ≠ its own — it would destroy v2's caches on every root activation. Fix: cleanup filter scoped to the `pullup-coach-` prefix only.
- v2 uses `spc-v2-<build-sha>` (SHA injected at deploy). v2's `activate` deletes only `spc-v2-*` caches other than the current one and never touches `pullup-coach-*`.

### F0.5 Avoiding stale assets
v2 is multi-file (ES modules), so mixed-version module sets are the real hazard. Strategy: **atomic versioned precache** — `install` caches the complete v2 asset manifest into the SHA-named cache; `activate` (+`skipWaiting`/`clients.claim`) swaps versions atomically and cleans old `spc-v2-*` caches; navigations are network-first with cache fallback (as today); static assets are cache-first *from the current versioned cache only*. Chart.js is vendored locally and precached (also fixes the existing offline-charts gap). A visible build stamp (`version.js`) is shown in v2 Settings so staleness is diagnosable at a glance.

### F0.6 Non-destructive `puc_*` → `spc_*` migration
- v2's DB module exposes legacy data through a **read-only accessor**; there is no code path that writes or deletes a `puc_*` key. Enforced twice: (a) a runtime guard in the v2 storage wrapper that throws on any `puc_`-prefixed write/delete; (b) an automated test that runs the full migration plus simulated sessions against a spied `localStorage` and asserts zero `puc_*` mutations.
- Migration copies and transforms `puc_*` → `spc_*`, stamps `spc_meta.migratedAt` + a hash of the source snapshot, and is idempotent (re-running against unchanged `puc_*` is a no-op; changed `puc_*` triggers an explicit re-import prompt, never a silent merge).
- Statuses proposed by migration take effect only after the one-time onboarding review screen (decision #2).
- Because both apps share the origin's localStorage, the stable app continues to read/write `puc_*` completely unaware of v2.

### F0.7 Rollback procedure
1. **Asset rollback**: revert the offending commit on the v2 branch → workflow redeploys `/v2/`; root untouched at every step.
2. **Full withdrawal (kill switch)**: deploy a v2 `sw.js` variant that self-unregisters and deletes all `spc-v2-*` caches; `/v2/` then serves plain network or 404 — root app unaffected.
3. **Data rollback**: v2 Settings includes "Reset v2 data" (deletes `spc_*` keys only). Legacy `puc_*` is untouched by construction, so the stable app resumes exactly where it was.
4. **Last resort**: the user's exported JSON backup (Phase 0 feature) restores everything.

### F0.8 Fallback if isolation fails validation
Phase 0 ends with an isolation validation on real devices (notably iOS Safari, which has SW quirks): two registrations visible with correct scopes; root update cycle doesn't evict v2 caches and vice versa; deleting all `spc_*` data leaves root fully functional. **If any check fails and can't be fixed within the phase, the fallback is a separate preview URL** (second repo `pullup-coach-v2` with its own Pages site; migration via the export/import file instead of shared localStorage). This is decision #4's condition, encoded as an explicit go/no-go gate.

---

## F. Migration plan — implementation phases (rev 2)

Each phase lands on the v2 branch, is independently shippable, and never touches `puc_*` destructively. **Ordering principle: no structural change before a safety net exists; no engine before its content is reviewed.**

**Phase 0A — Safety net** *(before any restructuring; parts ship to `main`)*
- Features: (1) JSON **export/import** of all six `puc_*` keys with independent count/content validation (§C3.3), shipped to stable `main` (pure win), plus a monthly export reminder banner and the data-inventory document (§C3.1); (2) **baseline regression checklist** (`docs/regression-checklist.md`) covering every user-visible behavior, executed once against the production app with results recorded; (3) **automated characterization tests** (Playwright + the pre-installed headless Chromium, driving the real `index.html` — practical because all functions are currently global) for: the session runner (`buildNewSession`/`advanceSession`/`getNextSetInfo` across all types, adaptive-pyramid arithmetic, ladder round/step transitions, max-test phases), weekly calculations (`getWeekStats`, `getAnchorConsistency`, `getMissedAnchorWarnings`, incl. week-boundary/midnight edges), progression logic (easy-session thresholds, weighted suggestion), the existing ad-hoc storage migrations (`targetSets`→`currentTarget`, ring icon), and export/import round-trip; (4) tests wired into CI for both branches.
- Rationale: the current app has no tests, so "zero behavior change" is unverifiable until these exist. The module split is **blocked on this phase**.
- Risk: low (additive only).
- Acceptance: see §F.acceptance below (exact criteria).

**Phase 0B — Module split & deployment scaffold** *(gated on 0A green)*
- Features: split `index.html` into native ES modules (`js/db.js`, `js/session-engine.js`, `js/views/*.js`, `css/app.css`) on the v2 branch with the 0A test suite passing unchanged before and after; HTML-escape helper; date handling unified on `getLocalDateKey`; Chart.js vendored; the three reviewed `main` changes (root-SW cache-cleanup prefix fix + `/v2/` pass-through guard, workflow dual-deploy, export/import already landed in 0A); first `/v2/` deployment; **isolation validation gate** (§F0.8).
- Risk: medium (big diff) — bounded by the characterization tests + re-executed checklist.
- Acceptance: see §F.acceptance.

**Phase 1 — Content review + graph engine + migration**
- Gate: **`docs/skill-graph-content.md` approved by the user first.** The engine is built against the approved document; content ships as `content/skills.json`, transcribed 1:1.
- Features: `graph.js` (status computation, unlock evaluation, readiness aggregation) with unit tests for edge semantics (AND-prereqs, OR-groups, assessment-unlock, first-success vs mastery, manual override, editable-threshold overrides); `spc_*` stores + schema versioning; one-time `puc_*` migration with the **onboarding review screen** where every proposed status is approved or corrected (decision #2).
- Risk: low (additive; old app untouched).
- Acceptance: engine tests green; migration implements the full Data Preservation Contract (§C3) — **preview before write** (§C3.5), **blocking reconciliation after** (§C3.6: session count, set count, total reps, per-week totals, training-day counts, PR values/sequence, per-secondary-skill counts — any mismatch rolls back with a diff report), idempotent re-run without duplicates and clean rollback (§C3.7), zero `puc_*` mutations (guard test §F0.6), set-level fidelity with original timestamps (no aggregate-only conversion), unmappable fields preserved in `legacy` metadata plus a complete `legacySnapshot`, and migration accepting both live `puc_*` keys and an imported export file through the same code path (§C3.2, §C3.8).

**Phase 2 — Skill map + lessons + assessments + two goals + Home v2 + minimal gym capture**
- Features: Path screen (SVG map, node sheet with editable thresholds); Pyramid/Ladder/Light/Max as Lesson Templates driving the existing runner; assessment flow; GoalState with the soft two-goal cap; Home v2; Secondary Skills tab retired (read-only legacy view kept one release). **Plus minimal Gym Data Capture** (moved forward per review): exercise catalog, log of date/weight/reps/sets, PR detection, optional support tags — *no trends, no correlation claims, no skill-map presence*; the point is that historical data starts accumulating now.
- Risk: medium-high (largest UX phase) — bounded by keeping the session runner internals intact.
- Acceptance: a full real training week runs entirely in v2 (all four legacy session types via lessons, statuses move, an assessment passes, an unlock fires); a gym session logs in under a minute with correct PR detection.

**Phase 3 — Climbing check-in + patterns + gym load integration**
- Features: ≤30-second check-in modal wired to climbing logs; limitation/wall-type/pain trend cards (appear only at ≥5 check-ins, correlational language enforced); V5 readiness display consuming check-in data; gym sessions (already accumulating since Phase 2) counted into weekly load and the Home recovery strip. Still no correlation *claims* — frequency counts and trends only.
- Risk: low.
- Acceptance: check-in completable in ≤30s all-tap; pain answers feed the existing pain gate; gym load visible in recovery strip.

**Phase 4 — Weekly planner v2**
- Features: day-plans (anchor lesson + 0–2 supporting practices) recommended from active goals' focus nodes, per-node weekly frequencies, climbing/gym days, pain state. **Recommendation engine, not a constraint solver** — proposes with reasons, user accepts/edits. Caps active supporting skills (default 4, editable).
- Risk: medium (the over-engineering magnet; scope pinned to "suggest + explain why").
- Acceptance: Monday shows a sane, executable week respecting the two-goal cap and the real schedule (3–4 gym + 1 climb); every recommendation displays its reason.

**Phase 5 — Game-layer polish + identity**
- Features: milestone animations, unlock moments, rename/manifest/icon ("Skill Progression Coach"), install/update flow for existing PWA users.
- Risk: low.
- Acceptance: renaming doesn't orphan the installed PWA or its data.

Cut line: Phases 0–2 are the MVP core. 3 is a fast follow. 4 can ship as "manual planner + suggestions" and iterate. 5 is polish.

### F.acceptance — exact Phase 0 acceptance criteria

**Phase 0A (safety net) is done when:**
0. **Data inventory**: `docs/data-inventory.md` committed, documenting every localStorage key and its exact contents (§C3.1), backed by an automated scan of the codebase confirming no storage access outside the six `puc_*` keys.
1. **Export**: one button downloads `pullup-coach-export-YYYY-MM-DD.json` containing all six `puc_*` values verbatim + format version + timestamp + a `counts` block (§C3.3); **export validation** independently recomputes counts and performs entry-by-entry comparison against live localStorage, refusing to produce a file that fails. **Import** restores it exactly after the same validation. Automated round-trip test: export → clear storage → import → deep-equality on all keys, *plus* count-block assertions (session count, set count, total reps, date range, PRs, secondary entries). A reminder banner appears when the last export is >30 days old. **This ships on stable `main` first, so a verified backup of the real history exists before any other work proceeds.**
2. **Regression checklist** committed at `docs/regression-checklist.md`, covering at minimum: start→finish for all six session types; adaptive-pyramid inline rep adjust + auto-extend; ladder extra-round flow; light-practice mini-logs + reminders; max-test PB update; skip flows (dashboard + in-session) with all reasons; pain gate (48h warning) and pain-ends-session; weekly plan edit; settings persistence for every field; history edit/delete/past-session log; charts render; PWA offline load; notification scheduling. Executed once against the production app with pass/fail recorded per item.
3. **Automated tests green against the unmodified app** (Playwright/Chromium driving real `index.html` via `page.evaluate` on the global functions): session-runner state machine (all types, incl. adaptive pyramid `next = actual − 1`, done-at-1; ladder round/step/rest transitions and round extension; max-test warmup→rest→max), weekly calcs across week boundaries and a simulated midnight-edge date, progression suggestions (2-easy-sessions rules, weighted-at-10), existing storage migrations, export/import round-trip.
4. Tests run in **CI** on pushes to both `main` and the v2 branch.

**Phase 0B (module split + dual deploy) is done when:**
5. The ES-module split passes **the identical 0A test suite, unmodified**, before and after the split (characterization guarantee), plus the escaping helper and date unification each carry their own new tests.
6. The three `main` changes are live and the regression checklist re-executed on the deployed root app with **zero behavioral diffs**: (a) root SW cache cleanup restricted to `pullup-coach-*` prefix, (b) root SW `/v2/` pass-through guard, (c) workflow composes root(`main`) + `/v2/`(v2 branch) into one Pages deployment.
7. `/v2/` is deployed and installable **alongside** the root app; DevTools shows two SW registrations with scopes `/pullup-coach/` and `/pullup-coach/v2/`; v2 caches are named `spc-v2-<sha>` and survive a root-app update cycle; the root app survives v2 updates and a full `spc_*`/v2-cache wipe.
8. **Isolation validation gate (§F0.8) passes on real devices including iOS Safari** — or the documented fallback (separate preview URL) is invoked and recorded before Phase 1 begins.
9. v2 loads offline (vendored Chart.js precached; atomic versioned precache verified by deploying two consecutive builds and confirming no mixed-version module set is ever served).

---

## G. MVP recommendation & scope challenges

**Build first (Phases 0–2)**: safety net (tests + export/backup), module split, graph engine against the approved 40-node content document, migration + onboarding review, skill map, lessons, assessments, two goals, Home v2, and **minimal gym data capture** (exercise/date/weight/reps/sets, PR detection, support tags — capture only, so history starts accumulating early).

**Deliberately deferred**:
- Automatic weekly plan generation (Phase 4) — the existing manual plan works today; a bad auto-planner would be worse than none.
- Gym *analytics* (trends beyond simple PR/recent, load modeling refinements, any correlation output) — capture ships in Phase 2, analysis follows the data.
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

## H. Decisions (resolved by user review, rev 2)

1. **Backup**: manual JSON export/import + a monthly export reminder for MVP. (Ships in Phase 0A.)
2. **Initial statuses**: use statuses proposed from existing performance data, gated by a one-time review screen where **every** status can be approved or corrected before taking effect. (Ships in Phase 1.)
3. **Hangboard**: remains an assessment placeholder (`grip.hangboard-assess` stub node) until the user provides board type, hold depth, grip type, and pain history. No protocol invented before then.
4. **Deployment**: same repository, `/v2/` path — **conditional on the isolation validation gate (§F0.8) passing on real devices**. If clean SW/cache isolation proves impractical, fall back to a separate preview URL (second repo + Pages), with migration via export/import file. Go/no-go recorded at end of Phase 0B.
5. **Language**: keep English UI + Hebrew coaching/help text for MVP.
6. **Terminology**: Goal / Branch / Skill / Lesson / Assessment — confirmed.

**Remaining review gate before Phase 1 implementation**: approval of `docs/skill-graph-content.md` (the 40-node / 50-edge content document). No training assumption enters application code without a corresponding approved row there; thresholds remain editable data at runtime regardless.
