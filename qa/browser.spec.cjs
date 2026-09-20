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

async function setParameterLayers(page, layers) {
  for (const layer of ['mn', 'mn0', 'mn1']) {
    const button = await reveal(page, `#btn-locus-${layer}`);
    if ((await button.getAttribute('aria-pressed') === 'true') !== layers.includes(layer)) {
      await button.click();
    }
    await expect(button).toHaveAttribute('aria-pressed', String(layers.includes(layer)));
  }
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

// Read colors at declared mathematical coordinates, independently of the
// app's transforms and search buffers. The most frequent color in a 3×3 patch
// resists a faint grid line while retaining actual rendered-pixel evidence.
async function canvasColors(page, selector, points, { spanX, center = { x: 0, y: 0 } }) {
  return page.locator(selector).evaluate((canvas, { points, spanX, center }) => {
    const context = canvas.getContext('2d');
    const scale = canvas.width / spanX;
    return points.map(point => {
      const x = Math.round(canvas.width / 2 + (point.x - center.x) * scale);
      const y = Math.round(canvas.height / 2 - (point.y - center.y) * scale);
      if (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2) {
        throw new Error(`Color witness (${point.x},${point.y}) is outside the displayed canvas`);
      }
      const pixels = context.getImageData(x - 1, y - 1, 3, 3).data;
      const counts = new Map();
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const key = Array.from(pixels.slice(offset, offset + 3)).join(',');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const [key, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
      return { rgb: key.split(',').map(Number), count };
    });
  }, { points, spanX, center });
}

const brightness = color => color.rgb.reduce((sum, channel) => sum + channel, 0);

async function setCaptureCycle(page, q) {
  const input = await reveal(page, '#param-modulo');
  await input.focus();
  await input.press('Home');
  for (let value = 1; value < q; value++) await input.press('ArrowRight');
  await expect(input).toHaveValue(String(q));
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

test('black first-piece boundaries remain visible inside overlapping exact rectangles', async ({ page }, testInfo) => {
  // For c=2i and n=5, the independent even/odd radix -4 expansions are
  // intervals: E=[-16/3,16/3]×[-8/3,8/3]. Every first piece is
  // [t-4/3,t+4/3]×[-8/3,8/3], for t=-4,-2,0,2,4. The edges at
  // x=2/3 and x=4/3 lie strictly inside the union and inside another piece;
  // an outer-union contour or a last-painted-piece contour misses them.
  await page.goto('/#n=5&cx=0&cy=2&dcx=0&dcy=0&dz=12&focus=dynamical&mode=collinear&layers=0100000&backend=cpu&renderer=boundary&pieces=1&aop=1&bdepth=16&badapt=0');
  const canvas = page.locator('#dynamical-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const probe = async () => canvas.evaluate(element => {
    const context = element.getContext('2d');
    const scale = element.width / 12;
    const top = Math.round(element.height / 2 - 1.2 * scale);
    const bottom = Math.round(element.height / 2 - 0.5 * scale);
    const scan = worldX => {
      const center = Math.round(element.width / 2 + worldX * scale);
      const width = 7;
      const data = context.getImageData(center - 3, top, width, bottom - top).data;
      let darkRows = 0;
      for (let row = 0; row < bottom - top; row++) {
        for (let column = 0; column < width; column++) {
          const offset = (row * width + column) * 4;
          // Capture shading can make the unsegmented fill dark olive. Count
          // the genuinely black contour, not every dark capture-band pixel.
          if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < 30) {
            darkRows++;
            break;
          }
        }
      }
      return darkRows / (bottom - top);
    };
    return { boundaries: [2 / 3, 4 / 3].map(scan), interiors: [1, 2].map(scan) };
  });
  const outlined = await probe();
  for (const coverage of outlined.boundaries) expect(coverage, 'Each covered internal piece edge is a continuous black line').toBeGreaterThan(0.9);
  for (const coverage of outlined.interiors) expect(coverage, 'Interior fill does not become a false black contour').toBeLessThan(0.1);
  await page.screenshot({ path: testInfo.outputPath('overlapping-rectangles-all-piece-outlines.png') });

  await (await reveal(page, '#first-level-pieces')).uncheck();
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  for (const coverage of (await probe()).boundaries) expect(coverage, 'Hiding the first pieces also hides their internal outlines').toBeLessThan(0.1);
});

test('finite capture colors actual E levels and preserves the minimum when pieces change', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: Math.min(page.viewportSize().width, 640), height: 620 });
  // E(2i,5) is the exact rectangle [-16/3,16/3]×[-8/3,8/3]. Its
  // canonical trap is |x|<5, |y|<5/2. These witnesses have minimum depths
  // 0, 1 and 2 respectively: (5.1+i) -> -2+2.2i; and
  // (1+2.58i) -> -5.16+2i -> -4-2.32i. Every first inverse image of
  // the last point has real part -5.16, excluding an earlier capture.
  // The fourth witness lies in just piece t=2, and already in the trap.
  const points = [{ x: 1, y: 1 }, { x: 5.1, y: 1 }, { x: 1, y: 2.58 }, { x: 2, y: 1 }];
  await page.goto('/#n=5&cx=0&cy=2&dcx=0&dcy=0&dz=12&focus=dynamical&mode=collinear&layers=0100000&backend=cpu&renderer=boundary&pieces=0&aop=1&bdepth=12&badapt=0&q=3');
  const canvas = page.locator('#dynamical-canvas');
  const colors = () => canvasColors(page, '#dynamical-canvas', points, { spanX: 12 });
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(page.locator('#capture-style')).toHaveValue('depth');
  const initial = await colors();
  for (const color of initial) expect(color.count, 'Stable interior color fills the witness patch').toBeGreaterThanOrEqual(5);
  expect(brightness(initial[1]) - brightness(initial[0]), 'Minimum level 1 is visibly distinct from level 0').toBeGreaterThan(30);
  expect(brightness(initial[2]) - brightness(initial[1]), 'Minimum level 2 is visibly distinct from level 1').toBeGreaterThan(30);
  await reveal(page, '#dynamical-capture-legend');
  await expect(page.locator('#dynamical-capture-legend .capture-level-title')).toContainText('Minimum capture level');
  await expect(page.locator('#dynamical-capture-legend .capture-level-swatch')).toHaveCount(3);
  await page.locator('#legend-dynamical > summary').click();
  await page.screenshot({ path: testInfo.outputPath('exact-rectangle-finite-capture-levels.png') });

  await select(page, '#capture-style', 'sets');
  await expect(page.locator('#param-modulo')).toBeDisabled();
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const solid = await colors();
  expect(solid.slice(0, 3).map(color => color.rgb), 'Set colors intentionally hide the capture bands').toEqual([solid[0].rgb, solid[0].rgb, solid[0].rgb]);
  const levelZeroFactor = brightness(initial[3]) / brightness(solid[3]);

  await select(page, '#capture-style', 'depth');
  await expect(page.locator('#param-modulo')).toBeEnabled();
  await fillNumber(page, '#param-kmax', 0);
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const zeroBudget = await colors();
  expect(zeroBudget[0].rgb, 'The initial trap remains minimum level 0 at k=0').toEqual(initial[0].rgb);
  expect(zeroBudget.slice(1, 3).map(color => color.rgb), 'Positive capture levels retain occupied coverage with an unconfirmed minimum').toEqual([solid[1].rgb, solid[2].rgb]);
  const limited = await readRecord(page);
  expect(limited.k_max).toBe(0);
  expect(limited.finite_capture.maximum_depth).toBe(0);
  expect(limited.visual_renderer.effective_depth, 'Boundary coverage keeps its independent depth').toBe(12);
  await fillNumber(page, '#param-kmax', 12);
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  expect((await colors()).slice(0, 3).map(color => color.rgb), 'Restoring capture depth restores the minimum levels').toEqual(initial.slice(0, 3).map(color => color.rgb));

  await setCaptureCycle(page, 1);
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const oneBand = await colors();
  expect(oneBand.slice(0, 3).map(color => color.rgb), 'q=1 identifies one capture band for all three depths').toEqual([oneBand[0].rgb, oneBand[0].rgb, oneBand[0].rgb]);
  await expect(page.locator('#dynamical-capture-legend .capture-level-swatch')).toHaveCount(1);
  const record = await readRecord(page);
  expect(record.finite_capture).toMatchObject({ capture_style: 'depth', cycle: 1 });
  expect(record.visual_renderer).toMatchObject({ capture_style: 'depth', capture_cycle: 1 });
  const url = await shareUrl(page);
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  expect(hash.get('capture')).toBe('depth');
  expect(hash.get('q')).toBe('1');
  await page.goto('/');
  await page.goto(url);
  await expect(page.locator('#capture-style')).toHaveValue('depth');
  await expect(page.locator('#param-modulo')).toHaveValue('1');

  // Changing geometric piece colors must not shift an existing depth-0
  // capture to depth 1 merely because a first-digit address was requested.
  await setCaptureCycle(page, 3);
  await (await reveal(page, '#first-level-pieces')).check();
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const pieceDepth = (await colors())[3];
  await select(page, '#capture-style', 'sets');
  await page.locator('#btn-close-controls').click();
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const pieceSolid = (await colors())[3];
  expect(brightness(pieceDepth) / brightness(pieceSolid), 'Piece coloring preserves the same minimum-depth shade').toBeCloseTo(levelZeroFactor, 2);
  expect(pieceSolid.rgb, 'The first piece keeps its own identifying hue').not.toEqual(solid[3].rgb);
  const setsUrl = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(setsUrl.get('capture')).toBe('sets');
  const setsRecord = await readRecord(page);
  expect(setsRecord.finite_capture).toMatchObject({ capture_style: 'sets', cycle: 3 });
  expect(setsRecord.visual_renderer).toMatchObject({ capture_style: 'sets', capture_cycle: 3 });
});

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
  // The independent M_n parameter layer still uses cell escape depth even
  // when the dynamical view selects a direct prefix renderer.
  await expect(page.locator('#boundary-settings')).toBeVisible();
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
  // Several view changes and seven Share roundtrips share this fixture.
  // Keep individual action and render deadlines while allowing slower CI CPUs.
  test.setTimeout(75000);
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
  await setParameterLayers(page, []);
  const active = [];
  for (const mode of ['mn0', 'mn1']) {
    await page.locator(`#btn-locus-${mode}`).click();
    active.push(mode);
    await expect(page.locator(`#btn-locus-${mode}`)).toHaveAttribute('aria-pressed', 'true');
    await expectInsideViewport(page, `#btn-locus-${mode}`);
    hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
    expect(hash.get('pl')).toBe(active.join(','));
    expect(hash.get('pm')).toBe(active.length === 1 ? mode : 'compare');
  }
  await page.locator('#btn-locus-compare').click();
  await expect(page.locator('#btn-locus-compare')).toHaveAttribute('aria-pressed', 'true');
  hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(hash.get('pm')).toBe('compare');
  expect(hash.get('pl')).toBe('mn,mn0,mn1');
  await page.locator('#btn-locus-mn').click();
  await expect(page.locator('#btn-locus-mn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btn-locus-mn0')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-locus-mn1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#parameter-canvas')).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
});

test('M_n, M_n^0, M_n^1 and comparison pixels preserve their definitions and M_n record', async ({ page }) => {
  // Four independently completed renders and four schema-validated downloads
  // share this fixture; each individual render keeps its 30-second deadline.
  test.setTimeout(75000);
  // This magnified classification fixture needs only a narrow neighborhood.
  // Preserve horizontal scale and the independent probes while bounding the
  // number of expensive search pixels on slower CI machines. Full viewport
  // layout coverage remains in the startup, drawer and resize regressions.
  await page.setViewportSize({ width: page.viewportSize().width, height: 520 });
  await open(page, '#n=2&cx=1.2&cy=.9&k=12&l=1000&pm=mn&focus=parameter&pcx=1.2&pcy=.9&pz=.02&layers=0000000');
  const canvas = page.locator('#parameter-canvas');
  let witness;
  for (const mode of ['mn', 'mn0', 'mn1', 'compare']) {
    await setParameterLayers(page, mode === 'compare' ? ['mn', 'mn0', 'mn1'] : [mode]);
    await expect(page.locator(`#btn-locus-${mode}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    await expect(page.locator('#stat-verdict')).toHaveText('Undetermined');
    // The n=2 neighborhood has finite M_n escape survivors but is outside
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
    else expect(coverage, `${mode} preserves finite M_n escape coverage`).toBeGreaterThan(0.9);
    const record = await readRecord(page);
    expect(record.n).toBe(2);
    expect(record.N).toBe(3);
    expect(record.input_parameter).toEqual({ re: 1.2, im: 0.9 });
    expect(record.verdict).toBe('Undetermined');
    expect(record.stop_reason).toBe('depth-cap');
    expect(record.proof_status).toBe('bounded-search-undetermined');
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
    await setParameterLayers(page, [mode]);
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

for (const fixture of [
  { name: 'M_n', layers: ['mn'], digits: [], minimum: 0 },
  { name: 'M_n^0', layers: ['mn0'], digits: [], minimum: 0 },
  { name: 'M_n^1', layers: ['mn1'], digits: [], minimum: 1 },
  { name: 'original first digit 0', layers: [], digits: [0], minimum: 1 },
  { name: 'complementary first digit 1', layers: [], digits: [1], minimum: 1 },
]) {
  test(`finite capture and escape coverage remain distinct for ${fixture.name}`, async ({ page }, testInfo) => {
    test.setTimeout(75000);
    await page.setViewportSize({ width: Math.min(page.viewportSize().width, 420), height: 520 });
    // At n=5, c=2i is in the original trap. M_n and M_n^0 therefore
    // capture at level 0; the complementary and fixed-first-digit searches
    // capture after their mandatory first step. At c=i√5, the exact
    // rectangles E(c,5)=[-5,5]×[-√5,√5] and
    // E(c,9)=[-10,10]×[-2√5,2√5] put every selected witness on a
    // boundary. Both original digit 0 and complementary digit 1 contain c.
    // The first has c²=-5; the second has c(c-1)=-5-i√5.
    // These are finite escape survivors, never strict trap captures.
    await open(page, '#n=5&cx=1.2&cy=.9&focus=parameter&layers=0000000&backend=cpu&pl=&pd=');
    const canvas = page.locator('#parameter-canvas');
    const dimensions = await canvas.evaluate(element => ({ width: element.width, height: element.height }));
    const spanX = 0.32;
    const step = spanX / dimensions.width;
    const pixel = { x: Math.floor(dimensions.width / 2), y: Math.floor(dimensions.height * 0.1) };
    // Put the exact boundary witness at a pixel center, so its center-depth
    // result is not accidentally replaced by that of a nearby interior point.
    const center = {
      x: (dimensions.width / 2 - pixel.x - 0.5) * step,
      y: Math.sqrt(5) + (pixel.y + 0.5 - dimensions.height / 2) * step,
    };
    const hash = new URLSearchParams({
      n: '5', cx: '1.2', cy: '.9', focus: 'parameter', layers: '0000000', backend: 'cpu',
      pl: fixture.layers.join(','), pd: fixture.digits.join(','),
      pcx: String(center.x), pcy: String(center.y), pz: String(spanX),
      bdepth: '12', badapt: '0', q: '3', capture: 'depth',
    });
    await page.goto(`/#${hash}`);
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const probe = async () => ({
      captured: (await canvasColors(page, '#parameter-canvas', [{ x: 0.01, y: 2 }], { spanX, center }))[0],
      boundary: await canvas.evaluate((element, pixel) => ({
        rgb: Array.from(element.getContext('2d').getImageData(pixel.x, pixel.y, 1, 1).data.slice(0, 3)),
      }), pixel),
    });
    const initial = await probe();
    // The original-lens guide crosses this exact boundary. Compare each
    // pixel against its own set-color rendering below, so guide antialiasing
    // cannot masquerade as a change in mathematical capture classification.
    expect(Math.min(...initial.boundary.rgb), 'The exact boundary remains visibly occupied').toBeLessThan(230);
    await reveal(page, '#parameter-capture-legend');
    await expect(page.locator('#legend-parameter')).toContainText('pixel centers');
    await expect(page.locator('#parameter-capture-legend .capture-level-swatch')).toHaveCount(3);
    await page.locator('#legend-parameter > summary').click();
    await page.screenshot({ path: testInfo.outputPath(`capture-and-survival-${fixture.layers[0] || `digit-${fixture.digits[0]}`}.png`) });

    const q = fixture.minimum === 0 ? 1 : 2;
    await setCaptureCycle(page, q);
    await page.locator('#btn-close-controls').click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const recolored = await probe();
    expect(recolored.captured.rgb, `q changes the ${fixture.minimum}-step capture band`).not.toEqual(initial.captured.rgb);
    expect(recolored.boundary.rgb, 'Changing q cannot relabel the boundary survivor as capture').toEqual(initial.boundary.rgb);

    await select(page, '#capture-style', 'sets');
    await page.locator('#btn-close-controls').click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const solid = await probe();
    expect(brightness(solid.captured) - brightness(initial.captured), 'Set mode restores the full identifying hue').toBeGreaterThan(25);
    expect(brightness(initial.boundary) - brightness(solid.boundary), 'The boundary coverage tint disappears only in set-color mode').toBeGreaterThan(25);
    const record = await readRecord(page);
    expect(record.parameter_view).toMatchObject({ layers: fixture.layers, digits: fixture.digits,
      capture_style: 'sets', capture_cycle: q, raster_sampling: 'parameter-cell', selected_point_sampling: 'point' });
    expect(record.finite_capture).toMatchObject({ capture_style: 'sets', cycle: q,
      sample_type: 'pixel-center', boundary_coverage_sampling: { parameter: 'whole-pixel' } });
    const shared = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
    expect(shared.get('capture')).toBe('sets');
    expect(shared.get('q')).toBe(String(q));
    expect(shared.get('pl')).toBe(fixture.layers.join(','));
    expect(shared.get('pd')).toBe(fixture.digits.join(','));
  });
}

test('later sibling captures are visible at their actual minimum parameter depth', async ({ page }) => {
  test.setTimeout(75000);
  await page.setViewportSize({ width: Math.min(page.viewportSize().width, 420), height: 520 });
  // These witnesses have earlier surviving DFS branches. Returning that first
  // finite survivor hides a shallower capture on a later sibling. A complete
  // minimum-depth search gives 1 and 2 respectively, which have opposite
  // lightness changes when the cycle changes from 3 to 2.
  for (const fixture of [
    { n: 2, x: 0.617, y: 1.023, layers: 'mn', digits: '', minimum: 1 },
    { n: 4, x: 0.017, y: 1.173, layers: '', digits: '3', minimum: 2 },
  ]) {
    const center = { x: fixture.x, y: fixture.y };
    const spanX = 0.0002;
    const hash = new URLSearchParams({
      n: String(fixture.n), cx: '2', cy: '2', pcx: String(center.x), pcy: String(center.y),
      pz: String(spanX), focus: 'parameter', layers: '0000000', backend: 'cpu',
      pl: fixture.layers, pd: fixture.digits, bdepth: '12', badapt: '0', capture: 'depth', q: '3',
    });
    await page.goto(`/#${hash}`);
    const canvas = page.locator('#parameter-canvas');
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const probe = async () => (await canvasColors(page, '#parameter-canvas', [center], { spanX, center }))[0];
    const q3 = await probe();
    await setCaptureCycle(page, 2);
    await page.locator('#btn-close-controls').click();
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    const q2 = await probe();
    if (fixture.minimum === 1) {
      expect(brightness(q2) - brightness(q3), 'The later sibling is a minimum-level-1 capture').toBeGreaterThan(30);
    } else {
      expect(brightness(q3) - brightness(q2), 'The fixed first digit contributes to the minimum level 2').toBeGreaterThan(30);
    }
  }
});

test('an off-lens enclosure cannot paint an escaping difference point as captured', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: Math.min(page.viewportSize().width, 640), height: 520 });
  // For E(3+3i,3), z=1/4+i/20 is excluded after the first inverse step.
  // The historical off-lens rectangle nevertheless contained it. The
  // displayed difference attractor is at half scale, so inspect z/2.
  await page.goto('/#n=2&cx=3&cy=3&dcx=.125&dcy=.025&dz=.3&focus=dynamical&mode=difference&layers=1000000&backend=cpu&k=12');
  const canvas = page.locator('#dynamical-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const [color] = await canvasColors(page, '#dynamical-canvas', [{ x: 0.125, y: 0.025 }], {
    spanX: 0.3, center: { x: 0.125, y: 0.025 },
  });
  expect(Math.min(...color.rgb), 'The independently escaping point is white exterior').toBeGreaterThan(245);
  const record = await readRecord(page);
  expect(record.trap).toBeNull();
  await page.locator('#btn-close-controls').click();
  await page.screenshot({ path: testInfo.outputPath('off-lens-rectangle-is-not-a-trap.png') });
});

test('independent aggregates and digit subsets survive sharing, export and arity changes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: page.viewportSize().width, height: 520 });
  await open(page, '#n=3&cx=1.2&cy=.9&focus=parameter&pcx=1.2&pcy=.9&pz=.02&layers=0000000&backend=cpu&pl=mn0,mn1&pd=-2,0,2');
  for (const layer of ['mn0', 'mn1']) await expect(page.locator(`#btn-locus-${layer}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-locus-mn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-parameter-digit]')).toHaveCount(5);
  for (const digit of [-2, 0, 2]) await expect(page.locator(`[data-parameter-digit="${digit}"]`)).toBeChecked();
  const keyboardDigit = await reveal(page, '[data-parameter-digit="-1"]');
  await keyboardDigit.focus();
  await keyboardDigit.press('Space');
  await expect(keyboardDigit).toBeChecked();
  await (await reveal(page, '[data-parameter-digit="2"]')).uncheck();
  await expectInsideViewport(page, '#parameter-digit-settings .parameter-digit-card');
  await page.screenshot({ path: testInfo.outputPath('independent-first-digit-controls.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#parameter-digit-settings')).not.toHaveAttribute('open');
  await page.locator('#btn-locus-compare').click();
  for (const layer of ['mn', 'mn0', 'mn1']) await expect(page.locator(`#btn-locus-${layer}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-parameter-digit="-1"]')).toBeChecked();
  await expect(page.locator('[data-parameter-digit="2"]')).not.toBeChecked();
  await page.locator('#btn-locus-mn').click();
  await expect(page.locator('#btn-locus-mn0')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-locus-mn1')).toHaveAttribute('aria-pressed', 'true');

  const url = await shareUrl(page);
  const hash = new URLSearchParams(new URL(url).hash.slice(1));
  expect(hash.get('pl')).toBe('mn0,mn1');
  expect(hash.get('pd')).toBe('-2,-1,0');
  expect(hash.get('pm')).toBe('compare');
  await page.goto('/');
  await page.goto(url);
  const record = await readRecord(page);
  expect(record.parameter_view.layers).toEqual(['mn0', 'mn1']);
  expect(record.parameter_view.digits).toEqual([-2, -1, 0]);
  expect(record.parameter_view.search_record_set).toBe('M_n');
  await page.locator('#btn-close-controls').click();
  for (const digit of [-2, -1, 0]) await expect(page.locator(`[data-parameter-digit="${digit}"]`)).toBeChecked();
  await (await reveal(page, '#btn-digits-all')).click();
  await expect(page.locator('[data-parameter-digit]:checked')).toHaveCount(5);
  await page.locator('#btn-view-dyn').click();
  await expect(page.locator('#parameter-digit-settings')).not.toHaveAttribute('open');
  await expect(page.locator('#dynamical-panel')).toBeVisible();
  await expect(page.locator('#parameter-panel')).not.toBeVisible();
  await page.keyboard.press('Escape');
  // With the hidden popup closed, Escape retains its existing workspace
  // shortcut and restores both panels rather than focusing an invisible control.
  await expect(page.locator('#parameter-panel')).toBeVisible();
  await expect(page.locator('#dynamical-panel')).toBeVisible();
  await page.locator('#btn-view-param').click();
  await (await reveal(page, '#btn-digits-none')).click();
  await expect(page.locator('[data-parameter-digit]:checked')).toHaveCount(0);
  await expect(page.locator('#btn-locus-mn0')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-locus-mn1')).toHaveAttribute('aria-pressed', 'true');
  await (await reveal(page, '[data-parameter-digit="0"]')).check();
  await page.keyboard.press('Escape');
  await fillNumber(page, '#quick-arity', 2);
  await expect(page.locator('[data-parameter-digit]')).toHaveCount(3);
  await expect(page.locator('[data-parameter-digit="0"]')).toBeChecked();
  const resized = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(resized.get('pl')).toBe('mn0,mn1');
  expect(resized.get('pd')).toBe('0');
  await setParameterLayers(page, []);
  await (await reveal(page, '[data-parameter-digit="0"]')).uncheck();
  await page.keyboard.press('Escape');
  const emptyUrl = await shareUrl(page);
  const empty = new URLSearchParams(new URL(emptyUrl).hash.slice(1));
  expect(empty.get('pl')).toBe('');
  expect(empty.get('pd')).toBe('');
  await page.goto(emptyUrl);
  for (const layer of ['mn', 'mn0', 'mn1']) await expect(page.locator(`#btn-locus-${layer}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-parameter-digit]:checked')).toHaveCount(0);
});

test('parameter cells retain a proven boundary between pixel centers without filling nearby exterior', async ({ page }, testInfo) => {
  // At n=4, digit 3 followed forever by -3 gives c=3-3/(c-1),
  // so c*=2+i√2 belongs to F_(4,3). This lies outside the original trap lens.
  // The chosen pixel center c*+.002 escapes under point sampling; its footprint
  // still contains c*. A point-cloud renderer loses this exact boundary point.
  await page.setViewportSize({ width: page.viewportSize().width, height: 520 });
  await open(page, '#n=4&cx=1.2&cy=.9&focus=parameter&layers=0000000&backend=cpu&pl=&pd=3&bdepth=32&badapt=0');
  const canvas = page.locator('#parameter-canvas');
  const dimensions = await canvas.evaluate(element => ({ width: element.width, height: element.height }));
  const step = 0.003 * Math.SQRT2;
  const pixel = { x: Math.floor(dimensions.width / 2), y: Math.floor(dimensions.height / 2) };
  const hash = new URLSearchParams({
    n: '4', cx: '1.2', cy: '.9', focus: 'parameter', layers: '0000000', backend: 'cpu',
    pl: '', pd: '3', bdepth: '32', badapt: '0',
    pcx: String(2.002 - (pixel.x + 0.5 - dimensions.width / 2) * step),
    pcy: String(Math.SQRT2 + (pixel.y + 0.5 - dimensions.height / 2) * step),
    pz: String(dimensions.width * step),
  });
  await page.goto(`/#${hash}`);
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const pixels = await canvas.evaluate((element, pixel) => {
    const context = element.getContext('2d');
    const sample = offset => Array.from(context.getImageData(pixel.x + offset, pixel.y, 1, 1).data);
    return { boundary: sample(0), exterior: sample(4) };
  }, pixel);
  expect(Math.min(...pixels.boundary.slice(0, 3)), 'The pixel containing the explicit infinite address remains visible').toBeLessThan(220);
  expect(Math.min(...pixels.exterior.slice(0, 3)), 'A nearby pruned exterior pixel remains white').toBeGreaterThan(245);
  const record = await readRecord(page);
  expect(record.parameter_view.layers).toEqual([]);
  expect(record.parameter_view.digits).toEqual([3]);
  expect(record.parameter_view.raster_sampling).toBe('parameter-cell');
  expect(record.parameter_view.selected_point_sampling).toBe('point');
  expect(record.parameter_view.raster_parameter_radius).toBeCloseTo(0.003, 12);
  await page.locator('#btn-close-controls').click();
  await page.screenshot({ path: testInfo.outputPath('parameter-cell-proven-boundary.png') });
});

test('all 199 digit controls stay reachable without overflowing the viewport', async ({ page }, testInfo) => {
  await open(page, '#n=100&cx=100&cy=100&focus=parameter&pcx=100&pcy=100&pz=.1&layers=0000000&backend=cpu&pl=&pd=');
  await expect(page.locator('[data-parameter-digit]')).toHaveCount(199);
  await (await reveal(page, '[data-parameter-digit="98"]')).check();
  await expect(page.locator('[data-parameter-digit="98"]')).toBeChecked();
  await expect(page.locator('[data-parameter-digit]:checked')).toHaveCount(1);
  await expect(page.locator('#parameter-digit-count')).toHaveText('1/199');
  await expectInsideViewport(page, '#parameter-digit-settings .parameter-digit-card');
  await expectInsideViewport(page, '[data-parameter-digit="98"]');
  const focusedCard = await page.locator('#parameter-digit-settings .parameter-digit-card').boundingBox();
  const focusedPanel = await page.locator('#parameter-panel').boundingBox();
  expect(focusedCard.y + focusedCard.height, 'The scrollable popup ends above the plot boundary and status bar').toBeLessThanOrEqual(focusedPanel.y + focusedPanel.height + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, 'The longest digit alphabet does not create horizontal page scrolling').toBe(false);
  await page.screenshot({ path: testInfo.outputPath('maximum-arity-digit-controls.png') });
  await page.keyboard.press('Escape');
  const hash = new URLSearchParams(new URL(await shareUrl(page)).hash.slice(1));
  expect(hash.get('pl')).toBe('');
  expect(hash.get('pd')).toBe('98');
  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator('#btn-view-split').click();
  await reveal(page, '[data-parameter-digit="98"]');
  await expectInsideViewport(page, '#parameter-digit-settings .parameter-digit-card');
  const card = await page.locator('#parameter-digit-settings .parameter-digit-card').boundingBox();
  const panel = await page.locator('#parameter-panel').boundingBox();
  expect(card.x + card.width, 'Tablet digit controls fit their half of the split workspace').toBeLessThanOrEqual(panel.x + panel.width + 1);
  expect(card.y + card.height, 'The tablet panel does not clip the bottom of its popup').toBeLessThanOrEqual(panel.y + panel.height + 1);
  await page.screenshot({ path: testInfo.outputPath('maximum-arity-tablet-split.png') });
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
  await expect(page.locator('#original-attractor-opacity')).toHaveValue('100');
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
  await expect(page.locator('#stat-verdict')).toHaveText('Undetermined');
  const record = await readRecord(page);
  expect(record.n).toBe(3);
  expect(record.N).toBe(5);
  expect(record.input_parameter).toEqual({ re: 1.419643377607, im: 0.606290729207 });
  // This archived preset lies outside the canonical self-covering lens.
  // Its historical off-lens heuristic hit is no longer exposed as a capture.
  expect(record.word).toEqual([]);
  expect(record.stop_reason).toBe('node-cap');
  expect(record.proof_status).toBe('bounded-search-undetermined');
  expect(record.trap).toBeNull();
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
  for (const [id, color] of [['palette-interior', '#13579b'], ['palette-undetermined', '#2468ac']]) {
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
  expect(hash.get('cu')).toBe('#2468ac');

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
  await expect(page.locator('#palette-undetermined')).toHaveValue('#2468ac');
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
