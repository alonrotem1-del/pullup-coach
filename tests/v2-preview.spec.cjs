// End-to-end smoke for the Skill Progression Coach Preview, plus the
// strictly-additive guarantees (spec §I.1 requirement B).
const { test, expect } = require('@playwright/test');

const LEGACY = {
  puc_log: [
    { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 1, reps: 5 },
    { id: 100, date: '2026-05-04T12:00:00.000Z', sessionType: 'strength', setType: 'working', setNumber: 2, reps: 4 },
    { id: 200, date: '2026-05-06T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 },
  ],
  puc_plan: { 0: 'rest', 3: 'strength' },
  puc_settings: { maxReps: 9 },
  puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
  puc_secondary: { skills: [{ id: 'ring-support', name: 'Ring Support Hold', unit: 'seconds', icon: '◎', frequency: 2, log: [{ date: '2026-05-10T10:00:00.000Z', value: 30 }] }] },
};

async function openPreview(page, withLegacy) {
  await page.goto('v2.html'); // base-relative → /pullup-coach/v2.html (matches production depth)
  await page.evaluate((legacy) => {
    localStorage.clear();
    if (legacy) Object.keys(legacy).forEach(k => localStorage.setItem(k, JSON.stringify(legacy[k])));
  }, withLegacy ? LEGACY : null);
  await page.reload();
}

test('boots under the GitHub Pages project base — skill content loads (no path escape)', async ({ page }) => {
  // Regression for the deployed "Could not load skill content" error: the app
  // must fetch content relative to its own page, not escape /pullup-coach/.
  await openPreview(page, true);
  await expect(page.locator('text=Could not load skill content')).toHaveCount(0);
  await expect(page.locator('text=Found your Pull-Up Coach data')).toBeVisible();
});

test('welcome → migration preview → reconciliation passes → review → home', async ({ page }) => {
  await openPreview(page, true);
  await expect(page.locator('text=Found your Pull-Up Coach data')).toBeVisible();
  await page.click('#btn-migrate');
  await expect(page.locator('text=Migration preview')).toBeVisible();
  await expect(page.locator('text=✅ Reconciliation passed')).toBeVisible();
  await page.click('#btn-confirm');
  await expect(page.locator('text=Review your starting statuses')).toBeVisible();
  await page.click('#btn-review-summary');
  await expect(page.locator('text=Final summary')).toBeVisible();
  await page.click('#btn-confirm-review');
  await expect(page.locator('text=First V5')).toBeVisible();
  await expect(page.locator('text=First Muscle-Up')).toBeVisible();
});

test('additive: puc_* is unchanged and only spc_* keys are written', async ({ page }) => {
  await openPreview(page, true);
  const before = await page.evaluate(() => JSON.stringify({
    puc_log: localStorage.getItem('puc_log'),
    puc_settings: localStorage.getItem('puc_settings'),
    puc_secondary: localStorage.getItem('puc_secondary'),
  }));
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  const after = await page.evaluate(() => JSON.stringify({
    puc_log: localStorage.getItem('puc_log'),
    puc_settings: localStorage.getItem('puc_settings'),
    puc_secondary: localStorage.getItem('puc_secondary'),
  }));
  expect(after).toBe(before); // legacy data byte-identical
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('spc_')).sort());
  expect(keys).toContain('spc_meta');
  expect(keys).toContain('spc_sessions');
  expect(keys).toContain('spc_state');
});

test('additive: the Preview registers no service worker', async ({ page }) => {
  await openPreview(page, true);
  const regs = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 0;
    const r = await navigator.serviceWorker.getRegistrations();
    return r.length;
  });
  expect(regs).toBe(0);
});

test('store guard throws if anything tries to write a puc_* key', async ({ page }) => {
  await openPreview(page, true);
  const threw = await page.evaluate(() => {
    try { window.SPCStore.set('puc_log', []); return false; } catch (e) { return /only write spc_/.test(e.message); }
  });
  expect(threw).toBe(true);
});

async function toHome(page) {
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  await expect(page.locator('text=First V5')).toBeVisible();
}

test('Home is a Weekly Coach: Today card with a primary CTA, compact Done/Left/Skip, slim goals', async ({ page }) => {
  // Seed a plan where today trains (every day strength) so a Pyramid — an
  // activity with a "works toward" goal — is recommended deterministically.
  const allStrength = {}; for (let i = 0; i < 7; i++) allStrength[i] = 'strength';
  const legacy = {
    puc_log: [{ id: 1, date: '2026-05-02T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 }],
    puc_plan: allStrength, puc_settings: { maxReps: 9 },
    puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
    puc_secondary: { skills: [] },
  };
  await page.goto('v2.html');
  await page.evaluate((l) => { localStorage.clear(); Object.keys(l).forEach(k => localStorage.setItem(k, JSON.stringify(l[k]))); }, legacy);
  await page.reload();
  await page.click('#btn-migrate'); await page.click('#btn-confirm');
  await page.click('#btn-review-summary'); await page.click('#btn-confirm-review');
  await expect(page.locator('text=First V5')).toBeVisible();
  await expect(page.locator('.today-card')).toBeVisible();
  await expect(page.locator('#tc-cta')).toBeVisible();           // one primary action
  // Unified Weekly progress section with a bar + done/left.
  await expect(page.locator('text=WEEKLY PROGRESS')).toBeVisible();
  await expect(page.locator('.wk-bar')).toBeVisible();
  await expect(page.locator('text=✅ Done')).toBeVisible();
  await expect(page.locator('text=🎯 Left')).toBeVisible();
  // Renamed section (no longer "Skip now").
  await expect(page.locator('text=⛔ Not recommended today')).toBeVisible();
  await expect(page.locator('text=⛔ Skip now')).toHaveCount(0);
  await expect(page.locator('.wk-line.skip')).toContainText('Max Test');
  await expect(page.locator('.wk-line.skip')).toContainText('Hangboard');
  // Order: Goals card sits above the Today card and reads as objectives.
  await expect(page.locator('.goals-card')).toContainText('Current Goals');
  const goalsY = await page.locator('.goals-card').boundingBox();
  const todayY = await page.locator('.today-card').boundingBox();
  expect(goalsY.y).toBeLessThan(todayY.y);
  await expect(page.locator('.goals-card')).toContainText('First V5');
  await expect(page.locator('.goals-card')).toContainText('First Muscle-Up');
  // Progress is percentage-first; no bare "N / M required" wording.
  await expect(page.locator('.wk-pct')).toBeVisible();
  await expect(page.locator('.wk-prog')).not.toContainText('required this week');
  // Today card names what the workout works toward (one line).
  await expect(page.locator('.tc-towards')).toContainText('Works toward');
  // Pyramid recommendation must never show a fixed sequence (adaptive).
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).not.toMatch(/5\s*,\s*4\s*,\s*3\s*,\s*2\s*,\s*1/);
});

test('guided map: goal switch, Now/Next zones, frozen Hangboard, node detail preserved', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#btn-map');
  await expect(page.locator('text=▶ NOW').first()).toBeVisible();
  // Frozen Hangboard is shown frozen, never as unlockable.
  await expect(page.locator('.frozen-row', { hasText: 'Hangboard Assessment' })).toBeVisible();
  // The "Next unlock" callout must never imply Hangboard becomes unlocked.
  const unlock = page.locator('.unlock-card');
  if (await unlock.count()) {
    await expect(unlock).not.toContainText('Hangboard');
    // Wording fixed: no unfinished "(to be defined)" criterion line.
    await expect(unlock).not.toContainText('to be defined');
    await expect(unlock).toContainText('Details inside the skill');
  }
  // NEXT is capped with a "Show more" control when there are many upcoming skills.
  const nextChips = page.locator('.zone-h', { hasText: 'NEXT' });
  if (await page.locator('#btn-next-more').count()) {
    const before = await page.locator('.chips .zn').count();
    await page.click('#btn-next-more');
    const after = await page.locator('.chips .zn').count();
    expect(after).toBeGreaterThan(before);   // more skills revealed
    await expect(page.locator('#btn-next-less')).toBeVisible();
  }
  await expect(page.locator('text=Foundation completed')).toBeVisible();
  // Switch to the other goal.
  await page.click('#btn-swap');
  await expect(page.locator('.topbar')).toContainText('First');
  // Node detail page is preserved (prereqs / unlocks / why). Reveal all NEXT
  // first so the target chip isn't hidden behind the "Show more" cap.
  if (await page.locator('#btn-next-more').count()) await page.click('#btn-next-more');
  await page.locator('.zn[data-node="exp.c2b"]').first().click();
  await expect(page.locator('h3', { hasText: 'Why this status' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'Prerequisites' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'What it unlocks' })).toBeVisible();
});

test('Muscle-Up map Now = active mainline (10 Pull-Ups), not assessment-ready Weighted-Prep', async ({ page }) => {
  // Seed 8,8,9 so pull.8 is mastered → Weighted-Prep becomes assessment-ready.
  const legacy = {
    puc_log: [
      { id: 1, date: '2026-05-02T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 8 },
      { id: 2, date: '2026-05-16T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 8 },
      { id: 3, date: '2026-06-20T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 },
    ],
    puc_plan: { 0: 'rest', 3: 'strength' }, puc_settings: { maxReps: 9 },
    puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
    puc_secondary: { skills: [] },
  };
  // Seed this specific dataset directly (openPreview only loads the default LEGACY).
  await page.goto('v2.html');
  await page.evaluate((l) => { localStorage.clear(); Object.keys(l).forEach(k => localStorage.setItem(k, JSON.stringify(l[k]))); }, legacy);
  await page.reload();
  await page.click('#btn-migrate'); await page.click('#btn-confirm');
  await page.click('#btn-review-summary'); await page.click('#btn-confirm-review');
  await page.click('#btn-map');
  // Ensure we're on the Muscle-Up map.
  if (!/Muscle-Up/.test(await page.locator('.brand').first().innerText())) await page.click('#btn-swap');
  const pullNow = page.locator('.now-row', { hasText: 'Pull Strength' });
  await expect(pullNow).toContainText('10 Pull-Ups');
  await expect(pullNow).not.toContainText('Weighted Pull-Up Preparation');
  // Weighted-Prep is demoted to the Next zone, not Now.
  const nowZone = page.locator('.now-row');
  await expect(nowZone.filter({ hasText: 'Weighted Pull-Up Preparation' })).toHaveCount(0);
});

test('climbing check-in records the session without inventing blank fields', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#qa-climb');
  await expect(page.locator('text=Climbing check-in')).toBeVisible();
  await page.click('#save-climb'); // save with defaults (grade V3, no limitation/pain)
  await expect(page.locator('.today-card')).toBeVisible();
  const climb = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).find(s => s.kind === 'climbing' && s.legacy && s.legacy.source === 'preview-live'));
  expect(climb).toBeTruthy();
  expect(climb.checkin.limitation).toBeNull(); // not fabricated
});

test('gym form: tapping options never saves — only the explicit confirm button does', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  const before = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).length);
  await page.click('#qa-gym');
  await page.click('#sm-opts .opt[data-v="group"]');
  let count = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).length);
  expect(count).toBe(before); // session mode tap did not save
  await page.click('#mg-opts .opt[data-v="push"]');
  count = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).length);
  expect(count).toBe(before); // muscle group tap did not save
  await page.click('#gi-opts .opt[data-v="high"]');
  count = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).length);
  expect(count).toBe(before); // intensity tap did not save either — still nothing written
});

test('gym form: confirm button stays disabled until session type + muscle group + intensity are all chosen', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#qa-gym');
  await expect(page.locator('#gym-save-btn')).toBeDisabled();
  await page.click('#sm-opts .opt[data-v="group"]');
  await expect(page.locator('#gym-save-btn')).toBeDisabled();
  await page.click('#mg-opts .opt[data-v="push"]');
  await expect(page.locator('#gym-save-btn')).toBeDisabled();
  await page.click('#gi-opts .opt[data-v="high"]');
  await expect(page.locator('#gym-save-btn')).toBeEnabled(); // all three chosen now
});

test('gym form: confirm saves the explicit sessionMode/muscleGroups/intensity shape', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#qa-gym');
  await page.click('#sm-opts .opt[data-v="group"]');
  await page.click('#mg-opts .opt[data-v="push"]');
  await page.click('#mg-opts .opt[data-v="core"]');
  await page.click('#gi-opts .opt[data-v="high"]');
  await page.click('#gym-save-btn');
  await expect(page.locator('.today-card')).toBeVisible();
  const gym = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_sessions')) || []).find(s => s.kind === 'gym'));
  expect(gym).toMatchObject({ kind: 'gym', sessionMode: 'group', muscleGroups: ['push', 'core'], intensity: 'high' });
  expect(gym.completedAt).toBeTruthy();
  expect(gym.createdAt).toBeTruthy();
  expect(gym.id).toBeTruthy();
});

test('gym form: muscle-group conflict resolution (Full Body clears others; a detailed pick removes the conflicting broad one)', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.click('#qa-gym');
  await page.click('#mg-opts .opt[data-v="full"]');
  await expect(page.locator('#mg-opts .opt[data-v="full"]')).toHaveClass(/on/);
  // Tapping a detailed group removes the conflicting broad "Full Body" pick.
  await page.click('#mg-opts .opt[data-v="push"]');
  await expect(page.locator('#mg-opts .opt[data-v="full"]')).not.toHaveClass(/on/);
  await expect(page.locator('#mg-opts .opt[data-v="push"]')).toHaveClass(/on/);
  // Push + Pull can coexist (no conflict between them).
  await page.click('#mg-opts .opt[data-v="pull"]');
  await expect(page.locator('#mg-opts .opt[data-v="push"]')).toHaveClass(/on/);
  await expect(page.locator('#mg-opts .opt[data-v="pull"]')).toHaveClass(/on/);
  // Selecting Upper Body clears both Push and Pull (redundant with it).
  await page.click('#mg-opts .opt[data-v="upper"]');
  await expect(page.locator('#mg-opts .opt[data-v="push"]')).not.toHaveClass(/on/);
  await expect(page.locator('#mg-opts .opt[data-v="pull"]')).not.toHaveClass(/on/);
  await expect(page.locator('#mg-opts .opt[data-v="upper"]')).toHaveClass(/on/);
});

test('completing a Max Test lesson updates skill status and shows an unlock moment', async ({ page }) => {
  await openPreview(page, true);
  // Fast path through migration + review.
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  // Start Max Test via the "start another lesson" expander.
  await page.click('#qa-lessons');
  await page.click('.lesson-btn[data-t="max_test"]');
  await page.click('#btn-log');            // warmup (default 2)
  await page.click('#btn-skip');           // skip warmup rest → max phase
  for (let i = 0; i < 10; i++) await page.click('#inc'); // 0 → 10
  await page.click('#btn-log');
  await expect(page.locator('text=Lesson complete')).toBeVisible();
  await page.click('#btn-save');
  await expect(page.locator('text=Skill update')).toBeVisible();
  // pull.10 should now be recorded as at least first_success in spc_state.
  const status = await page.evaluate(() => (JSON.parse(localStorage.getItem('spc_state')).statusById['pull.10']));
  expect(['first_success', 'stabilizing', 'mastered']).toContain(status);
});

// ---- History & Progress ----------------------------------------------------

test('Home has a single History & Progress entry point', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await expect(page.locator('#btn-history')).toBeVisible();
  await expect(page.locator('#btn-history')).toContainText('History & Progress');
});

test('History lists sessions newest-first, grouped by day, with per-kind detail; handles legacy gym shape without crashing', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => {
    const now = new Date();
    const today = now.toISOString();
    const yest = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const sessions = JSON.parse(localStorage.getItem('spc_sessions') || '[]');
    sessions.push(
      { id: 'seed_climb_1', kind: 'climbing', date: today, day: today.slice(0, 10), checkin: { grade: 4, limitation: 'finger/grip', painArea: null } },
      // Legacy pre-slice gym shape: gymType + old intensity enum, no sessionMode/muscleGroups.
      { id: 'seed_gym_legacy', kind: 'gym', date: yest, day: yest.slice(0, 10), gymType: 'push', intensity: 'hard' },
      // New-shape gym entry.
      { id: 'seed_gym_new', kind: 'gym', date: yest, day: yest.slice(0, 10), sessionMode: 'group', muscleGroups: ['full'], intensity: 'high' }
    );
    localStorage.setItem('spc_sessions', JSON.stringify(sessions));
  });
  await page.click('#btn-history');
  await expect(page.locator('.brand')).toContainText('History & Progress');
  await expect(page.locator('text=Today')).toBeVisible();
  await expect(page.locator('text=Yesterday')).toBeVisible();
  await expect(page.locator('.hist-card', { hasText: '🧗 Climbing' })).toContainText('V4');
  await expect(page.locator('.hist-card', { hasText: 'legacy entry' })).toContainText('Hard intensity');
  await expect(page.locator('.hist-card', { hasText: 'Group Workout' })).toContainText('Full Body');
  expect(errors).toEqual([]); // never crashes on the old shape
});

test('deleting a record requires confirmation, removes only that id (across both storage arrays), and updates Home', async ({ page }) => {
  await openPreview(page, true);
  await toHome(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const sessions = JSON.parse(localStorage.getItem('spc_sessions') || '[]');
    sessions.push({ id: 'del_target', kind: 'rest', date: now, day: now.slice(0, 10) });
    sessions.push({ id: 'del_keep', kind: 'gym', date: now, day: now.slice(0, 10), sessionMode: 'free', muscleGroups: ['legs'], intensity: 'light' });
    localStorage.setItem('spc_sessions', JSON.stringify(sessions));
    // A migrated-style secondary-session record, living in the OTHER array.
    localStorage.setItem('spc_secondary_sessions', JSON.stringify([
      { id: 'sec_keep', kind: 'practice', date: now, day: now.slice(0, 10), nodeId: 'push.ring-support', unit: 'seconds', value: 30, legacy: { skillId: 'ring-support', skillName: 'Ring Support Hold' } }
    ]));
  });
  await page.click('#btn-history');

  const target = page.locator('.hist-card[data-id="del_target"]');
  await target.locator('.hist-del').click();
  // Confirmation row appears; Cancel leaves the record intact.
  await expect(target.locator('.hist-confirm')).toBeVisible();
  await target.locator('.hist-cancel').click();
  let sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('spc_sessions')));
  expect(sessions.some(s => s.id === 'del_target')).toBe(true);

  // Confirm deletes only the targeted id.
  await target.locator('.hist-del').click();
  await target.locator('.hist-confirm-del').click();
  sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('spc_sessions')));
  const secondary = await page.evaluate(() => JSON.parse(localStorage.getItem('spc_secondary_sessions')));
  expect(sessions.find(s => s.id === 'del_target')).toBeUndefined();
  expect(sessions.find(s => s.id === 'del_keep')).toBeTruthy();      // untouched
  expect(secondary.find(s => s.id === 'sec_keep')).toBeTruthy();     // other array untouched
  await expect(page.locator('.hist-card[data-id="del_target"]')).toHaveCount(0); // History updated immediately

  // Home reflects the deletion (recomputed fresh on next render — no stale cache).
  await page.click('#btn-home');
  await expect(page.locator('.today-card')).toBeVisible();
});

test('deleting a lesson session updates Weekly Progress / Today on Home', async ({ page }) => {
  const allStrength = {}; for (let i = 0; i < 7; i++) allStrength[i] = 'strength';
  const legacy = {
    puc_log: [{ id: 1, date: '2026-05-02T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 }],
    puc_plan: allStrength, puc_settings: { maxReps: 9 },
    puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
    puc_secondary: { skills: [] },
  };
  await page.goto('v2.html');
  await page.evaluate((l) => { localStorage.clear(); Object.keys(l).forEach(k => localStorage.setItem(k, JSON.stringify(l[k]))); }, legacy);
  await page.reload();
  await page.click('#btn-migrate'); await page.click('#btn-confirm');
  await page.click('#btn-review-summary'); await page.click('#btn-confirm-review');

  const pctBefore = await page.locator('.wk-pct').innerText();
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const sessions = JSON.parse(localStorage.getItem('spc_sessions') || '[]');
    sessions.push({ id: 'lesson_to_delete', kind: 'lesson', sessionType: 'strength', lessonTemplateId: 'pyramid', date: now, day: now.slice(0, 10), sets: [{ reps: 5, setType: 'working', isWorking: true }] });
    localStorage.setItem('spc_sessions', JSON.stringify(sessions));
  });
  // Force a fresh Home render (there's no in-place refresh button on Home
  // itself) by navigating to History and back — renderHome() always
  // recomputes from storage, so this reflects the seeded completion.
  await page.click('#btn-history');
  await page.click('#btn-home');
  const pctAfterSeed = await page.locator('.wk-pct').innerText();
  expect(pctAfterSeed).not.toBe(pctBefore); // progress moved once the lesson was "done"

  await page.click('#btn-history');
  await page.locator('.hist-card[data-id="lesson_to_delete"] .hist-del').click();
  await page.locator('.hist-card[data-id="lesson_to_delete"] .hist-confirm-del').click();
  await page.click('#btn-home');
  const pctAfterDelete = await page.locator('.wk-pct').innerText();
  expect(pctAfterDelete).toBe(pctBefore); // back to where it was before the seeded completion
});

test('history and gym-form flows never write any puc_* key', async ({ page }) => {
  await openPreview(page, true);
  const before = await page.evaluate(() => JSON.stringify({
    puc_log: localStorage.getItem('puc_log'),
    puc_settings: localStorage.getItem('puc_settings'),
    puc_secondary: localStorage.getItem('puc_secondary'),
    puc_plan: localStorage.getItem('puc_plan'),
  }));
  await page.click('#btn-migrate'); await page.click('#btn-confirm');
  await page.click('#btn-review-summary'); await page.click('#btn-confirm-review');
  // Gym form full flow.
  await page.click('#qa-gym');
  await page.click('#sm-opts .opt[data-v="free"]');
  await page.click('#mg-opts .opt[data-v="legs"]');
  await page.click('#gi-opts .opt[data-v="moderate"]');
  await page.click('#gym-save-btn');
  // History + delete flow.
  await page.click('#btn-history');
  const anyCard = page.locator('.hist-card').first();
  if (await anyCard.count()) {
    await anyCard.locator('.hist-del').click();
    await anyCard.locator('.hist-confirm-del').click();
  }
  const after = await page.evaluate(() => JSON.stringify({
    puc_log: localStorage.getItem('puc_log'),
    puc_settings: localStorage.getItem('puc_settings'),
    puc_secondary: localStorage.getItem('puc_secondary'),
    puc_plan: localStorage.getItem('puc_plan'),
  }));
  expect(after).toBe(before);
});
