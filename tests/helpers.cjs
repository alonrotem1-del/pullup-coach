// Shared setup: block external CDN requests (deterministic, offline-safe),
// load the real app, start from empty storage.
async function openApp(page) {
  await page.route('**://cdn.jsdelivr.net/**', r => r.abort());
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
}

module.exports = { openApp };
