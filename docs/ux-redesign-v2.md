# UX Redesign — Weekly Coach Home + Guided Skill Map (PROPOSAL, for review)

Status: **design proposal — no code until approved.** Addresses information overload: Home must
coach ("what now / what's left / what to avoid"), and the map must feel like a guided path, not a
database. Scope stays inside the Preview slice (additive, `spc_*` only, no new data capture).

Grounding note on available data: the weekly engine uses what the slice already has — migrated
Pull-Up Coach lessons (pyramid/ladder/light/max), climbing (bouldering) days from the weekly plan +
logs, pain flags, skips, secondary-skill weekly targets, and the progression/anchor rules. **Gym /
group sessions are not yet captured** (that's the Phase-2 gym layer); until then the engine treats
plan rest/non-pull days as-is and shows an honest "gym not tracked yet" note where relevant.

---

## 1. Home — "Weekly Coach / Today"

Home becomes coaching-first. The two goals shrink to a context strip; the skill map is demoted to a
secondary link.

```
┌──────────────────────────────────────────────┐
│ 🧗 Skill Progression Coach            [Preview]│
│ Goals: First V5 · First Muscle-Up  (tap → map) │
├──────────────────────────────────────────────┤
│ TODAY · Wednesday                              │
│ ┌──────────────────────────────────────────┐  │
│ │ 💪 Pyramid Day  · anchor                  │  │
│ │ 5, 4, 3, 2, 1 — stop 1–2 before failure   │  │
│ │ Why: your Pyramid anchor isn't done this  │  │
│ │ week and you're fresh (no pulling since    │  │
│ │ Sunday, no pain).                          │  │
│ │                                            │  │
│ │        [ ▶ Start Pyramid ]   ← primary     │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ✅ COMPLETED THIS WEEK                          │
│   🧗 Climbing — Sun                            │
│   🔄 Ladder — Mon                              │
│   ◎ Ring Support 30s — Mon                     │
│                                                │
│ 🎯 REMAINING THIS WEEK                          │
│   💪 Pyramid            ← today                 │
│   🧗 Climbing (planned Fri)                     │
│   ◎ Ring Support — 1 more                       │
│                                                │
│ ⛔ DON'T DO NOW                                 │
│   🏆 Max Test — not fresh enough this week      │
│   🪝 Hangboard — frozen (needs board info)      │
│   ➕ 6th Ladder round — over progression cap    │
│                                                │
│ ────────────────────────────────────────────  │
│   [ 🗺️ Skill map ]              [ ⚙️ Settings ] │
└──────────────────────────────────────────────┘
```

Fixed sections, always in this order (each line carries a one-line *why*):
1. **Today** — the single recommended action + why + one primary button. On a no-pull day this reads
   "No additional pulling today" and the primary button becomes the relevant thing (e.g. *Log climbing*)
   or is hidden.
2. **Completed this week** — logged sessions Sun–Sat.
3. **Remaining this week** — target set minus completed.
4. **Don't do now** — the avoid list with reasons.
5. Secondary row — skill map + settings (no longer the star of the screen).

Pain state overrides everything: Today collapses to "Rest — pain reported in the last 48 h. No
pulling," primary button hidden, and pulling items move to Don't-do-now.

---

## 2. Skill Map — guided, one goal at a time

Top of map: a **goal switch** (First V5 ⇄ First Muscle-Up) and a **filter** (Active / Locked /
Completed / All, default Active). Structure is three zones — **Now / Next / Later** — plus a
collapsed **Foundation completed** and a **Your next unlock** callout. Only hard-prerequisite
ordering is shown (as Now→Next→Later placement and short "unlocks/needs" text); supporting and
readiness edges stay inside the node-detail page. Tapping any skill opens the existing detail page
(prerequisites, supporting skills, unlocks, why-status) unchanged. Shared skills are badged with both
goal icons.

### 2a. First Muscle-Up (a real prerequisite chain)

```
┌──────────────────────────────────────────────┐
│ 🗺️  First Muscle-Up            [⇄ First V5]   │
│ Filter:  [Active]  Locked  Completed  All      │
├──────────────────────────────────────────────┤
│ 🔓 YOUR NEXT UNLOCK                             │
│    Chest-to-Bar  →  unlocks High Pull (band)   │
│    Do: 1 clean chest-to-bar pull-up            │
│                                                │
│ ▶ NOW — train these (active next per branch)   │
│   💪 Pull Strength                             │
│      ● 10 Pull-Ups — In Progress               │
│   ⚡ Explosive Pull                            │
│      ● Chest-to-Bar — Available     [🧗🔄 shared]│
│   🤸 Push & Support                            │
│      ● Parallel-Bar Dips — In Progress         │
│   🔄 Transition                                │
│      ● Low-Bar Jump Transition — Available     │
│                                                │
│ ⏭️ NEXT — opens after Now                       │
│   High Pull (band) · Straight-Bar Dips ·        │
│   Low-Bar Transition                           │
│                                                │
│ 🔒 LATER                                        │
│   Full Negative MU · Band-Assisted MU ·         │
│   ▸ First Muscle-Up 🎯                          │
│                                                │
│ ✅ Foundation completed (6)            ▸ expand │
│    Active Hang · First Pull-Up · 5 Pull-Ups ·   │
│    8 Pull-Ups · Hanging Leg Raise · …           │
└──────────────────────────────────────────────┘
```

### 2b. First V5 (readiness-based — no single chain)

V5 has **no prerequisite chain** (a grade can't be unlocked by metrics), so its map is organized by
**support area**, each showing the active next skill, plus an honest "on the wall" note for the
things the app can't train yet.

```
┌──────────────────────────────────────────────┐
│ 🗺️  First V5                  [⇄ Muscle-Up]   │
│ Filter:  [Active]  Locked  Completed  All      │
├──────────────────────────────────────────────┤
│ ℹ️ No single unlock path — V5 is readiness-     │
│   based. Strengthen the areas below.           │
│                                                │
│ ▶ NOW — build these areas                      │
│   🪝 Finger / Grip                             │
│      ● Dead Hang — confirm  →  Hangboard 🔒     │
│   ⚡ Explosive Pull                            │
│      ● Band-Assisted Explosive Pull — Available │
│   🦵 High Step / Single-Leg                    │
│      ● Bulgarian Split Squat — Available        │
│   🧱 Body Tension (support)                     │
│      ● Toes-to-Bar — First Success  [🔄 shared] │
│                                                │
│ ⏭️ NEXT                                         │
│   Chest-to-Bar · High Step-Up · Pistol (assist) │
│                                                │
│ 🧗 ON THE WALL — not app-tracked yet            │
│   Technique · route reading · fear exposure —   │
│   arrives with the climbing check-in            │
│                                                │
│ 🔒 LATER                                        │
│   Hangboard protocol (frozen) · Pistol (full)   │
│                                                │
│ ✅ Foundation completed (2)            ▸ expand │
└──────────────────────────────────────────────┘
```

Zone assignment rule (both goals):
- **Now** = the single lowest-in-the-chain non-mastered node per branch whose hard prerequisites are
  met (status available / in_progress / assessment_unlocked / first_success / stabilizing). One per
  branch, shown prominently.
- **Next** = nodes whose only blocker is a "Now" node (one hard-prereq hop away).
- **Later** = still-locked nodes ≥2 hops away, plus the goal node itself.
- **Foundation completed** = all `mastered` nodes, collapsed to a count + expandable list.
- **Your next unlock** = the nearest node that will flip something from locked→available or open an
  assessment when completed (for MU, the closest assessment/prereq gate; for V5, the highest-leverage
  readiness node).

Filters just re-scope which statuses are visible; Now/Next/Later framing stays.

---

## 3. Weekly recommendation logic (v1 — deterministic & explainable)

Every output line carries a plain-language *why*. This is a recommendation engine, not a mandate —
any lesson is still startable from the map.

**Week = Sunday–Saturday** (matches the existing app).

### Inputs
- **Plan** (`puc_plan`): weekday → {strength, volume, light, max_test, bouldering, rest}. Source of
  intended climbing/anchor/rest days.
- **Completed this week** (`spc_sessions`, Sun–Sat): pyramid / ladder / light / max / climbing / skip.
- **Support targets**: active secondary skills with a weekly frequency (e.g. Ring Support ×2).
- **Fatigue signals**: hours since last pulling lesson (pyramid/ladder/max/weighted); hours since last
  climbing (forearm/grip load); consecutive training days.
- **Pain**: any pain flag in the last 48 h (hard gate).
- **Skips**: skipped sessions this week + reason.
- **Progression rules** (from the existing app): Pyramid & Ladder are weekly anchors (1 each, don't
  skip unless pain); Max Test at most ~once per 1–2 weeks and only when fresh; Light Practice optional
  / technique only; no pulling on climbing/rest days; Ladder round cap; weighted work only once
  unlocked; Hangboard always frozen.

### Weekly target set (what "should" happen)
1× Pyramid, 1× Ladder, climbing per plan, Ring Support ×(its weekly freq), optional 1–2 Light on light
days, Max Test only on a max-test week **and** only if fresh.
`Remaining = target − completed`. `Completed` = grouped logged sessions.

### Today's recommendation (first matching rule wins)
1. **Pain in last 48 h** → "Rest / mobility only — no pulling." Hide primary button.
2. **Plan = climbing today** (or climbing already logged today) → "Climbing day — no extra pulling."
   Primary = *Log climbing* (check-in later).
3. **Plan = rest today** → "Recovery day."
4. **Heavy pull <~20 h ago** → "No additional pulling today — recover." Offer a non-grip support
   (e.g. Ring Support) or rest.
5. **Anchor due**: Pyramid (or Ladder) still remaining and you're fresh → recommend it (prefer the
   plan's assignment for today). This is the common "Start Pyramid" case.
6. **Support due**: Ring Support / Dips owed and fresh → recommend it.
7. **Light day & fresh** → Light Practice.
8. **Else** → "Nothing required today — optional light practice or rest."

### "Don't do now" list (always computed; show only relevant items)
- **Max Test** — unless fresh *and* due → why: "not fresh" / "already tested recently."
- **Hangboard** — always → why: "frozen until board/hold/grip/pain provided."
- **Extra Ladder round** — → why: "over progression cap."
- **More pulling** — if pain or heavy pull <~20 h → why: "recover first."
- **Grip-heavy (Dead Hang / hangboard)** — if climbed <~24 h ago → why: "forearms still loaded."
- **Weighted pull-ups** — if not unlocked → why: "reach a stable 10 pull-ups first."

### Worked example (matches the brief)
Given: Ladder done Mon, climbed Sun, Ring Support once, no pain, today Wed (plan = strength), last
pull >48 h ago →
- **Today:** Start Pyramid (anchor due, you're fresh).
- **Remaining:** Pyramid (today), Climbing (Fri planned), Ring Support ×1.
- **Don't do now:** Max Test (not fresh enough), Hangboard (frozen), 6th Ladder round (over cap).

### Honest gaps (called out in-app, not hidden)
- Gym/group load isn't captured yet → not in fatigue math until the Phase-2 gym layer.
- Climbing check-in (limitation/pain trends) isn't built yet → climbing counts as a session and grip
  load only.

---

## Open questions for you
1. Home goal context — keep the slim "Goals: … (tap → map)" strip, or drop goals from Home entirely
   and reach them only via the map button? (Proposed: keep the slim strip.)
2. Max Test cadence — is "~once every 1–2 weeks, only when fresh" the right default, or do you want it
   purely manual (always in Don't-do-now unless you explicitly choose it)?
3. For the V5 map "Now" areas, is one active skill per support branch the right density, or do you
   want top-2 per branch?
