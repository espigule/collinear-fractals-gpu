import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttractorMembershipContext as context,
  classifyAttractorPoint as classify,
  classifyAttractorCapture as capture
} from '../src/compute/attractor_membership.mjs';
import { classifyParameterView, classifyParameterDigit } from '../src/compute/parameter_views.mjs';
import { computeEnclosureGeneral, inverseIterationTestDetailed } from '../src/compute/inverse_search_reference.mjs';
import { inverseIterationTestFast } from '../src/compute/inverse_search_kernel.mjs';
import { analyticConnectednessResult } from '../src/math/connectedness_regions.mjs';
import { createComplexTreeGuidance, preferredComplexTreeDigit } from '../src/compute/tree_guidance.mjs';
import { prepareRasterJob, renderRasterTile, RASTER_CODES } from '../src/compute/raster_jobs.mjs';

const isMember = result => result.verdict === 'Member' || result.verdict === 'Interior';
const hasMinimum = result => Number.isInteger(result?.minimumCaptureDepth);

// For real |c| <= m the first-level intervals meet or overlap, so
// E(c,m)=[-R,R], R=(m-1)|c|/(|c|-1). This is an independent IFS interval
// calculation, not an inverse-search or production-enclosure oracle.
function realMembership(c, n, layer, digit = null) {
  if (Math.abs(c) < 1) c = 1 / c;
  const rho = Math.abs(c);
  if (!(rho > 1) || rho > n) return false;
  if (layer === 'mn' || layer === 'mn0') return true;
  const halfWidth = (n - 1) / (rho - 1);
  if (digit !== null) return Math.abs(c - digit) <= halfWidth;
  // Complementary first pieces have centers A_(n-1), spacing two and
  // half-width >=1, so their union is a single interval.
  return rho <= n - 2 + halfWidth;
}

test('the exact real Mn trace includes ±n and respects the reciprocal chart', () => {
  for (const n of [2, 3, 5, 10, 32, 100]) {
    for (const rho of [1.125, (n + 1) / 2, n - .125, n, n + .125]) {
      for (const sign of [-1, 1]) for (const reciprocal of [false, true]) {
        const x = sign * (reciprocal ? 1 / rho : rho);
        const expected = rho <= n;
        for (const classifier of [inverseIterationTestFast, inverseIterationTestDetailed]) {
          const result = classifier(x, 0, n, 0, 1000, 1e-8, { canonicalOnly: true });
          assert.equal(isMember(result), expected, `${classifier.name}, n=${n}, c=${x}`);
          if (!expected) assert.equal(result.verdict, 'Exterior');
          assert.equal(result.minimumCaptureDepth, null, 'interval membership has no inverse capture word');
          assert.equal(result.evidenceType, 'analytic');
          assert.equal(result.work, 0);
        }
        const result = classifyParameterView(x, 0, n, 0, 1000, 1e-8, 'mn');
        assert.equal(isMember(result), expected);
        assert.equal(result.minimumCaptureDepth, null);
      }
    }
  }
});

test('real original, complementary and fixed-digit sets agree with interval IFS oracles', () => {
  for (const n of [2, 3, 5, 8]) {
    const complementEnd = ((n - 1) + Math.sqrt((n - 1) ** 2 + 4)) / 2;
    for (const rho of [1.125, (n + 1) / 2, complementEnd - .01, complementEnd + .01, n, n + .125]) {
      for (const sign of [-1, 1]) for (const reciprocal of [false, true]) {
        const x = sign * (reciprocal ? 1 / rho : rho);
        const result = classifyParameterView(x, 0, n, 12, 1000, 1e-8, 'compare',
          { parameterLayers: ['mn0', 'mn1'], escapeDepth: 12 });
        for (const layer of ['mn0', 'mn1']) {
          const actual = result.layers[layer];
          assert.equal(isMember(actual), realMembership(x, n, layer), `n=${n}, c=${x}, ${layer}`);
          if (!realMembership(x, n, layer)) assert.equal(actual.verdict, 'Exterior');
          assert.equal(hasMinimum(actual.captureSample ?? actual), false);
        }
        for (let digit = 1 - n; digit <= n - 1; digit++) {
          const actual = classifyParameterDigit(x, 0, n, digit);
          const expected = realMembership(x, n, 'digit', digit);
          assert.equal(isMember(actual), expected, `n=${n}, c=${x}, digit=${digit}`);
          if (!expected) assert.equal(actual.verdict, 'Exterior');
          assert.equal(hasMinimum(actual.captureSample ?? actual), false);
        }
      }
    }
  }
});

test('the dynamical real interval and disconnected real IFS retain their distinct geometry', () => {
  for (const m of [2, 3, 5, 8]) for (const sign of [-1, 1]) {
    for (const rho of [1.25, m - .125, m]) {
      const c = context(sign * rho, 0, m);
      assert.equal(c.error, undefined);
      const radius = (m - 1) * rho / (rho - 1);
      for (const point of [-radius, -.417 * radius, 0, .583 * radius, radius]) {
        const result = classify(c, point, 0, 12, { firstLevelPieces: false });
        assert.equal(isMember(result), true, `m=${m}, c=${sign * rho}, z=${point}`);
        assert.equal(hasMinimum(result), false);
      }
      assert.equal(classify(c, radius + .1, 0, 12).verdict, 'Exterior');
      assert.equal(classify(c, 0, .1, 12).verdict, 'Exterior');
      assert.equal(capture(c, 0, 0, 12).minimumCaptureDepth, null);
    }
  }
  // For c=±4 and A_2={-1,1}, the attractor is disconnected and avoids zero.
  // Periodic inverse words give exact members without assuming an interval.
  for (const cValue of [-4, 4]) {
    const c = context(cValue, 0, 2);
    assert.equal(classify(c, 0, 0, 12).verdict, 'Exterior');
    for (const word of [[-1], [1], [1, -1], [-1, -1, 1]]) {
      const numerator = word.reduce((sum, digit, index) => sum + digit * cValue ** -index, 0);
      const point = numerator / (1 - cValue ** -word.length);
      const result = classify(c, point, 0, 12, { firstLevelPieces: false });
      assert.notEqual(result.verdict, 'Exterior', `c=${cValue}, word=${word}, z=${point}`);
      assert.equal(hasMinimum(result), false);
    }
  }
});

test('unit-circle points never acquire capture and crossing-cell membership excludes the circle', () => {
  for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.6, .8]]) {
    assert.equal(analyticConnectednessResult(x, y, 4), null);
    for (const parameterRadius of [0, .001]) {
      const result = classifyParameterView(x, y, 4, 37, 1000, 1e-8, 'compare',
        { parameterRadius, parameterLayers: ['mn', 'mn0', 'mn1'], parameterDigits: [-3, 0, 3] });
      for (const layer of Object.values({ ...result.layers, ...result.digits })) {
        const knownValidPart = parameterRadius > 0 && layer.set === 'mn' && (x !== 0 || y !== 0);
        assert.equal(layer.verdict, knownValidPart ? 'Interior' : 'Undetermined',
          `${x},${y}, r=${parameterRadius}, ${layer.set}`);
        if (knownValidPart) {
          assert.equal(layer.membershipScope, 'all-valid-parameters');
          assert.equal(layer.excludedParameterLocus, 'unit-circle');
        }
        assert.equal(hasMinimum(layer), false);
        assert.equal(hasMinimum(layer.captureSample), false);
        assert.equal(layer.work ?? 0, 0);
      }
    }
  }
  for (const [x, y, radius] of [[.7, .7, .02], [1.0001, .0001, .001], [.9999, 0, .001]]) {
    const result = classifyParameterView(x, y, 4, 37, 1000, 1e-8, 'mn', { parameterRadius: radius });
    assert.equal(result.stopReason, 'analytic-membership');
    assert.equal(result.membershipScope, 'all-valid-parameters');
    assert.equal(result.excludedParameterLocus, 'unit-circle');
    assert.equal(hasMinimum(result), false);
    const c = context(x, y, 7);
    const actualCenter = capture(c, 2 * c.x, 2 * c.y, 37);
    assert.equal(result.captureSample.minimumCaptureDepth, actualCenter.minimumCaptureDepth,
      'an independently valid center can retain capture even when its footprint crosses the circle');
  }
});

test('annulus shortcuts preserve independent finite-capture minima', () => {
  const x = .017, y = 1.223, n = 2;
  const analytic = analyticConnectednessResult(x, y, n);
  assert.equal(analytic?.verdict, 'Interior');
  assert.equal(analytic.minimumCaptureDepth, null);
  const result = classifyParameterView(x, y, n, 12, 1000, 1e-8, 'mn', { parameterRadius: .001 });
  assert.equal(isMember(result), true);
  assert.equal(result.captureSample.minimumCaptureDepth, 1);
  assert.equal(result.captureSample.captureDepthSemantics, 'minimum-verified');
  const raster = prepareRasterJob({ kind: 'parameter', n, width: 1, height: 1,
    center: { x, y }, spanX: .001, kMax: 12, parameterMode: 'mn' });
  const tile = renderRasterTile(raster, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(tile.data[0], RASTER_CODES.INTERIOR);
  assert.equal(tile.captureDepths[0], 1);
  assert.equal(tile.layerCaptureDepths[0], 1);
});

test('a parameter disk centered on a real endpoint is not certified by its center interval', () => {
  const point = classifyParameterView(2, 0, 2, 12, 1000, 1e-8, 'mn');
  assert.equal(isMember(point), true);
  const cell = classifyParameterView(2, 0, 2, 12, 1000, 1e-8, 'mn', { parameterRadius: .001 });
  assert.notEqual(cell.stopReason, 'analytic-membership');
  assert.equal(hasMinimum(cell), false);
  assert.equal(hasMinimum(cell.captureSample), false);
  assert.notEqual(cell.verdict, 'Exterior', 'the disk includes an exact member at its center');
});

test('real dynamical rasters use the correct footprint for both E and its half difference', () => {
  // E(±2,3)=[-4,4], and (E-E)/2 is the same interval. A displayed disk
  // therefore meets either set iff its Euclidean distance to [-4,4] is at
  // most span/sqrt(2). The difference search must double the pixel radius
  // together with its marked coordinate 2z.
  for (const cx of [-2, -.5, .5, 2]) {
    for (const originalRenderer of ['boundary', 'survival']) {
      for (const [x, y, spanX] of [[4.4, 0, .7], [4.4, 0, .5], [0, .4, .7], [0, .4, .5], [0, 0, .1]]) {
        const radius = Math.SQRT1_2 * spanX;
        const expected = Math.hypot(Math.max(0, Math.abs(x) - 4), y) <= radius;
        const prepared = prepareRasterJob({ kind: 'dynamical', width: 1, height: 1,
          center: { x, y }, spanX, n: 3, cx, cy: 0, kMax: 12,
          showDifference: true, showOriginalSurvival: true, originalRenderer,
          firstLevelPieces: false });
        const tile = renderRasterTile(prepared, { x: 0, y: 0, width: 1, height: 1 });
        for (const channel of [0, 2]) {
          assert.equal(tile.data[channel] === RASTER_CODES.INTERIOR, expected,
            `c=${cx}, z=${x}+${y}i, span=${spanX}, renderer=${originalRenderer}, channel=${channel}`);
          if (!expected) assert.equal(tile.data[channel], RASTER_CODES.EXTERIOR);
          assert.equal(tile.captureDepths[channel / 2], 255,
            'real interval membership cannot invent a canonical capture level');
        }
      }
    }
  }
});

test('optimized nonreal enclosures contain independent trigonometric support sums', () => {
  const fixtures = [[0, 1.25], [0, 2], [.3, 1.2], [-.3, 1.2], [2, .5], [2, -.5],
    [-2, .5], [1.001, 1e-8], [1.00001, .0001], [1.5, 1e-12], [-1.5, 1e-12], [3, 3]];
  for (const m of [2, 5, 63]) for (const [x, y] of fixtures) {
    const actual = computeEnclosureGeneral(x, y, m);
    assert.equal(actual.err, false);
    const rho = Math.hypot(x, y), theta = Math.atan2(y, x);
    let partialVertical = 0;
    for (let k = 1; k <= 4096; k++) {
      partialVertical += (m - 1) * rho ** -k * Math.abs(Math.sin(k * theta));
    }
    const allowance = 1e-11 * Math.max(1, partialVertical);
    assert.ok(actual.ve + allowance >= partialVertical, `vertical support m=${m}, c=${x}+${y}i`);
    const partialSlanted = (m - 1) * Math.abs(y) / rho + partialVertical / rho;
    assert.ok(actual.se + allowance >= partialSlanted, `slanted support m=${m}, c=${x}+${y}i`);
    if (x === 0) {
      const exactVertical = (m - 1) * rho / (rho * rho - 1);
      assert.ok(actual.ve + allowance >= exactVertical);
      assert.ok(actual.ve - exactVertical < 1e-6 * m);
    }
  }
});

test('complex-tree preferred digits minimize a direct Cartesian parallelogram score', () => {
  for (const m of [3, 5, 15, 63]) {
    for (const [x, y] of [[0, 1.2], [1.2, .2], [2, .5], [-2, .5], [2, -.5], [3, 3], [1.001, 1e-8]]) {
      const g = createComplexTreeGuidance(x, y, m);
      assert.ok(g);
      for (const [u, v] of [[0, 0], [.25, .05], [2 * x, 2 * y], [-3.7, 2.19], [12.3, -.029]]) {
        for (const [low, high] of [[1 - m, m - 1], [1 - m, m - 2], [-2, 2], [0, 0]]) {
          const preferred = preferredComplexTreeDigit(g, u, v, low, high);
          const scores = [];
          for (let digit = low; digit <= high; digit += 2) {
            const childX = x * (u - digit) - y * v;
            const childY = y * (u - digit) + x * v;
            const score = Math.max(
              Math.abs(y * childX + x * childY) / ((m - 1) * Math.abs(y)),
              Math.abs(childY) / (g.B * Math.abs(y) / (x * x + y * y)));
            scores.push({ digit, score });
          }
          const actual = scores.find(value => value.digit === preferred);
          assert.ok(actual, `the preferred digit remains inside the admissible step-two range`);
          const best = Math.min(...scores.map(value => value.score));
          assert.ok(actual.score <= best + 1e-10 * Math.max(1, best),
            `m=${m}, c=${x}+${y}i, z=${u}+${v}i, range=${low}:${high}`);
        }
      }
    }
  }
});

test('guided traversal preserves exhaustive Cartesian finite survival and all minimum fields', () => {
  function cartesianSurvives(c, zx, zy, depth) {
    const admitted = (x, y) => Math.abs(c.relativeY * x + c.relativeX * y) <= c.se
      && Math.abs(y) <= c.ve && Math.hypot(x, y) <= c.diskRadius;
    if (!admitted(zx, zy)) return false;
    let frontier = [[zx, zy]];
    for (let level = 0; level < depth; level++) {
      const next = [];
      for (const [x, y] of frontier) for (let digit = 1 - c.m; digit <= c.m - 1; digit += 2) {
        const u = c.x * (x - digit) - c.y * y;
        const v = c.y * (x - digit) + c.x * y;
        if (admitted(u, v)) next.push([u, v]);
      }
      assert.ok(next.length < 100000, 'the independent oracle must remain bounded');
      frontier = next;
    }
    return frontier.length !== 0;
  }
  for (const [m, x, y] of [[3, 1.4, .5], [5, 2.2, .7], [5, -2.2, .7], [7, 2, .5], [15, 3.8, 1.1]]) {
    const c = context(x, y, m);
    assert.equal(c.useTrap, false, 'these fixtures exercise the off-lens traversal');
    for (let ix = -3; ix <= 3; ix++) for (let iy = -2; iy <= 2; iy++) {
      const zx = ix * .731 + .173, zy = iy * .457 + .281;
      const expected = cartesianSurvives(c, zx, zy, 5);
      for (const treeGuidance of [false, true]) {
        const result = classify(c, zx, zy, 5,
          { treeGuidance, maxWork: 200000, firstLevelPieces: false });
        assert.equal(result.status === 'finite-survivor', expected,
          `m=${m}, c=${x}+${y}i, z=${zx}+${zy}i, guided=${treeGuidance}`);
        assert.equal(result.verdict, expected ? 'Undetermined' : 'Exterior');
        assert.equal(result.minimumCaptureDepth, null);
      }
    }
  }
});

test('the historical off-lens parallelogram cannot produce false capture', () => {
  const c = context(3, 3, 3), point = [.25, .05];
  // The old P contains this point. Every inverse child has |Im|>=.9,
  // exceeding the independent disk support 2/(sqrt(18)-1)<2/3.
  assert.ok(Math.abs(point[1]) < 2 * 3 / 18);
  assert.ok(2 / (Math.sqrt(18) - 1) < 2 / 3);
  const result = classify(c, ...point, 16, { firstLevelPieces: false, treeGuidance: true });
  assert.equal(result.verdict, 'Exterior');
  assert.equal(hasMinimum(result), false);
  assert.equal(capture(c, ...point, 16).minimumCaptureDepth, null);
});
