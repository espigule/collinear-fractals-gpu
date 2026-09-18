'use strict';

const { test: base, expect } = require('playwright/test');
const { readFile, writeFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

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
  const drawer = page.locator('#sidebar-panel');
  const insideDrawer = await control.locator('xpath=ancestor::*[@id="sidebar-panel"]').count();
  if (insideDrawer && !await drawer.isVisible()) {
    await page.locator('#btn-toggle-controls').click();
    await expect(drawer).toBeVisible();
  } else if (!insideDrawer && await drawer.isVisible()) {
    await page.locator('#btn-close-controls').click();
    await expect(drawer).not.toBeVisible();
  }
  const more = page.locator('#toolbar-more');
  if (!await control.locator('xpath=ancestor::*[@id="toolbar-more"]').count() && await more.getAttribute('open') !== null) {
    await more.locator(':scope > summary').click();
  }
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

async function expectInsideViewport(page, selector) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} has visible layout bounds`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${selector} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${selector} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
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

// Independent projection from the fixture's declared world span. This helper
// reads the actual displayed Canvas, without importing the renderer or using
// application geometry as its expected answer. Patches avoid axes and markers.
async function dynamicalPatch(page, point, worldSpan = 12) {
  return page.locator('#dynamical-canvas').evaluate((canvas, { point, worldSpan }) => {
    const scale = canvas.width / worldSpan;
    const x = Math.round(canvas.width / 2 + point.x * scale);
    const y = Math.round(canvas.height / 2 - point.y * scale);
    const radius = Math.max(2, Math.floor(0.1 * scale));
    if (x - radius < 0 || y - radius < 0 || x + radius >= canvas.width || y + radius >= canvas.height) {
      throw new Error('Geometry fixture lies outside the visible canvas');
    }
    const side = 2 * radius + 1;
    const data = canvas.getContext('2d').getImageData(x - radius, y - radius, side, side).data;
    let marked = 0;
    for (let i = 0; i < data.length; i += 4) {
      // White is the declared exterior. Ignore faint grid/axis antialiasing.
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 220 && data[i + 3] > 250) marked++;
    }
    return { marked, total: side * side, coverage: marked / (side * side) };
  }, { point, worldSpan });
}

test('served deployment manifest identifies the checkout and fingerprints public assets', async ({ request }) => {
  const response = await request.get('/deployment.json');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.schema_version).toBe(1);
  expect(manifest.canonical_url).toBe('https://complextrees.com/collinear-fractals-gpu/');
  expect(manifest.source_commit).toMatch(/^[0-9a-f]{40}$/);
  expect(typeof manifest.source_dirty).toBe('boolean');
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8',
  });
  expect(revision.status).toBe(0);
  expect(manifest.source_commit).toBe(revision.stdout.trim());
  const files = Object.keys(manifest.asset_sha256);
  expect(files).toEqual([...files].sort());
  expect(files).not.toContain('deployment.json');
  expect(files.some(name => /^(?:qa|node_modules|artifacts|python|tools|\.git)\//.test(name))).toBe(false);
  for (const path of [
    'index.html', 'index.css', 'explorer.js', 'VERSION',
    'src/renderers/attractor_prefix.mjs', 'src/renderers/attractor_histogram.mjs',
    'src/compute/inverse_search_kernel.mjs', 'src/state/explorer_state.mjs',
  ]) {
    const asset = await request.get(`/${path}`);
    expect(asset.ok(), path).toBe(true);
    const bytes = await asset.body();
    expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(manifest.asset_sha256[path]);
    if (path === 'VERSION') expect(bytes.toString('utf8').trim()).toBe(manifest.version);
  }
});

for (const renderer of ['boundary', 'prefix', 'histogram', 'survival']) {
  test(`${renderer} renders full E(c,4) geometry for c=2i in the actual canvas`, async ({ page }, testInfo) => {
    // Even and odd radix -4 expansions give E(2i,4)=[-4,4]×[-2,2]
    // exactly. An erroneous extra division by c has x bounds [-1,1], so
    // the patches at x=±3 distinguish the two scales without a screenshot oracle.
    const hash = new URLSearchParams({
      n: '4', cx: '0', cy: '2', dcx: '0', dcy: '0', dz: '12', focus: 'dynamical',
      mode: 'collinear', layers: '0100000', renderer, adepth: '7',
      hseed: '20260917', hsamples: '200000', pieces: '0', aop: '1', sop: '1', k: '12',
    });
    // Omission exercises the canonical boundary default; older renderers remain
    // explicit so their geometry coverage cannot silently change with defaults.
    if (renderer === 'boundary') hash.delete('renderer');
    await page.goto(`/#${hash}`);
    const canvas = page.locator('#dynamical-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('#parameter-panel')).not.toBeVisible();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    await expect(page.locator('#original-renderer-mode')).toHaveValue(renderer);
    await expect(page.locator('#show-collinear-attractor')).toBeChecked();
    await expect(page.locator('#show-difference-attractor')).not.toBeChecked();
    for (const point of [{ x: 3, y: 0.7 }, { x: -3, y: 0.7 }]) {
      const pixels = await dynamicalPatch(page, point);
      expect(pixels.coverage, `${renderer}: original-scale interior near (${point.x},${point.y})`).toBeGreaterThan(renderer === 'boundary' ? 0.9 : 0.05);
    }
    for (const point of [{ x: 4.25, y: 0.7 }, { x: -4.25, y: 0.7 }, { x: 0.7, y: 2.25 }]) {
      const pixels = await dynamicalPatch(page, point);
      expect(pixels.coverage, `${renderer}: outside the exact rectangle at (${point.x},${point.y})`).toBeLessThan(0.01);
    }
    await page.screenshot({ path: testInfo.outputPath(`full-E-${renderer}.png`) });
  });
}

for (const fixture of [
  { name: 'E4 overlap', slug: 'e4', n: 4, re: 1.5, im: 1.6583123951777 },
  { name: 'E5 tile', slug: 'e5', n: 5, re: 1, im: 2 },
]) {
  test(`sharp boundary gallery: ${fixture.name} before, after and zoom`, async ({ page }, testInfo) => {
    const hash = new URLSearchParams({
      n: String(fixture.n), cx: String(fixture.re), cy: String(fixture.im),
      focus: 'dynamical', mode: 'collinear', layers: '0100000', backend: 'cpu',
      renderer: 'prefix', adepth: '7', pieces: '1', k: '12',
    });
    await page.goto(`/#${hash}`);
    const canvas = page.locator('#dynamical-canvas');
    await page.locator('#btn-reset-dyn').click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const prefix = await readRecord(page);
    expect(prefix.visual_renderer.renderer_mode).toBe('prefix');
    await page.locator('#btn-close-controls').click();
    await page.screenshot({ path: testInfo.outputPath(`${fixture.slug}-01-prefix.png`) });

    await select(page, '#original-renderer-mode', 'boundary');
    await page.locator('#btn-close-controls').click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const boundary = await readRecord(page);
    expect(boundary.visual_renderer).toMatchObject({ renderer: 'capture-escape-boundary', first_level_pieces: true });
    expect(boundary.view.dynamical_zoom).toBe(prefix.view.dynamical_zoom);
    expect(boundary.view.dynamical_center).toEqual(prefix.view.dynamical_center);
    await page.locator('#btn-close-controls').click();
    await page.screenshot({ path: testInfo.outputPath(`${fixture.slug}-02-boundary.png`) });

    // Cross a full detail threshold even on the narrower mobile canvas.
    for (let count = 0; count < 6; count++) await page.locator('#btn-zoom-in-dyn').click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const zoomed = await readRecord(page);
    expect(zoomed.visual_renderer.effective_depth).toBeGreaterThan(boundary.visual_renderer.effective_depth);
    expect(zoomed.visual_renderer.pixel_radius_world).toBeLessThan(boundary.visual_renderer.pixel_radius_world);
    await page.locator('#btn-close-controls').click();
    await page.screenshot({ path: testInfo.outputPath(`${fixture.slug}-03-boundary-zoom.png`) });
    const recordPath = testInfo.outputPath(`${fixture.slug}-rendering-records.json`);
    await writeFile(recordPath, JSON.stringify({ prefix, boundary, zoomed }, null, 2) + '\n');
    await testInfo.attach(`${fixture.slug}-rendering-records.json`, { path: recordPath, contentType: 'application/json' });
  });
}

test('boundary detail follows zoom and preserves manual depth independently of search limits', async ({ page }) => {
  await page.goto('/#n=4&cx=0&cy=2&dcx=0&dcy=0&dz=12&focus=dynamical&mode=collinear&layers=0100000&backend=cpu&k=8');
  const canvas = page.locator('#dynamical-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(page.locator('#original-renderer-mode')).toHaveValue('boundary');
  await reveal(page, '#boundaryDepth');
  await expect(page.locator('#boundaryDepth')).toHaveValue('0');
  await expect(page.locator('#adaptiveBoundary')).toBeChecked();
  await expect(page.locator('#prefix-settings')).not.toBeVisible();
  await expect(page.locator('#histogram-settings')).not.toBeVisible();
  const initial = await readRecord(page);
  expect(initial.visual_renderer).toMatchObject({
    renderer: 'capture-escape-boundary', requested_base_depth: 0, adaptive: true,
  });
  expect(initial.visual_renderer.effective_depth).toBeGreaterThanOrEqual(12);
  expect(initial.visual_renderer.pixel_radius_world).toBeGreaterThan(0);
  // The adaptive budget accounts for actual pixel width. On a 390px mobile
  // canvas, three steps from this wide span still fit within the base depth.
  for (let count = 0; count < 6; count++) await (await reveal(page, '#btn-zoom-in-dyn')).click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const zoomed = await readRecord(page);
  expect(zoomed.visual_renderer.effective_depth).toBeGreaterThan(initial.visual_renderer.effective_depth);
  expect(zoomed.visual_renderer.pixel_radius_world).toBeLessThan(initial.visual_renderer.pixel_radius_world);
  expect(zoomed.k_max).toBe(8);

  await fillNumber(page, '#boundaryDepth', 17);
  await (await reveal(page, '#adaptiveBoundary')).uncheck();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const manual = await readRecord(page);
  expect(manual.visual_renderer).toMatchObject({ effective_depth: 17, requested_base_depth: 17, adaptive: false });
  expect(manual.k_max).toBe(8);
  const url = await shareUrl(page);
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  expect(hash.get('bdepth')).toBe('17');
  expect(hash.get('badapt')).toBe('0');
  await page.goto('/');
  await page.goto(url);
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(page.locator('#boundaryDepth')).toHaveValue('17');
  await expect(page.locator('#adaptiveBoundary')).not.toBeChecked();
  const restored = await readRecord(page);
  expect(restored.visual_renderer).toMatchObject({ effective_depth: 17, requested_base_depth: 17, adaptive: false });

  await select(page, '#original-renderer-mode', 'prefix');
  await expect(page.locator('#prefix-settings')).toBeVisible();
  await expect(page.locator('#boundary-settings')).not.toBeVisible();
  await select(page, '#original-renderer-mode', 'histogram');
  await expect(page.locator('#histogram-settings')).toBeVisible();
  await expect(page.locator('#prefix-settings')).not.toBeVisible();
});

test('immersive workspace has an accessible drawer, view switch and synchronized quick arity', async ({ page, isMobile }) => {
  await open(page);
  const initialArity = Number(await page.locator('#quick-arity').inputValue());
  const editedArity = initialArity + 2;
  const drawer = page.locator('#sidebar-panel');
  const toggle = page.locator('#btn-toggle-controls');
  await expect(drawer).not.toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  for (const selector of ['#btn-toggle-controls', '#btn-arity-increase', '#btn-share', '#btn-fullscreen']) {
    await expectInsideViewport(page, selector);
  }
  const stage = await page.locator('#workspace').boundingBox();
  expect(stage.width).toBeGreaterThanOrEqual(page.viewportSize().width - 2);
  expect(stage.height).toBeGreaterThan(page.viewportSize().height * 0.8);
  if (!isMobile) {
    const chrome = await page.evaluate(() =>
      document.querySelector('#explorer-toolbar').getBoundingClientRect().height
      + document.querySelector('#footer-status').getBoundingClientRect().height);
    expect(chrome, 'Desktop controls reserve at most 96px outside the plots').toBeLessThanOrEqual(96);
  }
  await toggle.focus();
  await toggle.press('Enter');
  await expect(drawer).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await (await reveal(page, '#param-real')).focus();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(toggle).toBeFocused();

  await page.locator('#btn-view-dyn').click();
  await expect(page.locator('#parameter-panel')).not.toBeVisible();
  await expect(page.locator('#dynamical-panel')).toBeVisible();
  await expect(page.locator('#btn-view-dyn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btn-view-param').click();
  await expect(page.locator('#dynamical-panel')).not.toBeVisible();
  await expect(page.locator('#parameter-panel')).toBeVisible();
  await page.locator('#btn-view-split').click();
  await expect(page.locator('#parameter-panel')).toBeVisible();
  await expect(page.locator('#dynamical-panel')).toBeVisible();
  await expect(page.locator('#btn-view-split')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#btn-arity-increase').click();
  await expect(page.locator('#quick-arity')).toHaveValue(String(initialArity + 1));
  await expect(page.locator('#arity-slider')).toHaveValue(String(initialArity + 1));
  await page.locator('#btn-arity-decrease').click();
  await expect(page.locator('#quick-arity')).toHaveValue(String(initialArity));
  await fillNumber(page, '#quick-arity', editedArity);
  await expect(page.locator('#arity-slider')).toHaveValue(String(editedArity));
  await (await reveal(page, '#btn-undo')).click();
  await expect(page.locator('#quick-arity')).toHaveValue(String(initialArity));
  await expect(page.locator('#arity-slider')).toHaveValue(String(initialArity));
  await (await reveal(page, '#btn-redo')).click();
  await expect(page.locator('#quick-arity')).toHaveValue(String(editedArity));
  const hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(hash.get('n')).toBe(String(editedArity));
  expect(hash.get('focus')).toBe('both');
});

test('scene chips, zoom and fit update the rendered view and shared state', async ({ page }) => {
  await open(page, '#n=4&cx=0&cy=2&dcx=0&dcy=0&dz=12&layers=1000000');
  await page.locator('#btn-view-dyn').click();
  await page.locator('#btn-layer-collinear').click();
  await expect(page.locator('#show-collinear-attractor')).toBeChecked();
  await expect(page.locator('#show-difference-attractor')).not.toBeChecked();
  await expect(page.locator('#btn-layer-collinear')).toHaveAttribute('aria-pressed', 'true');
  let hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(hash.get('mode')).toBe('collinear');
  expect(hash.get('layers')).toBe('0100000');

  await page.locator('#btn-zoom-in-dyn').click();
  hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(Number(hash.get('dz'))).toBeLessThan(12);
  await page.locator('#btn-zoom-out-dyn').click();
  hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(Number(hash.get('dz'))).toBeCloseTo(12, 10);
  await page.locator('#btn-reset-dyn').click();
  hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(Number(hash.get('dz'))).toBeGreaterThan(8);
  expect(Number(hash.get('dcx'))).toBe(0);
  expect(Number(hash.get('dcy'))).toBe(0);
  await expect(page.locator('#dynamical-canvas')).toHaveAttribute('data-render-state', 'complete');

  await page.locator('#btn-layer-overlay').click();
  await expect(page.locator('#show-collinear-attractor')).toBeChecked();
  await expect(page.locator('#show-difference-attractor')).toBeChecked();
  await page.locator('#btn-layer-difference').click();
  await expect(page.locator('#show-collinear-attractor')).not.toBeChecked();
  await expect(page.locator('#show-difference-attractor')).toBeChecked();
  await expect(page.locator('#btn-layer-difference')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#btn-view-param').click();
  for (const mode of ['mn0', 'mn1']) {
    await page.locator(`#btn-locus-${mode}`).click();
    await expect(page.locator(`#btn-locus-${mode}`)).toHaveAttribute('aria-pressed', 'true');
    await expectInsideViewport(page, `#btn-locus-${mode}`);
    hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
    expect(hash.get('pm')).toBe(mode);
  }
  await page.locator('#btn-locus-compare').click();
  await expect(page.locator('#btn-locus-compare')).toHaveAttribute('aria-pressed', 'true');
  hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(hash.get('pm')).toBe('compare');
  await page.locator('#btn-locus-mn').click();
  await expect(page.locator('#btn-locus-mn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#parameter-canvas')).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
});

test('M_n, M_n^0, M_n^1 and comparison pixels preserve their definitions and M_n record', async ({ page }) => {
  // This magnified classification fixture needs only a narrow neighborhood.
  // Preserve horizontal scale and the independent probes while bounding the
  // number of expensive search pixels on slower CI machines. Full viewport
  // layout coverage remains in the startup, drawer and resize regressions.
  await page.setViewportSize({ width: page.viewportSize().width, height: 520 });
  await open(page, '#n=2&cx=1.2&cy=.9&k=12&l=1000&pm=mn&focus=parameter&pcx=1.2&pcy=.9&pz=.02&layers=0000000');
  const canvas = page.locator('#parameter-canvas');
  let witness;
  for (const mode of ['mn', 'mn0', 'mn1', 'compare']) {
    await (await reveal(page, `#btn-locus-${mode}`)).click();
    await expect(page.locator(`#btn-locus-${mode}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    await expect(page.locator('#stat-verdict')).toHaveText('Interior-offLens');
    // The independent n=2 witness has an off-lens M_n trap hit but is outside
    // M_n^0. It is also outside M_n^1: for n=2, the complementary first digit
    // is 0, so M_n^1 requires c² in E(c,2). Im(c²)=2.16 exceeds the vertical
    // support sum Σ|Im(c^-j)|≈1.4113. Probe the stable neighborhood at c=1.202+.901i, away from the
    // selected-point marker at the viewport center (span .02, center 1.2+.9i).
    const coverage = await canvas.evaluate(element => {
      const x = Math.round(element.width * 0.6);
      const y = Math.round(element.height / 2 - element.width * 0.05);
      const data = element.getContext('2d').getImageData(x - 4, y - 4, 9, 9).data;
      let marked = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.min(data[i], data[i + 1], data[i + 2]) < 220) marked++;
      }
      return marked / 81;
    });
    if (mode === 'mn0' || mode === 'mn1') expect(coverage, `${mode} exterior is white`).toBeLessThan(0.01);
    else expect(coverage, `${mode} shows the M_n off-lens result`).toBeGreaterThan(0.9);
    const record = await readRecord(page);
    expect(record.n).toBe(2);
    expect(record.N).toBe(3);
    expect(record.input_parameter).toEqual({ re: 1.2, im: 0.9 });
    expect(record.verdict).toBe('Interior-offLens');
    expect(record.proof_status).toBe('exploratory');
    expect(record.parameter_view.mode).toBe(mode);
    expect(record.parameter_view.search_record_set).toBe('M_n');
    if (mode === 'mn') {
      witness = record.word;
    } else {
      expect(record.word).toEqual(witness);
      const set = mode === 'mn1' ? 'mn1' : 'mn0';
      expect(record.parameter_view[set].verdict).toBe('Exterior');
      await expect(page.locator('#stat-view-detail')).toContainText('Exterior');
    }
    expect(record.parameter_view).not.toHaveProperty('rn');
    const hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
    expect(hash.get('pm')).toBe(mode);
  }
});

test('complementary first digits distinguish M_n^1 from M_n^0 in actual parameter pixels', async ({ page }) => {
  // At n=2, c=1+i belongs to M_n^0: the original-digit inverse orbit uses +1,
  // then repeats -1 forever at -1+i. M_n^1 instead has only first digit 0 and
  // would require c²=2i in E(c,2), whose exact vertical support is 5/3 < 2.
  // A tiny neighborhood remains a finite survivor at depth 12; the off-center
  // patch avoids the selected-point marker and preserves the exact witness.
  await page.setViewportSize({ width: page.viewportSize().width, height: 520 });
  await open(page, '#n=2&cx=1&cy=1&k=12&l=1000&pm=mn0&focus=parameter&pcx=1&pcy=1&pz=.0002&layers=0000000&backend=cpu');
  const canvas = page.locator('#parameter-canvas');
  for (const mode of ['mn0', 'mn1']) {
    await (await reveal(page, `#btn-locus-${mode}`)).click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const coverage = await canvas.evaluate(element => {
      const x = Math.round(element.width * 0.6);
      const y = Math.round(element.height / 2 - element.width * 0.05);
      const data = element.getContext('2d').getImageData(x - 4, y - 4, 9, 9).data;
      let marked = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (Math.min(data[offset], data[offset + 1], data[offset + 2]) < 220) marked++;
      }
      return marked / 81;
    });
    if (mode === 'mn0') expect(coverage, 'M_n^0 contains finite survivors near the periodic witness').toBeGreaterThan(0.9);
    else expect(coverage, 'M_n^1 is outside its exact vertical support').toBeLessThan(0.01);
    const record = await readRecord(page);
    expect(record.parameter_view.mode).toBe(mode);
    if (mode === 'mn0') {
      expect(record.parameter_view.mn0.stopReason).toBe('depth-cap');
      expect(record.parameter_view.mn0.displayReason).toBe('finite-survival');
    } else {
      expect(record.parameter_view.mn1.verdict).toBe('Exterior');
    }
  }
});

test('polar edits roundtrip through Cartesian controls and preserve exact real-axis input', async ({ page }) => {
  await open(page, '#n=3&cx=1&cy=1&k=12&layers=0100000');
  expect(Number(await page.locator('#param-modulus').inputValue())).toBeCloseTo(Math.sqrt(2), 12);
  expect(Number(await page.locator('#param-argument').inputValue())).toBeCloseTo(45, 12);
  await fillNumber(page, '#param-modulus', 2);
  expect(Number(await page.locator('#param-real').inputValue())).toBeCloseTo(Math.sqrt(2), 12);
  expect(Number(await page.locator('#param-imag').inputValue())).toBeCloseTo(Math.sqrt(2), 12);
  await fillNumber(page, '#param-argument', 90);
  await expect(page.locator('#param-real')).toHaveValue('0');
  await expect(page.locator('#param-imag')).toHaveValue('2');
  await fillNumber(page, '#param-argument', 0);
  await expect(page.locator('#param-real')).toHaveValue('2');
  await expect(page.locator('#param-imag')).toHaveValue('0');
  const realAxis = await readRecord(page);
  expect(realAxis.input_parameter).toEqual({ re: 2, im: 0 });
  expect(realAxis.verdict).toBe('Undetermined');
  expect(realAxis.stop_reason).toBe('outside-domain');

  await fillNumber(page, '#param-real', -1.25);
  await fillNumber(page, '#param-imag', 0.75);
  const modulus = Math.hypot(-1.25, 0.75);
  const angle = Math.atan2(0.75, -1.25) * 180 / Math.PI;
  expect(Number(await page.locator('#param-modulus').inputValue())).toBeCloseTo(modulus, 12);
  expect(Number(await page.locator('#param-argument').inputValue())).toBeCloseTo(angle, 12);
  const url = await shareUrl(page);
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  expect(Number(hash.get('cx'))).toBe(-1.25);
  expect(Number(hash.get('cy'))).toBe(0.75);
  await page.goto('/');
  await page.goto(url);
  await expect(page.locator('#param-real')).toHaveValue('-1.25');
  await expect(page.locator('#param-imag')).toHaveValue('0.75');
  expect(Number(await page.locator('#param-modulus').inputValue())).toBeCloseTo(modulus, 12);
  expect(Number(await page.locator('#param-argument').inputValue())).toBeCloseTo(angle, 12);
});

for (const fixture of [
  { name: 'c=2i rectangle', re: 0, im: 2, xMax: 4, yMax: 2 },
  // Independently evaluated with 80-digit decimal arithmetic from the exact
  // parameter (3+i√11)/2: 3 sum |Re/Im(c^-j)|, with 300 series terms.
  { name: 'E4 overlap example', re: 1.5, im: 1.6583123951777, xMax: 4.344021327993613, yMax: 1.853746339874843 },
]) {
  test(`Fit contains the full original-attractor bounds for the ${fixture.name}`, async ({ page }) => {
    const hash = new URLSearchParams({
      n: '4', cx: String(fixture.re), cy: String(fixture.im), focus: 'dynamical',
      dcx: '6', dcy: '-4', dz: '2', layers: '0100000', mode: 'collinear', renderer: 'prefix',
    });
    await page.goto(`/#${hash}`);
    await page.locator('#btn-reset-dyn').click();
    const canvas = page.locator('#dynamical-canvas');
    await expect(canvas).toHaveAttribute('data-render-state', 'complete');
    const aspect = await canvas.evaluate(element => element.width / element.height);
    const fitted = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
    const width = Number(fitted.get('dz'));
    expect(Number(fitted.get('dcx'))).toBe(0);
    expect(Number(fitted.get('dcy'))).toBe(0);
    expect(width / 2).toBeGreaterThan(fixture.xMax);
    expect(width / aspect / 2).toBeGreaterThan(fixture.yMax);
    const tightWidth = Math.max(2 * fixture.xMax, 2 * fixture.yMax * aspect);
    expect(width / tightWidth, 'Fit retains useful plot occupancy with its 15% margin').toBeCloseTo(1.15, 6);
    if (fixture.re === 0) {
      expect((await dynamicalPatch(page, { x: 3, y: 0.7 }, width)).coverage).toBeGreaterThan(0.05);
      expect((await dynamicalPatch(page, { x: 4.25, y: 0.7 }, width)).coverage).toBeLessThan(0.01);
    }
  });
}

test('a rejected fullscreen request leaves the scene controls usable', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = async () => {
      throw new DOMException('Fullscreen denied by this embedding context', 'NotAllowedError');
    };
  });
  await open(page);
  await page.locator('#btn-fullscreen').click();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.locator('#btn-view-dyn').click();
  await expect(page.locator('#dynamical-panel')).toBeVisible();
  await expect(page.locator('#parameter-panel')).not.toBeVisible();
  await page.locator('#btn-view-split').click();
  await expect(page.locator('#parameter-panel')).toBeVisible();
  await expect(page.locator('#dynamical-panel')).toBeVisible();
});

test('legacy links preserve their selected sets and vertical camera span through modern sharing', async ({ page }) => {
  await page.goto('/?legacy=1#n=4&cx=0&cy=2&panels=0100&zoom=.4&centerX=0&centerY=0');
  const canvas = page.locator('#dynamical-canvas');
  await expect(page.locator('#parameter-panel')).not.toBeVisible();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(page.locator('#arity-slider')).toHaveValue('4');
  await expect(page.locator('#param-real')).toHaveValue('0');
  await expect(page.locator('#param-imag')).toHaveValue('2');
  await expect(page.locator('#show-collinear-attractor')).toBeChecked();
  await expect(page.locator('#show-difference-attractor')).not.toBeChecked();
  await expect(page.locator('#original-renderer-mode')).toHaveValue('boundary');
  const aspect = await canvas.evaluate(element => element.width / element.height);
  const url = await shareUrl(page);
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  expect(hash.get('focus')).toBe('dynamical');
  expect(hash.get('mode')).toBe('collinear');
  expect(Number(hash.get('dcx'))).toBe(0);
  expect(Number(hash.get('dcy'))).toBe(0);
  // The old camera used height=2/zoom. New dz is a horizontal width and
  // therefore must use the actual aspect AFTER the imported single-panel focus.
  expect(Number(hash.get('dz')) / aspect).toBeCloseTo(5, 8);
  await page.goto('/');
  await page.goto(url);
  await expect(page.locator('#parameter-panel')).not.toBeVisible();
  await expect(page.locator('#param-real')).toHaveValue('0');
  await expect(page.locator('#param-imag')).toHaveValue('2');
  expect(await shareUrl(page)).toBe(url);
});

test('startup finishes both scientific panels with real pixel content', async ({ page, isMobile }, testInfo) => {
  await open(page);
  await expect(page.locator('#original-renderer-mode')).toHaveValue('boundary');
  await expect(page.locator('#stat-verdict')).toHaveText('Undetermined');
  await expect(page.locator('#arity-slider')).toHaveValue('4');
  await expect(page.locator('#param-real')).toHaveValue('1.5');
  await expect(page.locator('#param-imag')).toHaveValue('1.6583123951777');
  await expect(page.locator('#show-collinear-attractor')).toBeChecked();
  await expect(page.locator('#show-difference-attractor')).not.toBeChecked();
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

  await expectInsideViewport(page, '#toolbar-more .toolbar-menu');
  await page.screenshot({ path: testInfo.outputPath('more-actions.png') });
  await page.locator('#toolbar-more > summary').click();
  await reveal(page, '#stat-reason');
  await expectInsideViewport(page, '#result-details .result-card');
  await page.screenshot({ path: testInfo.outputPath('search-details.png') });
  await page.locator('#result-details > summary').click();

  const manifest = await (await page.request.get('/deployment.json')).json();
  await expect(page.locator('html')).toHaveAttribute('data-source-commit', manifest.source_commit);
  const about = await reveal(page, '#btn-about');
  await about.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#modal-body')).toContainText(manifest.source_commit.slice(0, 12));
  await expect(page.locator('#modal-body a[href="deployment.json"]')).toBeVisible();
  const copied = [];
  await page.exposeFunction('recordCitationCopy', text => { copied.push(text); });
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: text => window.recordCitationCopy(text) },
  }));
  await page.locator('#modal-tabs [data-tab="references"]').click();
  await page.locator('#btn-copy-software-citation').click();
  await expect(page.locator('#btn-copy-software-citation')).toHaveText('Copied');
  expect(copied[0]).toContain('Bernat Espigule');
  expect(copied[0]).toContain(manifest.source_commit);
  await page.locator('#btn-copy-bibtex').click();
  await expect(page.locator('#btn-copy-bibtex')).toHaveText('Copied');
  expect(copied[1]).toMatch(/^@software\{/);
  expect(copied[1]).toContain(`version = {${manifest.version}}`);
  expect(copied[1]).toContain(`/tree/${manifest.source_commit}`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(about).toBeFocused();
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
  await expect(page.locator('#original-renderer-mode')).toHaveValue('boundary');
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
  { name: 'histogram seed', selector: '#histogram-seed', value: '314159', hashKey: 'hseed', renderer: 'histogram' },
  { name: 'search depth', selector: '#param-kmax', value: '19', hashKey: 'k' },
]) {
  test(`uncommitted ${edit.name} survives a real resize before blur`, async ({ page }) => {
    await open(page);
    if (edit.renderer) await select(page, '#original-renderer-mode', edit.renderer);
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
  await page.goto('/#cx=0&cy=5e-324&focus=dynamical&renderer=boundary&mode=collinear&layers=0100000');
  await expect(page.locator('#dynamical-canvas')).toHaveAttribute('data-render-state', 'complete');
  await expect(page.locator('#stat-verdict')).toHaveText('Undetermined');
  const record = await readRecord(page);
  expect(record.input_parameter).toEqual({ re: 0, im: 5e-324 });
  expect(record.c).toBeNull();
  expect(record.verdict).toBe('Undetermined');
  expect(record.stop_reason).toBe('numerical-range');
  expect(record.proof_status).toBe('bounded-search-undetermined');
  expect(record.visual_renderer).toMatchObject({ available: false, stop_reason: 'numerical-range',
    effective_depth: 0, effective_work_limit: 0, self_covering_region: false });

  // A representable parameter just above the unit circle also exceeds the
  // conservative enclosure arithmetic range; mathematical lens eligibility
  // must not be reported as a capture computation that actually ran.
  await page.goto('/#n=3&cx=.6&cy=.8000000000000003&focus=dynamical&renderer=boundary&mode=collinear&layers=0100000');
  await expect(page.locator('#dynamical-canvas')).toHaveAttribute('data-render-state', 'complete');
  const closeToUnit = await readRecord(page);
  expect(closeToUnit.visual_renderer).toMatchObject({ available: false, stop_reason: 'numerical-range',
    effective_depth: 0, effective_work_limit: 0, self_covering_region: false });
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
