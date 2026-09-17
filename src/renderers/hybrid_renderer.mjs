import { createWebGLPreview } from './webgl_preview.mjs';
import { createRasterWorkerPool } from '../compute/raster_worker_pool.mjs';

const TABLE_WIDTH = 101;
const TEAL = [50, 138, 148];

/** Convert independent numerical result codes to the same palette as the GPU. */
export function colorizeRasterTile(data, job, colors) {
  const output = new Uint8ClampedArray(data.length);
  const lookup = (code, depth) => (Math.min(8, code) * TABLE_WIDTH + Math.min(100, depth)) * 4;
  const opacity = Math.max(0, Math.min(1, colors.survivalOpacity ?? job.survivalOpacity ?? 0.45));
  for (let i = 0; i < data.length; i += 4) {
    let code = data[i], depth = data[i + 1];
    const secondary = data[i + 2];
    let teal = false;
    if (job.kind === 'parameter') {
      if (code === 5 || (job.parameterMode === 'compare' && secondary === 5)) {
        code = 5; depth = 0;
      } else {
        teal = job.parameterMode === 'rn' ? code === 3 : job.parameterMode === 'compare' && secondary === 3;
        if (job.parameterMode === 'compare' && secondary !== 0 && !teal) { code = 4; depth = 0; }
      }
    }
    const offset = lookup(code, depth);
    let r = colors.table[offset], g = colors.table[offset + 1], b = colors.table[offset + 2];
    if (teal) [r, g, b] = TEAL;
    if (job.kind === 'dynamical') {
      if (!job.showDifference) [r, g, b] = colors.exterior;
      if (job.showOriginalSurvival) {
        if (secondary === 1 || secondary === 2 || secondary === 3 || secondary === 4 || secondary === 7) {
          r = Math.round(r * (1 - opacity) + colors.branch[0] * opacity);
          g = Math.round(g * (1 - opacity) + colors.branch[1] * opacity);
          b = Math.round(b * (1 - opacity) + colors.branch[2] * opacity);
        } else if (secondary === 6 || secondary === 8) {
          const unknown = lookup(secondary, data[i + 3]);
          r = colors.table[unknown]; g = colors.table[unknown + 1]; b = colors.table[unknown + 2];
        }
      }
    }
    output[i] = r; output[i + 1] = g; output[i + 2] = b; output[i + 3] = 255;
  }
  return output;
}

/** One GPU preview device and a bounded worker pool, shared by both planes. */
export function createHybridRenderer({ onStatus = () => {} } = {}) {
  const runs = new Map();
  let serial = 0, gpu, pool, disposed = false;

  function current(run) { return !disposed && runs.get(run.job.kind) === run && !run.cancelled; }
  function report(run, extra = {}) {
    if (!current(run)) return;
    run.metadata = { ...run.metadata, ...extra };
    onStatus(run.job.kind, { ...run.metadata });
  }
  function getGPU() {
    if (gpu === undefined) {
      try {
        gpu = createWebGLPreview({ onUnavailable: reason => {
          queueMicrotask(() => {
            for (const run of runs.values()) {
              if (current(run) && run.metadata.active_backend === 'webgl2' && !run.refining) {
                report(run, { fallback_reason: String(reason || 'WebGL context unavailable') });
                startCPU(run);
              }
            }
          });
        } });
      } catch (error) { gpu = { supported: false, reason: error.message }; }
    }
    return gpu;
  }
  function getPool() {
    if (!pool) pool = createRasterWorkerPool({ maxWorkers: 2 });
    return pool;
  }
  function paint(run, complete = false) {
    if (!current(run)) return;
    if (run.paintId) cancelAnimationFrame(run.paintId);
    run.paintId = null;
    run.callbacks.onFrame({ canvas: run.canvas, complete, metadata: { ...run.metadata } });
  }
  function schedulePaint(run) {
    if (!current(run) || run.paintId) return;
    run.paintId = requestAnimationFrame(() => paint(run));
  }
  function fallback(run, error) {
    if (!current(run) || run.failed) return;
    run.failed = true;
    run.refining = false;
    if (run.paintId) cancelAnimationFrame(run.paintId);
    run.paintId = null;
    report(run, {
      active_backend: 'cpu-main-thread', phase: 'refining', arithmetic: 'binary64',
      fallback_reason: [run.metadata.fallback_reason, error?.message || 'Worker rendering unavailable'].filter(Boolean).join('; ')
    });
    run.callbacks.onFallback({ ...run.metadata });
  }
  function startCPU(run) {
    if (!current(run) || run.refining || run.failed) return;
    run.refining = true;
    run.completed = false;
    report(run, { active_backend: 'cpu-worker', arithmetic: 'binary64', phase: 'refining' });
    // A small worker pass gives machines without WebGL a prompt first image.
    const coarse = !run.renderedGPU && run.job.width * run.job.height > 16384;
    const renderPass = preview => {
      if (!current(run)) return;
      const coarseWidth = Math.max(1, Math.ceil(run.job.width / 4));
      const job = preview ? {
        ...run.job,
        width: coarseWidth,
        // Cover the full requested view with square world-coordinate pixels.
        // A centered crop below removes the fractional-row overscan.
        height: Math.max(1, Math.ceil(run.job.height * coarseWidth / run.job.width))
      } : run.job;
      const target = preview ? document.createElement('canvas') : run.canvas;
      if (preview) { target.width = job.width; target.height = job.height; }
      const context = target.getContext('2d');
      if (preview) {
        context.fillStyle = `rgb(${run.colors.exterior.join(',')})`;
        context.fillRect(0, 0, target.width, target.height);
      }
      try {
        run.workerHandle = getPool().render(job, {
          onTile: tile => {
            if (!current(run)) return;
            const rgba = colorizeRasterTile(tile.data, job, run.colors);
            context.putImageData(new ImageData(rgba, tile.width, tile.height), tile.x, tile.y);
            if (preview) {
              run.context.imageSmoothingEnabled = false;
              const scaledHeight = target.height * run.canvas.width / target.width;
              run.context.drawImage(target, 0, (run.canvas.height - scaledHeight) / 2,
                run.canvas.width, scaledHeight);
            }
            run.metadata.pixels_completed = tile.pixelsCompleted;
            run.metadata.total_pixels = tile.totalPixels;
            schedulePaint(run);
          },
          onComplete: details => {
            if (!current(run)) return;
            if (preview) { paint(run); target.width = 0; target.height = 0; renderPass(false); return; }
            run.refining = false;
            run.completed = true;
            report(run, {
              phase: 'complete', active_backend: 'cpu-worker', arithmetic: 'binary64',
              worker_count: details.workerCount, refinement_ms: details.elapsedMs,
              elapsed_ms: performance.now() - run.started
            });
            paint(run, true);
          },
          onError: error => fallback(run, error)
        });
      } catch (error) { fallback(run, error); }
    };
    renderPass(coarse);
  }
  function cancel(kind) {
    const run = runs.get(kind);
    if (!run) return;
    run.cancelled = true;
    if (run.startId) cancelAnimationFrame(run.startId);
    if (run.paintId) cancelAnimationFrame(run.paintId);
    run.workerHandle?.cancel();
    run.canvas.width = 0; run.canvas.height = 0;
    runs.delete(kind);
  }
  function render(job, colors, callbacks) {
    cancel(job.kind);
    const canvas = document.createElement('canvas');
    canvas.width = job.width; canvas.height = job.height;
    const context = canvas.getContext('2d');
    context.fillStyle = `rgb(${colors.exterior.join(',')})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const run = {
      id: ++serial, job: structuredClone(job), colors, callbacks, canvas, context,
      started: performance.now(), cancelled: false, completed: false, refining: false,
      metadata: { requested_backend: job.backend, active_backend: 'initializing', phase: 'initializing',
        requested_limits: { depth: job.kMax, frontier: job.LMax, tolerance: job.tol } }
    };
    runs.set(job.kind, run);
    report(run);
    run.startId = requestAnimationFrame(() => {
      if (!current(run)) return;
      run.startId = null;
      if (job.backend !== 'cpu') {
        const device = getGPU();
        let preview;
        try { if (device.supported) preview = device.render(run.job, colors); }
        catch (error) { report(run, { fallback_reason: error.message }); }
        if (!current(run)) return;
        if (preview?.canvas) {
          // preserveDrawingBuffer=false: copy in this task, before yielding.
          context.imageSmoothingEnabled = false;
          context.drawImage(preview.canvas, 0, 0, canvas.width, canvas.height);
          run.renderedGPU = true;
          report(run, { active_backend: 'webgl2', arithmetic: 'float32-preview', phase: 'preview',
            gpu: preview.metadata, first_preview_ms: performance.now() - run.started });
          if (job.backend === 'gpu') {
            run.completed = true;
            paint(run, true);
            return;
          }
          paint(run);
        } else {
          report(run, { fallback_reason: run.metadata.fallback_reason || device.reason || 'WebGL 2 unavailable for this view' });
        }
      }
      startCPU(run);
    });
    return { id: run.id, cancel: () => { if (current(run)) cancel(job.kind); } };
  }
  function dispose() {
    for (const kind of [...runs.keys()]) cancel(kind);
    disposed = true;
    pool?.dispose(); gpu?.dispose?.();
  }
  return { render, cancel, dispose };
}
