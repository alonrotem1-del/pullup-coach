// Screenshot capture for the Preview (Home, both maps, both check-ins).
// Serves under /pullup-coach/ (production depth) and drives the real app.
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

function seed() {
  // Build a realistic week: today = strength (Pyramid anchor due), with a
  // Ladder + Climbing already done earlier this week, and max-test history.
  const now = new Date();
  const iso = d => d.toISOString();
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const at = (offsetDays, h) => { const d = new Date(weekStart); d.setDate(d.getDate() + offsetDays); d.setHours(h, 0, 0, 0); return iso(d); };
  const today = now.getDay();
  const plan = { 0: 'bouldering', 1: 'volume', 2: 'light', 3: 'strength', 4: 'light', 5: 'rest', 6: 'max_test' };
  plan[today] = 'strength';
  const log = [
    // status history (older): three max tests 8,8,9
    { id: 1, date: '2026-05-02T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 8 },
    { id: 2, date: '2026-05-16T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 8 },
    { id: 3, date: '2026-06-20T09:00:00.000Z', sessionType: 'max_test', setType: 'max', reps: 9 },
    // this week: a climbing day (Sunday) and a ladder session (Monday)
    { id: 10, date: at(0, 10), sessionType: 'bouldering', setType: 'session', reps: 0 },
    { id: 11, date: at(1, 18), sessionType: 'volume', setType: 'working', setNumber: 1, reps: 3 },
    { id: 12, date: at(1, 18), sessionType: 'volume', setType: 'working', setNumber: 2, reps: 2 },
  ];
  return {
    puc_log: log,
    puc_plan: plan,
    puc_settings: { maxReps: 9 },
    puc_progression: { strength: { level: 1, easySessions: 0 }, volume: { ladderLevel: 0, rounds: 3, easySessions: 0 } },
    puc_secondary: { skills: [
      { id: 'ring-support', name: 'Ring Support Hold', unit: 'seconds', icon: '◎', frequency: 2, log: [{ date: at(1, 19), value: 30 }] },
      { id: 'dips', name: 'Dips', unit: 'reps', icon: '⬇️', frequency: 1, log: [{ date: '2026-06-01T10:00:00.000Z', value: 6 }] },
    ]},
  };
}

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'tests', 'serve.cjs')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const base = 'http://127.0.0.1:8791/pullup-coach/';

  await page.goto(base + 'v2.html');
  await page.evaluate((data) => { localStorage.clear(); Object.keys(data).forEach(k => localStorage.setItem(k, JSON.stringify(data[k]))); }, seed());
  await page.reload();

  // Migration → review → home
  await page.click('#btn-migrate');
  await page.click('#btn-confirm');
  await page.click('#btn-review-summary');
  await page.click('#btn-confirm-review');
  await page.waitForSelector('.today-card');
  await page.screenshot({ path: path.join(OUT, '1-home.png'), fullPage: true });

  // Map — default goal (V5), then swap to Muscle-Up
  await page.click('#btn-map');
  await page.waitForSelector('.zone-h');
  const title = await page.locator('.brand').first().innerText();
  const firstIsV5 = /V5/.test(title);
  await page.screenshot({ path: path.join(OUT, firstIsV5 ? '2-map-v5.png' : '3-map-mu.png'), fullPage: true });
  await page.click('#btn-swap');
  await page.waitForSelector('.zone-h');
  await page.screenshot({ path: path.join(OUT, firstIsV5 ? '3-map-mu.png' : '2-map-v5.png'), fullPage: true });

  // Climbing check-in
  await page.goto(base + 'v2.html'); await page.waitForSelector('.today-card');
  await page.click('#qa-climb');
  await page.waitForSelector('#save-climb');
  await page.click('#lim-opts .opt[data-v="finger/grip"]');
  await page.screenshot({ path: path.join(OUT, '4-checkin-climbing.png'), fullPage: true });

  // Gym / group check-in
  await page.goto(base + 'v2.html'); await page.waitForSelector('.today-card');
  await page.click('#qa-gym');
  await page.waitForSelector('#gt-opts');
  await page.click('#gt-opts .opt[data-v="push"]');
  await page.screenshot({ path: path.join(OUT, '5-checkin-gym.png'), fullPage: true });

  await browser.close();
  server.kill();
  console.log('screenshots written to', OUT);
})();
