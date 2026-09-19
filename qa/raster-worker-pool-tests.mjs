import test from 'node:test';
import assert from 'node:assert/strict';
import { createRasterWorkerPool } from '../src/compute/raster_worker_pool.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));

function job(kind = 'parameter', extra = {}) {
  return {
    kind, width: 5, height: 3, center: { x: 0, y: 0 }, spanX: 4,
    n: 3, cx: 0.5, cy: 1.1, kMax: 2, LMax: 8, tol: 1e-8,
    parameterMode: 'mn', showDifference: true, showOriginalSurvival: false,
    showEscapeStrata: false, survivalOpacity: 0.72, ...extra
  };
}

function harness(options = {}) {
  const workers = [];
  const requests = [];
  class FakeWorker {
    constructor(url, config) {
      this.url = url;
      this.config = config;
      this.listeners = new Map();
      this.pending = null;
      this.terminated = false;
      this.terminations = 0;
      workers.push(this);
    }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) {
      this.listeners.get(type)?.delete(callback);
    }
    postMessage(message) {
      assert.equal(this.terminated, false, 'terminated workers cannot receive new work');
      assert.equal(this.pending, null, 'one worker must never have two tiles in flight');
      assert.equal(message.type, 'tile');
      assert.ok(Number.isInteger(message.tileId));
      assert.ok(message.job && message.tile);
      this.pending = message;
      requests.push({ worker: this, message });
    }
    terminate() {
      this.terminated = true;
      this.terminations++;
    }
    emit(type, event) {
      for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
    }
    response(request = this.pending) {
      assert.ok(request, 'a response must refer to an assigned tile');
      const { x, y, width, height } = request.tile;
      return {
        type: 'tile', jobId: request.jobId, tileId: request.tileId,
        x, y, width, height, data: new Uint8Array(width * height * 4).fill(123)
      };
    }
    finish() {
      const response = this.response();
      this.pending = null;
      this.emit('message', { data: response });
      return response;
    }
  }
  const pool = createRasterWorkerPool({
    maxWorkers: 2, hardwareConcurrency: 8, tileWidth: 2, tileHeight: 2,
    timeoutMs: 1000,
    workerFactory: (url, config) => new FakeWorker(url, config), ...options
  });
  return { pool, workers, requests };
}

function recorder() {
  const tiles = [], completed = [], errors = [];
  return {
    tiles, completed, errors,
    callbacks: {
      onTile: tile => tiles.push(tile),
      onComplete: value => completed.push(value),
      onError: (error, metadata) => errors.push({ error, metadata })
    }
  };
}

async function drain(h, maximum = 100) {
  for (let iteration = 0; iteration < maximum; iteration++) {
    await turn();
    const pending = h.workers.filter(worker => !worker.terminated && worker.pending);
    if (!pending.length) return;
    for (const worker of pending) worker.finish();
  }
  assert.fail('worker scheduling failed to finish a bounded raster');
}

function assertError(value, id) {
  assert.ok(value.error instanceof Error);
  assert.equal(value.metadata.jobId, id);
  assert.equal(value.metadata.backend, 'cpu-worker');
}

test('tiles cover every pixel exactly once, respect the worker cap, and complete once', async t => {
  const h = harness();
  t.after(() => h.pool.dispose());
  const observed = recorder();
  const handle = h.pool.render(job(), observed.callbacks);
  assert.equal(h.pool.supported, true);
  await drain(h);

  assert.ok(h.workers.length >= 1 && h.workers.length <= 2);
  assert.equal(observed.errors.length, 0);
  assert.equal(observed.tiles.length, 6, 'partial right and bottom tiles must not be lost');
  const covered = new Uint8Array(15);
  let pixels = 0;
  for (const tile of observed.tiles) {
    assert.equal(tile.jobId, handle.id);
    assert.ok(tile.width > 0 && tile.width <= 2);
    assert.ok(tile.height > 0 && tile.height <= 2);
    assert.ok(tile.x >= 0 && tile.y >= 0 && tile.x + tile.width <= 5 && tile.y + tile.height <= 3);
    assert.ok(tile.data instanceof Uint8Array);
    assert.equal(tile.data.length, tile.width * tile.height * 4);
    assert.ok(tile.data.every(value => value === 123));
    for (let y = tile.y; y < tile.y + tile.height; y++) {
      for (let x = tile.x; x < tile.x + tile.width; x++) covered[y * 5 + x]++;
    }
    pixels += tile.width * tile.height;
    assert.equal(tile.pixelsCompleted, pixels);
    assert.equal(tile.totalPixels, 15);
  }
  assert.deepEqual([...covered], new Array(15).fill(1));
  assert.equal(observed.completed.length, 1);
  const completed = observed.completed[0];
  assert.equal(completed.jobId, handle.id);
  assert.equal(completed.tilesCompleted, 6);
  assert.equal(completed.totalTiles, 6);
  assert.equal(completed.pixelsCompleted, 15);
  assert.equal(completed.totalPixels, 15);
  assert.equal(completed.backend, 'cpu-worker');
  assert.ok(completed.workerCount >= 1 && completed.workerCount <= 2);
  assert.ok(Number.isFinite(completed.elapsedMs) && completed.elapsedMs >= 0);
});

test('parameter and dynamical panels run concurrently without starving the later panel', async t => {
  const h = harness();
  t.after(() => h.pool.dispose());
  const parameter = recorder(), dynamical = recorder();
  const first = h.pool.render(job('parameter', { width: 20, height: 4 }), parameter.callbacks);
  const second = h.pool.render(job('dynamical'), dynamical.callbacks);
  assert.notEqual(first.id, second.id);
  await turn();
  for (let step = 0; step < 4 && !h.requests.some(item => item.message.jobId === second.id); step++) {
    const worker = h.workers.find(value => !value.terminated && value.pending);
    assert.ok(worker);
    worker.finish();
    await turn();
  }
  assert.ok(h.requests.some(item => item.message.jobId === second.id), 'a queued panel must receive a worker before the large first panel finishes');
  assert.equal(parameter.completed.length, 0);
  await drain(h);
  assert.equal(parameter.completed.length, 1);
  assert.equal(dynamical.completed.length, 1);
  assert.equal(parameter.errors.length + dynamical.errors.length, 0);
  assert.ok(parameter.tiles.every(tile => tile.jobId === first.id));
  assert.ok(dynamical.tiles.every(tile => tile.jobId === second.id));
});

test('same-panel replacement terminates only that panel and ignores late old messages', async t => {
  const h = harness();
  t.after(() => h.pool.dispose());
  const old = recorder(), other = recorder(), replacement = recorder();
  const oldHandle = h.pool.render(job('parameter', { width: 2, height: 2 }), old.callbacks);
  const otherHandle = h.pool.render(job('dynamical', { width: 2, height: 2 }), other.callbacks);
  await turn();
  const oldWorker = h.workers.find(worker => worker.pending?.jobId === oldHandle.id);
  const otherWorker = h.workers.find(worker => worker.pending?.jobId === otherHandle.id);
  assert.ok(oldWorker && otherWorker);
  const stale = oldWorker.response();
  const staleListeners = [...(oldWorker.listeners.get('message') || [])];
  const staleErrors = [...(oldWorker.listeners.get('error') || [])];
  const replacementHandle = h.pool.render(job('parameter'), replacement.callbacks);
  assert.notEqual(replacementHandle.id, oldHandle.id);
  assert.equal(oldWorker.terminated, true, 'cancelled computation must release its worker immediately');
  assert.equal(otherWorker.terminated, false, 'replacing one panel must preserve the other panel');
  for (const listener of staleListeners) listener({ data: stale });
  for (const listener of staleErrors) listener({ message: 'cancelled worker error', preventDefault() {} });
  assert.equal(h.pool.supported, true, 'an error queued by a terminated worker must be ignored');
  oldHandle.cancel(); // A stale cancellation handle must not cancel its replacement.
  await drain(h);
  assert.equal(old.tiles.length + old.completed.length + old.errors.length, 0);
  assert.equal(other.completed.length, 1);
  assert.equal(replacement.completed.length, 1);
  assert.ok(replacement.tiles.every(tile => tile.jobId === replacementHandle.id));
});

test('cancelling one handle leaves the other panel live and pool-wide cancel is reusable', async t => {
  const h = harness();
  t.after(() => h.pool.dispose());
  const cancelled = recorder(), other = recorder();
  const first = h.pool.render(job('parameter', { width: 2, height: 2 }), cancelled.callbacks);
  h.pool.render(job('dynamical', { width: 2, height: 2 }), other.callbacks);
  await turn();
  first.cancel();
  first.cancel();
  await drain(h);
  assert.equal(cancelled.tiles.length + cancelled.completed.length + cancelled.errors.length, 0);
  assert.equal(other.completed.length, 1);

  const abandoned = recorder();
  h.pool.render(job(), abandoned.callbacks);
  await turn();
  h.pool.cancel();
  h.pool.cancel();
  assert.equal(abandoned.completed.length + abandoned.errors.length, 0);
  const resumed = recorder();
  h.pool.render(job(), resumed.callbacks);
  await drain(h);
  assert.equal(resumed.completed.length, 1);
  assert.equal(resumed.errors.length, 0);
});

test('foreign and duplicate tile messages cannot inflate progress or complete a job early', async t => {
  const h = harness({ maxWorkers: 1 });
  t.after(() => h.pool.dispose());
  const observed = recorder();
  const handle = h.pool.render(job(), observed.callbacks);
  await turn();
  const worker = h.workers.find(value => value.pending);
  const firstResponse = worker.response();
  worker.emit('message', { data: { ...firstResponse, jobId: `${handle.id}-stale` } });
  worker.emit('message', { data: { ...firstResponse, tileId: firstResponse.tileId + 9999 } });
  worker.emit('message', { data: { type: 'error', jobId: `${handle.id}-stale`, tileId: firstResponse.tileId, message: 'foreign job' } });
  assert.equal(observed.tiles.length + observed.completed.length + observed.errors.length, 0);
  worker.finish();
  worker.emit('message', { data: firstResponse });
  await drain(h);
  assert.equal(observed.tiles.length, 6);
  assert.equal(observed.completed.length, 1);
  assert.equal(observed.completed[0].pixelsCompleted, 15);
  assert.equal(observed.errors.length, 0);
});

test('a worker runtime failure disables the pool and notifies every active job once', async t => {
  const h = harness();
  t.after(() => h.pool.dispose());
  const first = recorder(), second = recorder();
  const a = h.pool.render(job('parameter', { width: 2, height: 2 }), first.callbacks);
  const b = h.pool.render(job('dynamical', { width: 2, height: 2 }), second.callbacks);
  await turn();
  const worker = h.workers.find(value => value.pending);
  const listeners = [...(worker.listeners.get('error') || [])];
  assert.ok(listeners.length, 'runtime errors must be handled');
  const event = { message: 'synthetic worker crash', error: new Error('synthetic worker crash'), preventDefault() {} };
  worker.emit('error', event);
  for (const listener of listeners) listener(event);
  await turn();
  assert.equal(h.pool.supported, false);
  assert.ok(h.workers.every(value => value.terminated));
  assert.equal(first.errors.length, 1);
  assert.equal(second.errors.length, 1);
  assertError(first.errors[0], a.id);
  assertError(second.errors[0], b.id);
  assert.equal(first.completed.length + second.completed.length, 0);

  let synchronous = true;
  const fallback = recorder();
  const next = h.pool.render(job(), {
    ...fallback.callbacks,
    onError(error, metadata) {
      assert.equal(synchronous, false, 'unsupported fallback must not race assignment of the returned handle');
      fallback.callbacks.onError(error, metadata);
    }
  });
  synchronous = false;
  await turn();
  assert.equal(fallback.errors.length, 1);
  assertError(fallback.errors[0], next.id);
});

test('an explicit worker tile error takes the same safe fallback path', async t => {
  const h = harness();
  t.after(() => h.pool.dispose());
  const observed = recorder();
  const handle = h.pool.render(job(), observed.callbacks);
  await turn();
  const worker = h.workers.find(value => value.pending);
  const { jobId, tileId } = worker.pending;
  worker.emit('message', { data: { type: 'error', jobId, tileId, name: 'RangeError', message: 'synthetic tile failure' } });
  await turn();
  assert.equal(h.pool.supported, false);
  assert.equal(observed.errors.length, 1);
  assertError(observed.errors[0], handle.id);
  assert.match(observed.errors[0].error.message, /synthetic tile failure/);
  assert.equal(observed.tiles.length + observed.completed.length, 0);
  assert.ok(h.workers.every(value => value.terminated));
});

test('worker construction failure is reported asynchronously without throwing from render', async t => {
  const h = harness({ workerFactory() { throw new Error('synthetic worker construction failure'); } });
  t.after(() => h.pool.dispose());
  const observed = recorder();
  let synchronous = true;
  const handle = h.pool.render(job(), {
    ...observed.callbacks,
    onError(error, metadata) {
      assert.equal(synchronous, false);
      observed.callbacks.onError(error, metadata);
    }
  });
  synchronous = false;
  await turn();
  assert.equal(h.pool.supported, false);
  assert.equal(observed.errors.length, 1);
  assertError(observed.errors[0], handle.id);
  assert.equal(observed.tiles.length + observed.completed.length, 0);
});

test('absence of Worker is an asynchronous unsupported result when no factory is supplied', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true, writable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else delete globalThis.Worker;
  });
  const pool = createRasterWorkerPool();
  t.after(() => pool.dispose());
  assert.equal(pool.supported, false);
  const observed = recorder();
  let synchronous = true;
  const handle = pool.render(job(), {
    ...observed.callbacks,
    onError(error, metadata) {
      assert.equal(synchronous, false);
      observed.callbacks.onError(error, metadata);
    }
  });
  synchronous = false;
  await turn();
  assert.equal(observed.errors.length, 1);
  assertError(observed.errors[0], handle.id);
  assert.equal(observed.completed.length, 0);
});

test('a stuck worker times out, terminates all work, and reports both active panels once', async t => {
  const h = harness({ timeoutMs: 20 });
  t.after(() => h.pool.dispose());
  const first = recorder(), second = recorder();
  const a = h.pool.render(job('parameter', { width: 2, height: 2 }), first.callbacks);
  const b = h.pool.render(job('dynamical', { width: 2, height: 2 }), second.callbacks);
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(h.pool.supported, false);
  assert.ok(h.workers.every(value => value.terminated));
  assert.equal(first.errors.length, 1);
  assert.equal(second.errors.length, 1);
  assertError(first.errors[0], a.id);
  assertError(second.errors[0], b.id);
  assert.match(first.errors[0].error.message, /time|stuck/i);
  assert.equal(first.completed.length + second.completed.length, 0);
});

test('disposing pending work is idempotent and suppresses messages already queued for delivery', async () => {
  const h = harness();
  const observed = recorder();
  h.pool.render(job(), observed.callbacks);
  await turn();
  const delivery = h.workers.filter(worker => worker.pending).map(worker => ({
    response: worker.response(), callbacks: [...(worker.listeners.get('message') || [])]
  }));
  assert.ok(delivery.length);
  h.pool.dispose();
  h.pool.dispose();
  assert.ok(h.workers.every(worker => worker.terminated));
  for (const { response, callbacks } of delivery) {
    for (const callback of callbacks) callback({ data: response });
  }
  await turn();
  assert.equal(observed.tiles.length + observed.completed.length + observed.errors.length, 0);
});

test('optional first-piece arrays preserve ownership and reach the compositor unchanged', async t => {
  const h = harness({ maxWorkers: 1 });
  t.after(() => h.pool.dispose());
  const observed = recorder();
  h.pool.render(job('dynamical', { width: 2, height: 2, originalRenderer: 'boundary', firstLevelPieces: true }), observed.callbacks);
  await turn();
  const worker = h.workers.find(value => value.pending);
  const response = worker.response();
  response.pieces = Uint8Array.from([0, 4, 0, 1, 0, 0, 0, 3]);
  worker.pending = null;
  worker.emit('message', { data: response });
  await turn();
  assert.equal(observed.errors.length, 0);
  assert.equal(observed.completed.length, 1);
  assert.equal(observed.tiles[0].pieces, response.pieces, 'the pool must not copy or discard piece metadata');
  assert.deepEqual([...observed.tiles[0].pieces], [0, 4, 0, 1, 0, 0, 0, 3]);
});

test('malformed piece attachments cannot enter the compositor or complete a frame', async t => {
  for (const invalid of [null, new Uint8Array(7), new Uint16Array(8), new Array(8).fill(0)]) {
    const h = harness({ maxWorkers: 1 });
    t.after(() => h.pool.dispose());
    const observed = recorder();
    h.pool.render(job('dynamical', { width: 2, height: 2 }), observed.callbacks);
    await turn();
    const worker = h.workers.find(value => value.pending);
    worker.emit('message', { data: { ...worker.response(), pieces: invalid } });
    await turn();
    assert.equal(observed.tiles.length, 0);
    assert.equal(observed.completed.length, 0);
    assert.equal(observed.errors.length, 1);
    assert.match(observed.errors[0].error.message, /malformed tile/);
    assert.equal(h.pool.supported, false);
    assert.ok(h.workers.every(value => value.terminated));
  }
});

test('independent layer and halo-mask buffers reach the compositor without copying', async t => {
  for (const kind of ['parameter', 'dynamical']) {
    const h = harness({ maxWorkers: 1 });
    t.after(() => h.pool.dispose());
    const observed = recorder();
    h.pool.render(job(kind, { width: 2, height: 2, parameterLayers: ['mn0', 'mn1'], parameterDigits: [1] }), observed.callbacks);
    await turn();
    const worker = h.workers.find(value => value.pending);
    const response = worker.response();
    if (kind === 'parameter') response.layerData = new Uint8Array(24).fill(3);
    else {
      response.pieceMasks = new Uint32Array(16).fill(3);
      response.pieceUncertainMasks = new Uint32Array(16);
    }
    worker.pending = null;
    worker.emit('message', { data: response });
    await turn();
    assert.equal(observed.errors.length, 0);
    assert.equal(observed.completed.length, 1);
    for (const key of ['layerData', 'pieceMasks', 'pieceUncertainMasks']) {
      assert.equal(observed.tiles[0][key], response[key]);
    }
  }
});

test('a truncated layer or halo mask triggers fallback before it can erase geometry', async t => {
  for (const attachment of [
    { layerData: new Uint8Array(7) }, { pieceMasks: new Uint32Array(15) },
    { pieceUncertainMasks: new Uint8Array(16) }
  ]) {
    const h = harness({ maxWorkers: 1 });
    t.after(() => h.pool.dispose());
    const observed = recorder();
    h.pool.render(job('parameter', { width: 2, height: 2 }), observed.callbacks);
    await turn();
    const worker = h.workers.find(value => value.pending);
    worker.emit('message', { data: { ...worker.response(), ...attachment } });
    await turn();
    assert.equal(observed.tiles.length + observed.completed.length, 0);
    assert.equal(observed.errors.length, 1);
    assert.equal(h.pool.supported, false);
  }
});
