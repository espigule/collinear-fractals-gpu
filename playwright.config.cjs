'use strict';

const { defineConfig, devices } = require('playwright/test');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

module.exports = defineConfig({
  testDir: './qa',
  testMatch: '**/browser.spec.cjs',
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'artifacts/qa/results',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/qa/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 12000,
    launchOptions: executablePath ? {
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    } : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'python tools/stage_site.py && python -m http.server 4173 --bind 127.0.0.1 --directory site',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 15000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
