import test from 'node:test';
import assert from 'node:assert/strict';
import { prefixCenters, tailRadius } from '../src/math/prefix_cylinders.mjs';
import { renderPrefixAttractor } from '../src/renderers/attractor_prefix.mjs';
import { renderHistogramAttractor } from '../src/renderers/attractor_histogram.mjs';
import { createInverseSearchContext, inverseSearchPointFast } from '../src/compute/inverse_search_kernel.mjs';
import { inverseIterationTestDetailed } from '../src/compute/inverse_search_reference.mjs';
import { attractorBounds } from '../src/math/attractor_bounds.mjs';

// An exact, visibly asymmetric fixture: for c=2i and n=4, the even and
// odd digits are independent radix -4 expansions with digits {-3,-1,1,3}.
// Consequently E(c,4)=[-4,4] x [-2,2], while E(c,4)/c=[-1,1] x [-2,2].
// This distinguishes a misplaced factor 1/c without trusting a reference image.
const c = { re: 0, im: 2 };
const scale = 40;
const origin = { x: 240, y: 160 };
const project = (x, y) => ({ x: origin.x + scale * x, y: origin.y - scale * y });

function context() {
  return {
    circles: [], pixels: [], saved: 0,
    save() { this.saved++; },
    restore() { this.saved--; },
    beginPath() {},
    arc(x, y, radius) { this.circles.push({ x, y, radius }); },
    fill() {},
    fillRect(x, y) { this.pixels.push({ x, y }); }
  };
}

function normalizedKey(z) {
  return `${z.re === 0 ? 0 : z.re},${z.im === 0 ? 0 : z.im}`;
}

function coversCircle(ctx, x, y) {
  const p = project(x, y);
  return ctx.circles.some(disk => Math.hypot(p.x - disk.x, p.y - disk.y) <= disk.radius);
}

function sampledPatch(ctx, x, y, radius = 0.125) {
  const p = project(x, y);
  return ctx.pixels.some(pixel => Math.abs(pixel.x - p.x) <= scale * radius && Math.abs(pixel.y - p.y) <= scale * radius);
}

test('finite IFS geometry has the expected original-scale support and sign symmetry', () => {
  const centers = prefixCenters(c, 4, 6);
  const maxX = Math.max(...centers.map(z => Math.abs(z.re)));
  const maxY = Math.max(...centers.map(z => Math.abs(z.im)));
  assert.equal(maxX, 3 * (1 + 1 / 4 + 1 / 16));
  assert.equal(maxY, maxX / 2);
  assert.ok(maxX > 3, 'E(c,4)/c would never reach |Re z| > 1');
  assert.equal(tailRadius(c, 4, 6), 3 / 32);
  const oppositeParameter = prefixCenters({ re: 0, im: -2 }, 4, 6);
  assert.deepEqual(new Set(centers.map(normalizedKey)), new Set(oppositeParameter.map(normalizedKey)));
});

test('prefix Canvas geometry occupies z=3 and respects the original rectangle boundary', () => {
  const ctx = context();
  const metadata = renderPrefixAttractor(ctx, {
    c, m: 4, requestedDepth: 6, maxPrefixes: 60000, pixelRadius: 1 / scale, project
  });
  assert.equal(metadata.maps, 'z -> t + z/c');
  assert.equal(metadata.rendered_prefixes, 4 ** 6);
  assert.equal(metadata.tail_disks_clipped, false);
  assert.ok(coversCircle(ctx, 3, 0), 'the original attractor must cover this interior point');
  assert.ok(coversCircle(ctx, -3, 0));
  assert.ok(!coversCircle(ctx, 4.25, 0), 'original-attractor support cannot extend this far');
  assert.ok(!coversCircle(ctx, 0, 2.25));
  assert.equal(ctx.saved, 0);
});

test('seeded-histogram Canvas geometry uses the same world coordinates as prefix mode', () => {
  const ctx = context();
  const metadata = renderHistogramAttractor(ctx, {
    c, m: 4, samples: 16384, burnIn: 64, seed: 20260917, project
  });
  assert.equal(metadata.maps, 'z -> t + z/c');
  assert.ok(sampledPatch(ctx, 3, 0), 'histogram points must reach the original-scale interior');
  assert.ok(sampledPatch(ctx, -3, 0));
  assert.ok(!sampledPatch(ctx, 4.25, 0));
  assert.ok(!sampledPatch(ctx, 0, 2.25));
  for (const pixel of ctx.pixels) {
    assert.ok(Math.abs(pixel.x - origin.x) <= 4 * scale + 0.5);
    assert.ok(Math.abs(pixel.y - origin.y) <= 2 * scale + 0.5);
  }
  assert.equal(ctx.saved, 0);
});

test('inverse-survival mode tests z in E(c,n), without an extra multiplication by c', () => {
  const original = createInverseSearchContext(0, 2, 4, false, 1e-10, { useTrap: false });
  for (const point of [[3, 0], [-3, 0], [0, 1.5], [0.5, 0.5]]) {
    const found = inverseSearchPointFast(original, ...point, 12, 1000);
    assert.notEqual(found.verdict, 'Exterior');
  }
  for (const point of [[4.25, 0], [-4.25, 0], [0, 2.25], [0, -2.25]]) {
    assert.equal(inverseSearchPointFast(original, ...point, 12, 1000).verdict, 'Exterior');
  }
  // An erroneous test at c*z sends z=3 to 6i, which lies outside E(c,4).
  assert.equal(inverseSearchPointFast(original, 0, 6, 12, 1000).verdict, 'Exterior');
});

test('half-difference geometry tests 2z in E(c,2n-1), keeping the factor two explicit', () => {
  // For this fixture E(c,7)=[-8,8] x [-4,4]; half of it equals E(c,4).
  const difference = createInverseSearchContext(0, 2, 7, true, 1e-10);
  const halfDifferenceVerdict = (x, y) => inverseSearchPointFast(difference, 2 * x, 2 * y, 12, 1000).verdict;
  assert.equal(halfDifferenceVerdict(3, 0), 'Interior');
  assert.equal(halfDifferenceVerdict(4.25, 0), 'Exterior');
  assert.equal(halfDifferenceVerdict(0, 2.25), 'Exterior');
  // Omitting the factor two would incorrectly accept the same exterior point.
  assert.equal(inverseSearchPointFast(difference, 4.25, 0, 12, 1000).verdict, 'Interior');
});

test('finite prefix difference identity and original-in-half-difference inclusion share a coordinate system', () => {
  const original = prefixCenters(c, 4, 2);
  const difference = prefixCenters(c, 7, 2);
  const pairwiseDifferences = new Set();
  for (const a of original) for (const b of original) {
    pairwiseDifferences.add(normalizedKey({ re: a.re - b.re, im: a.im - b.im }));
  }
  assert.deepEqual(pairwiseDifferences, new Set(difference.map(normalizedKey)));
  const halfDifference = new Set(difference.map(z => normalizedKey({ re: z.re / 2, im: z.im / 2 })));
  for (const point of original) assert.ok(halfDifference.has(normalizedKey(point)));
});

test('near-unit binary parameters are not rejected by a fixed display rectangle', () => {
  // Every binary parameter with 1 < |c| < sqrt(2) is connected: disjoint
  // first-level pieces would force a strong-separation dimension greater than 2.
  // A previous renderer's rho<=1.0001 fallback [-2,2]^2 incorrectly rejected
  // the marked point 2c in both of these explicit cases at depth zero.
  for (const [x, y] of [[1.00009, 0.00002], [1.00005, 0.00001]]) {
    assert.ok(Math.hypot(x, y) > 1 && Math.hypot(x, y) < Math.sqrt(2));
    assert.ok(2 * x > 2);
    const found = inverseIterationTestDetailed(x, y, 2, 37, 1000);
    assert.notEqual(found.verdict, 'Exterior');
    assert.equal(found.verdict, 'Interior-offLens');
  }
});

test('Cartesian support bounds include the leading digit and converge to the exact rectangle', () => {
  const bounds = attractorBounds(c, 4);
  assert.ok(bounds.xMax >= 4 && bounds.xMax - 4 < 1e-8);
  assert.ok(bounds.yMax >= 2 && bounds.yMax - 2 < 1e-8);
  assert.ok(bounds.tailRadius > 0 && bounds.tailRadius <= 1e-9);
  assert.equal(bounds.tailCapHit, false);
  assert.ok(bounds.terms > 1 && bounds.terms <= 2000);
  const realBounds = attractorBounds({ re: 2, im: 0 }, 3);
  assert.ok(realBounds.xMax >= 4 && realBounds.xMax - 4 < 1e-8);
  assert.ok(realBounds.yMax >= 0 && realBounds.yMax < 1e-8);
});

test('Cartesian bounds enclose finite IFS prefixes in every quadrant and fit the half-difference hull', () => {
  for (const parameter of [
    { re: 0.7, im: 1.4 }, { re: -0.7, im: 1.4 },
    { re: 0.7, im: -1.4 }, { re: -0.7, im: -1.4 }, { re: 0, im: 200 }
  ]) {
    const bounds = attractorBounds(parameter, 4);
    assert.ok(bounds.xMax >= 3, 'the leading real digit alone reaches n-1');
    for (const point of prefixCenters(parameter, 4, 5)) {
      assert.ok(Math.abs(point.re) <= bounds.xMax);
      assert.ok(Math.abs(point.im) <= bounds.yMax);
    }
    const difference = attractorBounds(parameter, 7);
    assert.ok(Math.abs(bounds.xMax - difference.xMax / 2) < 1e-8);
    assert.ok(Math.abs(bounds.yMax - difference.yMax / 2) < 1e-8);
  }
});

test('Cartesian bounds retain a positive remainder at the term cap and reject invalid inputs', () => {
  const capped = attractorBounds({ re: 0, im: 1.00001 }, 4, { tol: 1e-12, maxTerms: 8 });
  assert.equal(capped.terms, 8);
  assert.equal(capped.tailCapHit, true);
  assert.ok(capped.tailRadius > 1e5);
  assert.ok(capped.xMax > capped.tailRadius && capped.yMax > capped.tailRadius);
  const extreme = attractorBounds({ re: 1e308, im: 0 }, 4, { tol: Number.MIN_VALUE });
  assert.ok(Number.isFinite(extreme.xMax) && Number.isFinite(extreme.yMax));
  assert.ok(extreme.xMax >= 3 && extreme.tailRadius > 0);
  assert.throws(() => attractorBounds({ re: 1, im: 2e-8 }, 4), /too close to the unit circle/);
  const resolvableGap = attractorBounds({ re: 1 + Number.EPSILON, im: 0 }, 4, { maxTerms: 8 });
  assert.ok(Number.isFinite(resolvableGap.xMax) && resolvableGap.tailCapHit);
  for (const parameter of [{ re: 0, im: 0 }, { re: 1, im: 0 }, { re: 0.5, im: 0 }, { re: NaN, im: 2 }]) {
    assert.throws(() => attractorBounds(parameter, 4));
  }
  for (const options of [{ tol: 0 }, { tol: Infinity }, { maxTerms: 0 }, { maxTerms: 1.5 }, { maxTerms: 20001 }]) {
    assert.throws(() => attractorBounds(c, 4, options));
  }
  assert.throws(() => attractorBounds(c, 1));
});
