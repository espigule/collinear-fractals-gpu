import {
  computeEnclosureGeneral, getEffectiveC, getTrapHalfWidths, inLens,
  interiorVerdict, inverseIterationTestDetailed, validateSearchLimits
} from './inverse_search_reference.mjs';
import {
  assertAlphabetSize, assertArity, assertFiniteNumber, assertPositiveNumber
} from '../math/validation.mjs';

// The synchronous scalar search has no callbacks or await points. Reusing two
// queues across calls avoids per-pixel tree/word allocations in Canvas renders.
let previousBuffer = new Float64Array(512);
let nextBuffer = new Float64Array(512);

function result(verdict, depth, nodesExplored, stopReason, isLens) {
  const value = { verdict, depth, nodesExplored, stopReason };
  if (stopReason === 'trap-hit') value.trapRegion = isLens ? 'lens' : 'off-lens';
  return value;
}

/** Precompute the enclosure and trap once for a fixed dynamical parameter. */
export function createInverseSearchContext(x, y, m, isLens, tol = 1e-8, options = {}) {
  assertAlphabetSize(m);
  assertPositiveNumber(tol, 'tol');
  const eff = getEffectiveC(x, y);
  const rho = Math.hypot(eff.x, eff.y);
  const context = {
    x: eff.x, y: eff.y, rho, m, isLens: Boolean(isLens),
    useTrap: options.useTrap !== false,
    isDiskTrap: options.isDiskTrap === true
  };
  if (!Number.isFinite(rho)) return { ...context, error: 'numerical-range' };
  if (rho <= 1 || eff.y === 0) return { ...context, error: 'outside-domain' };
  const enclosure = computeEnclosureGeneral(eff.x, eff.y, m, tol);
  if (enclosure.err) return { ...context, error: enclosure.reason };
  const trap = getTrapHalfWidths(eff.x, eff.y, m, isLens);
  const S = options.S ?? trap.S;
  const V = options.V ?? trap.V;
  assertFiniteNumber(S, 'S');
  assertFiniteNumber(V, 'V');
  if (S < 0 || V < 0) throw new RangeError('trap half-widths must be nonnegative');
  return { ...context, se: enclosure.se, ve: enclosure.ve, S, V, enclosure };
}

function trapHit(context, s, v) {
  if (!context.useTrap) return false;
  return context.isDiskTrap
    ? Math.hypot(s, v) < context.S
    : Math.abs(s) < context.S && Math.abs(v) < context.V;
}

function searchCoordinates(context, s0, v0, kMax, LMax) {
  if (context.error) return result('Undetermined', 0, 0, context.error);
  if (!Number.isFinite(s0) || !Number.isFinite(v0)) {
    return result('Undetermined', 0, 0, 'numerical-range');
  }
  const { x, y, rho, m, se, ve, isLens } = context;
  if (Math.abs(s0) > se || Math.abs(v0) > ve) {
    return result('Exterior', 0, 1, 'enclosure-escape');
  }
  if (trapHit(context, s0, v0)) return result(interiorVerdict(isLens), 0, 1, 'trap-hit', isLens);

  previousBuffer[0] = s0;
  previousBuffer[1] = v0;
  let previousCount = 1;
  let totalNodes = 1;
  const twiceRelativeX = 2 * (x / rho);
  const parity = (m - 1) % 2;
  for (let k = 1; k <= kMax; k++) {
    let nextCount = 0;
    for (let p = 0; p < previousCount; p++) {
      const rhoS = rho * previousBuffer[2 * p];
      const rhoV = rho * previousBuffer[2 * p + 1];
      if (!Number.isFinite(rhoS) || !Number.isFinite(rhoV)) {
        return result('Undetermined', k, totalNodes + nextCount, 'numerical-range');
      }
      const t1 = (rhoS - ve) / y;
      const t2 = (rhoS + ve) / y;
      if (Number.isNaN(t1) || Number.isNaN(t2)) {
        return result('Undetermined', k, totalNodes + nextCount, 'numerical-range');
      }
      let a = Math.max(-m + 1, Math.ceil(Math.min(t1, t2)));
      const b = Math.min(m - 1, Math.floor(Math.max(t1, t2)));
      if (a > b) continue;
      if (((a - parity) % 2 + 2) % 2 !== 0) a++;
      for (let t = a; t <= b; t += 2) {
        const vPrime = rhoS - y * t;
        const sPrime = twiceRelativeX * vPrime - rhoV;
        if (!Number.isFinite(sPrime) || !Number.isFinite(vPrime)) {
          return result('Undetermined', k, totalNodes + nextCount, 'numerical-range');
        }
        if (Math.abs(sPrime) > se) continue;
        nextCount++;
        if (trapHit(context, sPrime, vPrime)) {
          return result(interiorVerdict(isLens), k, totalNodes + nextCount, 'trap-hit', isLens);
        }
        if (nextCount >= LMax) {
          return result('Undetermined', k, totalNodes + nextCount, 'node-cap');
        }
        if (2 * nextCount > nextBuffer.length) {
          const grown = new Float64Array(Math.min(2 * LMax, nextBuffer.length * 2));
          grown.set(nextBuffer);
          nextBuffer = grown;
        }
        nextBuffer[2 * nextCount - 2] = sPrime;
        nextBuffer[2 * nextCount - 1] = vPrime;
      }
    }
    totalNodes += nextCount;
    if (nextCount === 0) return result('Exterior', k, totalNodes, 'tree-exhausted');
    [previousBuffer, nextBuffer] = [nextBuffer, previousBuffer];
    previousCount = nextCount;
  }
  return result('Undetermined', kMax, totalNodes, 'depth-cap');
}

/** Verdict/depth only: no orbit tree or certificate word is allocated. */
export function inverseIterationTestFast(x, y, n, kMax = 37, LMax = 1000, tol = 1e-8) {
  assertArity(n);
  validateSearchLimits(kMax, LMax);
  assertPositiveNumber(tol, 'tol');
  const eff = getEffectiveC(x, y);
  const rho = Math.hypot(eff.x, eff.y);
  if (!Number.isFinite(rho)) return result('Undetermined', 0, 0, 'numerical-range');
  if (rho <= 1 || eff.y === 0) return result('Undetermined', 0, 0, 'outside-domain');
  const context = createInverseSearchContext(eff.x, eff.y, 2 * n - 1, inLens(eff.x, eff.y, n), tol);
  return searchCoordinates(context, (4 * (eff.x / rho)) * eff.y, 2 * eff.y, kMax, LMax);
}

/** Reuse a createInverseSearchContext result for all pixels of a dynamical view. */
export function inverseSearchPointFast(context, zx, zy, kMax = 37, LMax = 1000) {
  assertFiniteNumber(zx, 'zx');
  assertFiniteNumber(zy, 'zy');
  validateSearchLimits(kMax, LMax);
  const s0 = (context.x / context.rho) * zy + (context.y / context.rho) * zx;
  return searchCoordinates(context, s0, zy, kMax, LMax);
}

export function inverseSearchKernel(job) {
  const { x, y, n, kMax = 37, LMax = 1000, tol = 1e-8 } = job;
  const detailed = job.details !== false;
  const search = detailed ? inverseIterationTestDetailed : inverseIterationTestFast;
  return {
    ...search(x, y, n, kMax, LMax, tol),
    kernel: detailed ? 'reference-breadth-first' : 'float64-breadth-first',
    searchOrder: 'ascending-digits',
    // Digit ordering is part of reproducible finite-word and cap semantics.
    zigzag: false,
    zigzagRequested: Boolean(job.zigzag)
  };
}
