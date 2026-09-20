import { computeEnclosureGeneral, getEffectiveC } from './inverse_search_reference.mjs';
import {
  assertAlphabetSize, assertFiniteNumber, assertInteger, assertPositiveNumber
} from '../math/validation.mjs';

/** Limits of the reusable, synchronous O(depth) search workspace. */
export const ATTRACTOR_MEMBERSHIP_LIMITS = Object.freeze({
  maxDepth: 100, maxWork: 1000000, defaultWork: 20000
});

const EPS = Number.EPSILON;
const TINY = Number.MIN_VALUE * 64;
const SIZE = ATTRACTOR_MEMBERSHIP_LIMITS.maxDepth + 1;
const xs = new Float64Array(SIZE);
const ys = new Float64Array(SIZE);
const errors = new Float64Array(SIZE);
const radii = new Float64Array(SIZE);
const derivativeXs = new Float64Array(SIZE);
const derivativeYs = new Float64Array(SIZE);
const remainders = new Float64Array(SIZE);
const nextDigits = new Float64Array(SIZE);
const lastDigits = new Float64Array(SIZE);

/**
 * Fixed-parameter geometry for E(c,m) = A_m + c^-1 E(c,m).
 * Coordinates are those of the original E, without an additional 1/c.
 * Reciprocal input follows the explorer's shared expanding-parameter convention.
 *
 * The only capture region used here is the canonical self-covering rectangle
 * |s| < S, |Im z| < V when |c|^2 + 2 |Re c| < m. The step-two nearest-digit
 * argument works for both parities of m. Off-lens searches have no capture rule.
 * These are binary64 numerical searches, not interval-arithmetic certificates.
 */
export function createAttractorMembershipContext(x, y, m, tol = 1e-8) {
  assertAlphabetSize(m);
  assertPositiveNumber(tol, 'tol');
  const effective = getEffectiveC(x, y);
  x = effective.x;
  y = effective.y;
  const rho = Math.hypot(x, y);
  const invalid = (error) => ({ x, y, m, rho, useTrap: false, error });
  if (!Number.isFinite(rho)) return invalid('numerical-range');
  if (rho <= 1 || y === 0) return invalid('outside-domain');
  // A downward modulus allowance keeps the disk support bound outward.
  const rhoLower = Math.max(Math.abs(x), Math.abs(y), rho * (1 - 8 * EPS));
  const rhoUpper = rho * (1 + 8 * EPS);
  if (rhoLower <= 1 || !Number.isFinite(rhoUpper)) return invalid('numerical-range');
  const diskRadius = ((m - 1) + (m - 1) / (rhoLower - 1)) * (1 + 32 * EPS);
  if (!Number.isFinite(diskRadius)) return invalid('numerical-range');
  const enclosure = computeEnclosureGeneral(x, y, m, tol);
  if (enclosure.err) return invalid(enclosure.reason);
  // Covers summation/projection roundoff in addition to the positive analytic
  // tail already included by computeEnclosureGeneral. This is an engineering
  // margin; no exact-arithmetic certification is implied.
  const pad = 64 * EPS * (enclosure.truncationDepth + 1) * diskRadius + TINY;
  const se = enclosure.se + pad;
  const ve = enclosure.ve + pad;
  if (!Number.isFinite(se) || !Number.isFinite(ve)) return invalid('numerical-range');
  const relativeY = Math.abs(y) / rhoUpper;
  const S = (m * relativeY) * (1 - 32 * EPS);
  const V = ((m - 2 * Math.abs(x)) / rhoUpper) * relativeY * (1 - 32 * EPS);
  const useTrap = rhoUpper * rhoUpper + 2 * Math.abs(x) < m
    && Number.isFinite(S) && Number.isFinite(V) && S > 0 && V > Math.abs(y);
  return {
    x, y, m, rho, rhoUpper, se, ve, S: useTrap ? S : 0, V: useTrap ? V : 0,
    useTrap, diskRadius, relativeX: x / rho, relativeY: y / rho,
    enclosure, arithmetic: 'binary64'
  };
}

/** Fixed-per-frame depth policy, shared by CPU and GPU render jobs. */
export function membershipDepthForView(m, spanX, {
  referenceSpan = 8, pixelWidth = 768, maxDepth = 100, baseDepth = 0, adaptive = true
} = {}) {
  assertAlphabetSize(m);
  assertPositiveNumber(spanX, 'spanX');
  assertPositiveNumber(referenceSpan, 'referenceSpan');
  assertPositiveNumber(pixelWidth, 'pixelWidth');
  assertInteger(maxDepth, 'maxDepth', 1, ATTRACTOR_MEMBERSHIP_LIMITS.maxDepth);
  assertInteger(baseDepth, 'baseDepth');
  const base = baseDepth > 0 ? baseDepth : (m === 2 ? 16 : 12);
  const logZoom = Math.log2(referenceSpan) - Math.log2(spanX)
    + Math.log2(pixelWidth) - Math.log2(768);
  // Avoid a spurious extra level from roundoff at an exact power-of-two zoom.
  const extra = adaptive ? Math.max(0, Math.ceil(logZoom - 32 * EPS * Math.max(1, Math.abs(logZoom)))) : 0;
  return Math.min(maxDepth, base + extra);
}

/**
 * Depth-first inverse membership search with a bounded work budget.
 *
 * A finite survivor is only an outer approximation: it does not prove infinite
 * survival or membership. A positive pixelRadius searches disk footprints for
 * display coverage. Capture requires the entire footprint to lie in the trap;
 * parameter-set point membership must use the default pixelRadius=0. A fixed
 * firstDigit restricts the first-level piece before any capture can occur.
 *
 * The module reuses typed stacks and is synchronous (no callbacks/reentrancy).
 * nodesExplored counts retained nodes including the root; work counts candidate
 * inverse maps. Exterior depth is the greatest exhaustion level encountered.
 */
export function classifyAttractorPoint(context, zx, zy, depth, options = {}) {
  return classifyWithOptionalMinimum(context, zx, zy, depth, options, 0);
}

/**
 * Minimum finite-capture level at one point, independently of raster coverage.
 *
 * Each depth-limited pass visits all admitted siblings before increasing the
 * limit. A first hit therefore has minimum depth for this numerical trap test;
 * an ordinary first-success DFS does not have that property. One candidate-map
 * budget covers all passes, and the reusable workspace remains O(depth).
 * A compulsory first digit counts as the first inverse step. The unrestricted
 * original search may capture at depth zero, independently of piece coloring.
 */
export function classifyAttractorCapture(context, zx, zy, depth, options = {}) {
  return classifyMembership(context, zx, zy, depth,
    { ...options, firstLevelPieces: false, pixelRadius: 0 }, 0, true);
}

/**
 * Cover the marked-point problem z(c)=c throughout a parameter disk.
 *
 * This is display coverage, not point membership. Each inverse word is tracked
 * as z(c0+delta)=a+b*delta+R, |R|<=remainder, |delta|<=parameterRadius. The
 * derivative retains cancellation in the parameter dependence. The second-order
 * remainder and a Hausdorff bound on E(c,n) make enclosure pruning conservative
 * over the whole disk. Trap capture also requires the whole disk's orbit image
 * to lie in the corresponding strict self-covering rectangles.
 *
 * Arithmetic uses padded binary64 bounds, not directed-rounding certificates.
 */
export function classifyAttractorParameterCell(context, depth, {
  parameterRadius = 0, markedPointScale = 1, ...options
} = {}) {
  assertFiniteNumber(parameterRadius, 'parameterRadius');
  if (parameterRadius < 0) throw new RangeError('parameterRadius must be nonnegative');
  assertPositiveNumber(markedPointScale, 'markedPointScale');
  return classifyWithOptionalMinimum(context, markedPointScale * context?.x,
    markedPointScale * context?.y, depth,
    { firstLevelPieces: false, ...options, pixelRadius: 0, markedPointScale }, parameterRadius);
}

function classifyWithOptionalMinimum(context, zx, zy, depth, options, parameterRadius) {
  const minimumCapture = options.minimumCapture ?? false;
  if (typeof minimumCapture !== 'boolean') throw new TypeError('minimumCapture must be boolean');
  const coverage = classifyMembership(context, zx, zy, depth, options, parameterRadius);
  if (!minimumCapture || coverage.minimumCaptureDepth !== null || coverage.verdict === 'Exterior') {
    return coverage;
  }
  const remaining = (options.maxWork ?? ATTRACTOR_MEMBERSHIP_LIMITS.defaultWork) - coverage.work;
  if (remaining <= 0) return { ...coverage, captureSearchStopReason: 'work-cap' };
  const capture = classifyMembership(context, zx, zy, depth,
    { ...options, maxWork: remaining }, parameterRadius, true);
  const combinedWork = coverage.work + capture.work;
  const combinedNodes = coverage.nodesExplored + capture.nodesExplored;
  return capture.minimumCaptureDepth !== null
    ? { ...capture, work: combinedWork, nodesExplored: combinedNodes }
    : { ...coverage, work: combinedWork, nodesExplored: combinedNodes,
      captureSearchStopReason: capture.captureSearchStopReason };
}

function classifyMembership(context, zx, zy, depth, {
  firstStep = 'original', maxWork = ATTRACTOR_MEMBERSHIP_LIMITS.defaultWork,
  firstLevelPieces = true, pixelRadius = 0, firstDigit: requestedFirstDigit = null,
  markedPointScale = 1
} = {}, parameterRadius = 0, captureOnly = false) {
  if (!context || typeof context !== 'object') throw new TypeError('context is required');
  assertInteger(depth, 'depth');
  assertInteger(maxWork, 'maxWork', 1, ATTRACTOR_MEMBERSHIP_LIMITS.maxWork);
  assertFiniteNumber(pixelRadius, 'pixelRadius');
  if (pixelRadius < 0) throw new RangeError('pixelRadius must be nonnegative');
  if (firstStep !== 'original' && firstStep !== 'complement') {
    throw new RangeError('firstStep must be original or complement');
  }
  if (requestedFirstDigit !== null) {
    assertInteger(requestedFirstDigit, 'firstDigit', -context.m + 1, context.m - 1);
  }
  let nodesExplored = 0;
  let work = 0;
  let firstDigit = null;
  const isParameterCell = parameterRadius > 0;
  const sampleType = isParameterCell ? 'parameter-cell' : pixelRadius > 0 ? 'pixel-footprint' : 'point';
  const result = (verdict, stopReason, status, resultDepth, retainDigit = false) => ({
    verdict, depth: resultDepth, stopReason, status, nodesExplored, work,
    minimumCaptureDepth: stopReason === 'trap-hit' && (captureOnly || resultDepth <= 1)
      ? resultDepth : null,
    captureDepthSemantics: stopReason === 'trap-hit'
      ? (captureOnly || resultDepth <= 1 ? 'minimum-verified' : 'witness-upper-bound') : 'not-captured',
    captureSearchStopReason: stopReason === 'trap-hit' && (captureOnly || resultDepth <= 1)
      ? 'minimum-found' : captureOnly
        ? (stopReason === 'depth-cap' ? 'no-capture-through-depth' : stopReason) : 'disabled',
    firstDigit: retainDigit ? firstDigit : null,
    firstLevelIndex: retainDigit && firstDigit !== null
      ? Math.floor((firstDigit + context.m - 1) / 2) : null,
    sampleType, pixelRadius,
    ...(isParameterCell ? { parameterRadius, coverage: 'parameter-taylor-disk' } : {})
  });
  if (context.error) return result('Undetermined', context.error,
    context.error === 'outside-domain' ? 'out-of-domain' : 'numerical-range', 0);
  if (!Number.isFinite(zx) || !Number.isFinite(zy)) {
    return result('Undetermined', 'numerical-range', 'numerical-range', 0);
  }
  const { x, y, m, rho, rhoUpper, S, V, relativeX, relativeY, useTrap } = context;
  const maxDigit = m - 1;
  const operationFactor = 16 * EPS * (Math.abs(x) + Math.abs(y));
  const parameterRhoUpper = rhoUpper + parameterRadius;
  const parameterRhoLower = rho * (1 - 8 * EPS) - parameterRadius;
  // A cell intersecting the unit circle cannot share an expanding enclosure.
  // Leave that unresolved instead of pruning it using its center alone.
  if (isParameterCell && parameterRhoLower <= 1) {
    return result('Undetermined', 'outside-domain', 'out-of-domain', 0);
  }
  const enclosurePad = isParameterCell
    ? maxDigit * parameterRadius / (parameterRhoLower - 1) ** 2 * (1 + 64 * EPS) : 0;
  const se = context.se + enclosurePad;
  const ve = context.ve + enclosurePad;
  const diskRadius = isParameterCell
    ? Math.min(context.diskRadius + enclosurePad,
      maxDigit * parameterRhoLower / (parameterRhoLower - 1) * (1 + 64 * EPS))
    : context.diskRadius;
  if (!Number.isFinite(se) || !Number.isFinite(ve) || !Number.isFinite(diskRadius)) {
    return result('Undetermined', 'numerical-range', 'numerical-range', 0);
  }
  const minimumY = Math.max(0, Math.abs(y) - parameterRadius);
  const cellTrap = isParameterCell && useTrap && minimumY > 0
    && parameterRhoUpper ** 2 + 2 * (Math.abs(x) + parameterRadius) < m;
  // Point-center capture shading deliberately has no pixel radius. A separate
  // coverage search retains the whole raster footprint and its own verdict.
  if (captureOnly && !(isParameterCell ? cellTrap : useTrap)) {
    return result('Undetermined', 'trap-unavailable', 'no-capture', 0);
  }
  const cellS = m * (minimumY / rho) * (1 - 64 * EPS);
  const cellV = (m - 2 * (Math.abs(x) + parameterRadius))
    * (minimumY / parameterRhoUpper) / parameterRhoUpper * (1 - 64 * EPS);
  const precisionScale = Math.max(se, ve);
  let maxReached = 0;

  // Return -1 outside, 0 unresolved/in enclosure, 1 strict trap capture.
  function inspect(u, v, error, radius, canCapture) {
    const s = relativeY * u + relativeX * v;
    const projectionError = error + 16 * EPS
      * (Math.abs(relativeY * u) + Math.abs(relativeX * v)) + TINY;
    if (Math.abs(v) > ve + radius + error || Math.abs(s) > se + radius + projectionError
      || Math.hypot(u, v) > diskRadius + radius + error) return -1;
    if (canCapture && isParameterCell && cellTrap) {
      // |y(c)u(c)+x(c)v(c)| is bounded in the center's normalized direction;
      // the final term allows the canonical direction itself to vary with c.
      const directionVariation = parameterRadius / rho
        * (Math.hypot(u, v) + radius + error);
      if (Math.abs(s) + radius + projectionError + directionVariation < cellS
        && Math.abs(v) + radius + error < cellV) return 1;
    } else if (canCapture && !isParameterCell && useTrap
      && Math.abs(s) + radius + projectionError < S
      && Math.abs(v) + radius + error < V) return 1;
    return 0;
  }

  // Keep only digits whose child's vertical coordinate can meet the enlarged
  // enclosure. Clamp before integer conversion, including near-real parameters.
  function prepareDigits(level) {
    const limit = level === 0 && firstStep === 'complement' && requestedFirstDigit === null
      ? m - 2 : maxDigit;
    const u = xs[level], v = ys[level];
    const q = y * u + x * v;
    let nextRadius = radii[level] * rhoUpper;
    if (isParameterCell) {
      const derivative = Math.hypot(derivativeXs[level], derivativeYs[level]);
      const derivativeBound = Math.hypot(u, v) + limit + rhoUpper * derivative;
      const remainderBound = parameterRhoUpper * remainders[level]
        + derivative * parameterRadius ** 2 + errors[level] * parameterRadius;
      nextRadius = (derivativeBound * parameterRadius + remainderBound) * (1 + 64 * EPS) + TINY;
    }
    const maxError = errors[level] * rhoUpper
      + operationFactor * (Math.abs(u) + Math.abs(v) + limit) + TINY;
    const qError = 8 * EPS * (Math.abs(y * u) + Math.abs(x * v)) + TINY;
    const bound = ve + nextRadius + maxError + qError;
    if (!Number.isFinite(q) || !Number.isFinite(bound)) return false;
    const t1 = (q - bound) / y, t2 = (q + bound) / y;
    if (Number.isNaN(t1) || Number.isNaN(t2)) return false;
    let low = Math.min(t1, t2), high = Math.max(t1, t2);
    // Outward endpoint allowance also covers division roundoff.
    if (Number.isFinite(low)) low -= 16 * EPS * (Math.abs(low) + 1);
    if (Number.isFinite(high)) high += 16 * EPS * (Math.abs(high) + 1);
    const a = Math.max(-limit, Math.ceil(low));
    const b = Math.min(limit, Math.floor(high));
    // The index expression avoids signed-modulo parity surprises.
    nextDigits[level] = -limit + 2 * Math.ceil((a + limit) / 2);
    lastDigits[level] = b;
    if (level === 0 && requestedFirstDigit !== null) {
      nextDigits[level] = requestedFirstDigit;
      lastDigits[level] = requestedFirstDigit >= a && requestedFirstDigit <= b
        ? requestedFirstDigit : requestedFirstDigit - 1;
    }
    return true;
  }

  xs[0] = zx; ys[0] = zy; errors[0] = 0;
  radii[0] = isParameterCell ? markedPointScale * parameterRadius : pixelRadius;
  derivativeXs[0] = markedPointScale; derivativeYs[0] = 0; remainders[0] = 0;
  nodesExplored = 1;
  const root = inspect(zx, zy, 0, radii[0],
    requestedFirstDigit === null && firstStep === 'original' && !firstLevelPieces);
  if (root < 0) return result('Exterior', 'enclosure-escape', 'escaped', 0);
  if (root > 0) return result('Interior', 'trap-hit', 'captured', 0, true);
  if (depth === 0) return result('Undetermined', 'depth-cap', 'finite-survivor', 0, true);
  for (let searchDepth = captureOnly ? 1 : depth; searchDepth <= depth; searchDepth++) {
    if (!prepareDigits(0)) return result('Undetermined', 'numerical-range', 'numerical-range', 0);
    let survived = false;
    maxReached = 0;
    let level = 0;
    while (level >= 0) {
      if (nextDigits[level] > lastDigits[level]) {
        maxReached = Math.max(maxReached, level + 1);
        level--;
        continue;
      }
      if (work >= maxWork) return result('Undetermined', 'work-cap', 'capped', maxReached);
      const t = nextDigits[level];
      nextDigits[level] += 2;
      work++;
      const u = xs[level], v = ys[level];
      const shifted = u - t;
      const childX = x * shifted - y * v;
      const childY = y * shifted + x * v;
      const error = errors[level] * rhoUpper
        + operationFactor * (Math.abs(u) + Math.abs(v) + Math.abs(t)) + TINY;
      let radius = radii[level] * rhoUpper;
      let derivativeX = 0, derivativeY = 0, remainder = 0;
      if (isParameterCell) {
        const dx = derivativeXs[level], dy = derivativeYs[level];
        derivativeX = shifted + x * dx - y * dy;
        derivativeY = v + y * dx + x * dy;
        const derivativeError = 32 * EPS * (Math.abs(shifted) + Math.abs(v)
          + (Math.abs(x) + Math.abs(y)) * (Math.abs(dx) + Math.abs(dy))) + TINY;
        remainder = (parameterRhoUpper * remainders[level]
          + Math.hypot(dx, dy) * parameterRadius ** 2
          + (derivativeError + errors[level]) * parameterRadius) * (1 + 64 * EPS) + TINY;
        radius = (Math.hypot(derivativeX, derivativeY) * parameterRadius + remainder)
          * (1 + 64 * EPS) + TINY;
      }
      const childLevel = level + 1;
      maxReached = Math.max(maxReached, childLevel);
      if (!Number.isFinite(childX) || !Number.isFinite(childY)
        || !Number.isFinite(error) || !Number.isFinite(radius)) {
        return result('Undetermined', 'numerical-range', 'numerical-range', childLevel);
      }
      const decision = inspect(childX, childY, error, radius, true);
      if (decision < 0) continue;
      nodesExplored++;
      if (level === 0) firstDigit = t;
      if (decision > 0) return result('Interior', 'trap-hit', 'captured', childLevel, true);
      if (error > 0.25 * (precisionScale + radius)) {
        return result('Undetermined', 'precision-limit', 'numerical-range', childLevel);
      }
      if (childLevel >= searchDepth) {
        if (!captureOnly) return result('Undetermined', 'depth-cap', 'finite-survivor', childLevel, true);
        // A surviving branch does not rule out a capture in a later sibling.
        survived = true;
        continue;
      }
      if (childLevel >= ATTRACTOR_MEMBERSHIP_LIMITS.maxDepth) {
        return result('Undetermined', 'stack-cap', 'capped', childLevel);
      }
      xs[childLevel] = childX; ys[childLevel] = childY;
      errors[childLevel] = error; radii[childLevel] = radius;
      derivativeXs[childLevel] = derivativeX; derivativeYs[childLevel] = derivativeY;
      remainders[childLevel] = remainder;
      if (!prepareDigits(childLevel)) {
        return result('Undetermined', 'numerical-range', 'numerical-range', childLevel);
      }
      level = childLevel;
    }
    if (!survived) return result('Exterior', 'tree-exhausted', 'escaped', maxReached);
    if (searchDepth === depth) return result('Undetermined', 'depth-cap', 'finite-survivor', depth);
  }
  return result('Undetermined', 'depth-cap', 'finite-survivor', depth);
}
