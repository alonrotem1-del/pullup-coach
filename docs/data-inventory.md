# Data Inventory — Pull-Up Coach localStorage (Phase 0A)

Data Preservation Contract §C3.1 deliverable. The user's real training history lives
**only** in the browser's localStorage on the production origin, under exactly the six
keys below. The uploaded ZIP contains code only — it never contains user data.

## Verification

Two independent checks confirm this inventory is complete:

1. **Manual code audit**: every read/write in `index.html` goes through the `DB` wrapper
   (`DB.get`/`DB.set`/`DB.del`) or the export/import module; `clearAllData()` enumerates
   exactly the same six keys; `sw.js` touches no storage.
2. **Automated scan** (`tests/inventory.spec.cjs`, runs in CI): asserts that the set of
   `puc_*` string literals in the app equals exactly these six keys, and that no other
   persistence API (`indexedDB`, `document.cookie`, `sessionStorage`) is used anywhere.

## Keys

### `puc_log` — the training history (highest value)
Append-only array of entries:

```js
{
  id: Number,              // Date.now() at logging time
  date: String,            // full ISO timestamp of the set/event
  sessionType: 'strength' | 'volume' | 'light' | 'max_test' | 'bouldering' | 'rest',
  setType: 'working' | 'warmup' | 'max' | 'summary' | 'skip' | 'session',
  setNumber: Number?,      // position within the session
  reps: Number,            // 0 for summary/skip/session entries
  forearmFatigue: Number,  // vestigial, always 0
  pain: Boolean?,          // pain/discomfort flag (set-level or session summary)
  skipReason: 'pain'|'fatigue'|'no_time'|'bouldering'|'conflict'|'other'?,  // on skip entries
  notes: String?
}
```
Contains: every Pyramid/Ladder/Light/Max set with reps and timestamps, warm-up vs
working vs max sets, session summaries, pain records, skipped sessions with reasons,
bouldering/rest day markers, notes, and edited past sessions. **PR history and weekly
totals are derived from this key**, never stored separately.

### `puc_plan` — weekly plan
`{ 0..6: sessionType }`, weekday (0 = Sunday) → protocol.

### `puc_settings` — workout settings & rest times
```js
{
  soundEnabled, alertVolume, notificationsEnabled, maxReps,
  pyramid: { topSet, restSeconds },
  ladder:  { maxRung, rounds, miniRestSeconds, roundRestSeconds },
  light:   { repsPerSet, setsPerDay, firstReminderHour, intervalHours },
  lastExportAt   // added Phase 0A: timestamp of last verified export
}
```

### `puc_session` — in-flight session state (transient)
The active session state machine (phase, set cursors, adaptive pyramid target, ladder
round/step, max-test sub-phase, rest-timer end time). Not part of long-term history;
excluded from v2 migration (a running session must be finished or discarded first) but
**included in export/import** so a backup is always complete.

### `puc_progression` — progression / level-up state
```js
{
  strength: { level, easySessions },
  volume:   { ladderLevel, rounds, easySessions },
  suggestedWeighted: Boolean
}
```

### `puc_secondary` — secondary skills with full history
```js
{ skills: [{
    id, name, desc, unit: 'reps'|'seconds'|'cycles', icon,
    frequency,        // ×/week target, 0 = off
    target: String?,  // suggested target text
    custom: Boolean?, // user-created skill
    log: [{ date: ISO, value: Number }]   // full timestamped history; PRs derived
}]}
```
Defaults shipped: Ring Support Hold, Dips, Dead Hang, Scapular Pull-ups, Ring Rows,
Push-ups, Wrist Roller — plus any user-created custom skills.

## Export format (Phase 0A)

`pullup-coach-export-YYYY-MM-DD.json`:
```js
{
  app: 'pullup-coach',
  formatVersion: 1,
  exportedAt: ISO,
  data: { /* the six keys, values verbatim */ },
  counts: {
    logEntries, workingSets, totalReps, sessionDays, entriesBySessionType,
    skippedSessions, painEntries, dateRange: { first, last }, maxTestPB,
    secondarySkills, customSecondarySkills, secondaryLogEntries, secondaryPRs
  }
}
```
Export refuses to produce a file unless (a) the counts block equals an independent
recomputation from `data`, and (b) every key in `data` matches live localStorage
entry-by-entry. Import re-validates (a) before writing anything and fully replaces the
six keys (no partial merges).
