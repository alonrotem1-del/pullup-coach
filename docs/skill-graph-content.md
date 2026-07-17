# Skill Graph Content — Initial Nodes & Edges (v0.3, PREVIEW REVIEW FIXES)

Status: **preview reviewed on real data — eight status/logic corrections applied in v0.3 (below); v0.2 decisions retained.**

v0.3 corrections (from testing the Preview against the real 175-entry history):
1. **No status is asserted from nonexistent evidence.** Nodes whose status depends on secondary-skill logs are marked `evidenceSource: "secondary-log"`; if no logs exist the migration proposes `available` + `review: confirm`, never a demonstrated status. Fixes Scapular Pull-Up (was "mastered") and Wrist Roller (was "in progress").
2. **Ring Support PR comes from logged data** (30 s), not the stale "39 s" text carried from the brief. Evidence strings for secondary-log nodes are generated from the user's logs.
3. **Pull-up ladder statuses are derived from real session history.** For `maxRepsInSet` nodes the migration counts distinct days with a working-set max ≥ threshold: ≥3 → mastered, 2 → stabilizing, 1 → first_success, 0 → unearned (gated). Fixes "8 Pull-Ups" → mastered (demonstrated 8, 8, 9). These occurrence counts also seed lesson evidence so future lessons continue from the real baseline.
4. **Hangboard Assessment is `frozen: true`** — locked in the proposed states, non-editable in the status review, and forced locked by the graph engine. Consistent everywhere until board type / hold depth / grip type / pain history are provided.
5. **Readiness is branch-level** (coarse label + 0–4 pips per contributing branch), never a single precise percentage from arbitrary weights.
6. **Goal "current focus" is curated content** (`goal.focus`), representing the defined support structure per goal — not whichever nodes happen to rank highest.

Four review decisions incorporated in v0.2:
1. **Leg Raise = mastered approved**, defined as *controlled hanging straight-leg raises to or toward bar height* (≥1 Toes-to-Bar exists, so earlier core stages must not stay artificially locked).
2. **Top Hold = stabilizing approved** (10s × 3 — established, not yet mastered).
3. **Weighted Pull-Up gate split** (see nodes `pull.weighted-prep` / `pull.weighted-first` and edges #7a/#7b/#7c): 8 clean pull-ups (stabilizing) unlocks *Preparation/Assessment only* — technique, equipment setup, very light introductory testing. Regular programmed weighted work unlocks only after 10 clean pull-ups are reasonably stable (`pull.10` stabilizing) **or** another reviewed equivalent readiness criterion. 8 pull-ups is never presented as proof that full weighted programming is appropriate.
4. **Edge #10 (10 pull-ups → Chest-to-Bar) approved as readiness indicator**, not a prerequisite — C2B preparation, band-assisted explosive pulls, and speed work may begin earlier.
This document is the single review gate for training assumptions. Once approved, it is transcribed
1:1 into `content/skills.json` — no training assumption may exist in application code that is not
traceable to a row here.

Scope note: the Excel workbook (`אימונים.xlsx`) is **a source and early example, not the complete
skill library**. Nodes below merge the Excel chains with the product brief (branches A–I) and the
classified coach material (brief §8). Beginner rungs below the user's current level that serve no
active edge (Jackknife pull-ups, band-assisted pull-up variants, scapular rows, Australian rows,
"very high knee raises", "top-hold leg raises", grab-toes) are archived in §4 for future users and
deliberately **excluded** from the initial 41 to keep the graph lean.

Conventions:
- **First-success threshold**: value that flips the node to `first_success`.
- **Mastery seed**: default criteria = threshold met in ≥3 sessions spread over ≥14 days, unless stated. All editable data.
- **Proposed status**: pre-filled for the one-time migration review screen from your stated data
  (pull-up PB 9; Ring Support 39s; Dips 3×6; Dead Hang ~60s; Top Hold 10s×3; ≥1 Toes-to-Bar; V3 flash / some V4).
  Every proposal is confirmed or corrected by you before it takes effect.
- Confidence: `high` | `medium` | `experimental` (per spec §C1).

---

## 1. Nodes (41)

### Branch: Pull Strength (`pull`) — 9 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| pull.active-hang | Active Hang | seconds | 30s | 30s ×3 sessions | mastered | 60s dead hang + 9 pull-ups imply this |
| pull.scap-pullup | Scapular Pull-Up | reps | 10 | 10 ×3 sessions | mastered | existing secondary-skill logs |
| pull.negative | Negative Pull-Up (slow) | reps | 5 | 5 ×3 sessions | mastered | far below current level |
| pull.first | First Pull-Up | reps | 1 | 1 clean ×3 sessions | mastered | PB 9 |
| pull.5 | 5 Pull-Ups | reps | 5 | 5 ×3 sessions | mastered | PB 9, regular pyramid work |
| pull.8 | 8 Pull-Ups | reps | 8 | 8 ×3 sessions over ≥14d | **stabilizing** | PB 9 achieved; not yet repeated 3× |
| pull.10 | 10 Pull-Ups | reps | 10 | 10 ×3 sessions | in_progress | current gap: 9 → 10 |
| pull.weighted-prep | Weighted Pull-Up Preparation / Assessment | — | setup + technique session done | 2–3 very light intro sessions (≤ +2.5 kg) pain-free | **available** | unlocked by pull.8 stabilizing (decision #3) — technique, equipment setup, very light introductory testing ONLY |
| pull.weighted-first | First Weighted Pull-Up (programmed work) | kg added | 1 clean rep @ +5 kg | 3×3 @ +5 kg ×3 sessions | **locked** | unlocks at pull.10 stabilizing OR reviewed equivalent readiness criterion (decision #3) |

### Branch: Explosive Pull (`exp`) — 5 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| exp.fast | Fast Pull-Up (speed intent) | reps | 5 fast clean | 5 ×3 sessions | available | pull.5 mastered |
| exp.band-explosive | Band-Assisted Explosive Pull | reps | 5 | 5 ×3 sessions | available | — |
| exp.c2b | Chest-to-Bar Pull-Up | reps | 1 clean | 5 ×3 sessions | available | untested; assessment candidate |
| exp.highpull-band | High Pull with Band | reps | 5 | 5 ×3 sessions | locked | needs exp.c2b first_success |
| exp.highpull | High Pull (no band) | reps | 1 (bar to sternum) | 5 ×3 sessions | locked | — |

### Branch: Push & Support (`push`) — 4 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| push.ring-support | Ring Support Hold | seconds | 30s | 2×30s ×3 sessions | **stabilizing** | PR 39s, recurring logs |
| push.dips | Parallel-Bar Dips | reps | 8 | 3×8 ×3 sessions | in_progress | current 3×6, target 3×8 |
| push.bar-support | Straight-Bar Support Hold | seconds | 15s | 15s ×3 sessions | available | — |
| push.bar-dips | Straight-Bar Dips | reps | 5 | 10 ×3 sessions (Coach 3) | locked | needs bar-support |

### Branch: Muscle-Up Transition (`mu`) — 7 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| mu.low-jump | Low-Bar Jump Transition | reps | 5 | 10 ×3 sessions | available | — |
| mu.low-transition | Low-Bar Transition (minimal jump) | reps | 5 | 10 ×3 sessions | locked | — |
| mu.russian-pushup | Russian Push-Up | reps | 10 | 10 ×3 sessions | available | accessory only (brief §8) |
| mu.low-negative | Low-Bar Negative Muscle-Up | reps | 3 | 5 ×3 sessions | locked | — |
| mu.negative | Full Negative Muscle-Up | reps | 1 slow | 5 ×3 sessions | locked | — |
| mu.band | Band-Assisted Muscle-Up | reps | 1 | 5 clean ×3 sessions | locked | — |
| mu.first | First Muscle-Up 🎯 | reps | 1 clean (no kip-to-chicken-wing) | 3 singles across ≥3 sessions (= "stable MU") | locked | Goal 2 target node |

### Branch: Core & Bar Control (`core`) — 6 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| core.knee-raise | Hanging Knee Raise | reps | 10 | 10 ×3 sessions | mastered | implied by ≥1 T2B |
| core.leg-raise | Hanging Leg Raise (controlled, straight-leg, to/toward bar height) | reps | 10 | 10 ×3 sessions | mastered ✅ | approved decision #1 |
| core.t2b | Toes-to-Bar | reps | 1 | 5 ×3 sessions | **first_success** | "at least one T2B" |
| core.hollow | Hollow Hold | seconds | 30s | 45s ×3 sessions | available | no data |
| core.tophold | Top Hold (above bar) | seconds | 10s | 10s ×3 within 14d | stabilizing ✅ | approved decision #2 (10s × 3 — established, not mastered) |
| core.lsit | L-Sit (tuck → full) | seconds | 10s tuck | 10s full L ×3 sessions | available | staged node |

### Branch: Pullover (`po`) — 3 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| po.negative | Negative Pullover | reps | 1 slow | 5 ×3 sessions | **available** | prereqs already met (pull.5 ✓, tophold ✓) |
| po.kickup | Kick-Up Pullover | reps | 1 | 5 ×3 sessions | locked | — |
| po.pullover | Pullover 🎯 | reps | 1 clean | 3 across ≥3 sessions | locked | own path per brief §7F |

### Branch: Grip & Finger (`grip`) — 3 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| grip.deadhang | Dead Hang | seconds | 45s | 60s ×3 sessions | mastered (confirm) | ~60s reported |
| grip.wrist-roller | Wrist Roller | cycles | 3 | 3 ×3 sessions | in_progress | existing secondary logs |
| grip.hangboard-assess | Hangboard Assessment | — | **PLACEHOLDER** | — | stub (locked-pending-info) | frozen until board type, hold depth, grip type, pain history provided; no protocol invented (brief §7G) |

### Branch: High Step & Single-Leg (`leg`) — 3 nodes
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| leg.bulgarian | Bulgarian Split Squat | reps/leg | 3×8 bodyweight | 3×8 @ +10 kg ×3 sessions | available | gym access 3–4×/wk |
| leg.high-stepup | High Step-Up (box ≥ knee) | reps/leg | 3×5 | 3×6 controlled ×3 sessions | available | targets stated V5 limitation |
| leg.pistol | Pistol Squat (assisted → controlled → full) | stage | assisted ×5/leg | 1 full clean/leg ×3 sessions | available | staged node; coach notes §8 |

### Goal target: Climbing (`climb`) — 1 node
| id | Name | Unit | First success | Mastery seed | Proposed status | Evidence |
|---|---|---|---|---|---|---|
| climb.v5 | First V5 Boulder 🎯 | grade | 1 completed V5 | 3 different V5s | active goal (in_progress) | **zero prerequisite edges by design** — no metric can unlock a grade; achieved only via climbing check-in. Technique, route reading, and fear are tracked through check-in data (§9), not nodes |

---

## 2. Edges (53)

Types: `prereq` (locks target), `readiness` (never locks; feeds readiness score), `supporting`, `accessory`, `unlock:assessment` (flips target to Assessment Unlocked — never grants the skill).
"Req. status" = status the **source** node must reach for the edge to be satisfied. "—" = not applicable (non-gating edge).

| # | From | To | Type | Req. status | Threshold | Conf. | Source / rationale |
|---|---|---|---|---|---|---|---|
| 1 | pull.active-hang | pull.negative | prereq | mastered | 30s | high | Excel chain; control the hang before lowering |
| 2 | pull.scap-pullup | pull.first | supporting | — | 10 | high | Excel |
| 3 | pull.negative | pull.first | prereq | mastered | 5 slow | high | Excel: 5 negatives → 1 pull-up |
| 4 | pull.first | pull.5 | prereq | mastered | 1 | high | arithmetic progression |
| 5 | pull.5 | pull.8 | prereq | mastered | 5 | high | arithmetic progression |
| 6 | pull.8 | pull.10 | prereq | first_success | 8 | high | arithmetic progression |
| 7a | pull.8 | pull.weighted-prep | **unlock:assessment** | stabilizing | ~8 strict | high | decision #3: 8 clean unlocks preparation/assessment only — never full programming |
| 7b | pull.10 | pull.weighted-first | prereq | **stabilizing** | 10 clean, reasonably stable | high | decision #3: programmed weighted work gate. OR-group `weighted-entry` with #7c |
| 7c | *(reviewed equivalent readiness criterion — placeholder, user-defined)* | pull.weighted-first | prereq | — | TBD | experimental | decision #3 alternative gate; OR-group `weighted-entry` with #7b; inactive until defined and reviewed |
| 7d | pull.weighted-prep | pull.weighted-first | prereq | first_success | prep session completed | medium | setup/technique must precede loading |
| 8 | pull.weighted-first | exp.highpull | supporting | first_success | — | medium | brief §4: max strength supports explosive pull, does **not** replace speed work |
| 9 | pull.weighted-first | climb.v5 | readiness | first_success | — | medium | brief §4: shared skill serving both goals; pulling-strength reserve |
| 10 ✅ | pull.10 | exp.c2b | readiness | first_success | 10 | medium | Coach 2 ("at least 10 clean") — **demoted from prerequisite**: your 9 PB shows C2B work can begin sooner |
| 11 | pull.5 | exp.fast | prereq | mastered | 5 | high | base strength before speed intent |
| 12 | exp.fast | exp.c2b | supporting | — | 5 fast | medium | Coach 2 |
| 13 | exp.band-explosive | exp.c2b | supporting | — | 5 | high | Coach 2 & Coach 3 |
| 14 | exp.c2b | exp.highpull-band | prereq | first_success | 1 clean | medium | Coach 3 sequence |
| 15 | exp.highpull-band | exp.highpull | prereq | stabilizing | 5 | high | Coach 1 & 3: band → free |
| 16 | exp.highpull | mu.first | prereq | first_success | 1 (bar to sternum) | high | all three coaches converge on high pull as the gate skill |
| 17 | push.ring-support | push.bar-support | supporting | — | 30s | medium | support-stability transfer |
| 18 | push.bar-support | push.bar-dips | prereq | first_success | 15s | high | cannot dip on the bar without holding support |
| 19 | push.dips | push.bar-dips | supporting | — | 3×8 | high | Coach 3: parallel dips precede straight-bar dips |
| 20 | push.dips | mu.first | prereq | mastered | 10 | medium | Coach 2 & 3 ("10 dips"); editable |
| 21 | push.bar-dips | mu.low-negative | readiness | first_success | 5 | medium | Coach 3: pressing out of the dip is the second half of a negative MU |
| 22 | mu.low-jump | mu.low-transition | prereq | first_success | 10 jumps | medium | Coach 1 & 3 order |
| 23 | mu.low-transition | mu.low-negative | prereq | stabilizing | 10 | medium | Coach 3 |
| 24 | mu.russian-pushup | mu.low-transition | accessory | — | 10 | experimental | Coach 3; explicitly **not** a prerequisite (brief §8 correction) |
| 25 | mu.low-negative | mu.negative | prereq | stabilizing | 5 | medium | Coach 1 & 3 |
| 26 | mu.negative | mu.band | supporting | first_success | 5 slow | medium | Coach 1 order |
| 27 | exp.c2b | mu.band | readiness | stabilizing | 8 | medium | Coach 3 ("8 chest-to-bar") |
| 28 | mu.band | mu.first | **unlock:assessment** | stabilizing | 5 clean | medium | Coach 3: "5 band MU → 1 MU" — unlocks the attempt, never grants the skill. OR-group `mu-unlock` with #29 |
| 29 | mu.negative | mu.first | **unlock:assessment** | stabilizing | 5 full | medium | Coach 1 negative-first path; OR-group `mu-unlock` with #28 |
| 30 | core.hollow | mu.first | supporting | — | 30s | medium | body control; deliberately not a hard prerequisite (brief §8) |
| 31 | core.knee-raise | core.leg-raise | prereq | mastered | 10 | high | Excel |
| 32 | core.leg-raise | core.t2b | prereq | mastered | 10 | high | Excel |
| 33 | core.hollow | core.t2b | supporting | — | 30s | medium | standard tension work |
| 34 | core.leg-raise | core.lsit | supporting | — | 10 | medium | compression-strength transfer |
| 35 | pull.5 | po.negative | prereq | mastered | 5 | high | Excel pullover chain |
| 36 | core.tophold | po.negative | prereq | first_success | 10s | medium | Excel; the pullover finishes in the top-hold position |
| 37 | core.t2b | po.kickup | readiness | first_success | 5 | medium | brief §5 canonical example: "5 T2B unlocks pullover practice" — indicator, not grant |
| 38 | po.negative | po.kickup | prereq | mastered | 5 slow | high | Excel |
| 39 | po.kickup | po.pullover | **unlock:assessment** | stabilizing | 5 | high | Excel; unlocks first-pullover attempt |
| 40 | grip.deadhang | grip.hangboard-assess | prereq | mastered | 60s pain-free | high | standard readiness gate for fingerboard work |
| 41 | grip.deadhang | climb.v5 | readiness | — | 60s | medium | your stated limitation: grip/fingers on overhangs |
| 42 | grip.hangboard-assess | climb.v5 | readiness | — | TBD (placeholder) | experimental | frozen pending board/hold/pain facts |
| 43 | grip.wrist-roller | grip.deadhang | accessory | — | 3 cycles | experimental | forearm-endurance support |
| 44 | leg.bulgarian | leg.high-stepup | supporting | — | 3×8/leg | medium | single-leg strength transfer |
| 45 | leg.bulgarian | leg.pistol | supporting | — | 3×8/leg | high | standard single-leg progression |
| 46 | leg.high-stepup | climb.v5 | readiness | — | 3×6/leg @ ≥knee height | medium | your stated limitation: standing up on high footholds |
| 47 | leg.pistol | climb.v5 | readiness | — | full pistol | experimental | coach notes (brief §8) |
| 48 | exp.band-explosive | climb.v5 | readiness | — | 5 | medium | your stated limitation: explosive pulling power |
| 49 | core.t2b | climb.v5 | readiness | — | 5 | medium | body tension on overhangs |
| 50 | push.ring-support | mu.first | supporting | — | 30s | medium | top-of-MU support-position stability |

**Structural properties to verify at review:**
- `climb.v5` in-degree: 8 readiness edges, **0 prerequisites** — a grade can never be "unlocked" by metrics.
- `mu.first` gates: 2 prerequisites (#16 high pull first_success, #20 dips mastered-at-10) + one satisfied OR-group (#28 ∨ #29) assessment unlock.
- `pull.weighted-first` gates (decision #3): OR-group `weighted-entry` (#7b pull.10 stabilizing ∨ #7c reviewed-equivalent placeholder) AND #7d preparation completed. `pull.weighted-prep` is assessment-unlocked at 8 clean (#7a) and permits only technique/setup/very light testing.
- Shared nodes across both goals: `pull.weighted-first` (#8, #9), `core.t2b` (#32→37, #49), `exp.band-explosive` (#13, #48), `push.ring-support` (#17, #50) — each renders once on the map with both goal badges.
- Excel linear chains are preserved but generalized: `core.t2b` appears in both the T2B chain and the Pullover chain as one node (#32, #37), not a duplicate.

---

## 3. Deliberately excluded from v0.1
- **Ring Dips** — brief says "later"; add when push branch matures.
- **Weighted Pull-Up progression ladder** (beyond first) — folded into `pull.weighted-first` mastery; expand after first success. Preparation stage is now its own node (`pull.weighted-prep`, decision #3).
- **Hangboard protocol nodes** (repeaters/max hangs) — frozen behind `grip.hangboard-assess` placeholder per decision #3.
- **Technique / Fear / Route-reading nodes** — captured as climbing check-in data (§9), surfaced as trends; not skill nodes (brief §7I: "collect data and reveal patterns", not replace a coach).
- **Gym exercises** (Deadlift, Hip Thrust, etc.) — data layer with support tags, never map nodes (brief §11).

## 4. Archived beginner content (future users, not in initial graph)
From Excel: Scapular Rows ×10, Australian Rows ×10, Jackknife Pull-ups ×10, Jackknife Top Hold 10s, Band-Assisted Pull-ups ×5, Band-Assisted Top Hold 10s (pull chain); Grab Toes 10s, High Knee Raises ×10, Negative Leg Raises ×10, Negative T2B ×5 (core chain); Very High Knee Raises ×10, Top-Hold Leg Raises ×5 (pullover chain). These re-enter the content file when a below-first-pull-up user profile exists.
