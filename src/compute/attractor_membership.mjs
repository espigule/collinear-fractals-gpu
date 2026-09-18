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
 * parameter-set membership must use the default pixelRadius=0.
 *
 * The module reuses typed stacks and is synchronous (no callbacks/reentrancy).
 * nodesExplored counts retained nodes including the root; work counts candidate
 * inverse maps. Exterior depth is the greatest exhaustion level encountered.
 */
export function classifyAttractorPoint(context, zx, zy, depth, {
  firstStep = 'original', maxWork = ATTRACTOR_MEMBERSHIP_LIMITS.defaultWork,
  firstLevelPieces = true, pixelRadius = 0
} = {}) {
  assertInteger(depth, 'depth');
  assertInteger(maxWork, 'maxWork', 1, ATTRACTOR_MEMBERSHIP_LIMITS.maxWork);
  assertFiniteNumber(pixelRadius, 'pixelRadius');
  if (pixelRadius < 0) throw new RangeError('pixelRadius must be nonnegative');
  if (firstStep !== 'original' && firstStep !== 'complement') {
    throw new RangeError('firstStep must be original or complement');
  }
  let nodesExplored = 0;
  let work = 0;
  let firstDigit = null;
  const sampleType = pixelRadius > 0 ? 'pixel-footprint' : 'point';
  const result = (verdict, stopReason, status, resultDepth, retainDigit = false) => ({
    verdict, depth: resultDepth, stopReason, status, nodesExplored, work,
    firstDigit: retainDigit ? firstDigit : null,
    firstLevelIndex: retainDigit && firstDigit !== null
      ? (firstDigit + context.m - (firstStep === 'complement' ? 2 : 1)) / 2 : null,
    sampleType, pixelRadius
  });
  if (!context || typeof context !== 'object') throw new TypeError('context is required');
  if (context.error) return result('Undetermined', context.error,
    context.error === 'outside-domain' ? 'out-of-domain' : 'numerical-range', 0);
  if (!Number.isFinite(zx) || !Number.isFinite(zy)) {
    return result('Undetermined', 'numerical-range', 'numerical-range', 0);
  }
  const { x, y, m, rhoUpper, se, ve, S, V, diskRadius, relativeX, relativeY, useTrap } = context;
  const maxDigit = m - 1;
  const operationFactor = 16 * EPS * (Math.abs(x) + Math.abs(y));
  const precisionScale = Math.max(se, ve);
  let maxReached = 0;

  // Return -1 outside, 0 unresolved/in enclosure, 1 strict trap capture.
  function inspect(u, v, error, radius, canCapture) {
    const s = relativeY * u + relativeX * v;
    const projectionError = error + 16 * EPS
      * (Math.abs(relativeY * u) + Math.abs(relativeX * v)) + TINY;
    if (Math.abs(v) > ve + radius + error || Math.abs(s) > se + radius + projectionError
      || Math.hypot(u, v) > diskRadius + radius + error) return -1;
    if (canCapture && useTrap && Math.abs(s) + radius + projectionError < S
      && Math.abs(v) + radius + error < V) return 1;
    return 0;
  }

  // Keep only digits whose child's vertical coordinate can meet the enlarged
  // enclosure. Clamp before integer conversion, including near-real parameters.
  function prepareDigits(level) {
    const limit = level === 0 && firstStep === 'complement' ? m - 2 : maxDigit;
    const u = xs[level], v = ys[level];
    const q = y * u + x * v;
    const nextRadius = radii[level] * rhoUpper;
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
    return true;
  }

  xs[0] = zx; ys[0] = zy; errors[0] = 0; radii[0] = pixelRadius;
  nodesExplored = 1;
  const root = inspect(zx, zy, 0, pixelRadius, firstStep === 'original' && !firstLevelPieces);
  if (root < 0) return result('Exterior', 'enclosure-escape', 'escaped', 0);
  if (root > 0) return result('Interior', 'trap-hit', 'captured', 0, true);
  if (depth === 0) return result('Undetermined', 'depth-cap', 'finite-survivor', 0, true);
  if (!prepareDigits(0)) return result('Undetermined', 'numerical-range', 'numerical-range', 0);

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
    const radius = radii[level] * rhoUpper;
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
    if (childLevel >= depth) return result('Undetermined', 'depth-cap', 'finite-survivor', childLevel, true);
    if (childLevel >= ATTRACTOR_MEMBERSHIP_LIMITS.maxDepth) {
      return result('Undetermined', 'stack-cap', 'capped', childLevel);
    }
    xs[childLevel] = childX; ys[childLevel] = childY;
    errors[childLevel] = error; radii[childLevel] = radius;
    if (!prepareDigits(childLevel)) {
      return result('Undetermined', 'numerical-range', 'numerical-range', childLevel);
    }
    level = childLevel;
  }
  return result('Exterior', 'tree-exhausted', 'escaped', maxReached);
}
