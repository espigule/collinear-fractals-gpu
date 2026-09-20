import { inv } from '../math/complex.mjs';
import {
  assertAlphabetSize, assertArity, assertFiniteNumber, assertInteger, assertPositiveNumber
} from '../math/validation.mjs';

export function getEffectiveC(x, y) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  const rho = Math.hypot(x, y);
  if (rho < 1 && rho > 0) {
    const reciprocal = inv({ re: x, im: y });
    return { x: reciprocal.re, y: reciprocal.im };
  }
  return { x, y };
}

export function inLens(x, y, n) {
  assertArity(n);
  const eff = getEffectiveC(x, y);
  const rho = Math.hypot(eff.x, eff.y);
  const N = 2 * n - 1;
  return rho > 1 && eff.y !== 0 && (rho * rho + 2 * Math.abs(eff.x) < N);
}

export function chooseTailDepth(rho, tol = 1e-8, minM = 30, maxM = 2000) {
  assertPositiveNumber(rho, 'rho');
  if (rho <= 1) throw new RangeError('rho must be greater than 1');
  assertPositiveNumber(tol, 'tol');
  assertInteger(minM, 'minM');
  assertInteger(maxM, 'maxM', minM);
  // Logarithms of the factors avoid underflow in tol * (rho - 1).
  const target = -(Math.log(tol) + Math.log(rho - 1)) / Math.log(rho);
  let M = Math.min(maxM, Math.max(minM, Math.ceil(target)));
  // Cover a possible rounding error at an exact integer target.
  while (M < maxM && Math.pow(rho, -M) / (rho - 1) > tol) M++;
  return { M, capped: Math.pow(rho, -M) / (rho - 1) > tol };
}

export function firstAlphabetDigitAtOrAbove(a, m) {
  assertFiniteNumber(a, 'a');
  assertAlphabetSize(m);
  const parity = (m - 1) % 2;
  let t = Math.ceil(a);
  if (((t - parity) % 2 + 2) % 2 !== 0) t += 1;
  return t;
}

export function interiorVerdict(isLens) {
  return isLens ? 'Interior' : 'Interior-offLens';
}

export function validateSearchLimits(kMax, LMax) {
  assertInteger(kMax, 'kMax');
  assertInteger(LMax, 'LMax', 1);
}

export function computeEnclosureGeneral(x, y, m, tol = 1e-8) {
  assertAlphabetSize(m);
  assertPositiveNumber(tol, 'tol');
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  if (!Number.isFinite(rho)) return { se: 0, ve: 0, err: true, reason: 'numerical-range' };
  if (rho <= 1 || y === 0) return { se: 0, ve: 0, err: true, reason: 'outside-domain' };
  const theta = Math.atan2(y, x);
  const { M, capped } = chooseTailDepth(rho, tol);
  let valSum = 0;
  for (let k = 1; k <= M; k++) {
    valSum += Math.pow(rho, -k) * Math.abs(Math.sin(k * theta));
  }
  const tail = Math.pow(rho, -M) / (rho - 1);
  const ve = (m - 1) * (valSum + tail);
  const se = (m - 1) * (Math.abs(y) / rho) + ve / rho;
  if (!Number.isFinite(se) || !Number.isFinite(ve)) {
    return { se: 0, ve: 0, err: true, reason: 'numerical-range' };
  }
  return {
    se, ve, err: false, truncationDepth: M, tail,
    tailCertifiedToTol: tail <= tol,
    tailCapHit: capped
  };
}

export function getTrapHalfWidths(x, y, m, isLens) {
  assertAlphabetSize(m);
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  if (!Number.isFinite(rho) || rho <= 1 || y === 0) return { S: 0, V: 0 };
  const relativeY = Math.abs(y) / rho;
  if (isLens) {
    return {
      S: m * relativeY,
      V: Math.max(0, ((m - 2 * Math.abs(x)) / rho) * relativeY)
    };
  }
  const nPrime = (m + 1) / 2;
  const kappa = nPrime > 7 ? (1 + Math.floor(-2 - 2 * Math.sqrt(nPrime) + nPrime)) : 1;
  return { S: (m - 1) * relativeY, V: (kappa / rho) * relativeY };
}

export function undetermined(reason, depth = 0, nodesExplored = 0, tree = []) {
  return { verdict: 'Undetermined', depth, nodesExplored, word: [], tree, stopReason: reason };
}

export function inverseIterationTestDetailed(x, y, n, kMax = 37, LMax = 1000, tol = 1e-8, options = {}) {
  assertArity(n);
  validateSearchLimits(kMax, LMax);
  assertPositiveNumber(tol, 'tol');
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.hypot(x, y);
  if (!Number.isFinite(rho)) return undetermined('numerical-range');
  if (rho <= 1 || y === 0) return undetermined('outside-domain');

  const N = 2 * n - 1;
  const isLens = inLens(x, y, n);
  // Archived records retain the historical off-lens rule by default. Current
  // exploration opts into canonicalOnly: that rule is not a general trap.
  const useTrap = options.canonicalOnly !== true || isLens;
  const enc = computeEnclosureGeneral(x, y, N, tol);
  if (enc.err) return undetermined(enc.reason);
  const { se, ve } = enc;
  const { S, V } = getTrapHalfWidths(x, y, N, isLens);
  const s0 = (4 * (x / rho)) * y;
  const v0 = 2 * y;
  if (!Number.isFinite(s0) || !Number.isFinite(v0)) return undetermined('numerical-range');
  const initialNode = { s: s0, v: v0, depth: 0, parentIdx: -1, t: 0 };
  const tree = [[initialNode]];

  if (Math.abs(s0) > se || Math.abs(v0) > ve) {
    return { verdict: 'Exterior', depth: 0, word: [], nodesExplored: 1, tree, stopReason: 'enclosure-escape' };
  }
  if (useTrap && Math.abs(s0) < S && Math.abs(v0) < V) {
    return {
      verdict: interiorVerdict(isLens), depth: 0, word: [], nodesExplored: 1, tree,
      trapRegion: isLens ? 'lens' : 'off-lens', stopReason: 'trap-hit'
    };
  }

  let totalNodes = 1;
  const twiceRelativeX = 2 * (x / rho);
  for (let k = 1; k <= kMax; k++) {
    const previous = tree[k - 1];
    const next = [];
    for (let pIdx = 0; pIdx < previous.length; pIdx++) {
      const node = previous[pIdx];
      const rhoS = rho * node.s;
      const rhoV = rho * node.v;
      if (!Number.isFinite(rhoS) || !Number.isFinite(rhoV)) {
        return undetermined('numerical-range', k, totalNodes + next.length, tree);
      }
      const t1 = (rhoS - ve) / y;
      const t2 = (rhoS + ve) / y;
      // Infinite interval endpoints are harmless after clamping to the finite
      // alphabet; NaN never provides a valid pruning decision.
      if (Number.isNaN(t1) || Number.isNaN(t2)) {
        return undetermined('numerical-range', k, totalNodes + next.length, tree);
      }
      const a = Math.max(-N + 1, Math.ceil(Math.min(t1, t2)));
      const b = Math.min(N - 1, Math.floor(Math.max(t1, t2)));
      if (a > b) continue;
      for (let t = firstAlphabetDigitAtOrAbove(a, N); t <= b; t += 2) {
        const vPrime = rhoS - y * t;
        const sPrime = twiceRelativeX * vPrime - rhoV;
        if (!Number.isFinite(sPrime) || !Number.isFinite(vPrime)) {
          return undetermined('numerical-range', k, totalNodes + next.length, tree);
        }
        if (Math.abs(sPrime) > se) continue;
        const nextNode = { s: sPrime, v: vPrime, depth: k, parentIdx: pIdx, t };
        next.push(nextNode);
        if (useTrap && Math.abs(sPrime) < S && Math.abs(vPrime) < V) {
          tree.push(next);
          const path = new Array(k);
          let curr = nextNode;
          for (let d = k; d > 0; d--) {
            path[d - 1] = curr.t;
            curr = tree[d - 1][curr.parentIdx];
          }
          return {
            verdict: interiorVerdict(isLens), depth: k, word: path,
            nodesExplored: totalNodes + next.length, tree,
            trapRegion: isLens ? 'lens' : 'off-lens', stopReason: 'trap-hit'
          };
        }
        // LMax bounds retained nodes per level. Reaching the cap halts
        // conservatively before claiming complete tree exhaustion.
        if (next.length >= LMax) {
          tree.push(next);
          return undetermined('node-cap', k, totalNodes + next.length, tree);
        }
      }
    }
    totalNodes += next.length;
    if (next.length === 0) {
      return { verdict: 'Exterior', depth: k, word: [], nodesExplored: totalNodes, tree, stopReason: 'tree-exhausted' };
    }
    tree.push(next);
  }
  return undetermined('depth-cap', kMax, totalNodes, tree);
}
