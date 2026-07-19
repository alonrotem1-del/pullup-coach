// Verifies the Preview installs as a SEPARATE PWA from Pull-Up Coach with no
// manifest / scope / service-worker / installability conflict, and that the
// original app's PWA files are untouched.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const readJSON = f => JSON.parse(read(f));

test('Preview manifest is a distinct, valid PWA manifest', () => {
  const m = readJSON('manifest.v2.json');
  expect(m.name).toBe('Skill Progression Coach (Preview)');
  expect(m.start_url).toBe('v2.html');           // always opens v2.html
  expect(m.display).toBe('standalone');
  expect(m.icons[0].src).toBe('icon-v2.svg');    // its own icon
  expect(m.id).toBeTruthy();                     // explicit identity
  expect(m.scope).toBeTruthy();
  expect(fs.existsSync(path.join(root, 'icon-v2.svg'))).toBe(true);
});

test('the two manifests do not collide (distinct name / id / start_url / icon)', () => {
  const main = readJSON('manifest.json');
  const v2 = readJSON('manifest.v2.json');
  // Original app identity (id defaults to its start_url) must differ from the Preview's.
  const mainId = main.id || main.start_url;
  expect(v2.id).not.toBe(mainId);
  expect(v2.name).not.toBe(main.name);
  expect(v2.start_url).not.toBe(main.start_url);
  expect(v2.icons[0].src).not.toBe(main.icons[0].src);
});

test('original Pull-Up Coach PWA files are unchanged', () => {
  const main = readJSON('manifest.json');
  expect(main.name).toBe('Pull-Up Coach');
  expect(main.start_url).toBe('./index.html');
  expect(main.icons[0].src).toBe('./icon.svg');
  // index.html still points at the ORIGINAL manifest/icon, not the Preview's.
  const index = read('index.html');
  expect(index).toContain('href="manifest.json"');
  expect(index).not.toContain('manifest.v2.json');
  expect(index).not.toContain('icon-v2.svg');
  // The original service worker still exists and still precaches the original manifest.
  const sw = read('sw.js');
  expect(sw).toContain("'./manifest.json'");
  expect(sw).not.toContain('manifest.v2.json');
});

test('v2.html declares its own PWA identity and registers NO service worker', () => {
  const v2 = read('v2.html');
  expect(v2).toContain('href="manifest.v2.json"');   // own manifest
  expect(v2).toContain('href="icon-v2.svg"');         // own apple-touch-icon
  expect(v2).toContain('apple-mobile-web-app-title" content="Skill Coach"');
  expect(v2).not.toContain('manifest.json"');          // not the original manifest
  // Hard invariant preserved: the Preview never registers/replaces a service worker.
  expect(v2 + read('v2/app.js')).not.toContain('serviceWorker.register');
});

test('served page links the Preview manifest which fetches and parses with the distinct name', async ({ page }) => {
  await page.goto('v2.html');
  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBe('manifest.v2.json');
  const m = await page.evaluate(async (h) => {
    const r = await fetch(h); return r.ok ? r.json() : null;
  }, href);
  expect(m).not.toBeNull();
  expect(m.name).toBe('Skill Progression Coach (Preview)');
  expect(m.start_url).toBe('v2.html');
  // No service worker controls/gets registered by the Preview page.
  const regs = await page.evaluate(async () => ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).length : 0);
  expect(regs).toBe(0);
});
