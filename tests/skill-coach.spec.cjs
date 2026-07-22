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

// ─────────────────────────── ladder model ─────────────────────────────────────
// The pull-up ladder is 1-2-3 × 5 COMPLETE rounds: 5 rounds, 15 steps, 30 reps,
// with a short rest between steps and a longer rest between rounds.
test.describe('ladder model', () => {
  const ladderBlock = Data.templates.mu_strength.blocks[0];

  test('1-2-3 × 5 expands to 5 rounds and 15 steps', () => {
    const sets = Duration.genSets(ladderBlock);
    expect(sets.length).toBe(15);
    const rounds = new Set(sets.map(s => s.round));
    expect([...rounds].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // Each round is the sequence 1-2-3.
    for (let r = 1; r <= 5; r++) {
      expect(sets.filter(s => s.round === r).map(s => s.target)).toEqual([1, 2, 3]);
    }
  });

  test('total reps across the ladder equal 30', () => {
    const sets = Duration.genSets(ladderBlock);
    expect(sets.reduce((a, s) => a + s.target, 0)).toBe(30);
  });

  test('exactly 10 short rests, each 25 seconds', () => {
    const shorts = Duration.restsBetween(Data.templates.mu_strength).filter(r => r.kind === 'short');
    expect(shorts.length).toBe(10);
    shorts.forEach(r => expect(r.sec).toBe(25));
  });

  test('exactly 4 long (inter-round) rests, each 150 seconds', () => {
    const longs = Duration.restsBetween(Data.templates.mu_strength).filter(r => r.kind === 'long');
    expect(longs.length).toBe(4);
    longs.forEach(r => expect(r.sec).toBe(150));
  });

  test('last step of the ladder carries no trailing round rest', () => {
    const sets = Duration.genSets(ladderBlock);
    const last = sets[sets.length - 1];
    expect(last.round).toBe(5);
    expect(last.step).toBe(3);
    expect(last.lastInRound).toBe(true);
    // restsBetween excludes a rest after the final set of the block.
    const longs = Duration.restsBetween(Data.templates.mu_strength).filter(r => r.kind === 'long');
    expect(longs.length).toBe(4); // rounds 1-4, not 5
  });
});

// ─────────────────────────── calcDuration (range, from correct model) ─────────
test.describe('calcDurationRange', () => {
  test('ladder + 3×8 sets: about 21–22 min from the correct structure', () => {
    const r = Duration.calcDurationRange(Data.templates.mu_strength);
    // Ladder: 30 reps × (2–3 s) = 60–90 s exec; rests 10×25 + 4×150 = 850 s → 910–940 s.
    // Transition 60 s. Scapular 3×8 = 24 reps × (2–3 s) = 48–72 s exec; rests 2×120 = 240 s.
    // min = 60+850+60+48+240 = 1258 → 21 min; max = 90+850+60+72+240 = 1312 → 22 min.
    expect(r.minSec).toBe(1258);
    expect(r.maxSec).toBe(1312);
    expect(r.minMin).toBe(21);
    expect(r.maxMin).toBe(22);
  });

  test('pyramid (1-2-3-2-1): about 8 min', () => {
    const r = Duration.calcDurationRange(Data.templates.mu_volume);
    // 9 reps × (2–3 s) = 18–27 s exec; 4 straight rests × 120 = 480 s.
    expect(r.minSec).toBe(498);
    expect(r.maxSec).toBe(507);
    expect(r.maxMin).toBe(8);
  });

  test('hold + reps blocks (support + dips): about 15 min', () => {
    const r = Duration.calcDurationRange(Data.templates.mu_dip);
    // Holds 4×15 = 60 s exec; 3×120 rest. Transition 60. Dips 4×6 = 24 reps × (2–3 s); 3×120 rest.
    // min = 60+360+60+48+360 = 888 → 15; max = 60+360+60+72+360 = 912 → 15.
    expect(r.minMin).toBe(15);
    expect(r.maxMin).toBe(15);
  });

  test('AMRAP single set: about 1 min', () => {
    const r = Duration.calcDurationRange(Data.templates.mu_test);
    expect(r.minSec).toBe(60);
    expect(r.maxMin).toBe(1);
  });

  test('climbing template (no blocks) returns null', () => {
    expect(Duration.calcDurationRange(Data.templates.b_consolidate)).toBeNull();
    expect(Duration.calcDuration(Data.templates.b_consolidate)).toBeNull();
  });

  test('no phantom warm-up is added — only declared blocks count', () => {
    // A single 1×10 block: 10 reps exec only, no rests, no warm-up.
    const t = { type: 'strength', blocks: [{ scheme: 'sets', sets: 1, reps: 10 }] };
    const r = Duration.calcDurationRange(t);
    expect(r.minSec).toBe(20); // 10 × 2
    expect(r.maxSec).toBe(30); // 10 × 3
  });
});

// ─────────────────────────── genSets ──────────────────────────────────────────
test.describe('genSets', () => {
  test('ladder uses explicit steps × rounds and tags round/step metadata', () => {
    const sets = Duration.genSets({ scheme: 'ladder', steps: [1, 2, 3], rounds: 5 });
    expect(sets.length).toBe(15);
    expect(sets[0]).toMatchObject({ round: 1, step: 1, target: 1, firstInRound: true, lastInRound: false });
    expect(sets[2]).toMatchObject({ round: 1, step: 3, target: 3, lastInRound: true });
    expect(sets[3]).toMatchObject({ round: 2, step: 1, target: 1, firstInRound: true });
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

// ─────────────────────────── round-level (ladder) adaptation ──────────────────
test.describe('ladder round adaptation', () => {
  test('right keeps the round 1-2-3 and the inter-round rest', () => {
    const r = Adapt.adaptNextRound('appropriate', [1, 2, 3], null);
    expect(r.steps).toEqual([1, 2, 3]);
    expect(r.roundRestDelta).toBe(0);
    expect(r.reduced).toBe(false);
  });

  test('hard keeps 1-2-3 but increases the inter-round rest', () => {
    const r = Adapt.adaptNextRound('hard', [1, 2, 3], null);
    expect(r.steps).toEqual([1, 2, 3]);
    expect(r.roundRestDelta).toBe(30);
    // 2:30 default + 30 = 3:00, applied via applyRestDelta.
    expect(Adapt.applyRestDelta(150, r.roundRestDelta)).toBe(180);
  });

  test('failed on the final step reduces the next round to 1-2', () => {
    const r = Adapt.adaptNextRound('failed', [1, 2, 3], 3);
    expect(r.steps).toEqual([1, 2]);
    expect(r.reduced).toBe(true);
    expect(r.roundRestDelta).toBe(30);
  });

  test('failed earlier reduces the next round further (no forced maximal)', () => {
    const r = Adapt.adaptNextRound('failed', [1, 2, 3], 2);
    expect(r.steps).toEqual([1]);
    expect(r.reduced).toBe(true);
  });

  test('easy adds a rep to the top of the next round and shortens rest', () => {
    const r = Adapt.adaptNextRound('easy', [1, 2, 3], null);
    expect(r.steps).toEqual([1, 2, 4]);
    expect(r.roundRestDelta).toBe(-15);
  });

  test('a reduced round never drops below one step', () => {
    const r = Adapt.adaptNextRound('failed', [1], 1);
    expect(r.steps).toEqual([1]);
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

  test('workout preview shows the ladder as complete rounds before starting', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await expect(page.locator('.preview').first()).toBeVisible();
    const preview = await page.locator('.preview').first().textContent();
    // Ladder is described as N complete rounds, with distinct step/round rests.
    expect(preview).toMatch(/1–2–3\s*×\s*5\s*rounds/);
    expect(preview).toContain('between steps');
    expect(preview).toContain('between rounds');
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

  // Drive the current-action-first runner to completion. Optionally bump the
  // very first visible step up to `firstStepReps` (simulating a rep PR on a rung).
  async function completeStrengthRunner(page, firstStepReps) {
    if (firstStepReps) {
      const plus = page.locator('.cur-card [data-step="1"]').first();
      const cur = await page.locator('.cur-card .num').first().textContent();
      for (let j = +cur; j < firstStepReps; j++) await plus.click();
    }
    let guard = 0;
    while ((await page.locator('.cur-card [data-done]').count()) > 0 && guard++ < 120) {
      await page.locator('.cur-card [data-done]').first().click();
      if (await page.locator('.adapt-card [data-diff]').count()) {
        await page.locator('[data-diff="appropriate"]').click();
      }
      const skip = page.locator('[data-tskip]');
      if (await skip.count()) await skip.click();
    }
  }

  test('full loop — strength: finish a workout, unlock a node, persist across reload', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('puc_log', JSON.stringify([{ id: 1, date: 'x', sessionType: 'strength', setType: 'work', reps: 8 }]));
    });
    await page.goto('coach.html'); await seed(page);
    await page.locator('[data-start]').first().click();
    await expect(page.locator('.cur-card').first()).toBeVisible();
    // Log a 10-rep pull-up on the first rung for a PR, then finish everything.
    await completeStrengthRunner(page, 10);
    // All work done — Finish button should appear
    await page.locator('[data-finish]').click();
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

  test('ladder: difficulty is asked only after the last step of a round', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('[data-start]').first().click();
    await expect(page.locator('.cur-card')).toBeVisible();
    await expect(page.locator('.cur-meta').first()).toHaveText(/Round 1 of 5 · Step 1 of 3/);
    // Step 1 done → short rest, NO difficulty prompt.
    await page.locator('.cur-card [data-done]').click();
    expect(await page.locator('.adapt-card [data-diff]').count()).toBe(0);
    await expect(page.locator('#rest .timer')).toBeVisible();
    await page.locator('[data-tskip]').click();
    // Step 2 done → still no prompt.
    await page.locator('.cur-card [data-done]').click();
    expect(await page.locator('.adapt-card [data-diff]').count()).toBe(0);
    await page.locator('[data-tskip]').click();
    // Step 3 (last of round) done → prompt appears, rest NOT started until rated.
    await page.locator('.cur-card [data-done]').click();
    await expect(page.locator('.adapt-card')).toContainText('How did that round feel?');
    expect(await page.locator('#rest .timer').count()).toBe(0);
    // Rating Hard starts the (longer) inter-round rest and advances to round 2.
    await page.locator('[data-diff="hard"]').click();
    await expect(page.locator('#rest .timer')).toBeVisible();
    await expect(page.locator('.cur-meta').first()).toHaveText(/Round 2 of 5 · Step 1 of 3/);
  });

  test('ladder: a failed round reduces the next round, and the user can override', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('[data-start]').first().click();
    // Round 1: do step 1 and 2, then fail the top step by logging fewer reps.
    await page.locator('.cur-card [data-done]').click(); await page.locator('[data-tskip]').click();
    await page.locator('.cur-card [data-done]').click(); await page.locator('[data-tskip]').click();
    // Step 3 target is 3; drop actual to 1 (a failure at the top), mark done, rate Failed.
    await page.locator('.cur-card [data-step="-1"]').click();
    await page.locator('.cur-card [data-step="-1"]').click();
    await page.locator('.cur-card [data-done]').click();
    await page.locator('[data-diff="failed"]').click();
    // Round 2 should now be reduced to 1–2 and an override control is offered.
    const chip = page.locator('.round-chip').nth(1);
    await expect(chip).toContainText('1–2');
    await expect(page.locator('[data-keepfull]')).toBeVisible();
    await page.locator('[data-keepfull]').click();
    // Override restores the full 1–2–3 round.
    await expect(page.locator('.round-chip').nth(1)).toContainText('1–2–3');
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

  test('refresh preserves the current round, step, and logged reps', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    await page.locator('[data-start]').first().click();
    await expect(page.locator('.cur-card')).toBeVisible();
    // Advance into round 2 (complete all three steps of round 1).
    await page.locator('.cur-card [data-done]').click(); await page.locator('[data-tskip]').click();
    await page.locator('.cur-card [data-done]').click(); await page.locator('[data-tskip]').click();
    await page.locator('.cur-card [data-done]').click();
    await page.locator('[data-diff="appropriate"]').click();
    if (await page.locator('[data-tskip]').count()) await page.locator('[data-tskip]').click();
    await expect(page.locator('.cur-meta').first()).toHaveText(/Round 2 of 5 · Step 1 of 3/);
    // Log some reps on the current step, then reload.
    const plus = page.locator('.cur-card [data-step="1"]').first();
    await plus.click(); await plus.click();
    const numBefore = await page.locator('.cur-card .num').first().textContent();
    await page.reload();
    await expect(page.locator('.cur-card')).toBeVisible();
    // Same round/step and same logged reps survive the refresh.
    await expect(page.locator('.cur-meta').first()).toHaveText(/Round 2 of 5 · Step 1 of 3/);
    expect(await page.locator('.cur-card .num').first().textContent()).toBe(numBefore);
  });

  test('Today, Map, and Node Detail consume one canonical state (same focus for pmax=9)', async ({ page }) => {
    await page.goto('coach.html'); await seed(page, 'muscleup', { pullup_max: 9, dips_max: 6 });
    // Today
    const today = await page.locator('.path-summary').first().textContent();
    expect(today).toMatch(/\d+\/16 skills/);
    expect(today).toContain('10 Pull-Ups');
    expect(today).toContain('9/10');
    const todayCount = today.match(/(\d+)\/16 skills/)[1];
    // Map — same completed count and same focus node
    await page.locator('.nav [data-s="map"]').click();
    const map = await page.locator('.path-summary').first().textContent();
    expect(map).toContain(`${todayCount}/16 skills`);
    expect(map).toContain('10 Pull-Ups');
    await expect(page.locator('.node.current .nm')).toHaveText('10 Pull-Ups');
    // Node Detail for the current focus — same 9/10 progress
    await page.locator('.node.current').click();
    await expect(page.locator('.sheet h2')).toHaveText('10 Pull-Ups');
    await expect(page.locator('.sheet')).toContainText('9/10');
  });

  test('map reflects stored benchmarks even when node state was never seeded', async ({ page }) => {
    // Only benchmarks + an onboarded profile exist — no spc_c_state written.
    await page.goto('coach.html');
    await page.evaluate(() => {
      const S = window.CoachStore.makeStore();
      S.setBench({ pullup_max: 9, dips_max: 6 });
      S.setProfile({ onboarded: true, activeWorld: 'muscleup', days: [1, 3, 5], duration: 'normal' });
    });
    await page.reload();
    // Today derives progress from the benchmark fixture...
    await expect(page.locator('.path-summary').first()).toContainText('10 Pull-Ups');
    // ...and the Map derives the SAME focus (not a zeroed "Active Dead Hang").
    await page.locator('.nav [data-s="map"]').click();
    await expect(page.locator('.node.current .nm')).toHaveText('10 Pull-Ups');
    await expect(page.locator('.path-summary').first()).not.toContainText('0/16');
  });

  test('canonical view does not overwrite onboarded/migrated progress', async ({ page }) => {
    await page.goto('coach.html'); await seed(page, 'muscleup', { pullup_max: 9, dips_max: 6 });
    // Manually complete a node that benchmarks alone can NOT derive (Chest-to-Bar
    // has no seeding benchmark) — as onboarding "Yes, Chest-to-Bar" would.
    await page.evaluate(() => {
      const S = window.CoachStore.makeStore(), st = S.getState(), D = window.CoachData;
      const c2b = D.worldsById.muscleup.nodes.find(n => n.id === 'mu_c2b');
      st.muscleup.nodes.mu_c2b = { criteria: {} };
      c2b.criteria.forEach(cr => (st.muscleup.nodes.mu_c2b.criteria[cr.id] = cr.target));
      S.setState(st);
    });
    await page.reload();
    // Navigate through screens that all call the canonical worldView().
    await page.locator('.nav [data-s="map"]').click();
    await page.locator('.nav [data-s="today"]').click();
    await page.locator('.nav [data-s="map"]').click();
    // The manually-completed node is still completed — not wiped by lazy seeding.
    await expect(page.locator('.node.completed', { hasText: 'Chest-to-Bar' })).toBeVisible();
  });

  test('no service worker is registered by the coach app', async ({ page }) => {
    await page.goto('coach.html'); await seed(page);
    const regs = await page.evaluate(async () => ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
    expect(regs).toBe(0);
  });
});
