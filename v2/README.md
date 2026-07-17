# Skill Progression Coach — Preview (first slice)

Working name: **Skill Progression Coach Preview**. This is the new product experience.
Pull-Up Coach (`index.html`) is unchanged and remains the stable app.

## What this slice does
- Reads your existing Pull-Up Coach data (`puc_*`) or an imported backup export.
- Shows a **migration preview** (sessions, sets, reps, date range, PRs, unmapped records)
  and runs a **blocking reconciliation** (session/set/rep/weekly/PR checks). Nothing is
  written unless reconciliation passes.
- Lets you **review your starting skill statuses**, grouped by branch: high-confidence
  statuses are pre-approved, uncertain ones are highlighted, everything is editable, with
  a final summary before confirmation.
- Presents **two active goals** (First V5, First Muscle-Up) with readiness *indicators*.
- Renders the **approved skill graph** (41 nodes, 53 edges) with per-node status.
- Runs the existing **Pyramid / Ladder / Light Practice / Max Test** flows as lessons;
  completing a lesson updates skill status via evidence and shows **unlock moments**.

## Strictly additive (guarantees)
- Never modifies the root app.
- Reads `puc_*` only through a read-only accessor; **writes only `spc_*`** (a runtime
  guard throws on any attempt to write a `puc_*` key).
- Registers **no service worker**.
- Removable with zero effect on Pull-Up Coach — delete `v2.html` + `v2/` + `content/`,
  or use "Reset Preview data" to clear `spc_*` only.

## Files
- `../v2.html` — page shell (loads the scripts; no SW).
- `graph.js` — pure skill-graph engine (status, gating, unlocks, readiness). UMD.
- `migrate.js` — pure non-destructive migration + reconciliation. UMD.
- `lesson-runner.js` — the proven session state machine, parameterized as lessons. UMD.
- `app.js` — UI glue (welcome, migration wizard, review, home, map, lessons).
- `../content/skills.json` — the approved graph content (transcribed from
  `docs/skill-graph-content.md` v0.2).

## Storage keys (all removable, all `spc_*`)
`spc_meta` (incl. full legacy snapshot + reconciliation), `spc_sessions`,
`spc_secondary_sessions`, `spc_goals`, `spc_state`, `spc_progress`.

## Tests
`tests/graph.spec.cjs`, `tests/migrate.spec.cjs`, `tests/lesson-runner.spec.cjs`,
`tests/v2-preview.spec.cjs`. The migration is also verified locally against the real
export when `REAL_EXPORT_PATH` points at it (that file is never committed).
