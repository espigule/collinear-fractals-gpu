'use strict';

const { test: base, expect } = require('playwright/test');
const { CORE_GPU_FIXTURES } = require('./gpu-fixtures.cjs');
const { readFile } = require('node:fs/promises');

const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await use(page);
    expect(errors, 'The real WebGL/CPU browser path has no script or asset errors').toEqual([]);
  },
});

async function openHarness(page) {
  // Only this empty document is supplied by the test. Production modules,
  // shaders, native WebGL and Worker APIs all come from the staged deployment.
  await page.route('**/gpu-test-harness.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Production GPU regression harness</title>',
  }));
  await page.goto('/gpu-test-harness.html');
  await page.evaluate(async () => {
    const { createWebGLPreview } = await import('/src/renderers/webgl_preview.mjs');
    const { prepareRasterJob, renderRasterTile } = await import('/src/compute/raster_jobs.mjs');
    const { colorizeRasterTile } = await import('/src/renderers/hybrid_renderer.mjs');
    const table = new Uint8Array(9 * 101 * 4);
    for (let code = 0; code < 9; code++) for (let depth = 0; depth < 101; depth++) {
      table.set([19 + code * 23, 17 + depth * 2, 231 - code * 19, 255], (code * 101 + depth) * 4);
    }
    const colors = { table, branch: [23, 143, 209], exterior: [249, 247, 245], survivalOpacity: 0.45 };
    const unavailable = [];
    const device = createWebGLPreview({ onUnavailable: reason => unavailable.push(reason) });
    window.gpuTest = { device, colors, unavailable, prepareRasterJob, renderRasterTile, colorizeRasterTile };
  });
}

async function reveal(page, selector) {
  const control = page.locator(selector);
  const insideDrawer = await control.locator('xpath=ancestor::*[@id="sidebar-panel"]').count();
  const drawer = page.locator('#sidebar-panel');
  if (insideDrawer && !await drawer.isVisible()) await page.locator('#btn-toggle-controls').click();
  else if (!insideDrawer && await drawer.isVisible()) await page.locator('#btn-close-controls').click();
  for (const details of await control.locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  }
  await control.scrollIntoViewIfNeeded();
  return control;
}

async function readRecord(page) {
  const pending = page.waitForEvent('download');
  await (await reveal(page, '#btn-download-certificate')).click();
  const download = await pending;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

test('WebGL2: actual module workers refine exact CPU bytes and cancel only the replaced panel', async ({ page }) => {
  await openHarness(page);
  const workerURLs = [];
  page.on('worker', worker => workerURLs.push(worker.url()));
  const report = await page.evaluate(async baseJob => {
    const { createRasterWorkerPool } = await import('/src/compute/raster_worker_pool.mjs');
    const { prepareRasterJob, renderRasterTile } = window.gpuTest;
    const pool = createRasterWorkerPool({ maxWorkers: 2, tileWidth: 8, tileHeight: 4 });
    const replacement = { ...baseJob, n: 2, width: 9, height: 7, center: { x: 1.2, y: 0.9 }, spanX: 1.3 };
    const otherPanel = { ...baseJob, kind: 'dynamical', width: 9, height: 7, n: 4, cx: 0, cy: 2,
      spanX: 12, center: { x: 0, y: 0 }, showDifference: true, showOriginalSurvival: true };
    const results = [];
    let staleTiles = 0, staleComplete = 0, replaced = false;
    const collect = job => new Promise((resolve, reject) => {
      const output = new Uint8Array(job.width * job.height * 4);
      pool.render(job, {
        onTile(tile) {
          for (let row = 0; row < tile.height; row++) output.set(
            tile.data.subarray(row * tile.width * 4, (row + 1) * tile.width * 4),
            ((tile.y + row) * job.width + tile.x) * 4);
        },
        onComplete(metadata) {
          const expected = renderRasterTile(prepareRasterJob(job), { x: 0, y: 0, width: job.width, height: job.height }).data;
          results.push({ kind: job.kind, data: [...output], expected: [...expected], metadata }); resolve();
        }, onError: reject,
      });
    });
    let replaceFinished;
    const replacementDone = new Promise(resolve => { replaceFinished = resolve; });
    pool.render({ ...baseJob, width: 96, height: 64, n: 4, spanX: 6 }, {
      onTile() {
        if (replaced) { staleTiles++; return; }
        replaced = true;
        collect(replacement).then(replaceFinished);
      },
      onComplete() { staleComplete++; }, onError(error) { throw error; },
    });
    await Promise.all([replacementDone, collect(otherPanel)]);
    await new Promise(resolve => setTimeout(resolve, 50));
    pool.dispose();
    return { results, staleTiles, staleComplete, replaced };
  }, CORE_GPU_FIXTURES[0].job);
  expect(report.replaced).toBe(true);
  expect(report.staleTiles).toBe(0);
  expect(report.staleComplete).toBe(0);
  expect(report.results).toHaveLength(2);
  for (const result of report.results) {
    expect(result.data, `Native worker ${result.kind} bytes equal synchronous binary64 reference`).toEqual(result.expected);
    expect(result.metadata).toMatchObject({ backend: 'cpu-worker', pixelsCompleted: 63, totalPixels: 63 });
    expect(result.metadata.workerCount).toBeGreaterThanOrEqual(1);
  }
  expect(workerURLs.length).toBeGreaterThanOrEqual(2);
  expect(workerURLs.every(url => url.endsWith('/workers/raster-worker.mjs'))).toBe(true);
});

test('WebGL2: backend controls preserve scientific records and expose honest export metadata', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: page.viewportSize().width, height: 520 });
  await page.goto('/#n=2&cx=1.2&cy=.9&k=12&l=128&pcx=1.2&pcy=.9&pz=1&focus=parameter&pm=compare&backend=auto');
  const canvas = page.locator('#parameter-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(canvas).toHaveAttribute('data-render-backend', 'cpu-worker');
  const automatic = await readRecord(page);
  expect(automatic.rendering.parameter).toMatchObject({ active_backend: 'cpu-worker', arithmetic: 'binary64', phase: 'complete' });
  expect(automatic.rendering.parameter.gpu).toMatchObject({ backend: 'webgl2', arithmetic: 'float32', preview: true });
  const scientific = record => Object.fromEntries(['n', 'c', 'input_parameter', 'verdict', 'depth', 'word',
    'nodes_explored', 'stop_reason', 'arithmetic', 'proof_status', 'k_max', 'L_max'].map(key => [key, record[key]]));
  const reports = [automatic.rendering];
  for (const backend of ['gpu', 'cpu']) {
    await (await reveal(page, '#render-backend')).selectOption(backend);
    await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
    await expect(canvas).toHaveAttribute('data-render-backend', backend === 'gpu' ? 'webgl2' : 'cpu-worker');
    const record = await readRecord(page);
    expect(scientific(record), 'Selected binary64 record does not depend on display engine').toEqual(scientific(automatic));
    expect(record.rendering).toMatchObject({ requested_backend: backend, selected_record_arithmetic: 'binary64',
      selected_record_uses_full_requested_limits: true });
    expect(record.rendering.parameter.arithmetic).toBe(backend === 'gpu' ? 'float32-preview' : 'binary64');
    if (backend === 'gpu') {
      expect(record.rendering.parameter.gpu.requested).toMatchObject({ depth: 12, frontier: 128 });
      expect(record.rendering.parameter.gpu.effective).toMatchObject({ depth: 12, frontier: 32, work: 2048 });
    }
    expect(new URLSearchParams(new URL(record.share_url).hash.slice(1)).get('backend')).toBe(backend);
    reports.push(record.rendering);
  }
  await testInfo.attach('backend-export-metadata.json', { body: JSON.stringify(reports, null, 2), contentType: 'application/json' });
});

test('WebGL2: native context loss replaces a completed GPU preview with CPU refinement', async ({ page }) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    window.observedWebGLCanvases = [];
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const context = native.call(this, type, ...args);
      if (type === 'webgl2' && context && !window.observedWebGLCanvases.includes(this)) {
        window.observedWebGLCanvases.push(this);
      }
      return context;
    };
  });
  await page.setViewportSize({ width: page.viewportSize().width, height: 480 });
  await page.goto('/#n=3&cx=.5&cy=1.1&k=8&l=32&pcx=.5&pcy=1.1&pz=.5&focus=parameter&backend=gpu');
  const canvas = page.locator('#parameter-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete');
  await expect(canvas).toHaveAttribute('data-render-backend', 'webgl2');
  const before = await readRecord(page);
  await page.evaluate(() => {
    if (window.observedWebGLCanvases.length !== 1) throw new Error('Expected one shared native preview device');
    window.observedWebGLCanvases[0].getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(canvas).toHaveAttribute('data-render-backend', 'cpu-worker');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  const after = await readRecord(page);
  expect(after.rendering.parameter).toMatchObject({ phase: 'complete', arithmetic: 'binary64' });
  expect(after.rendering.parameter.fallback_reason).toMatch(/context.*lost/i);
  expect(after.verdict).toBe(before.verdict);
  expect(after.word).toEqual(before.word);
  expect(after.depth).toBe(before.depth);
  await expect(page.locator('#btn-save-image')).toBeEnabled();
});

test('CPU fallback: native worker runtime failure finishes through the main-thread renderer', async ({ page }) => {
  let workerLoads = 0;
  await page.route('**/workers/raster-worker.mjs', route => {
    workerLoads++;
    // A real module Worker is launched and raises its normal error event. This
    // models a broken cached worker module without mocking the Worker API.
    return route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("QA injected worker runtime failure");' });
  });
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto('/#n=3&cx=.5&cy=1.1&k=8&l=32&pcx=.5&pcy=1.1&pz=.5&focus=parameter&backend=auto');
  const canvas = page.locator('#parameter-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(canvas).toHaveAttribute('data-render-backend', 'cpu-main-thread');
  expect(workerLoads).toBeGreaterThan(0);
  const record = await readRecord(page);
  expect(record.rendering.parameter.fallback_reason).toMatch(/worker runtime failure/);
  await expect(page.locator('#render-backend-status')).toContainText('worker runtime failure');
  expect(record.rendering.parameter).toMatchObject({ arithmetic: 'binary64', phase: 'complete' });
  expect(record.verdict).toBe('Interior');
  await expect(page.locator('#btn-save-image')).toBeEnabled();
});

test('WebGL2: production shaders satisfy independent classifications and CPU parity', async ({ page }, testInfo) => {
  await openHarness(page);
  const report = await page.evaluate(fixtures => {
    const { device, colors, prepareRasterJob, renderRasterTile } = window.gpuTest;
    if (!device.supported) throw new Error(device.reason);
    return fixtures.map(fixture => {
      const rendered = device.render(fixture.job, colors);
      if (!rendered) throw new Error(`${fixture.name}: ${device.reason}`);
      const raw = device.readClassification();
      const cpu = renderRasterTile(prepareRasterJob(fixture.job), { x: 0, y: 0, width: 1, height: 1 });
      return { name: fixture.name, gpu: [...raw.data], cpu: [...cpu.data], metadata: rendered.metadata };
    });
  }, CORE_GPU_FIXTURES);
  await testInfo.attach('production-shader-classifications.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  for (let i = 0; i < report.length; i++) {
    const actual = report[i], fixture = CORE_GPU_FIXTURES[i];
    expect.soft(fixture.primary, `${fixture.name}: primary (${fixture.rationale})`).toContain(actual.gpu[0]);
    if (fixture.secondary) expect.soft(fixture.secondary, `${fixture.name}: secondary`).toContain(actual.gpu[2]);
    for (const channel of fixture.secondary ? [0, 2] : [0]) {
      const gpu = actual.gpu[channel], cpu = actual.cpu[channel];
      expect((gpu === 0 && [1, 2].includes(cpu)) || ([1, 2].includes(gpu) && cpu === 0),
        `${fixture.name}: no opposed decisive CPU/GPU classification`).toBe(false);
    }
    expect(actual.metadata).toMatchObject({ backend: 'webgl2', arithmetic: 'float32', preview: true });
    expect(actual.metadata.requested.depth).toBe(fixture.job.kMax);
    expect(actual.metadata.effective.frontier).toBeLessThanOrEqual(32);
  }
});

test('WebGL2: asymmetric original-attractor orientation survives canvas compositing', async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(() => {
    const { device, colors } = window.gpuTest;
    // z=3c/(c-1) is a fixed point in E(c,4); its conjugate escapes the initial
    // enclosure. These exact pixel centers distinguish a GL vertical flip.
    const job = { kind: 'dynamical', width: 1, height: 3, spanX: 54 / 17,
      center: { x: 63 / 17, y: 0 }, n: 4, cx: 1.2, cy: 0.9,
      kMax: 12, LMax: 32, tol: 1e-8, showDifference: false, showOriginalSurvival: true };
    const rendered = device.render(job, { ...colors, survivalOpacity: 1 });
    if (!rendered) throw new Error(device.reason);
    const copy = document.createElement('canvas'); copy.width = 1; copy.height = 3;
    const context = copy.getContext('2d'); context.drawImage(rendered.canvas, 0, 0);
    return { raw: [...device.readClassification().data], display: [...context.getImageData(0, 0, 1, 3).data],
      exterior: colors.exterior };
  });
  expect([3, 4, 7, 8]).toContain(result.raw[2]); // bottom row: actual fixed point
  expect(result.raw[10]).toBe(0); // top row: conjugate escapes
  expect(result.display.slice(0, 3)).toEqual(result.exterior); // Canvas y points down
  expect(result.display.slice(8, 11)).not.toEqual(result.exterior);
  expect(result.display.filter((_, index) => index % 4 === 3)).toEqual([255, 255, 255]);
});

test('WebGL2: complete pixel grids have no opposed CPU decisions and share palette compositing', async ({ page }, testInfo) => {
  await openHarness(page);
  const report = await page.evaluate(baseJob => {
    const { device, colors, prepareRasterJob, renderRasterTile, colorizeRasterTile } = window.gpuTest;
    const jobs = [2, 4, 13].flatMap(n => ['mn', 'rn', 'compare'].map(parameterMode => ({
      ...baseJob, n, parameterMode, width: 12, height: 12, spanX: 8, center: { x: 0.13, y: 0.17 },
    })));
    const dynamics = { ...baseJob, kind: 'dynamical', n: 4, cx: 0, cy: 2, width: 17, height: 13,
      spanX: 12, center: { x: 0, y: 0 }, showDifference: true, showOriginalSurvival: true };
    jobs.push(dynamics, { ...dynamics, survivalOpacity: 0.3, opacityFromJob: true },
      { ...dynamics, showDifference: false }, { ...dynamics, showOriginalSurvival: false });
    return jobs.map(job => {
      const jobColors = { ...colors };
      if (job.opacityFromJob) delete jobColors.survivalOpacity;
      const rendered = device.render(job, jobColors);
      if (!rendered) throw new Error(device.reason);
      const copy = document.createElement('canvas'); copy.width = job.width; copy.height = job.height;
      const context = copy.getContext('2d'); context.drawImage(rendered.canvas, 0, 0);
      const display = context.getImageData(0, 0, job.width, job.height).data;
      const raw = device.readClassification();
      const topDown = new Uint8Array(raw.data.length);
      for (let row = 0; row < job.height; row++) {
        topDown.set(raw.data.subarray((job.height - row - 1) * job.width * 4,
          (job.height - row) * job.width * 4), row * job.width * 4);
      }
      const cpu = renderRasterTile(prepareRasterJob(job), { x: 0, y: 0, width: job.width, height: job.height }).data;
      const expectedDisplay = colorizeRasterTile(topDown, job, jobColors);
      const opposed = [], invalidCodes = [], paletteDifferences = [];
      let decisive = 0, channels = 0;
      for (let offset = 0; offset < raw.data.length; offset += 4) {
        const channelsToCompare = job.kind === 'dynamical'
          ? [job.showDifference ? 0 : null, job.showOriginalSurvival ? 2 : null].filter(value => value !== null)
          : job.parameterMode === 'compare' ? [0, 2] : [0];
        for (const channel of channelsToCompare) {
          const gpuCode = topDown[offset + channel], cpuCode = cpu[offset + channel];
          channels++;
          if (gpuCode < 3) decisive++;
          if (gpuCode > 8) invalidCodes.push({ offset, channel, gpuCode });
          if ((gpuCode === 0 && [1, 2].includes(cpuCode)) || ([1, 2].includes(gpuCode) && cpuCode === 0)) {
            opposed.push({ pixel: offset / 4, channel, gpu: [...topDown.slice(offset, offset + 4)], cpu: [...cpu.slice(offset, offset + 4)] });
          }
        }
        // Classification bytes above are exact. Only display quantization may
        // differ by one byte across native GL/Canvas color conversion paths.
        if ([0, 1, 2, 3].some(channel => Math.abs(display[offset + channel] - expectedDisplay[offset + channel]) > 1)) {
          paletteDifferences.push({ pixel: offset / 4, codes: [...topDown.slice(offset, offset + 4)],
            gl: [...display.slice(offset, offset + 4)], cpuPalette: [...expectedDisplay.slice(offset, offset + 4)] });
        }
      }
      return { kind: job.kind, n: job.n, parameterMode: job.parameterMode, channels, decisive,
        opposed, invalidCodes, paletteDifferences: paletteDifferences.slice(0, 10), paletteDifferenceCount: paletteDifferences.length };
    });
  }, CORE_GPU_FIXTURES[0].job);
  await testInfo.attach('pixel-grid-parity.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  for (const grid of report) {
    expect.soft(grid.opposed, JSON.stringify({ kind: grid.kind, n: grid.n, mode: grid.parameterMode })).toEqual([]);
    expect(grid.invalidCodes).toEqual([]);
    expect(grid.decisive, 'The GPU meaningfully classifies the grid rather than returning all uncertainty').toBeGreaterThan(grid.channels * 0.2);
    expect.soft(grid.paletteDifferences, `GPU and CPU palette compositing for ${grid.kind}/${grid.parameterMode}`).toEqual([]);
  }
});

test('WebGL2: precision and resource guards preserve CPU fallback and requested budgets', async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(job => {
    const { device, colors } = window.gpuTest;
    const rejected = [
      { ...job, width: 1024, spanX: 1e-6, center: { x: 1.2, y: 0.9 } },
      { ...job, n: 33 },
      { ...job, kind: 'dynamical', cx: 2, cy: 1e-10 },
      { ...job, kind: 'dynamical', cx: 1.00005, cy: 0.00001 },
      { ...job, kind: 'dynamical', cx: 0, cy: 5e-324 },
    ].map(candidate => ({ rendered: Boolean(device.render(candidate, colors)), reason: device.reason,
      raw: device.readClassification(), supported: device.supported }));
    const rendered = device.render({ ...job, kMax: 100, LMax: 10000 }, colors);
    return { rejected, metadata: rendered?.metadata, reason: device.reason, raw: [...device.readClassification().data] };
  }, CORE_GPU_FIXTURES[0].job);
  for (const candidate of result.rejected) {
    expect(candidate.rendered).toBe(false);
    expect(candidate.raw).toBeNull();
    expect(candidate.supported).toBe(true); // an ineligible view does not destroy the device
    expect(candidate.reason.length).toBeGreaterThan(10);
  }
  expect(result.metadata.requested).toEqual({ depth: 100, frontier: 10000, tolerance: 1e-8 });
  expect(result.metadata.effective).toMatchObject({ depth: 64, frontier: 32, work: 2048, tail: 48 });
  expect(result.raw[0]).toBe(1);
});

test('WebGL2: production device recovers native context loss and disposes idempotently', async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(async job => {
    const { device, colors, unavailable } = window.gpuTest;
    const before = device.render(job, colors);
    const beforeBytes = [...device.readClassification().data];
    const gl = device.canvas.getContext('webgl2');
    const extension = gl.getExtension('WEBGL_lose_context');
    const lostEvent = new Promise(resolve => device.canvas.addEventListener('webglcontextlost', resolve, { once: true }));
    extension.loseContext();
    await lostEvent;
    const during = { supported: device.supported, render: device.render(job, colors), read: device.readClassification(), reason: device.reason };
    await new Promise(resolve => setTimeout(resolve, 0));
    const restoredEvent = new Promise(resolve => device.canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    extension.restoreContext(); await restoredEvent;
    const after = device.render(job, colors);
    const afterBytes = [...device.readClassification().data];
    device.dispose(); device.dispose();
    return { beforeBytes, afterBytes, during, beforeGeneration: before.metadata.generation,
      afterGeneration: after.metadata.generation, unavailable, disposed: {
        supported: device.supported, render: device.render(job, colors), read: device.readClassification() } };
  }, CORE_GPU_FIXTURES[2].job);
  expect([2, 8]).toContain(result.beforeBytes[0]);
  expect(result.beforeBytes.slice(2)).toEqual([0, 2]);
  expect(result.afterBytes).toEqual(result.beforeBytes);
  expect(result.during).toMatchObject({ supported: false, render: null, read: null });
  expect(result.during.reason).toMatch(/context.*lost/i);
  expect(result.unavailable).toHaveLength(1);
  expect(result.afterGeneration).toBeGreaterThan(result.beforeGeneration);
  expect(result.disposed).toEqual({ supported: false, render: null, read: null });
});

test('WebGL2: native GLSL compilation, readback and loss/restoration are available', async ({ page }, testInfo) => {
  const report = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 48;
    document.body.append(canvas);
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('The explicit SwiftShader test profile must provide WebGL2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const metadata = {
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      precision: { bits: precision.precision, rangeMin: precision.rangeMin, rangeMax: precision.rangeMax },
    };
    function draw() {
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
        void main() {
          vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
          gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }`);
      const fragment = compile(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float;
        out vec4 color;
        void main() {
          vec2 z = (gl_FragCoord.xy / vec2(96.0, 48.0) - 0.5) * vec2(12.0, 6.0);
          bool inside = abs(z.x) <= 4.0 && abs(z.y) <= 2.0;
          color = inside ? vec4(0.25, 0.5, 0.75, 1.0) : vec4(1.0);
        }`);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.bindVertexArray(gl.createVertexArray());
      gl.disable(gl.DITHER);
      gl.viewport(0, 0, 96, 48);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = [[3, 0.75], [-3, 0.75], [4.25, 0.75], [0.75, 2.25]].map(([x, y]) => {
        const rgba = new Uint8Array(4);
        gl.readPixels(Math.floor((x + 6) * 8), Math.floor((y + 3) * 8), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        return [...rgba];
      });
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`WebGL error after draw/readback: ${error}`);
      return pixels;
    }
    metadata.firstDraw = draw();
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Native context-loss extension is required by this test profile');
    const lost = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Context-loss event missing')), 5000);
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        clearTimeout(timeout);
        resolve(gl.isContextLost());
      }, { once: true });
    });
    extension.loseContext();
    metadata.lost = await lost;
    // The browser must finish dispatching the loss event before restoreContext
    // is allowed. A microtask continuation alone is too early in Chromium.
    await new Promise(resolve => setTimeout(resolve, 0));
    const restored = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Context-restored event missing')), 5000);
      canvas.addEventListener('webglcontextrestored', () => {
        clearTimeout(timeout);
        resolve(!gl.isContextLost());
      }, { once: true });
    });
    extension.restoreContext();
    metadata.restored = await restored;
    // All GL resources were invalidated: this creates and compiles new shaders.
    metadata.afterRestore = draw();
    return metadata;
  });
  expect(report.renderer).toMatch(/SwiftShader/i);
  expect(report.precision.bits).toBeGreaterThanOrEqual(23);
  expect(report.lost).toBe(true);
  expect(report.restored).toBe(true);
  const expected = [[64, 128, 191, 255], [64, 128, 191, 255], [255, 255, 255, 255], [255, 255, 255, 255]];
  for (const result of [report.firstDraw, report.afterRestore]) {
    for (let pixel = 0; pixel < expected.length; pixel++) {
      for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(result[pixel][channel] - expected[pixel][channel])).toBeLessThanOrEqual(1);
      }
    }
  }
  await testInfo.attach('software-webgl-capabilities.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});

test('CPU fallback: disabled native WebGL preserves original-attractor geometry', async ({ page }) => {
  await page.goto('/#n=4&cx=0&cy=2&k=8&l=32&dcx=0&dcy=0&dz=12&focus=dynamical&mode=collinear&layers=0100000&renderer=survival&pieces=0&sop=1&backend=auto');
  const availability = await page.evaluate(() => ({
    webgl2: Boolean(document.createElement('canvas').getContext('webgl2')),
    webgl1: Boolean(document.createElement('canvas').getContext('webgl')),
  }));
  expect(availability).toEqual({ webgl2: false, webgl1: false });
  const canvas = page.locator('#dynamical-canvas');
  await expect(canvas).toHaveAttribute('data-render-state', 'complete', { timeout: 30000 });
  await expect(canvas).toHaveAttribute('data-render-backend', 'cpu-worker');
  const patches = await canvas.evaluate(element => {
    const context = element.getContext('2d');
    const scale = element.width / 12;
    return [3, -3, 4.25].map(x => {
      const sx = Math.round(element.width / 2 + x * scale);
      const sy = Math.round(element.height / 2 - 0.7 * scale);
      const data = context.getImageData(sx - 2, sy - 2, 5, 5).data;
      let marked = 0;
      for (let i = 0; i < data.length; i += 4) if (Math.min(data[i], data[i + 1], data[i + 2]) < 220) marked++;
      return marked / 25;
    });
  });
  expect(patches[0]).toBeGreaterThan(0.05);
  expect(patches[1]).toBeGreaterThan(0.05);
  expect(patches[2]).toBe(0);
  const record = await readRecord(page);
  expect(record.rendering.dynamical.fallback_reason).toMatch(/WebGL2.*unavailable/i);
  await expect(page.locator('#render-backend-status')).toContainText('WebGL2 is unavailable');
  expect(record.rendering.dynamical.arithmetic).toBe('binary64');
  await expect(page.locator('#btn-save-image')).toBeEnabled();
});
