// Automated data-inventory scan (Data Preservation Contract §C3.1):
// asserts the app touches exactly the six documented puc_* keys and no
// other browser storage mechanism.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DOCUMENTED_KEYS = [
  'puc_log', 'puc_plan', 'puc_settings', 'puc_session', 'puc_progression', 'puc_secondary',
];

test.describe('storage inventory scan', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

  test('all puc_* literals in the app are exactly the six documented keys', () => {
    const found = new Set(indexSrc.match(/puc_[a-z]+/g));
    expect([...found].sort()).toEqual([...DOCUMENTED_KEYS].sort());
  });

  test('no other persistent-storage APIs are used', () => {
    for (const src of [indexSrc, swSrc]) {
      expect(src).not.toContain('indexedDB');
      expect(src).not.toContain('document.cookie');
      expect(src).not.toContain('sessionStorage');
    }
    // the service worker must not touch localStorage at all
    expect(swSrc).not.toContain('localStorage');
  });
});
