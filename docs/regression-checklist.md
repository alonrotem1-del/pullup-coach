# Baseline Regression Checklist — Pull-Up Coach (Phase 0A)

Purpose: the behavior contract for the stable app. Any future structural change
(module split, v2 work touching `main`) must re-execute this checklist with zero
behavioral diffs.

Baseline run: 2026-07-16, against the Phase 0A build.
- **Automated** = covered by the characterization suite (`npx playwright test`, 27 tests, all passing 2026-07-16).
- **Headless ✓** = verified in headless Chromium during the baseline run.
- **Device — pending user run** = requires a real phone / the production origin (notifications, PWA install, real data); to be checked off by the user after deploy.

| # | Area | Check | Expected | Baseline |
|---|---|---|---|---|
| 1 | Pyramid session | Start from dashboard on a strength day; log all sets | First target from settings; next target = actual reps − 1; ends at 1 rep; rest timer between sets | Automated (engine + full UI flow) |
| 2 | Pyramid adjust | Use inline −/+ before logging | Live preview updates dots/label; logged reps drive next target | Automated (UI flow logs adjusted rep) |
| 3 | Ladder session | Complete 1,2,3 × 3 rounds | Mini-rest between steps, round-rest between rounds, "Great work" screen with Continue/Finish | Automated (engine); completion screen headless ✓ |
| 4 | Ladder extension | Tap ➕ Continue at completion | One extra round through normal flow | Automated (engine: totalRounds increment path) |
| 5 | Light practice | Log mini-sets across the day | light_break between sets; dots update; done state after N sets | Automated (engine) |
| 6 | Max test | Warmup → rest 3 min → max set | Sub-phases in order; PB derived from max entries | Automated (engine + PB derivation) |
| 7 | Skip flows | Skip from dashboard and in-session, every reason | Skip entry logged with reason; pain reason triggers rest warning | Automated (log shape); UI dialogs headless ✓ |
| 8 | Pain gate | Log pain, revisit dashboard | Danger warning for 48h; none after | Automated |
| 9 | Performance drop | 3 declining sessions | Warning appears | Automated |
| 10 | Progression suggestions | 2 easy strength / volume sessions; max ≥10 | Level-up / add-round / weighted suggestions; hard session resets | Automated |
| 11 | Weekly plan | Edit plan in modal, save | Persists; dashboard reflects today's type | Headless ✓ (plan set via storage + dashboard render) |
| 12 | Weekly stats | This-week card and totals | Working reps only; skips/summaries excluded; anchor pills correct | Automated |
| 13 | Settings | Change every field, save, reload | All values persist; rest durations honored in sessions | Automated (rest durations); full-field persistence headless ✓ |
| 14 | History | Edit past session (date/type/sets/pain), delete session, log past session | Entries rewritten/removed for that date only | Pending user run (destructive on real data) — logic exercised via storage-level tests |
| 15 | In-flight session recovery | Kill app mid-rest, reopen | Timer resumes from absolute end-time; expired rest auto-advances | Automated (schema migration + timerEnd model); device re-check pending |
| 16 | Secondary skills | Log result, PR detection, frequency schedule, custom skill create/delete | PR alert on new best; week counters correct | Headless ✓ (storage-level) |
| 17 | Charts | Progress tab renders | PB journey, weekly stacked chart, max history | Pending user run (CDN Chart.js blocked in tests by design) |
| 18 | Export | Settings → Export | Validated file downloads with correct counts; reminder clears | Automated (download + counts + reminder) |
| 19 | Import | Settings → Import with a valid/invalid file | Valid: full restore + reload; invalid: rejected, nothing written | Automated (apply/validation paths); file-picker flow headless ✓ |
| 20 | Backup reminder | No export for 30+ days | Banner on dashboard | Automated |
| 21 | Rest-timer sound | Timer expiry | 3-beep pattern at configured volume | Pending user run (audio) |
| 22 | Notifications | Enable + rest timer in background | SW notification fires; tap opens app | Pending user run (device only) |
| 23 | PWA | Install banner, offline reload | App installable; loads offline (charts excluded — CDN) | Pending user run (device only) |
| 24 | After-midnight note | Finish session 00:00–04:00 | Hint to fix date shown | Pending user run (time-dependent) |

## Re-run instructions
1. `npm ci && npx playwright test` (CI does this on every push) — items marked *Automated*.
2. Manually walk items marked *Pending user run* on the deployed production app (phone).
3. Record date + result next to the Baseline column; any diff blocks the change that caused it.
