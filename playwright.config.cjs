const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8791',
    // In environments with a pre-provisioned Chromium (PW_CHROMIUM_PATH),
    // use it instead of downloading a matching browser build.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'node tests/serve.cjs',
    url: 'http://127.0.0.1:8791/index.html',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
