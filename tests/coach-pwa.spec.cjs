// Skill Progression Coach — PWA packaging: a separate installable app under
// /pullup-coach/coach/ that coexists with the original Pull-Up Coach and never
// controls it. HTTP/asset checks use the `request` fixture; SW/cache checks use
// a real page (127.0.0.1 is a secure context, so service workers register).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const COACH = path.join(__dirname, '..', 'coach');
const ROOT = path.join(__dirname, '..');

test.describe('coach PWA packaging', () => {
  test('/coach/ serves the Skill Progression Coach app', async ({ page }) => {
    await page.goto('coach/');
    await expect(page).toHaveTitle('Skill Progression Coach');
    await expect(page.locator('text=Skill Progression Coach').first()).toBeVisible();
  });

  test('/coach.html still resolves and redirects to /coach/', async ({ page }) => {
    await page.goto('coach.html');
    await page.waitForURL(/\/pullup-coach\/coach\/$/);
    expect(page.url()).toMatch(/\/pullup-coach\/coach\/$/);
    await expect(page.locator('text=Skill Progression Coach').first()).toBeVisible();
  });

  test('manifest has a unique id and ./-scoped start_url/scope with the right name', async ({ request }) => {
    const res = await request.get('coach/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.id).toBe('skill-progression-coach');
    expect(m.name).toBe('Skill Progression Coach');
    expect(m.short_name).toBe('Skill Coach');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toMatch(/^#/);
  });

  test('coach manifest identity is separate from the original Pull-Up Coach manifest', async ({ request }) => {
    const coach = await (await request.get('coach/manifest.webmanifest')).json();
    const orig = await (await request.get('manifest.json')).json();
    expect(coach.name).not.toBe(orig.name);
    expect(coach.short_name).not.toBe(orig.short_name);
    expect(coach.id).not.toBe(orig.id || orig.start_url);
    expect(coach.theme_color).not.toBe(orig.theme_color);
  });

  test('all coach icon assets exist (192, 512, maskable, apple-touch, svg)', async ({ request }) => {
    for (const f of ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png']) {
      const res = await request.get('coach/' + f);
      expect(res.ok(), f).toBeTruthy();
    }
    // The manifest advertises a maskable icon.
    const m = await (await request.get('coach/manifest.webmanifest')).json();
    expect(m.icons.some(i => (i.purpose || '').includes('maskable'))).toBeTruthy();
  });

  test('the green coach icon is different from the original blue icon', () => {
    const coach = fs.readFileSync(path.join(COACH, 'icon.svg'), 'utf8');
    const orig = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');
    expect(coach).not.toBe(orig);
    expect(coach).toMatch(/12b76a|0e9f6e/i); // coach is green
    expect(coach).not.toMatch(/6c63ff/i);    // and not the original blue
    expect(orig).toMatch(/6c63ff/i);         // original stays blue
  });

  test('coach module and asset relative paths resolve under /coach/', async ({ request }) => {
    for (const f of ['app.js', 'data.js', 'engine.js', 'settings.js', 'store.js', 'sw.js', 'manifest.webmanifest']) {
      const res = await request.get('coach/' + f);
      expect(res.ok(), f).toBeTruthy();
    }
    // index.html references its modules as siblings (no /coach/ prefix, no root paths).
    const html = await (await request.get('coach/')).text();
    expect(html).toMatch(/src="app\.js/);
    expect(html).not.toMatch(/src="coach\/app\.js/);
    expect(html).not.toMatch(/src="\/coach\//); // no absolute root paths that break on Pages
  });

  test('the original Pull-Up Coach still serves with its own identity', async ({ request }) => {
    const idx = await request.get('index.html');
    expect(idx.ok()).toBeTruthy();
    const m = await (await request.get('manifest.json')).json();
    expect(m.name).toBe('Pull-Up Coach');
    expect(m.theme_color).toBe('#6c63ff');
    // Original service worker + icon untouched.
    expect((await request.get('sw.js')).ok()).toBeTruthy();
    expect((await request.get('icon.svg')).ok()).toBeTruthy();
  });

  test('coach service worker registers with the /coach/ scope', async ({ page }) => {
    await page.goto('coach/');
    const reg = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const r = await navigator.serviceWorker.getRegistration();
      return r ? { scope: r.scope } : null;
    });
    expect(reg).not.toBeNull();
    expect(reg.scope).toMatch(/\/pullup-coach\/coach\/$/);
  });

  test('coach cache namespace is private and activation deletes only coach caches', () => {
    const sw = fs.readFileSync(path.join(COACH, 'sw.js'), 'utf8');
    const origSw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    expect(sw).toMatch(/skill-coach-v\d+/);              // versioned private namespace
    expect(sw).not.toMatch(/['"]pullup-coach-v\d+['"]/); // never opens/deletes the original cache
    expect(origSw).toMatch(/pullup-coach-v\d+/);         // original uses its own namespace
    // Activation filters to skill-coach- caches only.
    expect(sw).toMatch(/indexOf\('skill-coach-'\)\s*===\s*0/);
  });

  test('coach SW coexists with an existing original cache (does not remove it)', async ({ page }) => {
    await page.goto('coach/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    const keys = await page.evaluate(async () => {
      await window.caches.open('pullup-coach-v4'); // simulate the original app's cache
      return await window.caches.keys();
    });
    expect(keys).toContain('pullup-coach-v4');                         // original cache intact
    expect(keys.some(k => k.indexOf('skill-coach-') === 0)).toBeTruthy(); // coach cache present too
  });

  test('offline shell: the app opens from cache after a first online load', async ({ page, context }) => {
    await page.goto('coach/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForTimeout(600); // let the shell finish caching
    await context.setOffline(true);
    await page.goto('coach/');
    await expect(page.locator('text=Skill Progression Coach').first()).toBeVisible();
    await context.setOffline(false);
  });
});
