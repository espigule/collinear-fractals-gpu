import { MAX_RASTER_TILE_PIXELS, normalizeRasterJob } from './raster_jobs.mjs';
import { assertInteger, assertPositiveNumber } from '../math/validation.mjs';

const now = () => globalThis.performance?.now() ?? Date.now();
const asError = value => value instanceof Error ? value : new Error(String(value));

/**
 * Bounded CPU raster refinement. Each render replaces only its own panel kind;
 * a returned handle cancels that job alone. Cancellation terminates the busy
 * worker immediately, since a synchronous numerical tile cannot process an
 * abort message. The other panel and idle workers remain available.
 *
 * onTile receives {jobId,x,y,width,height,data,pieces?,pixelsCompleted,totalPixels}.
 * Four Uint8 bytes per pixel encode primary code/depth, secondary code/depth.
 * Optional two-byte piece records encode primary/secondary index+1, or zero.
 * onComplete includes tile/pixel counts, elapsedMs, workerCount and backend.
 * onError(Error,{jobId,backend}) is asynchronous, including unsupported starts.
 * No frame buffers or unbounded pending tile queues are held by the pool.
 * workerFactory/hardwareConcurrency/timeoutMs permit deterministic host tests.
 */
export function createRasterWorkerPool(options = {}) {
  const hardware = options.hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency ?? 4;
  const available = Number.isFinite(hardware) ? Math.max(1, Math.floor(hardware) - 1) : 2;
  const requested = options.maxWorkers ?? 2;
  assertInteger(requested, 'maxWorkers', 1);
  const workerLimit = Math.min(4, available, requested);
  const tileWidth = options.tileWidth ?? 64;
  const tileHeight = options.tileHeight ?? 16;
  assertInteger(tileWidth, 'tileWidth', 1, MAX_RASTER_TILE_PIXELS);
  assertInteger(tileHeight, 'tileHeight', 1, MAX_RASTER_TILE_PIXELS);
  if (tileWidth * tileHeight > MAX_RASTER_TILE_PIXELS) throw new RangeError('raster tile is too large');
  const timeoutMs = options.timeoutMs ?? 30000;
  assertPositiveNumber(timeoutMs, 'timeoutMs');
  if (timeoutMs > 2147483647) throw new RangeError('timeoutMs exceeds the timer range');
  const WorkerClass = globalThis.Worker;
  const factory = options.workerFactory ?? (typeof WorkerClass === 'function'
    ? (url, config) => new WorkerClass(url, config) : null);
  if (factory !== null && typeof factory !== 'function') throw new TypeError('workerFactory must be a function');
  const workerUrl = new URL('../../workers/raster-worker.mjs', import.meta.url);
  const slots = Array.from({ length: workerLimit }, (_, index) => ({
    index, worker: null, pending: null, timer: null, listeners: null
  }));
  const jobs = new Map();
  const panels = new Map();
  let disposed = false;
  let failure = null;
  let nextJobId = 1;
  let lastScheduledId = 0;
  let pumpQueued = false;

  const supported = () => Boolean(factory) && !disposed && !failure;

  function notifyError(job, error) {
    queueMicrotask(() => {
      if (job.cancelled) return;
      // One observer must not prevent another panel from receiving fallback.
      try { job.callbacks.onError?.(asError(error), { jobId: job.id, backend: 'cpu-worker' }); }
      catch { /* Errors thrown by observers do not strand pool resources. */ }
    });
  }

  function clearPending(slot) {
    if (slot.timer !== null) clearTimeout(slot.timer);
    slot.timer = null;
    slot.pending = null;
  }

  function stopWorker(slot) {
    const worker = slot.worker;
    // Invalidate first, so events already queued from this worker are stale.
    slot.worker = null;
    clearPending(slot);
    if (!worker) return;
    for (const [type, listener] of Object.entries(slot.listeners || {})) {
      try { worker.removeEventListener(type, listener); } catch { /* Best effort cleanup. */ }
    }
    slot.listeners = null;
    try { worker.terminate(); } catch { /* Already gone. */ }
  }

  function removeJob(job) {
    jobs.delete(job.id);
    if (panels.get(job.job?.kind) === job) panels.delete(job.job.kind);
    job.finished = true;
  }

  function cancelJob(job) {
    if (job.cancelled) return;
    job.cancelled = true;
    removeJob(job);
    for (const slot of slots) {
      if (slot.pending?.job === job) stopWorker(slot);
    }
    requestPump();
  }

  function failPool(error) {
    if (failure || disposed) return;
    failure = asError(error);
    const active = [...jobs.values()];
    for (const slot of slots) stopWorker(slot);
    for (const job of active) {
      removeJob(job);
      notifyError(job, failure);
    }
  }

  function complete(job) {
    removeJob(job);
    const metadata = {
      jobId: job.id, tilesCompleted: job.tilesCompleted, totalTiles: job.totalTiles,
      pixelsCompleted: job.pixelsCompleted, totalPixels: job.totalPixels,
      elapsedMs: Math.max(0, now() - job.started), workerCount: job.workersUsed.size,
      backend: 'cpu-worker'
    };
    try { job.callbacks.onComplete?.(metadata); }
    catch (error) { notifyError(job, error); }
  }

  function receive(slot, worker, message) {
    if (slot.worker !== worker || !slot.pending || disposed || failure) return;
    const { job, tile, tileId } = slot.pending;
    if (!message || typeof message !== 'object') {
      failPool(new Error('Raster worker returned an invalid message'));
      return;
    }
    // Includes delayed duplicates and errors from a superseded generation.
    if (message.jobId !== job.id || message.tileId !== tileId) return;
    if (message.type === 'error') {
      const error = new Error(message.message || 'Raster worker failed');
      error.name = typeof message.name === 'string' ? message.name : 'Error';
      failPool(error);
      return;
    }
    const layerBytes = 2 * (job.job.parameterLayers.length + job.job.parameterDigits.length) * tile.width * tile.height;
    const maskLength = (tile.width + 2) * (tile.height + 2) * Math.ceil(job.job.n / 32);
    if (message.type !== 'tile' || !(message.data instanceof Uint8Array) ||
        message.data.byteLength !== 4 * tile.width * tile.height ||
        (message.pieces !== undefined && (!(message.pieces instanceof Uint8Array) ||
          message.pieces.byteLength !== 2 * tile.width * tile.height)) ||
        (message.layerData !== undefined && (!(message.layerData instanceof Uint8Array) || message.layerData.byteLength !== layerBytes)) ||
        ['pieceMasks', 'pieceUncertainMasks'].some(key => message[key] !== undefined &&
          (!(message[key] instanceof Uint32Array) || message[key].length !== maskLength)) ||
        ['x', 'y', 'width', 'height'].some(key => message[key] !== tile[key])) {
      failPool(new Error('Raster worker returned a malformed tile'));
      return;
    }
    clearPending(slot);
    if (job.cancelled || jobs.get(job.id) !== job) { requestPump(); return; }
    job.tilesCompleted++;
    job.pixelsCompleted += tile.width * tile.height;
    try {
      job.callbacks.onTile?.({
        jobId: job.id, ...tile, data: message.data,
        ...(message.pieces === undefined ? {} : { pieces: message.pieces }),
        ...Object.fromEntries(['layerData', 'pieceMasks', 'pieceUncertainMasks']
          .filter(key => message[key] !== undefined).map(key => [key, message[key]])),
        pixelsCompleted: job.pixelsCompleted, totalPixels: job.totalPixels
      });
    } catch (error) {
      // A failed compositor cancels only that panel, not the numerical backend.
      removeJob(job);
      for (const other of slots) if (other.pending?.job === job) stopWorker(other);
      notifyError(job, error);
    }
    if (jobs.get(job.id) === job && job.tilesCompleted === job.totalTiles) complete(job);
    requestPump();
  }

  function ensureWorker(slot) {
    if (slot.worker) return slot.worker;
    const worker = factory(workerUrl, { type: 'module', name: `collinear-raster-${slot.index + 1}` });
    if (!worker || !['postMessage', 'terminate', 'addEventListener', 'removeEventListener']
      .every(key => typeof worker[key] === 'function')) {
      try { worker?.terminate?.(); } catch { /* Invalid factory result. */ }
      throw new TypeError('workerFactory must return a Worker-compatible object');
    }
    slot.worker = worker;
    const onError = event => {
      if (slot.worker !== worker || disposed || failure) return;
      event.preventDefault?.();
      failPool(event.error instanceof Error ? event.error : new Error(event.message || 'Raster worker could not load or execute'));
    };
    slot.listeners = {
      message: event => receive(slot, worker, event.data),
      error: onError,
      messageerror: () => {
        if (slot.worker === worker) failPool(new Error('Raster worker message could not be decoded'));
      }
    };
    for (const [type, listener] of Object.entries(slot.listeners)) worker.addEventListener(type, listener);
    return worker;
  }

  function nextJob() {
    const eligible = [...jobs.values()].filter(job => job.nextTile < job.totalTiles);
    if (!eligible.length) return null;
    const job = eligible.find(value => value.id > lastScheduledId) || eligible[0];
    lastScheduledId = job.id;
    return job;
  }

  function pump() {
    if (!supported()) return;
    for (const slot of slots) {
      if (slot.pending) continue;
      const job = nextJob();
      if (!job) break;
      try {
        const worker = ensureWorker(slot);
        const tileId = job.nextTile++;
        const x = (tileId % job.columns) * tileWidth;
        const y = Math.floor(tileId / job.columns) * tileHeight;
        const tile = {
          x, y, width: Math.min(tileWidth, job.job.width - x),
          height: Math.min(tileHeight, job.job.height - y)
        };
        slot.pending = { job, tile, tileId };
        job.workersUsed.add(slot.index);
        slot.timer = setTimeout(() => {
          if (slot.worker === worker && slot.pending?.job === job && slot.pending.tileId === tileId) {
            failPool(new Error(`Raster worker timed out after ${timeoutMs} ms`));
          }
        }, timeoutMs);
        worker.postMessage({ type: 'tile', jobId: job.id, tileId, job: job.job, tile });
      } catch (error) {
        failPool(error);
        break;
      }
      if (!supported()) break;
    }
  }

  function requestPump() {
    if (pumpQueued || !supported()) return;
    pumpQueued = true;
    queueMicrotask(() => { pumpQueued = false; pump(); });
  }

  function render(input, callbacks = {}) {
    const job = {
      id: nextJobId++, callbacks, job: null, cancelled: false, finished: false,
      nextTile: 0, tilesCompleted: 0, pixelsCompleted: 0, workersUsed: new Set(), started: now()
    };
    const handle = Object.freeze({ id: job.id, cancel: () => cancelJob(job) });
    if (input?.kind === 'parameter' || input?.kind === 'dynamical') {
      const previous = panels.get(input.kind);
      if (previous) cancelJob(previous);
    }
    try {
      job.job = normalizeRasterJob(input);
      if (!supported()) throw failure || new Error(disposed ? 'Raster worker pool is disposed' : 'Web Workers are unavailable');
      job.columns = Math.ceil(job.job.width / tileWidth);
      job.totalTiles = job.columns * Math.ceil(job.job.height / tileHeight);
      job.totalPixels = job.job.width * job.job.height;
      jobs.set(job.id, job);
      panels.set(job.job.kind, job);
      requestPump();
    } catch (error) {
      job.finished = true;
      notifyError(job, error);
    }
    return handle;
  }

  function cancel() {
    for (const job of [...jobs.values()]) cancelJob(job);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancel();
    for (const slot of slots) stopWorker(slot);
  }

  return { get supported() { return supported(); }, render, cancel, dispose };
}
