import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { inv, mul } from '../src/math/complex.mjs';
import { alphabet } from '../src/math/alphabets.mjs';
import { choosePrefixDepth, prefixCenters, tailRadius } from '../src/math/prefix_cylinders.mjs';
import { renderPrefixAttractor } from '../src/renderers/attractor_prefix.mjs';
import { makeLcg, renderHistogramAttractor, sampleHistogramAttractor } from '../src/renderers/attractor_histogram.mjs';
import { hexToRgb } from '../src/renderers/palettes.mjs';
import {
  chooseTailDepth, computeEnclosureGeneral, getEffectiveC, getTrapHalfWidths,
  inLens, inverseIterationTestDetailed
} from '../src/compute/inverse_search_reference.mjs';
import {
  createInverseSearchContext, inverseIterationTestFast, inverseSearchPointFast
} from '../src/compute/inverse_search_kernel.mjs';
import { buildCertificatePayload } from '../src/compute/certificate_builder.mjs';

function near(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

function canvas() {
  return {
    depth: 0, calls: [],
    save() { this.depth++; },
    restore() { this.depth--; },
    beginPath() {},
    arc(x, y, radius) { this.calls.push([x, y, radius]); },
    fill() {},
    fillRect(x, y) { this.calls.push([x, y]); }
  };
}

// Run the actual worker handlers without requiring browser-only Worker APIs.
let workerHarnessRun = 0;
async function workerHarness(relativePath, run) {
  const workerUrl = new URL(relativePath, import.meta.url);
  const text = await readFile(workerUrl, 'utf8');
  const source = text.replace(/from '([^']+)'/g, (_, path) => `from '${new URL(path, workerUrl).href}'`);
  const oldSelf = globalThis.self;
  let handler;
  const messages = [];
  globalThis.self = {
    addEventListener(type, fn) { assert.equal(type, 'message'); handler = fn; },
    postMessage(message) { messages.push(message); }
  };
  try {
    await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#run-${workerHarnessRun++}`);
    await run(job => { handler({ data: job }); return messages.at(-1); });
  } finally {
    if (oldSelf === undefined) delete globalThis.self;
    else globalThis.self = oldSelf;
  }
}

test('complex reciprocal survives square overflow and underflow', () => {
  for (const size of [1e-200, 1e200]) {
    const value = inv({ re: size, im: 2 * size });
    near(value.re * size, 0.2);
    near(value.im * size, -0.4);
    const product = mul({ re: size, im: 2 * size }, value);
    near(product.re, 1);
    near(product.im, 0);
  }
  assert.throws(() => inv({ re: 0, im: 0 }), RangeError);
  assert.throws(() => inv({ re: Infinity, im: 1 }), TypeError);
  const effective = getEffectiveC(1e-200, 2e-200);
  near(effective.x * 1e-200, 0.2);
  near(effective.y * 1e-200, -0.4);
});

test('prefix centers follow f_t(z) = t + z/c and color the outer map', () => {
  const c = { re: 0, im: 2 };
  assert.deepEqual(prefixCenters(c, 3, 1), [
    { re: -2, im: 0, firstDigit: -2 },
    { re: 0, im: 0, firstDigit: 0 },
    { re: 2, im: 0, firstDigit: 2 }
  ]);
  const centers = prefixCenters(c, 3, 2);
  assert.equal(centers.length, 9);
  let index = 0;
  for (const outer of [-2, 0, 2]) {
    for (const inner of [-2, 0, 2]) {
      assert.deepEqual(centers[index++], { re: outer, im: -inner / 2 + 0, firstDigit: outer });
    }
  }
  assert.equal(tailRadius(c, 3, 0), 4);
  assert.equal(tailRadius(c, 3, 1), 2);
  assert.equal(tailRadius(c, 3, 2), 1);
});

test('reported prefix tail bounds actual longer finite words', () => {
  const random = makeLcg(7411);
  for (const c of [{ re: 1.2, im: 0.7 }, { re: -0.4, im: 1.5 }, { re: 0, im: -2 }]) {
    for (let trial = 0; trial < 20; trial++) {
      const digits = Array.from({ length: 40 }, () => 2 * Math.floor(3 * random()) - 2);
      const invC = inv(c);
      const evaluate = sequence => {
        let z = { re: 0, im: 0 };
        for (const digit of [...sequence].reverse()) {
          z = mul(z, invC);
          z.re += digit;
        }
        return z;
      };
      const full = evaluate(digits);
      const prefix = evaluate(digits.slice(0, 4));
      assert.ok(Math.hypot(full.re - prefix.re, full.im - prefix.im) <= tailRadius(c, 3, 4) * (1 + 1e-12));
    }
  }
});

test('prefix budgets retain complete levels and reject oversized direct requests', () => {
  const c = { re: 0, im: 2 };
  assert.deepEqual(choosePrefixDepth(c, 3, 8, 243), {
    depth: 5, requestedDepth: 8, truncatedByWorkCap: true, estimatedPrefixes: 243, maxPrefixes: 243
  });
  assert.equal(choosePrefixDepth(c, 101, 8, 10).depth, 0);
  assert.throws(() => prefixCenters(c, 101, 5, { maxPrefixes: 10 }), RangeError);
  assert.throws(() => prefixCenters(c, 3, Infinity), RangeError);
  assert.throws(() => choosePrefixDepth(c, 3, 2, 0), RangeError);
  assert.throws(() => choosePrefixDepth(c, 3, 2, 1e9), RangeError);
  assert.throws(() => choosePrefixDepth({ re: 1, im: 0 }, 3, 2), RangeError);
  const ctx = canvas();
  const metadata = renderPrefixAttractor(ctx, {
    c, m: 101, requestedDepth: 8, maxPrefixes: 10, pixelRadius: 0.01,
    project: (x, y) => ({ x, y })
  });
  assert.equal(metadata.rendered_prefixes, 1);
  assert.equal(metadata.first_level_pieces, false);
  assert.equal(metadata.tail_disks_clipped, true);
  assert.equal(ctx.depth, 0);
});

test('histogram samples obey the same IFS with reproducible zero seeds', () => {
  const options = { c: { re: 0, im: 2 }, m: 3, seed: 0, samples: 12, burnIn: 0 };
  const samples = [];
  const metadata = sampleHistogramAttractor(options, (re, im, piece) => samples.push({ re, im, piece }));
  const random = makeLcg(0);
  let expected = { re: 0, im: 0 };
  for (const actual of samples) {
    const piece = Math.floor(3 * random());
    expected = { re: 2 * piece - 2 + expected.im / 2, im: -expected.re / 2 };
    near(actual.re, expected.re);
    near(actual.im, expected.im);
    assert.equal(actual.piece, piece);
  }
  assert.equal(metadata.seed, 0);
  assert.notEqual(makeLcg(0)(), makeLcg(1)());
  assert.throws(() => sampleHistogramAttractor({ ...options, samples: Infinity }, () => {}), RangeError);
  assert.throws(() => sampleHistogramAttractor({ ...options, burnIn: -1 }, () => {}), RangeError);
  assert.throws(() => sampleHistogramAttractor({ ...options, c: { re: 0.5, im: 0 } }, () => {}), RangeError);
});

test('Canvas state restores when a projection fails; CSS short hex colors expand correctly', () => {
  const ctx = canvas();
  assert.throws(() => renderHistogramAttractor(ctx, {
    c: { re: 0, im: 2 }, m: 3, samples: 1, burnIn: 0,
    project: () => { throw new Error('projection failed'); }
  }), /projection failed/);
  assert.equal(ctx.depth, 0);
  assert.deepEqual(hexToRgb('#abc'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb('invalid'), { r: 0, g: 0, b: 0 });
});

test('histogram worker agrees with shared sampler and bounds malformed jobs', async () => {
  await workerHarness('../workers/histogram-worker.js', dispatch => {
    const options = { id: 'sample-a', c: { re: 0.7, im: 1.4 }, m: 5, seed: 0, samples: 32, burnIn: 4 };
    const expected = [];
    sampleHistogramAttractor(options, (re, im, piece) => expected.push({ re, im, piece }));
    const actual = dispatch(options);
    assert.equal(actual.ok, true);
    assert.equal(actual.id, options.id);
    assert.deepEqual(actual.points, expected);
    assert.equal(actual.metadata.seed, 0);
    const invalid = dispatch({ ...options, samples: Infinity });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.id, options.id);
  });
});

test('search validates invalid inputs before they can masquerade as Exterior', () => {
  for (const search of [inverseIterationTestDetailed, inverseIterationTestFast]) {
    for (const bad of [NaN, Infinity, '1']) assert.throws(() => search(bad, 1.1, 3));
    for (const n of [0, 1, 2.5, NaN, Number.MAX_SAFE_INTEGER]) assert.throws(() => search(0.5, 1.1, n), RangeError);
    for (const k of [-1, 1.5, Infinity]) assert.throws(() => search(0.5, 1.1, 3, k), RangeError);
    for (const cap of [0, -1, 1.5, Infinity]) assert.throws(() => search(0.5, 1.1, 3, 5, cap), RangeError);
    assert.throws(() => search(0.5, 1.1, 3, 5, 10, 0), RangeError);
    for (const [x, y] of [[0, 0], [1, 0], [2, 0]]) {
      const actual = search(x, y, 3);
      assert.equal(actual.verdict, 'Undetermined');
      assert.equal(actual.stopReason, 'outside-domain');
    }
    for (const [x, y] of [[1e-320, 1e-320], [1e308, 1e308]]) {
      const actual = search(x, y, 3);
      assert.equal(actual.verdict, 'Undetermined');
      assert.equal(actual.stopReason, 'numerical-range');
    }
  }
});

test('tail truncation handles underflow targets and records near-unit cap exhaustion', () => {
  const choice = chooseTailDepth(1.001, Number.MIN_VALUE);
  assert.equal(choice.M, 2000);
  assert.equal(choice.capped, true);
  const nearUnit = computeEnclosureGeneral(0.5, Math.sqrt((1 + 1e-8) ** 2 - 0.25), 5);
  assert.equal(nearUnit.err, false);
  assert.equal(nearUnit.tailCapHit, true);
  assert.equal(nearUnit.tailCertifiedToTol, false);
  for (const args of [[1, 1e-8], [NaN, 1e-8], [2, 0], [2, 1e-8, 40, 30]]) {
    assert.throws(() => chooseTailDepth(...args));
  }
});

test('search stop reasons distinguish finite caps from decided results', () => {
  const c = [1.5, Math.sqrt(11) / 2, 4];
  assert.equal(inverseIterationTestDetailed(...c, 0, 1000).stopReason, 'depth-cap');
  const capped = inverseIterationTestDetailed(...c, 10, 1);
  assert.equal(capped.verdict, 'Undetermined');
  assert.equal(capped.stopReason, 'node-cap');
  assert.ok(capped.tree.every(level => level.length <= 1));
  assert.equal(inverseIterationTestDetailed(3, 3, 3).stopReason, 'enclosure-escape');
  assert.equal(inverseIterationTestDetailed(2.0719, 3.0537, 13).stopReason, 'tree-exhausted');
});

test('captured words independently replay the complex inverse maps c(z-t)', () => {
  for (const [x, y, n] of [[0.5, 1.1, 3], [1.419643377607, 0.606290729207, 3]]) {
    const found = inverseIterationTestDetailed(x, y, n);
    assert.match(found.verdict, /^Interior/);
    const rho = Math.hypot(x, y);
    let z = { re: 2 * x, im: 2 * y };
    for (let k = 0; k < found.word.length; k++) {
      const t = found.word[k];
      assert.ok(alphabet(2 * n - 1).includes(t));
      z = mul({ re: x, im: y }, { re: z.re - t, im: z.im });
    }
    const s = (x * z.im + y * z.re) / rho;
    const trap = getTrapHalfWidths(x, y, 2 * n - 1, inLens(x, y, n));
    assert.ok(Math.abs(s) < trap.S);
    assert.ok(Math.abs(z.im) < trap.V);
    assert.equal(found.word.length, found.depth);
  }
});

test('typed fast search matches detailed search across 1000 seeded cases and queue reuse', () => {
  const random = makeLcg(78191);
  for (let i = 0; i < 1000; i++) {
    const x = 8 * random() - 4, y = 8 * random() - 4;
    const n = 2 + Math.floor(30 * random());
    const k = Math.floor(18 * random()), cap = 1 + Math.floor(200 * random());
    const expected = inverseIterationTestDetailed(x, y, n, k, cap);
    const actual = inverseIterationTestFast(x, y, n, k, cap);
    for (const field of ['verdict', 'depth', 'nodesExplored', 'stopReason']) {
      assert.equal(actual[field], expected[field], JSON.stringify({ i, x, y, n, k, cap, field }));
    }
  }
  for (const cap of [1000, 2, 2000, 1, 1000]) {
    const a = inverseIterationTestDetailed(1, 2, 5, 37, cap);
    const b = inverseIterationTestFast(1, 2, 5, 37, cap);
    assert.equal(b.verdict, a.verdict);
    assert.equal(b.depth, a.depth);
    assert.equal(b.nodesExplored, a.nodesExplored);
  }
});

test('browser core and standalone JavaScript package agree on expanding parameters', () => {
  const standalone = createRequire(import.meta.url)('../javascript/index.js');
  const random = makeLcg(98153);
  let compared = 0;
  for (let i = 0; i < 500; i++) {
    const x = 8 * random() - 4, y = 8 * random() - 4;
    const n = 2 + Math.floor(30 * random());
    const k = Math.floor(18 * random()), cap = 1 + Math.floor(100 * random());
    if (Math.hypot(x, y) <= 1) continue;
    const expected = standalone.inverseIterationTest(x, y, n, k, cap);
    const actual = inverseIterationTestDetailed(x, y, n, k, cap);
    for (const field of ['verdict', 'depth', 'nodesExplored', 'stopReason']) {
      assert.equal(actual[field], expected[field], JSON.stringify({ i, x, y, n, k, cap, field }));
    }
    if (actual.verdict.startsWith('Interior')) assert.deepEqual(actual.word, expected.word);
    compared++;
  }
  assert.ok(compared > 400);
});

// An independent dynamical oracle enumerates the whole digit alphabet and
// applies the complex inverse maps directly, without canonical digit intervals.
function directPointSearch(context, zx, zy, kMax, LMax) {
  const { x, y, rho, se, ve, S, V, m } = context;
  const canonical = z => ({ s: (x * z.im + y * z.re) / rho, v: z.im });
  const insideEnclosure = z => { const p = canonical(z); return Math.abs(p.s) <= se && Math.abs(p.v) <= ve; };
  const insideTrap = z => { const p = canonical(z); return Math.abs(p.s) < S && Math.abs(p.v) < V; };
  const initial = { re: zx, im: zy };
  if (!insideEnclosure(initial)) return ['Exterior', 0];
  if (insideTrap(initial)) return ['Interior', 0];
  let level = [initial];
  for (let depth = 1; depth <= kMax; depth++) {
    const next = [];
    for (const z of level) {
      for (const digit of alphabet(m)) {
        const child = mul({ re: x, im: y }, { re: z.re - digit, im: z.im });
        if (!insideEnclosure(child)) continue;
        if (insideTrap(child)) return ['Interior', depth];
        next.push(child);
        if (next.length >= LMax) return ['Undetermined', depth];
      }
    }
    if (!next.length) return ['Exterior', depth];
    level = next;
  }
  return ['Undetermined', kMax];
}

test('fixed-context fast point search agrees with direct complex inverse maps', () => {
  const context = createInverseSearchContext(0.7, 1.4, 5, true);
  const random = makeLcg(921);
  for (let i = 0; i < 100; i++) {
    const x = 12 * random() - 6, y = 12 * random() - 6;
    const expected = directPointSearch(context, x, y, 7, 50);
    const actual = inverseSearchPointFast(context, x, y, 7, 50);
    assert.deepEqual([actual.verdict, actual.depth], expected);
  }
  const diagnostic = createInverseSearchContext(0.7, 1.4, 3, false, 1e-8, { useTrap: false });
  assert.notEqual(inverseSearchPointFast(diagnostic, 0, 0, 0, 50).verdict, 'Interior-offLens');
});

test('search records preserve reciprocal provenance and do not overclaim off-lens evidence', () => {
  const raw = inv({ re: 1.419643377607, im: 0.606290729207 });
  const result = inverseIterationTestDetailed(raw.re, raw.im, 3, 37, 1000, 1e-10);
  const certificate = buildCertificatePayload(result, { n: 3, c: raw, tol: 1e-10 });
  assert.ok(Math.hypot(certificate.c.re, certificate.c.im) > 1);
  assert.deepEqual(certificate.input_parameter, raw);
  assert.equal(certificate.parameter_convention, 'reciprocal-input');
  assert.equal(certificate.arithmetic, 'binary64');
  assert.equal(certificate.tol, 1e-10);
  assert.equal(certificate.proof_status, 'exploratory');
  assert.equal(certificate.stop_reason, 'trap-hit');
  assert.match(certificate.limitations, /not verified with interval arithmetic/);
  assert.throws(() => buildCertificatePayload({ ...result, word: [] }, { n: 3, c: raw }), /full inverse word/);
  const subnormal = { re: Number.MIN_VALUE, im: Number.MIN_VALUE };
  const unrepresentable = buildCertificatePayload(
    inverseIterationTestDetailed(subnormal.re, subnormal.im, 3), { n: 3, c: subnormal }
  );
  assert.equal(unrepresentable.c, null);
  assert.equal(unrepresentable.stop_reason, 'numerical-range');
  assert.deepEqual(JSON.parse(JSON.stringify(unrepresentable)).input_parameter, subnormal);
});

test('certificate worker preserves kMax=0, tolerance and request identifiers', async () => {
  await workerHarness('../workers/certificate-worker.js', dispatch => {
    const response = dispatch({ id: 19, x: 1.5, y: Math.sqrt(11) / 2, n: 4, kMax: 0, LMax: 1, tol: 1e-10 });
    assert.equal(response.ok, true);
    assert.equal(response.id, 19);
    assert.equal(response.certificate.k_max, 0);
    assert.equal(response.certificate.tol, 1e-10);
    assert.equal(response.certificate.stop_reason, 'depth-cap');
    assert.equal(response.certificate.proof_status, 'bounded-search-undetermined');
    const invalid = dispatch({ id: 20, x: NaN, y: 1, n: 3 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.id, 20);
  });
});

test('certificate worker preserves canonical-only policy in both search and payload', async () => {
  await workerHarness('../workers/certificate-worker.js', dispatch => {
    const job = { x: 1.419643377607, y: .606290729207, n: 3, kMax: 12, LMax: 100 };
    const legacy = dispatch({ ...job, id: 21 });
    assert.equal(legacy.ok, true);
    assert.equal(legacy.result.verdict, 'Interior-offLens');
    assert.notEqual(legacy.certificate.trap, null);
    const canonical = dispatch({ ...job, id: 22, canonicalOnly: true });
    assert.equal(canonical.ok, true);
    assert.equal(canonical.id, 22);
    assert.equal(canonical.result.verdict, 'Undetermined');
    assert.equal(canonical.certificate.verdict, canonical.result.verdict);
    assert.equal(canonical.certificate.trap, null);
    assert.equal(canonical.certificate.trap_region, null);
    assert.equal(canonical.certificate.minimum_capture_depth, null);
    assert.equal(canonical.certificate.trap_policy, 'canonical-only');
    const interior = dispatch({ ...job, id: 23, x: .7, y: 1.4, canonicalOnly: true });
    assert.equal(interior.ok, true);
    assert.equal(interior.result.verdict, 'Interior');
    assert.notEqual(interior.certificate.trap, null);
    assert.equal(interior.certificate.minimum_capture_depth, interior.result.depth);
  });
});
