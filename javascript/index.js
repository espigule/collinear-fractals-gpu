'use strict';

/**
 * Floating-point reference search for the expanding parameter c (|c| > 1).
 * Interior is an in-lens trap hit; Interior-offLens is exploratory. These
 * numerical results are not outward-rounded or exact mathematical certificates.
 */

const DEFAULT_K_MAX = 37;
const DEFAULT_L_MAX = 1000;
const DEFAULT_TOL = 1e-8;
const MAX_ORDER = Math.floor(Number.MAX_SAFE_INTEGER / 2);

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function assertInteger(value, name, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  assertFiniteNumber(value, name);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
}

function assertOrder(n) {
  assertInteger(n, 'n', 2, MAX_ORDER);
}

function assertTolerance(tol) {
  assertFiniteNumber(tol, 'tol');
  if (tol <= 0) throw new RangeError('tol must be positive');
}

function assertCoordinates(x, y) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
}

function getCanonicalCoordinates(ux, uy, cx, cy) {
  assertCoordinates(ux, uy);
  assertCoordinates(cx, cy);
  const rho = Math.hypot(cx, cy);
  if (rho === 0 || !Number.isFinite(rho)) throw new RangeError('c must have a finite, nonzero modulus');
  // Normalize before multiplying: finite coordinates need not have finite products.
  const ls = (cx / rho) * uy + (cy / rho) * ux;
  if (!Number.isFinite(ls)) throw new RangeError('canonical coordinate exceeds numerical range');
  return { ls, lv: uy };
}

function inLens(x, y, n) {
  assertCoordinates(x, y);
  assertOrder(n);
  const rho = Math.hypot(x, y);
  return rho > 1 && y !== 0 && rho * rho + 2 * Math.abs(x) < 2 * n - 1;
}

function chooseTailDepth(rho, tol = DEFAULT_TOL, minM = 30, maxM = 2000) {
  assertFiniteNumber(rho, 'rho');
  assertTolerance(tol);
  assertInteger(minM, 'minM', 0);
  assertInteger(maxM, 'maxM', minM);
  if (rho <= 1) throw new RangeError('rho must be greater than 1');
  // Taking logs separately avoids underflow of tol * (rho - 1).
  const target = -(Math.log(tol) + Math.log(rho - 1)) / Math.log(rho);
  if (target > maxM) return { M: maxM, capped: true };
  let M = Math.max(minM, Math.ceil(target));
  while (M < maxM && Math.pow(rho, -M) / (rho - 1) > tol) M += 1;
  return { M, capped: Math.pow(rho, -M) / (rho - 1) > tol };
}

function computeEnclosure(x, y, n, tol = DEFAULT_TOL) {
  assertCoordinates(x, y);
  assertOrder(n);
  assertTolerance(tol);
  const rho = Math.hypot(x, y);
  if (!Number.isFinite(rho) || rho <= 1 || y === 0) {
    throw new RangeError('c must have finite |c| > 1 and Im(c) != 0 for enclosure bounds');
  }
  const theta = Math.atan2(y, x);
  const multiplier = 2 * n - 2;
  const { M, capped } = chooseTailDepth(rho, tol);
  let valSum = 0;
  for (let k = 1; k <= M; k++) {
    valSum += Math.pow(rho, -k) * Math.abs(Math.sin(k * theta));
  }
  // Always retain the full tail, including when its requested tolerance is capped.
  const tail = Math.pow(rho, -M) / (rho - 1);
  const ve = multiplier * (valSum + tail);
  const se = multiplier * (Math.abs(y) / rho) + ve / rho;
  if (!Number.isFinite(se) || !Number.isFinite(ve)) throw new RangeError('enclosure exceeds numerical range');
  return { se, ve, truncationDepth: M, tail, tailCertifiedToTol: tail <= tol, tailCapHit: capped };
}

function getTrapHalfWidths(x, y, n) {
  assertCoordinates(x, y);
  assertOrder(n);
  const rho = Math.hypot(x, y);
  if (!Number.isFinite(rho) || rho <= 1 || y === 0) {
    throw new RangeError('c must have finite |c| > 1 and Im(c) != 0 for trap bounds');
  }
  const N = 2 * n - 1;
  const normalizedY = Math.abs(y) / rho;
  if (inLens(x, y, n)) {
    return {
      S: N * normalizedY,
      V: Math.max(0, ((N - 2 * Math.abs(x)) / rho) * normalizedY),
      region: 'lens'
    };
  }
  const kappa = n > 7 ? 1 + Math.floor(-2 - 2 * Math.sqrt(n) + n) : 1;
  return { S: (N - 1) * normalizedY, V: (kappa / rho) * normalizedY, region: 'off-lens' };
}

function firstAlphabetDigitAtOrAbove(a, m) {
  assertFiniteNumber(a, 'a');
  assertInteger(m, 'm', 1);
  let t = Math.ceil(a);
  if (!Number.isSafeInteger(t)) throw new RangeError('a must round to a safe integer');
  const parity = (m - 1) % 2;
  if (((t % 2) + 2) % 2 !== parity) t += 1;
  if (!Number.isSafeInteger(t)) throw new RangeError('next parity-compatible integer exceeds numerical range');
  // The caller intersects with the finite alphabet before using this parity helper.
  return t === 0 ? 0 : t;
}

function searchResult(verdict, depth, nodesExplored, stopReason, extra = {}) {
  return { verdict, depth, word: [], nodesExplored, stopReason, ...extra };
}

function inverseIterationTest(x, y, n, kMax = DEFAULT_K_MAX, LMax = DEFAULT_L_MAX, tol = DEFAULT_TOL) {
  assertCoordinates(x, y);
  assertOrder(n);
  assertInteger(kMax, 'kMax', 0);
  assertInteger(LMax, 'LMax', 1);
  assertTolerance(tol);
  const numericalRange = (depth, nodes) => searchResult('Undetermined', depth, nodes, 'numerical-range', {
    reason: 'calculation exceeds finite floating-point range'
  });
  const rho = Math.hypot(x, y);
  if (!Number.isFinite(rho)) return numericalRange(0, 0);
  if (rho <= 1 || y === 0) {
    return searchResult('Undetermined', 0, 0, 'outside-domain', {
      reason: 'c outside domain (|c| > 1 and Im(c) != 0)'
    });
  }
  const N = 2 * n - 1;
  const isLensParameter = inLens(x, y, n);
  const { se, ve } = computeEnclosure(x, y, n, tol);
  const { S, V, region: trapRegion } = getTrapHalfWidths(x, y, n);
  const interior = (depth, nodes, word = []) => searchResult(
    isLensParameter ? 'Interior' : 'Interior-offLens', depth, nodes, 'trap-hit', { word, trapRegion }
  );
  const s0 = (4 * (x / rho)) * y;
  const v0 = 2 * y;
  if (![s0, v0, S, V].every(Number.isFinite)) return numericalRange(0, 0);
  if (Math.abs(s0) > se || Math.abs(v0) > ve) return searchResult('Exterior', 0, 1, 'enclosure-escape');
  if (Math.abs(s0) < S && Math.abs(v0) < V) return interior(0, 1);

  let frontier = [{ s: s0, v: v0, word: [] }];
  let totalNodes = 1;
  const slantFactor = 2 * (x / rho);
  for (let k = 1; k <= kMax; k++) {
    const next = [];
    for (const node of frontier) {
      const rhoS = rho * node.s;
      if (!Number.isFinite(rhoS)) return numericalRange(k, totalNodes + next.length);
      const t1 = (rhoS - ve) / y;
      const t2 = (rhoS + ve) / y;
      // Clip first: ratios can overflow near the real axis, but digits are bounded.
      const lower = Math.max(-N + 1, Math.min(t1, t2));
      const upper = Math.min(N - 1, Math.max(t1, t2));
      if (lower > upper) continue;
      const a = Math.ceil(lower);
      const b = Math.floor(upper);
      for (let t = firstAlphabetDigitAtOrAbove(a, N); t <= b; t += 2) {
        const vPrime = rhoS - y * t;
        const sPrime = slantFactor * vPrime - rho * node.v;
        if (!Number.isFinite(sPrime) || !Number.isFinite(vPrime)) return numericalRange(k, totalNodes + next.length);
        if (Math.abs(sPrime) > se) continue;
        const word = node.word.concat(t);
        if (Math.abs(sPrime) < S && Math.abs(vPrime) < V) return interior(k, totalNodes + next.length + 1, word);
        next.push({ s: sPrime, v: vPrime, word });
        if (next.length >= LMax) {
          return searchResult('Undetermined', k, totalNodes + next.length, 'node-cap', {
            reason: 'frontier reached LMax'
          });
        }
      }
    }
    totalNodes += next.length;
    if (next.length === 0) return searchResult('Exterior', k, totalNodes, 'tree-exhausted');
    frontier = next;
  }
  return searchResult('Undetermined', kMax, totalNodes, 'depth-cap', { reason: 'search reached kMax' });
}

module.exports = {
  DEFAULT_K_MAX, DEFAULT_L_MAX, DEFAULT_TOL,
  getCanonicalCoordinates, inLens, chooseTailDepth, computeEnclosure,
  getTrapHalfWidths, firstAlphabetDigitAtOrAbove, inverseIterationTest
};
