import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttractorMembershipContext as context,
  classifyAttractorPoint as coverage,
  classifyAttractorCapture as capture
} from '../src/compute/attractor_membership.mjs';
import { classifyParameterView } from '../src/compute/parameter_views.mjs';
import {
  createInverseSearchContext, inverseSearchPointFast, inverseIterationTestFast
} from '../src/compute/inverse_search_kernel.mjs';
import { inverseIterationTestDetailed } from '../src/compute/inverse_search_reference.mjs';
import { buildCertificatePayload } from '../src/compute/certificate_builder.mjs';

// Independent Cartesian BFS: enumerate every digit without interval pruning,
// shared stacks, or the production traversal. Test points have generous margins
// from enclosure/trap boundaries, so the extra numerical allowance is immaterial.
function minimumByBreadthFirst(c, zx, zy, depth, { firstDigit = null, firstStep = 'original' } = {}) {
  const admitted = (x, y) => Math.abs(c.relativeY * x + c.relativeX * y) <= c.se
    && Math.abs(y) <= c.ve && Math.hypot(x, y) <= c.diskRadius;
  const captured = (x, y) => c.useTrap
    && Math.abs(c.relativeY * x + c.relativeX * y) < c.S - 1e-9
    && Math.abs(y) < c.V - 1e-9;
  if (!c.useTrap || !admitted(zx, zy)) return null;
  if (firstDigit === null && firstStep === 'original' && captured(zx, zy)) return 0;
  let frontier = [[zx, zy]];
  for (let level = 1; level <= depth; level++) {
    const next = [];
    const limit = level === 1 && firstStep === 'complement' ? c.m - 2 : c.m - 1;
    const alphabet = level === 1 && firstDigit !== null
      ? [firstDigit] : Array.from({ length: limit + 1 }, (_, index) => -limit + 2 * index);
    for (const [x, y] of frontier) for (const t of alphabet) {
      const u = c.x * (x - t) - c.y * y, v = c.y * (x - t) + c.x * y;
      if (!admitted(u, v)) continue;
      if (captured(u, v)) return level;
      next.push([u, v]);
    }
    frontier = next;
    assert.ok(frontier.length < 200000, 'oracle fixture must remain bounded');
  }
  return null;
}

test('later siblings can capture after the coverage DFS has found finite survival', () => {
  for (const example of [
    { m: 3, c: [.3, 1.2], z: [-.7, -2], expected: 1 },
    { m: 3, c: [.617, 1.023], z: [2 * .617, 2 * 1.023], expected: 1 },
    { m: 3, c: [.717, 1.023], z: [.717, 1.023], firstStep: 'complement', expected: 1 },
    { m: 4, c: [.017, 1.173], z: [.017, 1.173], firstDigit: 3, expected: 2 }
  ]) {
    const c = context(...example.c, example.m);
    const options = { firstLevelPieces: false, firstStep: example.firstStep ?? 'original',
      firstDigit: example.firstDigit ?? null };
    assert.equal(coverage(c, ...example.z, 12, options).status, 'finite-survivor');
    const result = capture(c, ...example.z, 12, options);
    assert.equal(result.minimumCaptureDepth, example.expected);
    assert.equal(result.depth, minimumByBreadthFirst(c, ...example.z, 12, options));
    assert.equal(result.captureDepthSemantics, 'minimum-verified');
    assert.equal(result.captureSearchStopReason, 'minimum-found');
  }
});

test('a first DFS capture witness is not advertised as the minimum level', () => {
  const c = context(.017, 1.223, 3);
  const z = [2 * .017, 2 * 1.223];
  const witness = coverage(c, ...z, 12, { firstLevelPieces: false });
  assert.equal(witness.status, 'captured');
  assert.equal(witness.depth, 3);
  assert.equal(witness.minimumCaptureDepth, null);
  assert.equal(witness.captureDepthSemantics, 'witness-upper-bound');
  const minimum = capture(c, ...z, 12);
  assert.equal(minimum.minimumCaptureDepth, 1);
  assert.equal(minimum.firstDigit, 0);
});

test('minimum capture agrees with an independent level-order oracle for both parities and first alphabets', () => {
  for (const m of [2, 3, 4, 5]) {
    const c = context(.3, 1.1, m);
    for (const firstStep of ['original', 'complement']) {
      for (let ix = -5; ix <= 5; ix++) for (let iy = -5; iy <= 5; iy++) {
        const z = [ix * .517 + .027, iy * .373 + .019];
        const options = { firstStep };
        const actual = capture(c, ...z, 7, options);
        const expected = minimumByBreadthFirst(c, ...z, 7, options);
        assert.equal(actual.minimumCaptureDepth, expected,
          `m=${m}, first=${firstStep}, z=${z}, stop=${actual.stopReason}`);
        assert.ok(actual.work <= 20000);
      }
    }
  }
});

test('E(2i,5) has independently known minimum levels zero, one and two', () => {
  const c = context(0, 2, 5);
  // E is [-16/3,16/3] x [-8/3,8/3], and its strict trap is
  // (-5,5) x (-5/2,5/2). The final example returns via [0,-4].
  for (const [x, y, expected] of [[0, 0, 0], [5.1, 0, 1], [0, 2.55, 2]]) {
    assert.equal(capture(c, x, y, 12).minimumCaptureDepth, expected);
  }
  assert.equal(capture(c, 0, 0, 12, { firstLevelPieces: true }).minimumCaptureDepth, 0,
    'union capture cannot change when first-piece colors are enabled');
});

test('a required first digit counts once and is never bypassed by root capture', () => {
  const c = context(.1, 1.1, 2);
  assert.equal(capture(c, 0, 0, 0).minimumCaptureDepth, 0);
  for (const options of [{ firstStep: 'complement' }, { firstDigit: 0 }]) {
    assert.equal(capture(c, 0, 0, 0, options).minimumCaptureDepth, null);
    assert.equal(capture(c, 0, 0, 12, options).minimumCaptureDepth, 1);
  }
  const d = context(.017, 1.173, 4);
  assert.equal(capture(d, d.x, d.y, 1, { firstDigit: 3 }).minimumCaptureDepth, null);
  assert.equal(capture(d, d.x, d.y, 2, { firstDigit: 3 }).minimumCaptureDepth, 2);
});

test('capture budgets are cumulative and an optional refinement cap preserves prior coverage', () => {
  const c = context(.017, 1.223, 3), z = [2 * c.x, 2 * c.y];
  const baseline = coverage(c, ...z, 12, { firstLevelPieces: false });
  const capped = coverage(c, ...z, 12,
    { firstLevelPieces: false, minimumCapture: true, maxWork: baseline.work + 1 });
  assert.equal(capped.verdict, baseline.verdict);
  assert.equal(capped.depth, baseline.depth);
  assert.equal(capped.firstDigit, baseline.firstDigit);
  assert.equal(capped.minimumCaptureDepth, null);
  assert.equal(capped.captureSearchStopReason, 'work-cap');
  assert.equal(capped.work, baseline.work + 1);
  const enough = coverage(c, ...z, 12,
    { firstLevelPieces: false, minimumCapture: true, maxWork: 100 });
  assert.equal(enough.minimumCaptureDepth, 1);
  const noMinimum = capture(context(.017, 1.173, 4), .017, 1.173, 12,
    { firstDigit: 3, maxWork: 2 });
  assert.equal(noMinimum.minimumCaptureDepth, null);
  assert.equal(noMinimum.captureSearchStopReason, 'work-cap');
  assert.equal(noMinimum.work, 2);
});

test('parameter coverage and center capture are separately labelled for every selected layer', () => {
  const options = { parameterRadius: .001, parameterLayers: ['mn', 'mn0', 'mn1'],
    parameterDigits: [-3, -2, -1, 0, 1, 2, 3], escapeDepth: 12 };
  const args = [.017, 1.173, 4, 37, 1000, 1e-8, 'compare'];
  const colored = classifyParameterView(...args, options);
  const plain = classifyParameterView(...args, { ...options, captureStyle: 'sets' });
  for (const [key, value] of Object.entries({ ...colored.layers, ...colored.digits })) {
    const unshaded = plain.layers[key] ?? plain.digits[key];
    const { captureSample } = value;
    assert.deepEqual(value, unshaded, 'color style cannot change coverage or capture diagnostics');
    assert.equal(value.sampleType, 'parameter-cell');
    assert.equal(captureSample.sampleType, 'point');
    assert.equal(captureSample.sampling, 'parameter-pixel-center');
    assert.equal(captureSample.pixelRadius, 0);
    assert.equal(captureSample.markedPointScale, key === 'mn' ? 2 : 1);
    const c = context(...args.slice(0, 2), key === 'mn' ? 7 : 4);
    const scale = key === 'mn' ? 2 : 1;
    const firstStep = key === 'mn1' ? 'complement' : 'original';
    const firstDigit = /^-?\d+$/.test(key) ? Number(key) : null;
    assert.equal(captureSample.minimumCaptureDepth,
      minimumByBreadthFirst(c, scale * c.x, scale * c.y, 12, { firstStep, firstDigit }));
  }
  assert.equal(colored.mn0.captureSample.minimumCaptureDepth, 0);
  assert.equal(colored.mn1.captureSample.minimumCaptureDepth, 1);
  assert.equal(colored.digits['3'].captureSample.minimumCaptureDepth, 2);
});

test('a center capture does not claim that a lens-crossing cell is captured', () => {
  const result = classifyParameterView(.1, 1.3, 2, 37, 1000, 1e-8, 'mn0',
    { parameterRadius: .05 });
  assert.equal(result.usesTrap, false);
  assert.notEqual(result.status, 'captured');
  assert.equal(result.captureSample.usesTrap, true);
  assert.equal(result.captureSample.minimumCaptureDepth, 0);
  const invalid = classifyParameterView(.01, .01, 4, 37, 1000, 1e-8, 'mn',
    { parameterRadius: .02 });
  assert.equal(invalid.stopReason, 'outside-domain');
  assert.equal(invalid.captureSample, undefined);
  const knownValidPart = classifyParameterView(.7, .7, 4, 37, 1000, 1e-8, 'mn',
    { parameterRadius: .1 });
  assert.equal(knownValidPart.stopReason, 'analytic-membership');
  assert.equal(knownValidPart.membershipScope, 'all-valid-parameters');
  assert.equal(knownValidPart.excludedParameterLocus, 'unit-circle');
  assert.equal(knownValidPart.minimumCaptureDepth, null);
  assert.equal(knownValidPart.captureSample.minimumCaptureDepth, 0,
    'the sampled expanding center has its own depth-zero canonical capture');
});

test('capture depth follows kMax independently of boundary escape depth', () => {
  const options = { parameterRadius: .001, escapeDepth: 0,
    parameterLayers: [], parameterDigits: [3] };
  const atDepth = kMax => classifyParameterView(.017, 1.173, 4, kMax, 1000, 1e-8, 'mn0', options);
  const zero = atDepth(0), one = atDepth(1), two = atDepth(2);
  for (const result of [zero, one, two]) {
    assert.equal(result.status, 'finite-survivor');
    assert.equal(result.depth, 0, 'coverage keeps its independently selected boundary depth');
  }
  assert.equal(zero.captureSample.minimumCaptureDepth, null);
  assert.equal(one.captureSample.minimumCaptureDepth, null);
  assert.equal(two.captureSample.minimumCaptureDepth, 2);
  assert.equal(two.captureSample.maxDepth, 2);
  const explicit = classifyParameterView(.017, 1.173, 4, 0, 1000, 1e-8, 'mn0',
    { ...options, captureDepth: 2 });
  assert.equal(explicit.captureSample.minimumCaptureDepth, 2);
  const selected = classifyParameterView(.017, 1.173, 4, 2, 1000, 1e-8, 'mn0',
    { ...options, parameterRadius: 0, minimumCapture: true });
  assert.equal(selected.verdict, 'Interior');
  assert.equal(selected.minimumCaptureDepth, 2,
    'selected-point records use the established minimum even beyond boundary depth');
});

test('the original-lens Mn0 center has depth zero rather than artificial positive strata', () => {
  for (const n of [2, 3, 4, 5, 10]) for (const x of [-.1, .1]) {
    const c = context(x, 1.1, n);
    assert.equal(c.useTrap, true);
    assert.equal(capture(c, x, 1.1, 12).minimumCaptureDepth, 0);
  }
});

test('the historical off-lens rectangle is never used as a current capture trap', () => {
  const c = context(3, 3, 3), z = [.25, .05];
  // All children have |Im| >= .9, but E(3+3i,3) has vertical support
  // <= 2/(sqrt(18)-1) < 2/3. Thus this alleged depth-zero capture is exterior.
  assert.ok(2 / (Math.sqrt(18) - 1) < 2 / 3);
  const legacy = createInverseSearchContext(3, 3, 3, false);
  assert.equal(inverseSearchPointFast(legacy, ...z, 16).verdict, 'Interior-offLens');
  const canonical = createInverseSearchContext(3, 3, 3, false, 1e-8, { useTrap: false });
  assert.equal(inverseSearchPointFast(canonical, ...z, 16).verdict, 'Exterior');
  assert.equal(coverage(c, ...z, 16).verdict, 'Exterior');
  assert.equal(capture(c, ...z, 16).captureSearchStopReason, 'trap-unavailable');
  assert.equal(capture(c, ...z, 16).work, 0);
  assert.equal(capture(context(0, 2, 4), 0, 0, 16).minimumCaptureDepth, null,
    'the closed canonical lens boundary does not acquire a trap');
});

test('modern parameter records use canonical capture while archived replay remains available', () => {
  const c = { re: 1.419643377607, im: .606290729207 }, n = 3;
  const args = [c.re, c.im, n, 12, 100, 1e-8];
  const legacy = inverseIterationTestDetailed(...args);
  assert.equal(legacy.verdict, 'Interior-offLens');
  const detailed = inverseIterationTestDetailed(...args, { canonicalOnly: true });
  const fast = inverseIterationTestFast(...args, { canonicalOnly: true });
  assert.equal(detailed.verdict, 'Interior');
  assert.equal(detailed.stopReason, 'analytic-membership');
  assert.equal(detailed.analyticReason, 'mn-inner-annulus');
  assert.equal(detailed.minimumCaptureDepth, null);
  assert.equal(fast.verdict, detailed.verdict);
  assert.equal(fast.depth, detailed.depth);
  const modern = classifyParameterView(...args, 'mn');
  assert.equal(modern.verdict, detailed.verdict);
  assert.equal(modern.minimumCaptureDepth, null);
  const options = { n, c, kMax: 12, LMax: 100, tol: 1e-8, canonicalOnly: true };
  const payload = buildCertificatePayload(detailed, options);
  assert.equal(payload.trap, null);
  assert.equal(payload.trap_region, null);
  assert.equal(payload.minimum_capture_depth, null);
  assert.equal(payload.trap_policy, 'canonical-only');
  assert.throws(() => buildCertificatePayload(legacy, options), /canonical-only/);
  assert.notEqual(buildCertificatePayload(legacy, { ...options, canonicalOnly: false }).trap, null);
  const captured = inverseIterationTestDetailed(.7, 1.4, 3, 12, 100, 1e-8, { canonicalOnly: true });
  const interiorPayload = buildCertificatePayload(captured,
    { ...options, c: { re: .7, im: 1.4 } });
  assert.equal(interiorPayload.minimum_capture_depth, captured.depth);
});
