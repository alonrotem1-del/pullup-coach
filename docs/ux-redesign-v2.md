# UX Redesign — Weekly Coach Home + Guided Skill Map (PROPOSAL rev 2, for review)

Status: **design proposal — no code until approved.** Rev 2 incorporates review corrections: no
invented thresholds; Hangboard stays frozen and is never implied to unlock; two-stage weekly logic
(gates → ranking); defined minimum climbing and gym/group check-ins; lower Home density;
activity-specific pain handling; variable primary CTA; weekly targets derived from the plan +
progression (not hard-coded). Scope stays inside the Preview slice (additive, `spc_*` only).

Principle carried throughout: **the app never states a training criterion or threshold that has not
been approved.** Where a specific criterion isn't approved yet, the UI shows the *relationship* and
the *current status* (both from real data) and marks the criterion "to be defined," deferring the
number to the skill-detail page where thresholds live as editable, reviewable data.

---

## 1. Home — "Weekly Coach / Today" (reduced density)

Coaching-first. Full reasoning appears **only** for Today. Completed/Remaining are compact chips.
Don't-do-now shows at most 2–3 contextually relevant items, reasons only where useful. A very slim
Goals strip sits near the map/settings row and must not compete visually with Today.

```
┌──────────────────────────────────────────────┐
│ 🧗 Skill Progression Coach            [Preview]│
├──────────────────────────────────────────────┤
│ TODAY · Wed                                    │
│ ┌──────────────────────────────────────────┐  │
│ │ 💪 Pyramid Day · anchor                   │  │
│ │ 5, 4, 3, 2, 1 — stop 1–2 before failure   │  │
│ │ Why: your Pyramid anchor is still open     │  │
│ │ this week and you're recovered (last pull  │  │
│ │ Sun, no current pain).                     │  │
│ │            [ ▶ Start Pyramid ]             │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ✅ Done   🧗 Sun · 🔄 Mon · ◎ Ring Mon         │
│ 🎯 Left   💪 Pyramid · 🧗 Climb (Fri) · ◎ Ring×1│
│ ⛔ Skip now  🏆 Max Test (not fresh) · 🪝 Hangbd │
│                                                │
│ ───────────────────────────────────────────── │
│ Goals · First V5 · First Muscle-Up   [🗺️] [⚙️] │
└──────────────────────────────────────────────┘
```

- **Today** — one recommended action, its detailed *why*, and one primary button whose label matches
  the recommendation (see §5 CTA table).
- **Done / Left** — single compact line each (icon + short label; no per-item reasoning).
- **Skip now** — ≤3 items, each with a short reason only when the reason isn't obvious (Hangboard
  needs none once labelled "frozen"; Max Test benefits from "not fresh").
- **Goals strip** — small, muted, secondary; tap opens that goal's map.
- **Pain state** (see §6) changes Today's card and CTA but does not blanket-blank the screen.

---

## 2. Skill Map — First Muscle-Up (real prerequisite chain)

Goal switch + filter (Active / Locked / Completed / All, default Active). Zones **Now / Next /
Later**, a **Next unlock** callout, collapsed **Foundation completed**. Only hard-prerequisite
ordering is shown; supporting/readiness edges live in the node-detail page (unchanged). Statuses shown
are real computed values. **No numeric unlock criteria are invented** — the callout names the
relationship and defers the criterion to the skill page.

```
┌──────────────────────────────────────────────┐
│ 🗺️  First Muscle-Up            [⇄ First V5]   │
│ Filter:  [Active]  Locked  Completed  All      │
├──────────────────────────────────────────────┤
│ 🔓 NEXT UNLOCK                                  │
│    Chest-to-Bar  →  High Pull (band)           │
│    Criterion: see skill (to be defined)        │
│                                                │
│ ▶ NOW — active next skill per branch           │
│   💪 Pull Strength   ● 10 Pull-Ups — In Progress│
│   ⚡ Explosive Pull  ● Chest-to-Bar — Available │
│                                    [🔄 🧗 shared]│
│   🤸 Push & Support  ● Parallel-Bar Dips —       │
│                        In Progress             │
│   🔄 Transition      ● Low-Bar Jump — Available │
│                                                │
│ ⏭️ NEXT — opens after Now                       │
│    High Pull (band) · Straight-Bar Dips ·       │
│    Low-Bar Transition                          │
│                                                │
│ 🔒 LATER                                        │
│    Full Negative MU · Band-Assisted MU ·        │
│    ▸ First Muscle-Up 🎯                         │
│                                                │
│ ✅ Foundation completed (6)            ▸ expand │
└──────────────────────────────────────────────┘
```

Tap any skill → existing node detail (prerequisites, supporting skills, unlocks, why-status). Shared
skills badged with both goal icons.

---

## 3. Skill Map — First V5 (readiness-based; no single chain)

V5 has no prerequisite chain, so its map is organized by **support area** with **one** active skill
each (per your answer #3). **Hangboard is never shown as something Dead Hang unlocks** — it sits in
its own **Frozen** zone with the full list of information it still needs, and no arrow points into it.

```
┌──────────────────────────────────────────────┐
│ 🗺️  First V5                  [⇄ Muscle-Up]   │
│ Filter:  [Active]  Locked  Completed  All      │
├──────────────────────────────────────────────┤
│ ℹ️ No single unlock path — V5 is readiness-     │
│   based. Strengthen the areas below.           │
│                                                │
│ ▶ NOW — one active skill per area              │
│   🪝 Finger / Grip   ● Dead Hang — confirm      │
│                        status                  │
│   ⚡ Explosive Pull  ● Band-Assisted Explosive  │
│                        Pull — Available        │
│   🦵 High Step       ● Bulgarian Split Squat —  │
│                        Available               │
│   🧱 Body Tension    ● Toes-to-Bar —            │
│                        First Success  [🔄 shared]│
│                                                │
│ 🧗 ON THE WALL — not app-tracked yet            │
│    Technique · route reading · fear exposure —  │
│    captured by the climbing check-in (§7)      │
│                                                │
│ 🔒 FROZEN                                       │
│    🪝 Hangboard Assessment — locked until you    │
│    provide: board type · hold depth · grip type │
│    · climbing frequency · finger capacity ·     │
│    pain history                                │
│                                                │
│ ✅ Foundation completed (2)            ▸ expand │
└──────────────────────────────────────────────┘
```

Note Dead Hang and Hangboard are both grip work, but the layout makes clear Dead Hang is a trainable
"Now" skill while Hangboard is a **separate frozen assessment** — completing Dead Hang does not open
it.

### Zone-assignment rule (both goals)
- **Now** — the single lowest-in-chain non-mastered node per branch whose hard prerequisites are met.
- **Next** — nodes whose only remaining blocker is a "Now" node (one hard-prereq hop away).
- **Later** — still-locked nodes ≥2 hops away, plus the goal node.
- **Frozen** — stub/frozen nodes (Hangboard), shown with their required-info list; never in Now/Next.
- **Foundation completed** — `mastered` nodes, collapsed to a count + expandable list.
- **Next unlock** — the nearest node that will flip something locked→available or open an assessment.
  Names the relationship and current status only; any numeric criterion is "to be defined" and lives
  on the skill page.

---

## 4. Weekly recommendation — TWO-STAGE logic (gates → ranking)

Replaces the old "first rule wins" chain. **Stage 1** removes anything unsafe or ineligible.
**Stage 2** ranks what remains. This runs over a candidate set of *activities* (the anchor lessons,
support skills, climbing, light practice, recovery, and any progression-triggered items).

### Weekly targets are derived, not hard-coded
The target set for the week is built from the **active weekly plan** (`puc_plan`) and **progression
rules**, per user:
- Anchor counts = however many Pyramid / Ladder days the plan schedules and the progression rules
  require (not assumed to be exactly one each).
- Climbing count = the plan's bouldering days.
- Support-skill counts = each active secondary skill's own weekly frequency.
- Light practice = the plan's light days.
- **Max Test is not a weekly target** — it appears only when manually chosen or progression-triggered
  (your answer #2).
`Remaining = derived targets − completed this week (Sun–Sat)`.

### Stage 1 — Hard gates (eliminate ineligible activities)
An activity is dropped from consideration if any gate fails:
- **Pain gate (activity-specific, §6):** current pain in an area this activity loads → drop this
  activity only (not all pulling).
- **Same-day / recovery gate:** a pulling activity is dropped if a heavy pull is already logged today
  or within the recovery window; grip-heavy work is dropped within the grip-recovery window after
  climbing.
- **Schedule gate:** on a plan **rest** day, pulling anchors are dropped; on a plan **climbing** day,
  additional pulling is dropped (don't stack pulling on a climbing day).
- **Frozen / locked gate:** frozen (Hangboard) and locked skills are never eligible.
- **Progression-cap gate:** over-cap items (e.g., an extra Ladder round) and not-yet-unlocked items
  (e.g., weighted pull-ups before their gate) are ineligible.
- **Max Test gate:** ineligible unless manually chosen or progression-triggered *and* the freshness
  conditions hold.

Anything dropped for a *user-relevant* reason (Max Test not fresh, Hangboard frozen, over cap) is
remembered for the **Don't-do-now** list (top 2–3 by relevance).

### Stage 2 — Rank the eligible activities
Remaining activities are ordered by these keys, in priority order (lexicographic — no arbitrary
numeric weights, so nothing looks falsely precise):
1. **Weekly priority** — an incomplete weekly **anchor** outranks optional work; an activity behind
   its weekly target outranks one that's on track.
2. **Progression value** — advances an active goal's current "Now" skill, or addresses a stated
   limitation (grip/explosive/high-step), outranks generic volume.
3. **Schedule fit** — matches today's plan slot (and, for light practice, the time-of-day windows).
4. **Recovery comfort** — better-recovered activities rank above ones you're marginally fresh for.

The **top-ranked** eligible activity becomes **Today's recommendation** and sets the **primary CTA**.
Other eligible, not-today activities populate **Remaining this week**. Ties are broken by the next key
down; if nothing is eligible (rest/pain day), Today becomes "Recovery day" with a *Log recovery* CTA.

### Worked example (unchanged outcome, new mechanism)
Ladder done Mon, climbed Sun, Ring Support once, no current pain, today Wed (plan = strength), last
pull > recovery window:
- Stage 1 keeps: Pyramid, Ring Support, (climbing not today), (light optional). Drops: Max Test (gate:
  not fresh), Hangboard (frozen), 6th Ladder round (over cap).
- Stage 2 ranks Pyramid top (incomplete anchor + progression value + fits today's strength slot).
- **Today:** Start Pyramid · **Left:** Pyramid, Climb (Fri), Ring ×1 · **Skip now:** Max Test (not
  fresh), Hangboard (frozen).

---

## 5. Primary CTA — varies with the recommendation

| Top recommendation | CTA label | Action |
|---|---|---|
| Pyramid anchor due | **Start Pyramid** | opens the Pyramid lesson |
| Ladder anchor due | **Start Ladder** | opens the Ladder lesson |
| Support skill due | **Start Ring Support** (etc.) | opens that skill's log/lesson |
| Light day, fresh | **Start Light Practice** | opens Light lesson |
| Climbing day / climb logged, no check-in | **Complete check-in** | opens climbing check-in (§7) |
| Climbing day, nothing logged | **Log climbing** | logs a climbing session + offers check-in |
| Rest day / fully gated | **Log recovery day** | records a recovery/rest day |
| Pain affecting today's work | **Update pain check-in** | opens the short pain clarifier (§6) |

---

## 6. Pain handling — activity-specific, current-state (not a blanket 48 h)

Problem with the old rule: any pain flag blocked *all* pulling for 48 h. New model:

- **Pain has an area and a current state.** New pain captured at lesson-end and in the climbing
  check-in records an **area** (finger / wrist / elbow / shoulder / other) and is treated as
  **current** until you mark it resolved (or log a pain-free session of that type) — not auto-cleared
  on a fixed timer.
- **Area → activity mapping** gates only the affected work: finger/wrist → grip / hangboard /
  climbing-grip; elbow → pulling / dips; shoulder → pulling / pressing / support. Unaffected
  activities stay eligible.
- **Legacy pain (boolean, no area):** older entries have no area. When one exists recently, the Coach
  does **not** blanket-block; it shows a one-tap **pain clarifier** ("You noted pain recently — is it
  still bothering you, and where?"). Until answered, it cautions only the **activity type that was in
  progress when the pain was logged**, not everything.
- **Communication:** the Today card names the affected area and what's gated ("Left elbow flagged —
  holding off on pulling and dips; grip/legs are fine"), and offers the clarifier CTA. It never
  silently blocks nor silently ignores pain.

---

## 7. Minimum check-ins required before implementation

The Weekly Coach needs two lightweight inputs to reason about load. These are **markers**, not the
full Phase-2 gym analytics layer.

### 7a. Climbing check-in (minimum)
- **Minimum fields (≤3 taps):** highest grade completed; main limitation (one tap from a fixed list:
  finger/grip · forearms pumped · explosive power · high step · technique · fear · endurance); pain
  area (none / finger / wrist / elbow / shoulder). *Optional:* attempted grade, wall type, note.
- **When it appears:** right after a climbing session is logged; offered from Home ("Complete
  check-in") on a planned climbing day whose session is logged but not detailed.
- **When info is missing:** the climbing session **still counts** (as a completed session and grip/pull
  load); its detail is marked "not reported." The Coach never fabricates a limitation or pain value.
- **Uncertainty:** shown as "Climbing logged · details not filled in," and any limitation/readiness
  trend is labelled "based on N of M climbing sessions with check-ins." The missing session is
  visible, never pretended away.

### 7b. Gym / group check-in (minimum marker)
- **Minimum fields (≤2 taps):** session type tag (push / pull / legs / full / group class / other);
  rough intensity (easy / moderate / hard). *Optional:* note. (Full exercise/weight/reps/sets stays
  Phase 2.)
- **When it appears:** on a planned gym/group day, or via a Home quick action ("Log gym/group").
- **When info is missing:** if no gym/group session is logged, the Coach **states it can't see gym
  load this week** rather than assuming rest; a logged-but-untagged session still counts as a generic
  trained session for fatigue.
- **Uncertainty:** untagged sessions show "Gym session · type not specified"; fatigue that depends on
  gym load is labelled as partial when gym data is absent.

Scope flag: 7b is the **smallest marker** the weekly logic needs to see gym/group load. If you'd
rather the Coach simply display "gym not tracked yet" and defer even this marker to Phase 2, say so —
the weekly logic degrades gracefully either way (it just loses the gym-fatigue signal).

---

## Decisions recorded (your answers)
1. Slim Goals strip kept as secondary context; must not compete with Today. ✔ (§1)
2. Max Test is manual or progression-triggered only — not a scheduled weekly target. ✔ (§4)
3. One active V5 skill per support branch. ✔ (§3)

## Open questions for you
1. **Pain area capture** requires adding an area choice at lesson-end (finger/wrist/elbow/shoulder/
   other). OK to add that one field now, so pain becomes activity-specific? (Legacy boolean pain is
   handled via the clarifier regardless.)
2. **Gym/group marker (§7b)** — include the minimal 2-tap marker now so the weekly logic sees gym
   load, or defer it and have the Coach show "gym not tracked yet" until Phase 2?
3. **Recovery windows** — set the concrete "heavy-pull recovery" and "post-climb grip-recovery"
   windows now (proposed ~20 h and ~24 h), or leave them as editable settings with those defaults?
