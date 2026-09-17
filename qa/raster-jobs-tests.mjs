import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRasterJob, prepareRasterJob, renderRasterTile, rasterResultCode } from '../src/compute/raster_jobs.mjs';
import { inverseIterationTestDetailed, inLens } from '../src/compute/inverse_search_reference.mjs';
import { createInverseSearchContext, inverseSearchPointFast } from '../src/compute/inverse_search_kernel.mjs';

const base = Object.freeze({
  kind: 'parameter', width: 1, height: 1, center: { x: 1, y: 1 }, spanX: 4,
  n: 3, cx: 0, cy: 2, kMax: 8, LMax: 128, tol: 1e-8,
  parameterMode: 'compare', showDifference: true, showOriginalSurvival: true
});

function image(input) {
  const prepared = prepareRasterJob({ ...base, ...input });
  return renderRasterTile(prepared, { x: 0, y: 0, width: prepared.job.width, height: prepared.job.height }).data;
}

function pair(result) {
  if (result.verdict === 'Exterior') return [0, result.depth];
  if (result.verdict === 'Interior') return [1, result.depth];
  if (result.verdict === 'Interior-offLens') return [2, result.depth];
  return [{ 'depth-cap': 3, 'node-cap': 4, 'outside-domain': 5, 'numerical-range': 6 }[result.stopReason], result.depth];
}

test('parameter bytes retain independent finite-search outcomes and exact stop depths', () => {
  const fixtures = [
    { x: 0.5, y: 1.1, n: 3, k: 12, expected: [1, 0, 4, 5] },
    // c=1+i has the explicit original-alphabet expansion 2-2/c.
    // Its R_n drawing nevertheless remains finite survival, not an Interior.
    { x: 1, y: 1, n: 3, k: 8, expected: [1, 1, 3, 8] },
    { x: 1.2, y: 0.9, n: 2, k: 12, expected: [2, 7, 0, 2] },
    { x: 3, y: 3, n: 3, k: 12, expected: [0, 0, 0, 0] },
    { x: 1.2, y: 0.9, n: 2, k: 0, expected: [3, 0, 3, 0] }
  ];
  for (const fixture of fixtures) {
    const input = { center: { x: fixture.x, y: fixture.y }, n: fixture.n, kMax: fixture.k };
    assert.deepEqual([...image(input)], fixture.expected);
    assert.deepEqual([...image({ ...input, parameterMode: 'mn' })], [...fixture.expected.slice(0, 2), 0, 0]);
    assert.deepEqual([...image({ ...input, parameterMode: 'rn' })], [...fixture.expected.slice(2), 0, 0]);
  }
  assert.deepEqual([...image({ LMax: 1 })], [4, 1, 4, 1], 'frontier caps cannot become Exterior');
});

test('off-origin, non-square partial tiles agree with the detailed reference at full-frame pixel centers', () => {
  const input = {
    ...base, width: 9, height: 5, center: { x: 1.3, y: 0.8 }, spanX: 2.7,
    kMax: 5, LMax: 17
  };
  const prepared = prepareRasterJob(input);
  const tile = renderRasterTile(prepared, { x: 2, y: 1, width: 4, height: 3 });
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 4; column++) {
      // Independently map the pixel's edges, then average to get its center.
      const pixelX = tile.x + column;
      const pixelY = tile.y + row;
      const left = input.center.x - input.spanX / 2;
      const top = input.center.y + input.spanX * input.height / input.width / 2;
      const pitch = input.spanX / input.width;
      const x = left + (pixelX + 0.5) * pitch;
      const y = top - (pixelY + 0.5) * pitch;
      const detailed = inverseIterationTestDetailed(x, y, input.n, input.kMax, input.LMax, input.tol);
      const offset = 4 * (row * 4 + column);
      assert.deepEqual([...tile.data.slice(offset, offset + 2)], pair(detailed));
      const context = createInverseSearchContext(x, y, input.n, false, input.tol, { useTrap: false });
      const rn = inverseSearchPointFast(context, x, y, input.kMax, input.LMax);
      assert.deepEqual([...tile.data.slice(offset + 2, offset + 4)], pair(rn));
    }
  }
  const combined = new Uint8Array(input.width * input.height * 4);
  for (const bounds of [
    { x: 0, y: 0, width: 4, height: 5 }, { x: 4, y: 0, width: 5, height: 2 },
    { x: 4, y: 2, width: 5, height: 3 }
  ]) {
    const part = renderRasterTile(prepared, bounds);
    for (let y = 0; y < part.height; y++) {
      combined.set(part.data.subarray(4 * y * part.width, 4 * (y + 1) * part.width),
        4 * ((part.y + y) * input.width + part.x));
    }
  }
  assert.deepEqual(combined, image(input), 'tile boundaries must not shift the coordinate lattice');
});

test('dynamical bytes preserve the exact E(2i,4) rectangle and half-difference scaling', () => {
  // Even and odd base -4 expansions give exactly [-4,4] × [-2,2].
  // Pixel centers are ±0.5, ±1.5, ...; no tested point lies on its boundary.
  const input = { ...base, kind: 'dynamical', width: 10, height: 6, spanX: 10, center: { x: 0, y: 0 }, n: 4, kMax: 12 };
  const pixels = image(input);
  for (let py = 0; py < input.height; py++) {
    for (let px = 0; px < input.width; px++) {
      const x = px - 4.5;
      const y = 2.5 - py;
      const offset = 4 * (py * input.width + px);
      const inside = Math.abs(x) < 4 && Math.abs(y) < 2;
      if (inside) {
        assert.equal(pixels[offset], 1, `half-difference captures ${x}+${y}i`);
        assert.deepEqual([...pixels.slice(offset + 2, offset + 4)], [3, 12], 'original survival stays unresolved');
      } else {
        assert.deepEqual([...pixels.slice(offset, offset + 4)], [0, 0, 0, 0]);
      }
    }
  }
  // This interior point lies outside the wrongly scaled E(c,4)/c rectangle.
  assert.deepEqual([...image({ ...input, width: 1, height: 1, center: { x: 3, y: 0.75 } })], [1, 0, 3, 12]);
  const originalOnly = image({ ...input, showDifference: false });
  const differenceOnly = image({ ...input, showOriginalSurvival: false });
  for (let offset = 0; offset < pixels.length; offset += 4) {
    assert.deepEqual([...originalOnly.slice(offset, offset + 2)], [0, 0]);
    assert.deepEqual([...originalOnly.slice(offset + 2, offset + 4)], [...pixels.slice(offset + 2, offset + 4)]);
    assert.deepEqual([...differenceOnly.slice(offset, offset + 2)], [...pixels.slice(offset, offset + 2)]);
    assert.deepEqual([...differenceOnly.slice(offset + 2, offset + 4)], [0, 0]);
  }
});

test('reciprocal parameters, domain exclusions, and numerical range retain their distinct meanings', () => {
  assert.deepEqual(image({ center: { x: 0.5, y: -0.5 } }), image({ center: { x: 1, y: 1 } }));
  const dynamics = { kind: 'dynamical', width: 7, height: 5, spanX: 6, center: { x: 0, y: 0 } };
  assert.deepEqual(image({ ...dynamics, cx: 0.5, cy: -0.5 }), image({ ...dynamics, cx: 1, cy: 1 }));
  for (const [x, y] of [[0, 0], [2, 0], [0, 1]]) {
    assert.deepEqual([...image({ center: { x, y } })], [5, 0, 5, 0]);
    assert.ok(image({ ...dynamics, cx: x, cy: y }).every(value => value === 0), 'unsupported dynamics remains clear');
  }
  assert.deepEqual([...image({ center: { x: Number.MIN_VALUE, y: Number.MIN_VALUE } })], [6, 0, 6, 0]);
  assert.ok(image({ ...dynamics, cx: Number.MIN_VALUE, cy: Number.MIN_VALUE }).every(value => value === 0));
});

test('dynamical contexts are reusable and agree with direct searches at nontrivial camera coordinates', () => {
  const input = { ...base, kind: 'dynamical', width: 5, height: 3, center: { x: 0.5, y: -0.2 }, spanX: 3, cx: 0.7, cy: 1.4, kMax: 7, LMax: 25 };
  const prepared = prepareRasterJob(input);
  const context = prepared.differenceContext;
  const first = renderRasterTile(prepared, { x: 0, y: 0, width: 5, height: 2 });
  const second = renderRasterTile(prepared, { x: 0, y: 2, width: 5, height: 1 });
  assert.equal(prepared.differenceContext, context);
  const independentlyPrepared = createInverseSearchContext(input.cx, input.cy, 2 * input.n - 1, inLens(input.cx, input.cy, input.n), input.tol);
  const data = new Uint8Array([...first.data, ...second.data]);
  for (let py = 0; py < 3; py++) for (let px = 0; px < 5; px++) {
    const x = input.center.x + ((px + 0.5) / 5 - 0.5) * 3;
    const y = input.center.y + (0.5 - (py + 0.5) / 3) * 3 * 3 / 5;
    const result = inverseSearchPointFast(independentlyPrepared, 2 * x, 2 * y, input.kMax, input.LMax);
    assert.deepEqual([...data.slice(4 * (py * 5 + px), 4 * (py * 5 + px) + 2)], pair(result));
  }
});

test('job and tile validation bounds allocations and refuses depth-byte truncation', () => {
  for (const invalid of [
    { width: 0 }, { height: 16385 }, { kMax: 256 }, { LMax: 10001 },
    { spanX: Infinity }, { center: { x: NaN, y: 0 } }, { survivalOpacity: -1 },
    { parameterMode: 'unknown' }, { n: 1 }
  ]) assert.throws(() => normalizeRasterJob({ ...base, ...invalid }));
  const prepared = prepareRasterJob({ ...base, width: 16384, height: 16384 });
  assert.equal(renderRasterTile(prepared, { x: 16383, y: 16383, width: 1, height: 1 }).data.byteLength, 4);
  for (const tile of [
    { x: 16384, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 256, height: 256 },
    { x: 0, y: 0, width: 0, height: 1 }
  ]) assert.throws(() => renderRasterTile(prepared, tile));
  assert.equal(rasterResultCode({ verdict: 'Undetermined', stopReason: 'work-cap' }), 7);
  assert.equal(rasterResultCode({ verdict: 'Undetermined', stopReason: 'precision-limit' }), 8);
  assert.throws(() => rasterResultCode({ verdict: 'Undetermined', stopReason: 'unrecognized' }));
});

test('worker wire messages transfer tile ownership, cache preparation, and report errors', async () => {
  const oldSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  let onMessage;
  const replies = [];
  globalThis.self = {
    addEventListener(type, listener) { assert.equal(type, 'message'); onMessage = listener; },
    postMessage(message, transfer = []) {
      if (message.type === 'tile') {
        assert.deepEqual(transfer, [message.data.buffer]);
        assert.equal(transfer.length, 1);
      }
      const copy = structuredClone(message, { transfer });
      if (message.type === 'tile') assert.equal(message.data.byteLength, 0, 'worker relinquishes the output buffer');
      replies.push(copy);
    }
  };
  try {
    await import('../workers/raster-worker.mjs');
    const input = { ...base, kind: 'dynamical', n: 4, center: { x: 3, y: 0.75 }, kMax: 12 };
    const tile = { x: 0, y: 0, width: 1, height: 1 };
    onMessage({ data: { type: 'tile', jobId: 1, tileId: 0, job: input, tile } });
    assert.deepEqual([...replies[0].data], [1, 0, 3, 12]);
    onMessage({ data: { type: 'tile', jobId: 1, tileId: 1, tile, get job() { throw new Error('cached job was prepared again'); } } });
    assert.equal(replies[1].type, 'tile');
    onMessage({ data: { type: 'tile', jobId: 2, tileId: 0, job: { ...input, n: 1 }, tile } });
    assert.equal(replies[2].type, 'error');
    assert.equal(replies[2].jobId, 2);
    assert.equal(replies[2].tileId, 0);
    assert.match(replies[2].message, /arity/);
  } finally {
    if (oldSelf) Object.defineProperty(globalThis, 'self', oldSelf);
    else delete globalThis.self;
  }
});
