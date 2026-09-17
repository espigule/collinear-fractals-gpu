'use strict';

const { defineConfig, devices } = require('playwright/test');
const base = require('./playwright.config.cjs');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const common = ['--no-sandbox', '--disable-dev-shm-usage'];
const launch = args => ({ ...(executablePath ? { executablePath } : {}), args: [...common, ...args] });
// Explicit software rendering makes shader compilation and readback repeatable
// in CI. These projects do not measure or claim hardware GPU performance.
const software = launch(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);

module.exports = defineConfig({
  ...base,
  testMatch: '**/gpu-browser.spec.cjs',
  outputDir: 'artifacts/qa/gpu/results',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/qa/gpu/report', open: 'never' }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    ...base.webServer,
    command: `python -c 'from pathlib import Path; import tools.stage_site as stage; stage.OUTPUT = Path("artifacts/qa/gpu/site").resolve(); stage.main()' && python -m http.server 4174 --bind 127.0.0.1 --directory artifacts/qa/gpu/site`,
    url: 'http://127.0.0.1:4174',
  },
  projects: [
    { name: 'webgl-swiftshader', grep: /WebGL2:/, use: { browserName: 'chromium', viewport: { width: 1024, height: 720 }, launchOptions: software } },
    { name: 'webgl-swiftshader-mobile', grep: /WebGL2:/, use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions: software } },
    { name: 'webgl-disabled-fallback', grep: /CPU fallback:/, use: {
      browserName: 'chromium', viewport: { width: 1024, height: 720 },
      launchOptions: launch(['--disable-webgl', '--disable-webgl2']),
    } },
  ],
});
