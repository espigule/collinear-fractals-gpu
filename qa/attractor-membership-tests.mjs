import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRACTOR_MEMBERSHIP_LIMITS,
  createAttractorMembershipContext as context,
  classifyAttractorPoint as classify,
  membershipDepthForView
} from '../src/compute/attractor_membership.mjs';

test('original E(2i,4) uses its exact [-4,4] by [-2,2] rectangle', () => {
  const c = context(0, 2, 4);
  assert.equal(c.useTrap, false, 'the strict original lens excludes its boundary');
  for (const [x, y] of [[3, .7], [-3, .7], [0, 0], [3.9, 1.9]]) {
    const result = classify(c, x, y, 16);
    assert.equal(result.status, 'finite-survivor');
    assert.equal(result.depth, 16);
    assert.ok(result.firstLevelIndex >= 0 && result.firstLevelIndex < 4);
  }
  for (const [x, y] of [[4.25, .7], [-4.25, .7], [.7, 2.25], [.7, -2.25]]) {
    assert.equal(classify(c, x, y, 16).verdict, 'Exterior');
  }
});

test('canonical original trap works for both alphabet parities and defers piece coloring', () => {
  for (const m of [2, 3, 4, 5, 6]) {
    for (const x of [-.1, .1]) for (const y of [-1.1, 1.1]) {
      const c = context(x, y, m);
      assert.equal(c.useTrap, true);
      assert.equal(classify(c, 0, 0, 12, { firstLevelPieces: false }).depth, 0);
      const identified = classify(c, 0, 0, 12);
      assert.equal(identified.verdict, 'Interior');
      assert.ok(identified.depth >= 1);
      assert.ok(Number.isInteger(identified.firstLevelIndex));
      assert.equal(identified.firstDigit, -m + 1 + 2 * identified.firstLevelIndex);

      // Independent nearest-digit self-cover check in the unshrunk canonical
      // trap: reconstruct Cartesian z, then explicitly apply all inverse maps.
      const rho = Math.hypot(x, y);
      const S = m * Math.abs(y) / rho;
      const V = (m - 2 * Math.abs(x)) * Math.abs(y) / (rho * rho);
      for (const sf of [-.97, -.53, 0, .53, .97]) {
        for (const vf of [-.97, -.53, 0, .53, .97]) {
          const v = vf * V, u = (sf * S * rho - x * v) / y;
          let covered = false;
          for (let digit = -m + 1; digit <= m - 1; digit += 2) {
            const childX = x * (u - digit) - y * v;
            const childY = y * (u - digit) + x * v;
            const childS = (y * childX + x * childY) / rho;
            covered ||= Math.abs(childS) < S && Math.abs(childY) < V;
          }
          assert.ok(covered, `self cover m=${m}, c=${x}+${y}i, s=${sf}, v=${vf}`);
        }
      }
    }
  }
});

test('M0 and M1 have an independent separating witness at c=1+i, n=2', () => {
  // M0: g_1(1+i)=-1+i and g_-1(-1+i)=-1+i, an explicit infinite address.
  // M1: its sole initial digit is 0, giving c^2=2i. The exact vertical support
  // of E(1+i,2) is 5/3, since each block of four sine terms scales by 1/4.
  const c = context(1, 1, 2);
  const m0 = classify(c, 1, 1, 16);
  const m1 = classify(c, 1, 1, 16, { firstStep: 'complement' });
  assert.equal(c.useTrap, false);
  assert.equal(m0.status, 'finite-survivor');
  assert.equal(m0.firstDigit, 1);
  assert.equal(m0.firstLevelIndex, 1);
  assert.equal(m1.verdict, 'Exterior');
  assert.equal(m1.depth, 1);
  assert.ok(Math.abs(c.ve - 5 / 3) < 1e-7);
});

test('complement entry is compulsory even when the input lies in the original trap', () => {
  const c = context(.1, 1.1, 2);
  const zero = classify(c, 0, 0, 0, { firstStep: 'complement', firstLevelPieces: false });
  assert.equal(zero.verdict, 'Undetermined');
  assert.equal(zero.stopReason, 'depth-cap');
  assert.equal(zero.depth, 0);
  assert.equal(zero.firstDigit, null);
  assert.equal(zero.firstLevelIndex, null);
  const result = classify(c, 0, 0, 16, { firstStep: 'complement', firstLevelPieces: false });
  assert.equal(result.verdict, 'Interior');
  assert.equal(result.depth, 1);
  assert.equal(result.firstDigit, 0);
  assert.equal(result.firstLevelIndex, 0);
});

test('off-lens bounded addresses remain finite survivors, with original piece indices', () => {
  const c = context(3, 3, 3);
  assert.equal(c.useTrap, false);
  for (const t of [-2, 0, 2]) {
    // Fixed point of z -> t + z/(3+3i) is t*(15-3i)/13.
    const result = classify(c, t * 15 / 13, -t * 3 / 13, 12);
    assert.equal(result.verdict, 'Undetermined');
    assert.equal(result.status, 'finite-survivor');
    assert.equal(result.firstDigit, t);
    assert.equal(result.firstLevelIndex, (t + 2) / 2);
  }
});

test('pixel footprints preserve thin attractor coverage without changing point membership', () => {
  const c = context(3, 3, 3);
  const x = 30 / 13 + .001, y = -6 / 13;
  const point = classify(c, x, y, 16);
  const pixel = classify(c, x, y, 16, { pixelRadius: .002 });
  assert.equal(point.verdict, 'Exterior');
  assert.equal(point.sampleType, 'point');
  assert.equal(pixel.status, 'finite-survivor');
  assert.equal(pixel.sampleType, 'pixel-footprint');
  assert.equal(pixel.firstDigit, 2);
  assert.equal(pixel.verdict, 'Undetermined', 'coverage never becomes an off-lens capture');
  assert.equal(classify(c, 10, 0, 16, { pixelRadius: .002 }).verdict, 'Exterior');
  const nearReal = context(1.1, 1e-8, 3);
  assert.equal(classify(nearReal, 100, 0, 16, { pixelRadius: .01 }).verdict, 'Exterior',
    'the independent disk bound prevents nearly parallel strips forming a spurious band');
});

test('capture requires the complete pixel footprint to lie inside the strict trap', () => {
  const c = context(.1, 1.1, 2);
  const point = classify(c, 0, 0, 0, { firstLevelPieces: false });
  const widePixel = classify(c, 0, 0, 0, { firstLevelPieces: false, pixelRadius: c.V * 2 });
  assert.equal(point.status, 'captured');
  assert.equal(widePixel.status, 'finite-survivor');
});

test('real interval pieces include closed endpoints without inventing planar capture', () => {
  const c = context(-2, 0, 2);
  assert.equal(c.realInterval, true);
  const endpoint = classify(c, -2, 0, 16, { firstDigit: -1 });
  assert.equal(endpoint.verdict, 'Member');
  assert.equal(endpoint.stopReason, 'analytic-membership');
  assert.equal(endpoint.depth, 1);
  assert.equal(endpoint.firstDigit, -1);
  assert.equal(endpoint.minimumCaptureDepth, null);
  assert.equal(endpoint.membershipScope, 'point');
  const footprint = classify(c, -2, .01, 16, { firstDigit: -1, pixelRadius: .02 });
  assert.equal(footprint.verdict, 'Member');
  assert.equal(footprint.membershipScope, 'pixel-intersection');
  for (const imaginary of [Number.MIN_VALUE, 1e-20, .01]) {
    assert.equal(classify(c, 0, imaginary, 16).verdict, 'Exterior');
  }
  assert.equal(classify(c, -2, 0, 16, { firstDigit: 1 }).verdict, 'Exterior');
});

test('real Cantor searches use horizontal support and retain bounded addresses', () => {
  for (const x of [-3, 3]) {
    const c = context(x, 0, 2);
    assert.equal(c.realInterval, false);
    // z = 1 + z/c gives this exact periodic address, including for c < 0.
    const fixed = x / (x - 1);
    const result = classify(c, fixed, 0, 16, { firstDigit: 1 });
    assert.equal(result.status, 'finite-survivor');
    assert.equal(result.work, 16);
    assert.equal(result.minimumCaptureDepth, null);
    assert.equal(classify(c, 0, 0, 16).verdict, 'Exterior');
  }
});

test('bounded work and stack exhaustion are explicitly unresolved', () => {
  const work = classify(context(0, 2, 4), 0, 0, 16, { maxWork: 1 });
  assert.equal(work.status, 'capped');
  assert.equal(work.stopReason, 'work-cap');
  assert.equal(work.work, 1);
  assert.equal(work.firstLevelIndex, null);
  const stack = classify(context(3, 3, 3), 0, 0, ATTRACTOR_MEMBERSHIP_LIMITS.maxDepth + 1);
  assert.equal(stack.verdict, 'Undetermined');
  assert.equal(stack.stopReason, 'stack-cap');
  assert.equal(stack.depth, 100);
  assert.equal(classify(context(3, 3, 3), 0, 0, 0).status, 'finite-survivor');
});

test('DFS agrees with exhaustive Cartesian branching away from numerical boundaries', () => {
  // The oracle enumerates every alphabet digit, with no interval pruning,
  // mutable stack, first-digit shortcuts, or capture rule.
  const c = context(1.6, 1.2, 3);
  assert.equal(c.useTrap, false);
  function admitted(x, y) {
    return Math.abs((c.y * x + c.x * y) / c.rho) <= c.se
      && Math.abs(y) <= c.ve && Math.hypot(x, y) <= c.diskRadius;
  }
  function brute(x, y, remaining, complement) {
    if (!admitted(x, y)) return false;
    if (remaining === 0) return true;
    const limit = complement ? c.m - 2 : c.m - 1;
    for (let t = -limit; t <= limit; t += 2) {
      if (brute(c.x * (x - t) - c.y * y, c.y * (x - t) + c.x * y,
        remaining - 1, false)) return true;
    }
    return false;
  }
  for (const complement of [false, true]) for (let ix = -8; ix <= 8; ix++) {
    for (let iy = -6; iy <= 6; iy++) {
      const x = ix * .371 + .017, y = iy * .317 + .031;
      const actual = classify(c, x, y, 5, { firstStep: complement ? 'complement' : 'original' });
      assert.equal(actual.status === 'finite-survivor', brute(x, y, 5, complement),
        `z=${x}+${y}i complement=${complement}, result=${actual.stopReason}`);
      assert.ok(actual.verdict === 'Exterior' || actual.status === 'finite-survivor');
    }
  }
});

test('automatic depth grows with zoom/resolution and respects explicit controls', () => {
  assert.equal(membershipDepthForView(2, 8), 16);
  assert.equal(membershipDepthForView(3, 8), 12);
  assert.equal(membershipDepthForView(4, 4), 13);
  assert.equal(membershipDepthForView(4, 8, { pixelWidth: 1536 }), 13);
  assert.equal(membershipDepthForView(4, 1, { baseDepth: 20 }), 23);
  assert.equal(membershipDepthForView(4, 1, { adaptive: false }), 12);
  assert.equal(membershipDepthForView(2, Number.MIN_VALUE), 100);
  assert.equal(membershipDepthForView(2, Number.MAX_VALUE), 16);
});

test('domain, reciprocal input, extreme range and invalid limits are handled explicitly', () => {
  assert.equal(context(1, 0, 2).error, 'outside-domain');
  assert.equal(context(0, 1, 2).error, 'outside-domain');
  assert.equal(context(Number.MIN_VALUE, Number.MIN_VALUE, 2).error, 'numerical-range');
  const direct = context(1, 1, 2), reciprocal = context(.5, -.5, 2);
  assert.equal(reciprocal.x, direct.x);
  assert.equal(reciprocal.y, direct.y);
  assert.deepEqual(classify(reciprocal, 1, 1, 16), classify(direct, 1, 1, 16));
  assert.equal(classify(context(1, 0, 2), 0, 0, 16).status, 'out-of-domain');
  assert.equal(classify(direct, Infinity, 0, 16).stopReason, 'numerical-range');
  assert.throws(() => context(1, 1, 1), RangeError);
  assert.throws(() => classify(direct, 0, 0, -1), RangeError);
  assert.throws(() => classify(direct, 0, 0, 16, { maxWork: 0 }), RangeError);
  assert.throws(() => classify(direct, 0, 0, 16, { firstStep: 'all' }), RangeError);
  assert.throws(() => classify(direct, 0, 0, 16, { pixelRadius: -.1 }), RangeError);
});
