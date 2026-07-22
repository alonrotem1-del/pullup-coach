// Skill Progression Coach — domain engine, migration, storage guard,
// duration calculator, dynamic adaptation, and the end-to-end vertical slice
// (onboarding → map → today → workout → progress). All English.
// Additive: never asserts against puc_* being writable.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const Data = require('../coach/data.js');
const Engine = require('../coach/engine.js');
const Store = require('../coach/store.js');
const Progress = require('../coach/progress.js');
const Duration = require('../coach/duration.js');
const Adapt = require('../coach/adapt.js');

const mu = Data.worldsById.muscleup;
const boulder = Data.worldsById.boulder;
const cmap = w => { const c = {}; w.nodes.forEach(n => (c[n.id] = n)); return c; };

// ─────────────────────────── no Hebrew in coach files ─────────────────────────
test('coach/*.js files contain no Hebrew characters', () => {
  const coachDir = path.join(__dirname, '..', 'coach');
  const files = fs.readdirSync(coachDir).filter(f => f.endsWith('.js'));
  const hebrewRe = /[֐-׿]/;
  const violations = [];
  files.forEach(f => {
    const content = fs.readFileSync(path.join(coachDir, f), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (hebrewRe.test(line)) violations.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  });
  expect(violations).toEqual([]);
});

// ─────────────────────────── calcDuration ─────────────────────────────────────
test.describe('calcDuration', () => {
  test('ladder template: 5 rounds ladder + 3×8 sets', () => {
    const t = Data.templates.mu_strength;
    const mins = Duration.calcDuration(t);
    expect(mins).toBeGreaterThan(0);
    // Manual: warmup=180 + ladder(5 sets @ 1,2,3,1,2 reps × 4s each = 4+8+12+4+8=36s exec, 4×120s rest = 480s, 4 rest periods between 5 sets)
    //        + transition=60 + sets(3 sets × 8 reps × 4s = 96s exec, 2×120s rest = 240s)
    //        no rest after the last set of the last block
    // total secs = 180 + 36 + 480 + 60 + 96 + 240 = 1092 → 18 min
    // But wait, last set of last block has no rest. Let me recalculate:
    // Block 1 (ladder, 5 sets): exec for each set + rest after each except: NO, rest after each EXCEPT the very last set of the very last block.
    // Block 1 is not the last block, so all 5 sets get rest:
    //   set1: 1×4=4 + 120 = 124
    //   set2: 2×4=8 + 120 = 128
    //   set3: 3×4=12 + 120 = 132
    //   set4: 1×4=4 + 120 = 124
    //   set5: 2×4=8 + 120 = 128
    //   subtotal = 636
    // Transition: 60
    // Block 2 (3×8 sets):
    //   set1: 8×4=32 + 120 = 152
    //   set2: 8×4=32 + 120 = 152
    //   set3: 8×4=32 + 0 (last set of last block) = 32
    //   subtotal = 336
    // Total = 180 + 636 + 60 + 336 = 1212 → 20 min
    expect(mins).toBe(20);
  });

  test('pyramid template', () => {
    const t = Data.templates.mu_volume; // pyramid, 5 sets (1,2,3,2,1)
    const mins = Duration.calcDuration(t);
    expect(mins).toBeGreaterThan(0);
    // warmup=180 + sets: 5 pyramid sets (1+2+3+2+1)×4=36s exec, 4×120s rest=480s (no rest after last set of last block)
    // total = 180 + 36 + 480 = 696 → 12 min
    expect(mins).toBe(12);
  });

  test('hold sets (support + dips)', () => {
    const t = Data.templates.mu_dip; // hold 4×15sec + sets 4×6reps
    const mins = Duration.calcDuration(t);
    expect(mins).toBeGreaterThan(0);
    // warmup=180
    // Block 1 (hold 4×15): 4×15=60 exec, 4×120=480 rest (all sets get rest — not last block)
    // Transition: 60
    // Block 2 (sets 4×6): 4×6×4=96 exec, 3×120=360 rest (no rest after last set)
    // total = 180 + 60 + 480 + 60 + 96 + 360 = 1236 → 21 min
    expect(mins).toBe(21);
  });

  test('multi-exercise template (3 blocks)', () => {
    const t = Data.templates.mu_light; // 3×30s hold + 3×8 sets + 3×25s hold
    const mins = Duration.calcDuration(t);
    expect(mins).toBeGreaterThan(0);
    // rest for light type = 60s
    // warmup=180
    // Block 1 (hold 3×30): 3×30=90 exec, 3×60=180 rest (not last block)
    // Transition: 60
    // Block 2 (sets 3×8): 3×8×4=96 exec, 3×60=180 rest (not last block)
    // Transition: 60
    // Block 3 (hold 3×25): 3×25=75 exec, 2×60=120 rest (last block, no rest after last set)
    // total = 180 + 90 + 180 + 60 + 96 + 180 + 60 + 75 + 120 = 1041 → 17 min
    expect(mins).toBe(17);
  });

  test('AMRAP template', () => {
    const t = Data.templates.mu_test; // amrap, 1 set
    const mins = Duration.calcDuration(t);
    // warmup=180 + amrap estimate=60 + no rest (single set) = 240 → 4 min
    expect(mins).toBe(4);
  });

  test('climbing template (no blocks) returns null', () => {
    const t = Data.templates.b_consolidate;
    expect(Duration.calcDuration(t)).toBeNull();
  });
});

// ─────────────────────────── genSets ──────────────────────────────────────────
test.describe('genSets', () => {
  test('ladder produces correct round count', () => {
    const sets = Duration.genSets({ scheme: 'ladder', rounds: 5 });
    expect(sets.length).toBe(5);
    expect(sets.map(s => s.target)).toEqual([1, 2, 3, 1, 2]);
  });

  test('pyramid produces 1-2-3-2-1', () => {
    const sets = Duration.genSets({ scheme: 'pyramid' });
    expect(sets.map(s => s.target)).toEqual([1, 2, 3, 2, 1]);
  });

  test('sets scheme produces correct count', () => {
    const sets = Duration.genSets({ scheme: 'sets', sets: 4, reps: 6 });
    expect(sets.length).toBe(4);
    sets.forEach(s => expect(s.target).toBe(6));
  });

  test('hold scheme uses seconds', () => {
    const sets = Duration.genSets({ scheme: 'hold', sets: 3, seconds: 30 });
    expect(sets.length).toBe(3);
    sets.forEach(s => { expect(s.unit).toBe('sec'); expect(s.target).toBe(30); });
  });
});

// ─────────────────────────── dynamic adaptation ───────────────────────────────
test.describe('dynamic adaptation', () => {
  test('easy: +1 rep, −15s rest', () => {
    const r = Adapt.adaptNext('easy', { unit: 'reps', target: 5 });
    expect(r.targetDelta).toBe(1);
    expect(r.restDelta).toBe(-15);
    expect(r.explanation).toContain('added 1 rep');
  });

  test('appropriate: no change', () => {
    const r = Adapt.adaptNext('appropriate', { unit: 'reps', target: 5 });
    expect(r.targetDelta).toBe(0);
    expect(r.restDelta).toBe(0);
  });

  test('hard: +30s rest, same target', () => {
    const r = Adapt.adaptNext('hard', { unit: 'reps', target: 5 });
    expect(r.targetDelta).toBe(0);
    expect(r.restDelta).toBe(30);
    expect(r.explanation).toContain('30 sec rest');
  });

  test('failed: −1 rep, +30s rest', () => {
    const r = Adapt.adaptNext('failed', { unit: 'reps', target: 5 });
    expect(r.targetDelta).toBe(-1);
    expect(r.restDelta).toBe(30);
    expect(r.explanation).toContain('reduced');
  });

  test('hold: easy adds 5 sec, failed removes 5 sec', () => {
    const re = Adapt.adaptNext('easy', { unit: 'sec', target: 30 });
    expect(re.targetDelta).toBe(5);
    const rf = Adapt.adaptNext('failed', { unit: 'sec', target: 30 });
    expect(rf.targetDelta).toBe(-5);
  });

  test('minimum values enforced: 1 rep, 5 sec hold, 15 sec rest', () => {
    expect(Adapt.applyTargetDelta(1, -1, 'reps')).toBe(1);
    expect(Adapt.applyTargetDelta(5, -5, 'sec')).toBe(5);
    expect(Adapt.applyRestDelta(15, -15)).toBe(15);
  });
});

// ─────────────────────────── domain / progression ───────────────────────────
test.describe('domain', () => {
  test('two data-driven worlds with resolvable prerequisites and edges', () => {
    expect(Data.worlds.map(w => w.id).sort()).toEqual(['boulder', 'muscleup']);
    Data.worlds.forEach(w => {
      const ids = new Set(w.nodes.map(n => n.id));
      w.nodes.forEach(n => {
        if (!n.prereq) return;
        (n.prereq.all || []).concat(n.prereq.any || []).forEach(id => expect(ids.has(id)).toBe(true));
      });
      (w.supports || []).forEach(e => { expect(ids.has(e[0])).toBe(true); expect(ids.has(e[1])).toBe(true); });
    });
  });

  test('completed criteria drive node completion; benchmarks seed real progress', () => {
    const states = Store.seedStates(mu, { pullup_max: 9, dips_max: 6 });
    const c = cmap(mu);
    expect(Engine.isComplete(c.mu_pull5, states)).toBe(true);    // 9 ≥ 5
    expect(Engine.isComplete(c.mu_pull10, states)).toBe(false);  // 9 < 10
    expect(Engine.isComplete(c.mu_dip5, states)).toBe(true);     // 6 ≥ 5
    expect(Engine.progressText(c.mu_pull10, states)).toContain('/10');
  });

  test('AND/OR prerequisites: first muscle-up stays locked until its chain is met', () => {
    const c = cmap(mu);
    let states = Store.seedStates(mu, { pullup_max: 12, dips_max: 9 });
    expect(Engine.statusOf(c.mu_firstmu, states, c, {})).toBe('locked');
    ['mu_fastpull', 'mu_c2b', 'mu_lowtrans', 'mu_negmu', 'mu_bandmu'].forEach(id => {
      states[id] = { criteria: {} };
      c[id].criteria.forEach(cr => (states[id].criteria[cr.id] = cr.target));
    });
    expect(Engine.prereqMet(c.mu_firstmu, states, c)).toBe(true);
    expect(Engine.statusOf(c.mu_firstmu, states, c, {})).toBe('available');
  });

  test('optional/support nodes do not block a milestone', () => {
    const c = cmap(mu);
    let states = Store.seedStates(mu, { pullup_max: 12 });
    ['mu_fastpull', 'mu_c2b', 'mu_lowtrans', 'mu_negmu', 'mu_dip5', 'mu_bandmu'].forEach(id => {
      states[id] = { criteria: {} }; c[id].criteria.forEach(cr => (states[id].criteria[cr.id] = cr.target));
    });
    expect(Engine.isComplete(c.mu_hollow, states)).toBe(false);
    expect(Engine.prereqMet(c.mu_firstmu, states, c)).toBe(true);
  });

  test('focus is milestone-driven and limited to one primary + one supporting', () => {
    const f = Engine.autoFocus(mu, Store.seedStates(mu, { pullup_max: 9, dips_max: 6 }));
    expect(f.primary).toBe('mu_pull10');
    expect(f.supporting).toBeTruthy();
    expect(f.primary).not.toBe(f.supporting);
    expect(Engine.autoFocus(mu, Store.seedStates(mu, { pullup_max: 2 })).primary).toBe('mu_deadhang');
    let bs = Store.seedStates(boulder, {});
    ['b_v0', 'b_v1'].forEach(id => { bs[id] = { criteria: {} }; cmap(boulder)[id].criteria.forEach(cr => (bs[id].criteria[cr.id] = cr.target)); });
    expect(Engine.autoFocus(boulder, bs).primary).toBe('b_v2');
  });

  test('world state is independent — switching worlds preserves each world', () => {
    const a = Store.seedStates(mu, { pullup_max: 9 });
    const b = Store.seedStates(boulder, {});
    a.mu_pull10 = { criteria: { reps: 10 } };
    expect(b.mu_pull10).toBeUndefined();
    expect(Engine.isComplete(cmap(mu).mu_pull10, a)).toBe(true);
  });

  test('with pullup_max=9, user is at 5PU completed and 10PU is current focus at 9/10', () => {
    const states = Store.seedStates(mu, { pullup_max: 9 });
    const c = cmap(mu);
    expect(Engine.isComplete(c.mu_pull5, states)).toBe(true);
    expect(Engine.isComplete(c.mu_pull10, states)).toBe(false);
    expect(Engine.progressText(c.mu_pull10, states)).toBe('9/10 reps');
    const f = Engine.autoFocus(mu, states);
    expect(f.primary).toBe('mu_pull10');
  });
});

// ─────────────────────────── recommendation engine ──────────────────────────
test.describe('recommendation engine', () => {
  const base = () => ({ world: mu, states: Store.seedStates(mu, { pullup_max: 9, dips_max: 6 }), templates: Data.templates });
  const focus = () => Engine.autoFocus(mu, Store.seedStates(mu, { pullup_max: 9, dips_max: 6 }));

  test('pain avoids an aggravating session and shows a caution', () => {
    const r = Engine.recommend(Object.assign(base(), { focus: focus(), readiness: { pain: true }, recent: [] }));
    expect(r.caution).toBeTruthy();
    expect(Data.templates[r.sessionTemplateId].type).toMatch(/light|technique|movement/);
  });

  test('fatigue produces a lighter recommendation than the hard default', () => {
    const r = Engine.recommend(Object.assign(base(), { focus: focus(), readiness: { energy: 1, upperFatigue: 3, time: 'normal' }, recent: [] }));
    expect(Data.templates[r.sessionTemplateId].type).toMatch(/light|technique|movement|skill/);
    expect(r.why).toBeTruthy();
  });

  test('a recent hard climbing session down-shifts hard pulling (climbing = pulling load)', () => {
    const hard = Engine.recommend(Object.assign(base(), { focus: focus(), readiness: { energy: 3, upperFatigue: 1, time: 'normal' }, recent: [{ kind: 'climbing', hardPull: true }] }));
    expect(Data.templates[hard.sessionTemplateId].type).not.toBe('strength');
    expect(hard.reasons.join(' ')).toContain('climbing');
  });

  test('recommendation targets the current focus and explains itself', () => {
    const f = focus();
    const r = Engine.recommend(Object.assign(base(), { focus: f, readiness: { energy: 2, upperFatigue: 2, time: 'normal' }, recent: [] }));
    expect(r.targetNodeIds).toContain(f.primary);
    expect(r.why.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────── apply session → progress ───────────────────────
test.describe('session application', () => {
  test('strength: 10 clean pull-ups completes the node and unlocks downstream', () => {
    const states = Store.seedStates(mu, { pullup_max: 9 });
    const res = Progress.applyStrength(mu, states, {
      templateId: 'mu_strength', exResults: { pullup: { bestReps: 10 } }, targetNodeIds: ['mu_pull10']
    }, Data.exercises);
    expect(Engine.isComplete(cmap(mu).mu_pull10, res.states)).toBe(true);
    expect(res.unlocked).toContain('mu_pull10');
    expect(res.bench.pullup_max).toBe(10);
  });

  test('strength: benchmarks only move by max (no noise PRs)', () => {
    const states = Store.seedStates(mu, { pullup_max: 12 });
    const res = Progress.applyStrength(mu, states, { templateId: 'mu_volume', exResults: { pullup: { bestReps: 5 } } }, Data.exercises);
    expect(res.states.mu_pull10.criteria.reps).toBe(12);
  });

  test('climbing: a send counts a distinct problem and a distinct style', () => {
    let bs = Store.seedStates(boulder, {});
    bs.b_v0 = { criteria: { sends: 5 } };
    const res = Progress.applyClimbing(boulder, bs, {
      templateId: 'b_consolidate', targetNodeIds: ['b_v1'], techniqueFocus: ['b_silentfeet'],
      problems: [{ grade: 'V1', style: 'slab', result: 'send' }, { grade: 'V1', style: 'overhang', result: 'flash' }]
    });
    expect(res.states.b_v1.criteria.sends).toBe(2);
    expect(res.states.b_v1.criteria.styles).toBe(2);
    expect(res.states.b_silentfeet.criteria.sessions).toBe(1);
  });

  test('climbing: reaching the crux advances a V5-project crux criterion', () => {
    let bs = Store.seedStates(boulder, {});
    const res = Progress.applyClimbing(boulder, bs, {
      templateId: 'b_project', targetNodeIds: ['b_v5proj'], problems: [{ grade: 'V5', style: 'overhang', result: 'crux' }]
    });
    expect(res.states.b_v5proj.criteria.crux).toBe(1);
  });
});

// ─────────────────────────── migration / storage guard ──────────────────────
test.describe('migration + storage guard', () => {
  test('deriveBench reads a legacy snapshot read-only and maps benchmarks', () => {
    const puc = {
      puc_log: [{ date: 'x', sessionType: 'strength', setType: 'work', reps: 11 }],
      puc_secondary: { skills: [{ id: 'dips', name: 'Dips', unit: 'reps', log: [{ value: 7 }] }, { id: 'rs', name: 'Ring Support', unit: 'seconds', log: [{ value: 20 }] }] }
    };
    const snapshot = JSON.stringify(puc);
    const bench = Store.deriveBench(puc);
    expect(bench.pullup_max).toBe(11);
    expect(bench.dips_max).toBe(7);
    expect(bench.ring_support_secs).toBe(20);
    expect(JSON.stringify(puc)).toBe(snapshot);
  });

  test('store refuses to write or delete any non-spc key', () => {
    const s = Store.makeStore(Store._memStore());
    expect(() => s.set('puc_log', [1])).toThrow(/spc_/);
    expect(() => s.del('puc_log')).toThrow(/spc_/);
    s.setProfile({ onboarded: true });
    expect(s.getProfile().onboarded).toBe(true);
  });
});

// ─────────────────────────── browser: UI + full loop ────────────────────────
async function seed(page, active = 'muscleup', bench = { pullup_max: 9, dips_max: 6 }) {
  await page.evaluate(({ active, bench }) => {
    const S = window.CoachStore.makeStore(), D = window.CoachData, E = window.CoachEngine;
    const state = {};
    D.worlds.forEach(w => {
      const nodes = window.CoachStore.seedStates(w, bench);
      const f = E.autoFocus(w, nodes);
      state[w.id] = { nodes, focus: { primary: f.primary, supporting: f.supporting, manual: false } };
    });
    S.setBench(bench); S.setState(state);
    S.setProfile({ onboarded: true, activeWorld: active, days: [0, 2, 4], duration: 'normal' });
  }, { active, bench });
  await page.reload();
}

test.describe('app UI', () => {
  test('boots into onboarding with English title and LTR, then reaches Today', async ({ page }) => {
    await page.goto('coach.html');
    await expect(page.locator('text=Skill Progression Coach')).toBeVisible();
    expect(await page.locator('html').getAttribute('dir')).toBe('ltr');
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    await page.locator('[data-world="muscleup"]').click();
    await page.locator('#q_pmax').fill('9');
    await page.locator('[data-next]').click();
    await page.locator('#days .pill').first().click();
    await page.locator('[data-next]').click();
    await expect(page.locator('.rec .name').first()).toBeVisible();
    await expect(page.locator('[data-start]').first()).toBeVisible();
  });

  test('Today screen shows recommendation first and readiness collapsed', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    // Recommendation card should be visible immediately
    await expect(page.locator('.rec .name').first()).toBeVisible();
    await expect(page.locator('[data-start]').first()).toBeVisible();
    // Readiness should be collapsed by default (energy/fatigue segments not visible)
    expect(await page.locator('.seg button[data-rk="energy"]').count()).toBe(0);
    // Expanding readiness should show the controls
    await page.locator('[data-toggle-readiness]').click();
    await expect(page.locator('.seg button[data-rk="energy"]').first()).toBeVisible();
  });

  test('Today shows calculated duration (not hardcoded)', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    const meta = await page.locator('.rec .meta').first().textContent();
    expect(meta).toMatch(/\d+ min/);
    expect(meta).not.toContain('—');
  });

  test('workout preview shows exercise structure before starting', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await expect(page.locator('.preview').first()).toBeVisible();
    const preview = await page.locator('.preview').first().textContent();
    // Should contain exercise names and set descriptions
    expect(preview).toMatch(/sets|rounds|Pyramid/i);
  });

  test('map: world rail sits OUTSIDE the blue canvas; both worlds switch the tree', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('#rail')).toBeVisible();
    expect(await page.locator('.canvas-wrap #rail').count()).toBe(0);
    await expect(page.locator('#rail .world-ic')).toHaveCount(2);
    await expect(page.locator('#rail .world-ic.active')).toHaveCount(1);
    const title1 = await page.locator('.map-title').textContent();
    await page.locator('#rail .world-ic:not(.active)').click();
    await expect(page.locator('.map-title')).not.toHaveText(title1);
  });

  test('map: node states are distinct (aria + classes) with English labels', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('.node.current')).toHaveCount(1);
    expect(await page.locator('.node.completed').count()).toBeGreaterThan(0);
    expect(await page.locator('.node.locked').count()).toBeGreaterThan(0);
    const locked = page.locator('.node.locked').first();
    const ariaLabel = await locked.getAttribute('aria-label');
    expect(ariaLabel).toContain('Locked');
  });

  test('map: center-on-focus button exists', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('[data-center]')).toBeVisible();
  });

  test('map: path summary shows completed count and focus name', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    const summary = await page.locator('.path-summary').first().textContent();
    expect(summary).toMatch(/\d+\/\d+ skills/);
    expect(summary).toContain('Focus');
  });

  test('node detail sheet: locked nodes explain prerequisites', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await page.locator('.node.locked').first().click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.locator('.sheet .needs')).toBeVisible();
    const needs = await page.locator('.sheet .needs').first().textContent();
    expect(needs).toContain('Locked');
    expect(needs).toContain('complete first');
  });

  test('node detail sheet opens and shows mastery criteria', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await page.locator('.node.current').click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.locator('.sheet .section', { hasText: 'Mastery Criteria' })).toBeVisible();
  });

  test('full loop — strength: finish a workout, unlock a node, persist across reload', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('puc_log', JSON.stringify([{ id: 1, date: 'x', sessionType: 'strength', setType: 'work', reps: 8 }]));
    });
    await page.goto('coach.html'); await seed(page);
    await page.locator('[data-start]').first().click();
    await expect(page.locator('.set').first()).toBeVisible();
    // Complete all sets: bump reps on first set for a 10-rep PR, then mark each done
    const sets = page.locator('.set');
    const count = await sets.count();
    for (let i = 0; i < count; i++) {
      const set = sets.nth(i);
      if (i === 0) {
        const plus = set.locator('[data-step="1"]');
        for (let j = 0; j < 9; j++) await plus.click();
      }
      await set.locator('[data-done]').click();
      // Dismiss adaptation prompt if shown
      if (await page.locator('.adapt-card').count()) {
        await page.locator('[data-diff="appropriate"]').click();
      }
      // Skip rest timer if shown
      const skipBtn = page.locator('[data-tskip]');
      if (await skipBtn.count()) await skipBtn.click();
    }
    // All sets done — Finish button should appear
    await page.locator('[data-finish]').click();
    // Should see unlock or completion text
    await expect(page.locator('text=/Unlocked|Nice Work/')).toBeVisible();
    if (await page.locator('.unlock [data-ok]').count()) await page.locator('.unlock [data-ok]').click();
    await page.locator('[data-map]').click();
    await expect(page.locator('.node.completed', { hasText: '10 Pull-Ups' })).toBeVisible();
    // Persists across reload
    await page.reload();
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('.node.completed', { hasText: '10 Pull-Ups' })).toBeVisible();
    // Legacy data untouched
    const puc = await page.evaluate(() => ({
      log: localStorage.getItem('puc_log'),
      extra: Object.keys(localStorage).filter(k => k.indexOf('puc_') === 0 && k !== 'puc_log')
    }));
    expect(JSON.parse(puc.log)[0].reps).toBe(8);
    expect(puc.extra).toEqual([]);
  });

  test('full loop — climbing: log problems and finish, updating grade progress', async ({ page }) => {
    await page.goto('coach.html'); await seed(page, 'boulder', {});
    await page.evaluate(() => {
      const S = window.CoachStore.makeStore(); const st = S.getState();
      const D = window.CoachData; const b = D.worldsById.boulder;
      st.boulder.nodes.b_v0 = { criteria: {} };
      b.nodes.find(n => n.id === 'b_v0').criteria.forEach(c => (st.boulder.nodes.b_v0.criteria[c.id] = c.target));
      st.boulder.focus = { primary: 'b_v1', supporting: 'b_silentfeet', manual: true };
      S.setState(st);
    });
    await page.reload();
    await page.locator('[data-start]').first().click();
    await expect(page.locator('[data-grades]')).toBeVisible();
    await page.locator('[data-grades] .pill', { hasText: 'V1' }).click();
    await page.locator('[data-styles] .pill').first().click();
    await page.locator('[data-results] .pill', { hasText: 'Send' }).click();
    await page.locator('[data-add]').click();
    await expect(page.locator('.prob')).toHaveCount(1);
    await page.locator('[data-finish]').click();
    await expect(page.locator('text=/Nice Work|Unlocked/')).toBeVisible();
    if (await page.locator('.unlock [data-ok]').count()) await page.locator('.unlock [data-ok]').click();
    await page.locator('[data-today]').click();
    await page.locator('.nav [data-s="progress"]').click();
    await expect(page.getByText('Skills Completed')).toBeVisible();
    await expect(page.locator('.chart .bar')).toHaveCount(1);
  });

  test('workout state persists across page refresh', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('[data-start]').first().click();
    await expect(page.locator('.set').first()).toBeVisible();
    // Store some reps
    const plus = page.locator('.set').first().locator('[data-step="1"]');
    await plus.click(); await plus.click();
    const numBefore = await page.locator('.set').first().locator('.num').textContent();
    // Reload — workout should restore
    await page.reload();
    await expect(page.locator('.set').first()).toBeVisible();
    const numAfter = await page.locator('.set').first().locator('.num').textContent();
    expect(numAfter).toBe(numBefore);
  });

  test('no service worker is registered by the coach app', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    const regs = await page.evaluate(async () => ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
    expect(regs).toBe(0);
  });
});
