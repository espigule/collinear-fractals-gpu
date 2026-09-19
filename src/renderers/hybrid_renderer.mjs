import { createWebGLPreview } from './webgl_preview.mjs';
import { createRasterWorkerPool } from '../compute/raster_worker_pool.mjs';
import {
  PIECE_COLORS, PIECE_OUTLINE_COLOR, hexToRgb, parameterLayerColor, parameterLayerKeys
} from './palettes.mjs';

const TABLE_WIDTH = 101;
const TEAL = [50, 138, 148];
const DEFAULT_PIECE_COLORS = Uint8Array.from(PIECE_COLORS.flatMap(value => {
  const { r, g, b } = hexToRgb(value); return [r, g, b];
}));

/**
 * A separate mask for every first-level piece keeps edges inside overlaps.
 * The one-cell halo comes from the same search as the tile and prevents seams
 * or spurious outlines at the viewport boundary. Capped neighbors are unknown,
 * never exterior evidence for an outline.
 */
function pieceMaskSampler(tile, job, pixelCount, pieceColors, pieceCount) {
  const masks = tile?.pieceMasks;
  const uncertain = tile?.pieceUncertainMasks;
  if (!(masks instanceof Uint32Array) || !pieceCount || tile.width * tile.height !== pixelCount) return null;
  const words = Math.ceil(job.n / 32);
  const stride = tile.width + 2;
  const required = stride * (tile.height + 2) * words;
  if (masks.length !== required || (uncertain && uncertain.length !== required)) return null;
  return index => {
    const x = index % tile.width, y = Math.floor(index / tile.width);
    const center = ((y + 1) * stride + x + 1) * words;
    const neighbors = [center - words, center + words, center - stride * words, center + stride * words];
    let r = 0, g = 0, b = 0, count = 0, outline = false;
    for (let word = 0; word < words; word++) {
      let occupied = masks[center + word];
      if (!occupied) continue;
      for (const neighbor of neighbors) {
        if (occupied & ~masks[neighbor + word] & ~(uncertain?.[neighbor + word] ?? 0)) outline = true;
      }
      while (occupied) {
        const bit = 31 - Math.clz32(occupied & -occupied);
        const piece = word * 32 + bit;
        if (piece < job.n) {
          const offset = (piece % pieceCount) * 3;
          r += pieceColors[offset]; g += pieceColors[offset + 1]; b += pieceColors[offset + 2]; count++;
        }
        occupied = (occupied & (occupied - 1)) >>> 0;
      }
    }
    return count ? { fill: outline ? PIECE_OUTLINE_COLOR : [r / count, g / count, b / count], outline } : null;
  };
}

function parameterLayerSampler(tile, job, colors, pixelCount, lookup) {
  const keys = parameterLayerKeys(job);
  const layers = tile?.layerData;
  if (!(layers instanceof Uint8Array) || layers.length !== pixelCount * keys.length * 2) return null;
  const palette = keys.map(key => {
    const value = hexToRgb(parameterLayerColor(key, job.n));
    return [value.r, value.g, value.b];
  });
  // Domain and arithmetic limits outrank work exhaustion when several selected
  // searches remain unresolved. A known covered layer still establishes the
  // displayed union independently of the others.
  const priorities = [0, 0, 0, 0, 1, 5, 3, 2, 4];
  return index => {
    if (!keys.length) return colors.exterior;
    let r = 0, g = 0, b = 0, covered = 0, diagnostic = 0, diagnosticDepth = 0, escapeDepth = 0;
    const start = index * keys.length * 2;
    for (let layer = 0; layer < keys.length; layer++) {
      const code = layers[start + layer * 2], depth = layers[start + layer * 2 + 1];
      if (code === 1 || code === 2 || code === 3) {
        r += palette[layer][0]; g += palette[layer][1]; b += palette[layer][2]; covered++;
      } else if (code === 0) escapeDepth = Math.max(escapeDepth, depth);
      else if ((priorities[code] ?? 0) > priorities[diagnostic]) { diagnostic = code; diagnosticDepth = depth; }
    }
    if (covered) return job.showEscapeStrata ? colors.exterior : [r / covered, g / covered, b / covered];
    const offset = lookup(diagnostic, diagnostic ? diagnosticDepth : escapeDepth);
    return [colors.table[offset], colors.table[offset + 1], colors.table[offset + 2]];
  };
}

/** Convert independent numerical result codes and coverage to the GPU palette. */
export function colorizeRasterTile(data, job, colors, pieces, tile) {
  const output = new Uint8ClampedArray(data.length);
  const lookup = (code, depth) => (Math.min(8, code) * TABLE_WIDTH + Math.min(100, depth)) * 4;
  const opacity = Math.max(0, Math.min(1, colors.survivalOpacity ?? job.survivalOpacity ?? 0.45));
  const originalOpacity = Math.max(0, Math.min(1, colors.originalOpacity ?? job.originalOpacity ?? 1));
  const pieceColors = colors.pieceColors ?? DEFAULT_PIECE_COLORS;
  const pieceCount = Math.floor(pieceColors.length / 3);
  const originalBoundary = (job.originalRenderer ?? 'boundary') === 'boundary';
  const samplePieces = job.kind === 'dynamical' && job.firstLevelPieces !== false && originalBoundary
    ? pieceMaskSampler(tile, job, data.length / 4, pieceColors, pieceCount) : null;
  const sampleLayers = job.kind === 'parameter'
    ? parameterLayerSampler(tile, job, colors, data.length / 4, lookup) : null;
  for (let i = 0; i < data.length; i += 4) {
    if (sampleLayers) {
      const [r, g, b] = sampleLayers(i / 4);
      output[i] = Math.round(r); output[i + 1] = Math.round(g); output[i + 2] = Math.round(b); output[i + 3] = 255;
      continue;
    }
    let code = data[i], depth = data[i + 1];
    const secondary = data[i + 2];
    let teal = false;
    if (job.kind === 'parameter') {
      if (code === 5 || (job.parameterMode === 'compare' && secondary === 5)) {
        code = 5; depth = 0;
      } else {
        teal = (job.parameterMode === 'rn' || job.parameterMode === 'mn0' || job.parameterMode === 'mn1') ? code === 3
          : job.parameterMode === 'compare' && (secondary === 1 || secondary === 3);
        if (job.parameterMode === 'compare' && secondary !== 0 && !teal) { code = 4; depth = 0; }
      }
    }
    const offset = lookup(code, depth);
    let r = colors.table[offset], g = colors.table[offset + 1], b = colors.table[offset + 2];
    if (teal) [r, g, b] = TEAL;
    if (job.kind === 'dynamical') {
      if (!job.showDifference) [r, g, b] = colors.exterior;
      if (job.showOriginalSurvival) {
        if (originalBoundary) {
          const mask = samplePieces?.(i / 4);
          if (mask || secondary === 1 || secondary === 3) {
            const encodedPiece = pieces?.[i / 2 + 1] ?? 0;
            const pieceOffset = ((encodedPiece - 1) % pieceCount) * 3;
            const usePiece = job.firstLevelPieces !== false && encodedPiece > 0 && pieceCount > 0;
            const fill = mask?.fill ?? (usePiece
              ? [pieceColors[pieceOffset], pieceColors[pieceOffset + 1], pieceColors[pieceOffset + 2]] : colors.branch);
            r = Math.round(r * (1 - originalOpacity) + fill[0] * originalOpacity);
            g = Math.round(g * (1 - originalOpacity) + fill[1] * originalOpacity);
            b = Math.round(b * (1 - originalOpacity) + fill[2] * originalOpacity);
          } else if (secondary !== 0 && secondary !== 5) {
            const unknown = lookup(secondary, data[i + 3]);
            r = colors.table[unknown]; g = colors.table[unknown + 1]; b = colors.table[unknown + 2];
          }
        } else if (secondary === 1 || secondary === 2 || secondary === 3 || secondary === 4 || secondary === 7) {
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
    report(run, { active_backend: 'cpu-worker', arithmetic: 'binary64', phase: 'refining',
      parameter_radius_world: run.job.kind === 'parameter'
        ? (run.job.parameterRadius ?? Math.SQRT1_2 * run.job.spanX / run.job.width) : 0,
      pixel_radius_world: run.job.kind === 'dynamical' && (run.job.originalRenderer ?? 'boundary') === 'boundary'
        ? Math.SQRT1_2 * run.job.spanX / run.job.width : 0 });
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
            const rgba = colorizeRasterTile(tile.data, job, run.colors, tile.pieces, tile);
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
        requested_limits: { depth: job.kMax, frontier: job.LMax, tolerance: job.tol,
          escape_depth: job.escapeDepth ?? (job.n === 2 ? 16 : 12), boundary_work: job.boundaryWork ?? 20000 },
        original_renderer: job.originalRenderer ?? 'boundary',
        original_sample_type: job.kind === 'dynamical' && (job.originalRenderer ?? 'boundary') === 'boundary' ? 'pixel-footprint' : 'point',
        parameter_sample_type: job.kind === 'parameter' && job.parameterRadius !== 0 ? 'parameter-cell' : 'point',
        parameter_radius_world: job.kind === 'parameter' ? (job.parameterRadius ?? Math.SQRT1_2 * job.spanX / job.width) : 0,
        parameter_layers: job.kind === 'parameter' ? parameterLayerKeys(job) : [],
        first_piece_boundaries: job.kind === 'dynamical' && job.showOriginalSurvival &&
          job.firstLevelPieces && (job.originalRenderer ?? 'boundary') === 'boundary',
        pixel_radius_world: job.kind === 'dynamical' && (job.originalRenderer ?? 'boundary') === 'boundary'
          ? Math.SQRT1_2 * job.spanX / job.width : 0 }
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
            gpu: preview.metadata,
            parameter_radius_world: preview.metadata.parameter_radius_world,
            pixel_radius_world: preview.metadata.pixel_radius_world,
            first_preview_ms: performance.now() - run.started });
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
