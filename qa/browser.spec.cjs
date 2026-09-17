'use strict';

const { test: base, expect } = require('playwright/test');
const { readFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

// Tests exercise the staged deployment in a real browser. No application globals
// or mocked Canvas/Worker APIs are used. Any script error or failed local asset
// fails its test, including modules loaded after initial navigation.
const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() >= 400) {
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText || '';
      if (request.url().startsWith(baseURL) && reason !== 'net::ERR_ABORTED') {
        errors.push(`${new URL(request.url()).pathname}: ${reason}`);
      }
    });
    await use(page);
    expect(errors, 'Browser console, modules and local assets').toEqual([]);
  },
});

async function reveal(page, selector) {
  const control = page.locator(selector);
  const ancestors = await control.locator('xpath=ancestor::details').all();
  for (const details of ancestors) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
  await control.scrollIntoViewIfNeeded();
  return control;
}

async function fillNumber(page, selector, value) {
  const input = await reveal(page, selector);
  await input.fill(String(value));
  await input.press('Tab');
}

async function select(page, selector, value) {
  await (await reveal(page, selector)).selectOption(value);
}

async function open(page, hash = '') {
  await page.goto(`/${hash}`);
  await expect(page.locator('#stat-verdict')).toHaveText(/Interior|Exterior|Undetermined/);
  await expect(page.locator('#parameter-canvas')).toHaveAttribute('data-render-state', /rendering|complete/);
}

async function shareUrl(page) {
  await (await reveal(page, '#btn-share')).click();
  await expect(page.locator('#modal-backdrop')).toBeVisible();
  const url = (await page.locator('#modal-body pre').textContent()).trim();
  expect(new URL(url).origin).toBe('http://127.0.0.1:4173');
  await page.keyboard.press('Escape');
  return url;
}

async function readRecord(page) {
  const pending = page.waitForEvent('download');
  await (await reveal(page, '#btn-download-certificate')).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  const schemaCheck = spawnSync(process.env.PYTHON || 'python', ['-c',
    'import json,sys; from jsonschema import Draft202012Validator; Draft202012Validator(json.load(open("schemas/certificate.schema.json"))).validate(json.load(sys.stdin))'],
  { cwd: require('node:path').resolve(__dirname, '..'), input: JSON.stringify(data), encoding: 'utf8' });
  expect(schemaCheck.stderr, 'Downloaded record satisfies published JSON Schema').toBe('');
  expect(schemaCheck.status).toBe(0);
  return data;
}

test('startup finishes both scientific panels with real pixel content', async ({ page, isMobile }, testInfo) => {
  await open(page);
  await expect(page.locator('#stat-verdict')).toHaveText('Interior');
  for (const id of ['parameter-canvas', 'dynamical-canvas']) {
    const canvas = page.locator(`#${id}`);
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const pixels = await canvas.evaluate(element => {
      const { width, height } = element;
      const rgba = element.getContext('2d').getImageData(0, 0, width, height).data;
      const colors = new Set();
      const stride = Math.max(4, Math.floor(rgba.length / 4000 / 4) * 4);
      for (let i = 0; i < rgba.length; i += stride) {
        colors.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]},${rgba[i + 3]}`);
      }
      return { width, height, colors: colors.size };
    });
    expect(pixels.width).toBeGreaterThan(100);
    expect(pixels.height).toBeGreaterThan(100);
    expect(pixels.colors, `${id} contains more than a blank canvas`).toBeGreaterThan(6);
    await expect(canvas).toHaveAttribute('aria-busy', 'false');
  }
  await expect(page.locator('#btn-save-image')).toBeEnabled();
  // Full-page capture can temporarily resize a dvh-based mobile viewport and
  // photograph a just-cleared canvas. Capture actual viewports after scrolling.
  await page.screenshot({ path: testInfo.outputPath('overview.png') });
  if (isMobile) {
    await page.locator('#dynamical-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('#dynamical-canvas')).toHaveAttribute('data-render-state', 'complete');
    await page.screenshot({ path: testInfo.outputPath('dynamical.png') });
  }
  const pending = page.waitForEvent('download');
  await (await reveal(page, '#btn-save-image')).click();
  const png = await pending;
  const bytes = await readFile(await png.path());
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test('partial and malformed share hashes preserve defaults and enforce bounds', async ({ page }) => {
  await open(page, '#n=4');
  await expect(page.locator('#arity-slider')).toHaveValue('4');
  await expect(page.locator('#param-real')).toHaveValue('0.5');
  await expect(page.locator('#param-imag')).toHaveValue('1.1');
  await expect(page.locator('#param-kmax')).toHaveValue('37');
  await expect(page.locator('#param-lmax')).toHaveValue('1000');
  await expect(page.locator('#original-attractor-opacity')).toHaveValue('72');
  let params = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(Number(params.get('pz'))).toBeGreaterThan(0.01);
  expect(Number(params.get('dz'))).toBeGreaterThan(0.01);

  // Same-document navigation verifies the hashchange path as well as startup.
  // A navigation intentionally replaces any draft left focused in the old view.
  await (await reveal(page, '#param-real')).fill('0.75');
  await page.goto('/#n=bad&cx=NaN&cy=Infinity&k=&l=bad&q=bad&renderer=bad&palette=bad&layers=x&pz=NaN');
  await expect(page.locator('#arity-slider')).toHaveValue('3');
  await expect(page.locator('#param-kmax')).toHaveValue('37');
  await expect(page.locator('#param-real')).toHaveValue('0.5');
  await expect(page.locator('#param-imag')).toHaveValue('1.1');
  await expect(page.locator('#original-renderer-mode')).toHaveValue('prefix');
  await expect(page.locator('#palette-mode')).toHaveValue('research');

  await page.goto('/#n=-9&k=-9&l=999999&q=999&hsamples=99999999&hseed=99999999999');
  await expect(page.locator('#arity-slider')).toHaveValue('2');
  await expect(page.locator('#param-kmax')).toHaveValue('0');
  await expect(page.locator('#param-lmax')).toHaveValue('10000');
  await expect(page.locator('#param-modulo')).toHaveValue('12');
  await expect(page.locator('#histogram-samples')).toHaveValue('1000000');
  await expect(page.locator('#histogram-seed')).toHaveValue('4294967295');
});

test('canonical presets load parameters and finite-search records honor chosen depth', async ({ page }) => {
  await open(page);
  await select(page, '#example-preset', 'e_c4_overlap');
  await expect(page.locator('#arity-slider')).toHaveValue('4');
  await expect(page.locator('#param-real')).toHaveValue('1.5');
  await expect(page.locator('#param-imag')).toHaveValue('1.6583123951777');
  await expect(page.locator('#show-collinear-attractor')).toBeChecked();

  await select(page, '#example-preset', 'e_c5_plane_filling');
  await expect(page.locator('#arity-slider')).toHaveValue('5');
  await expect(page.locator('#param-real')).toHaveValue('1');
  await expect(page.locator('#param-imag')).toHaveValue('2');

  await select(page, '#example-preset', 'off_lens_witnesses_n2_to_n19');
  await expect(page.locator('#arity-slider')).toHaveValue('3');
  await expect(page.locator('#stat-verdict')).toHaveText('Interior-offLens');
  const record = await readRecord(page);
  expect(record.n).toBe(3);
  expect(record.N).toBe(5);
  expect(record.input_parameter).toEqual({ re: 1.419643377607, im: 0.606290729207 });
  expect(record.word).toEqual([4, 0]);
  expect(record.depth).toBe(2);
  expect(record.stop_reason).toBe('trap-hit');
  expect(record.proof_status).toBe('exploratory');
  expect(record.arithmetic).toBe('binary64');

  await fillNumber(page, '#param-kmax', 1);
  const limited = await readRecord(page);
  expect(limited.k_max).toBe(1);
  expect(limited.verdict).toBe('Undetermined');
  expect(limited.stop_reason).toBe('depth-cap');
  expect(limited.proof_status).toBe('bounded-search-undetermined');
});

test('share URL restores custom colors, renderer settings, exact coordinates and layers', async ({ page }) => {
  await open(page);
  await fillNumber(page, '#param-real', 1.2345678901234567);
  await fillNumber(page, '#param-imag', 1.543210987654321);
  await select(page, '#original-renderer-mode', 'histogram');
  await fillNumber(page, '#histogram-seed', 314159);
  await fillNumber(page, '#histogram-samples', 1000);
  await (await reveal(page, '#first-level-pieces')).uncheck();
  await select(page, '#palette-mode', 'custom');
  for (const [id, color] of [['palette-interior', '#13579b'], ['palette-offlens', '#2468ac']]) {
    const input = await reveal(page, `#${id}`);
    await input.evaluate((element, value) => { element.value = value; }, color);
    await input.dispatchEvent('input');
  }
  await (await reveal(page, '#show-winning-path')).uncheck();
  const url = await shareUrl(page);
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  expect(Number(hash.get('cx'))).toBe(1.2345678901234567);
  expect(Number(hash.get('cy'))).toBe(1.543210987654321);
  expect(hash.get('hseed')).toBe('314159');
  expect(hash.get('hsamples')).toBe('1000');
  expect(hash.get('ci')).toBe('#13579b');
  expect(hash.get('co')).toBe('#2468ac');

  await page.goto('/');
  await page.goto(url);
  await expect(page.locator('#param-real')).toHaveValue('1.2345678901234567');
  await expect(page.locator('#param-imag')).toHaveValue('1.543210987654321');
  await expect(page.locator('#original-renderer-mode')).toHaveValue('histogram');
  await expect(page.locator('#histogram-seed')).toHaveValue('314159');
  await expect(page.locator('#histogram-samples')).toHaveValue('1000');
  await expect(page.locator('#first-level-pieces')).not.toBeChecked();
  await expect(page.locator('#show-winning-path')).not.toBeChecked();
  await expect(page.locator('#palette-interior')).toHaveValue('#13579b');
  await expect(page.locator('#palette-offlens')).toHaveValue('#2468ac');
  expect(await shareUrl(page)).toBe(url);
});

for (const edit of [
  { name: 'histogram seed', selector: '#histogram-seed', value: '314159', hashKey: 'hseed' },
  { name: 'search depth', selector: '#param-kmax', value: '19', hashKey: 'k' },
]) {
  test(`uncommitted ${edit.name} survives a real resize before blur`, async ({ page }) => {
    await open(page);
    const input = await reveal(page, edit.selector);
    const canvas = page.locator('#dynamical-canvas');
    await expect(canvas).toHaveAttribute('data-render-state', 'complete');
    const initialWidth = await canvas.evaluate(element => element.width);
    const viewport = page.viewportSize();
    await input.fill(edit.value);
    await expect(input).toBeFocused();

    // Force an asynchronous redraw while the field still contains a draft.
    // Waiting for both a changed backing size and completion avoids relying on
    // timing or calling application internals to trigger the former input race.
    await page.setViewportSize({ width: viewport.width + 24, height: viewport.height });
    await expect.poll(() => canvas.evaluate(element => element.width)).not.toBe(initialWidth);
    await expect(canvas).toHaveAttribute('data-render-state', 'complete');
    await expect(input).toBeFocused();
    expect(await input.inputValue(), 'Drawing must not replace a focused, uncommitted edit').toBe(edit.value);

    await input.press('Tab');
    const hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
    expect(hash.get(edit.hashKey), 'The subsequent blur commits the preserved draft').toBe(edit.value);
  });
}

test('dialogs contain keyboard focus, close from a focused control, and restore it', async ({ page }) => {
  await open(page);
  const trigger = await reveal(page, '#btn-share');
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.locator('#modal-copy-primary').focus();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('keyboard selection, undo/redo, focus and resize preserve usable scientific views', async ({ page, isMobile }) => {
  await open(page);
  const canvas = page.locator('#parameter-canvas');
  const before = await page.locator('#param-real').inputValue();
  await canvas.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#param-real')).not.toHaveValue(before);
  const changed = await page.locator('#param-real').inputValue();
  await (await reveal(page, '#btn-undo')).click();
  await expect(page.locator('#param-real')).toHaveValue(before);
  await (await reveal(page, '#btn-redo')).click();
  await expect(page.locator('#param-real')).toHaveValue(changed);

  await page.locator('#btn-focus-param').click();
  await expect(page.locator('#dynamical-panel')).not.toBeVisible();
  const focusUrl = await shareUrl(page);
  expect(new URLSearchParams(new URL(focusUrl).hash.slice(1)).get('focus')).toBe('parameter');
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#dynamical-panel')).toBeVisible();

  const beforeResize = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  await page.setViewportSize(isMobile ? { width: 430, height: 900 } : { width: 1100, height: 780 });
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const afterResize = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  for (const key of ['cx', 'cy', 'pcx', 'pcy', 'pz', 'dcx', 'dcy', 'dz']) {
    expect(afterResize.get(key), `Resize preserves ${key}`).toBe(beforeResize.get(key));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'The page fits the viewport without horizontal scrolling').toBeLessThanOrEqual(1);
});

test('out-of-range reciprocal remains an explicit undetermined record', async ({ page }) => {
  await open(page, '#cx=0&cy=5e-324');
  await expect(page.locator('#stat-verdict')).toHaveText('Undetermined');
  const record = await readRecord(page);
  expect(record.input_parameter).toEqual({ re: 0, im: 5e-324 });
  expect(record.c).toBeNull();
  expect(record.verdict).toBe('Undetermined');
  expect(record.stop_reason).toBe('numerical-range');
  expect(record.proof_status).toBe('bounded-search-undetermined');
});

test('a slow preset cannot replace a newer selection and invalid JSON uses the fallback', async ({ page }) => {
  await open(page);
  let releaseSlow;
  let markSeen;
  const held = new Promise(resolve => { releaseSlow = resolve; });
  const seen = new Promise(resolve => { markSeen = resolve; });
  await page.route('**/examples/e_c4_overlap/config.json', async route => {
    markSeen();
    await held;
    await route.continue();
  });
  await select(page, '#example-preset', 'e_c4_overlap');
  await seen;
  await select(page, '#example-preset', 'e_c5_plane_filling');
  await expect(page.locator('#arity-slider')).toHaveValue('5');
  const response = page.waitForResponse('**/examples/e_c4_overlap/config.json');
  releaseSlow();
  await response;
  await expect(page.locator('#param-real')).toHaveValue('1');
  await expect(page.locator('#param-imag')).toHaveValue('2');
  await expect(page.locator('#arity-slider')).toHaveValue('5');

  await page.unroute('**/examples/e_c4_overlap/config.json');
  await page.route('**/examples/e_c4_overlap/config.json', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{ malformed JSON',
  }));
  await select(page, '#example-preset', 'e_c4_overlap');
  await expect(page.locator('#arity-slider')).toHaveValue('4');
  await expect(page.locator('#param-real')).toHaveValue('1.5');
  await expect(page.locator('#param-imag')).toHaveValue('1.6583123951777');
});
