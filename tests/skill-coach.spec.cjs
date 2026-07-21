// Skill Progression Coach (coach.html + coach/*.js) — domain engine, migration,
// storage guard, and the end-to-end vertical slice (onboarding → map → today →
// workout → progress). Additive: never asserts against puc_* being writable.
const { test, expect } = require('@playwright/test');

const Data = require('../coach/data.js');
const Engine = require('../coach/engine.js');
const Store = require('../coach/store.js');
const Progress = require('../coach/progress.js');

const mu = Data.worldsById.muscleup;
const boulder = Data.worldsById.boulder;
const cmap = w => { const c = {}; w.nodes.forEach(n => (c[n.id] = n)); return c; };

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
    expect(Engine.isComplete(c.mu_hollow, states)).toBe(false); // support incomplete
    expect(Engine.prereqMet(c.mu_firstmu, states, c)).toBe(true); // still unlockable
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
    expect(hard.reasons.join(' ')).toContain('טיפוס');
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
    expect(res.states.mu_pull10.criteria.reps).toBe(12); // stays at 12, not lowered to 5
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
    expect(JSON.stringify(puc)).toBe(snapshot); // input not mutated
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
  test('boots into onboarding, then reaches Today with a real recommendation', async ({ page }) => {
    await page.goto('coach.html');
    await expect(page.locator('text=מאמן התקדמות סקילים')).toBeVisible();
    await page.locator('[data-world="muscleup"]').click();
    await page.locator('#q_pmax').fill('9');
    await page.locator('[data-next]').click();
    await page.locator('#days .pill').first().click();
    await page.locator('[data-next]').click();
    await expect(page.locator('.rec .name').first()).toBeVisible();
    await expect(page.locator('[data-start]').first()).toBeVisible();
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  });

  test('map: world rail sits OUTSIDE the blue canvas; both worlds switch the tree', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('#rail')).toBeVisible();
    expect(await page.locator('.canvas-wrap #rail').count()).toBe(0); // rail not inside the canvas
    await expect(page.locator('#rail .world-ic')).toHaveCount(2);
    await expect(page.locator('#rail .world-ic.active')).toHaveCount(1);
    const title1 = await page.locator('.map-title').textContent();
    await page.locator('#rail .world-ic:not(.active)').click();
    await expect(page.locator('.map-title')).not.toHaveText(title1);
  });

  test('map: node states are distinct and not color-only (aria + classes)', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('.node.current')).toHaveCount(1);
    expect(await page.locator('.node.completed').count()).toBeGreaterThan(0);
    expect(await page.locator('.node.locked').count()).toBeGreaterThan(0);
    const locked = page.locator('.node.locked').first();
    expect(await locked.getAttribute('aria-label')).toContain('נעול');
  });

  test('node detail sheet opens and shows mastery criteria', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('.nav [data-s="map"]').click();
    await page.locator('.node.current').click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.locator('.sheet .section', { hasText: 'קריטריוני שליטה' })).toBeVisible();
  });

  test('full loop — strength: finish a workout, unlock a node, persist across reload', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('puc_log', JSON.stringify([{ id: 1, date: 'x', sessionType: 'strength', setType: 'work', reps: 8 }]));
    });
    await page.goto('coach.html'); await seed(page); // focus = mu_pull10 (9/10)
    await page.locator('[data-start]').first().click();
    await expect(page.locator('.set').first()).toBeVisible();
    const plus = page.locator('.set').first().locator('[data-step="1"]');
    for (let i = 0; i < 9; i++) await plus.click();
    await page.locator('[data-finish]').click();
    await expect(page.locator('text=/נפתח|כל הכבוד/')).toBeVisible();
    if (await page.locator('.unlock [data-ok]').count()) await page.locator('.unlock [data-ok]').click();
    await page.locator('[data-map]').click();
    await expect(page.locator('.node.completed', { hasText: '10 מתחים' })).toBeVisible();
    await page.reload();
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('.node.completed', { hasText: '10 מתחים' })).toBeVisible();
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
    await page.locator('[data-results] .pill', { hasText: 'שליחה' }).click();
    await page.locator('[data-add]').click();
    await expect(page.locator('.prob')).toHaveCount(1);
    await page.locator('[data-finish]').click();
    await expect(page.locator('text=/כל הכבוד|נפתח/')).toBeVisible();
    if (await page.locator('.unlock [data-ok]').count()) await page.locator('.unlock [data-ok]').click();
    await page.locator('[data-today]').click();
    await page.locator('.nav [data-s="progress"]').click();
    await expect(page.getByText('סקילים הושלמו')).toBeVisible();
    // a boulder send is reflected in the by-grade chart
    await expect(page.locator('.chart .bar')).toHaveCount(1);
  });

  test('no service worker is registered by the coach app', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    const regs = await page.evaluate(async () => ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
    expect(regs).toBe(0);
  });
});
