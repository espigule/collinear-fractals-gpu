'use strict';

/**
 * Collinear Fractals GPU: Companion Software
 * Core inverse-iteration search utilities in JavaScript / Node.js.
 *
 * This package separates theorem-level in-lens trap hits (`Interior`) from
 * the exploratory off-lens trap rule (`Interior-offLens`).  Exterior verdicts
 * are produced by enclosure exhaustion or initial enclosure escape.
 */

const DEFAULT_K_MAX = 37;
const DEFAULT_L_MAX = 1000;
const DEFAULT_TOL = 1e-8;

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function getCanonicalCoordinates(ux, uy, cx, cy) {
  [ux, uy, cx, cy].forEach((v, i) => assertFiniteNumber(v, ['ux', 'uy', 'cx', 'cy'][i]));
  const rho = Math.hypot(cx, cy);
  if (rho === 0) throw new Error('c must be nonzero.');
  return {
    ls: (cx * uy + cy * ux) / rho,
    lv: uy
  };
}

function inLens(x, y, n) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  const rho = Math.hypot(x, y);
  const N = 2 * n - 1;
  return rho > 1.0 && y !== 0.0 && (rho * rho + 2.0 * Math.abs(x) < N);
}

function chooseTailDepth(rho, tol = DEFAULT_TOL, minM = 30, maxM = 2000) {
  assertFiniteNumber(rho, 'rho');
  assertFiniteNumber(tol, 'tol');
  if (rho <= 1.0) throw new Error('rho must be greater than 1.');
  if (tol <= 0.0) throw new Error('tol must be positive.');
  const target = -Math.log(tol * (rho - 1.0)) / Math.log(rho);
  let M = Math.max(minM, Math.ceil(target));
  const capped = M > maxM;
  if (capped) M = maxM;
  return { M, capped };
}

function computeEnclosure(x, y, n, tol = DEFAULT_TOL) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  const rho = Math.hypot(x, y);
  if (rho <= 1.0 || y === 0.0) {
    throw new Error('c must satisfy |c| > 1 and Im(c) != 0 for enclosure bounds.');
  }

  const theta = Math.atan2(y, x);
  const Nminus1 = 2 * n - 2;
  const { M, capped } = chooseTailDepth(rho, tol);

  let valSum = 0.0;
  for (let k = 1; k <= M; k++) {
    valSum += Math.pow(rho, -k) * Math.abs(Math.sin(k * theta));
  }

  const tail = Math.pow(rho, -M) / (rho - 1.0);
  const ve = Nminus1 * (valSum + tail);
  const se = Nminus1 * Math.abs(y) / rho + ve / rho;

  return {
    se,
    ve,
    truncationDepth: M,
    tail,
    tailCertifiedToTol: tail <= tol,
    tailCapHit: capped
  };
}

function getTrapHalfWidths(x, y, n) {
  const rho = Math.hypot(x, y);
  const N = 2 * n - 1;
  const isLens = inLens(x, y, n);
  if (isLens) {
    return {
      S: (N * Math.abs(y)) / rho,
      V: Math.max(0.0, ((N - 2.0 * Math.abs(x)) * Math.abs(y)) / (rho * rho)),
      region: 'lens'
    };
  }
  const nPrime = (N + 1) / 2.0;
  const kappa = nPrime > 7 ? 1 + Math.floor(-2.0 - 2.0 * Math.sqrt(nPrime) + nPrime) : 1;
  return {
    S: ((N - 1) * Math.abs(y)) / rho,
    V: (kappa * Math.abs(y)) / (rho * rho),
    region: 'off-lens'
  };
}

function firstAlphabetDigitAtOrAbove(a, m) {
  const parity = ((m - 1) % 2 + 2) % 2;
  let t = Math.ceil(a);
  if (((t - parity) % 2 + 2) % 2 !== 0) t += 1;
  return t;
}

function interiorVerdict(isLensParameter) {
  return isLensParameter ? 'Interior' : 'Interior-offLens';
}

function inverseIterationTest(x, y, n, kMax = DEFAULT_K_MAX, LMax = DEFAULT_L_MAX, tol = DEFAULT_TOL) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  const rho = Math.hypot(x, y);
  if (rho <= 1.0 || y === 0.0) {
    return {
      verdict: 'Undetermined',
      depth: 0,
      nodesExplored: 0,
      reason: 'c outside domain (|c| > 1 and Im(c) != 0)'
    };
  }

  const N = 2 * n - 1;
  const isLensParameter = inLens(x, y, n);

  let se, ve;
  try {
    const enc = computeEnclosure(x, y, n, tol);
    se = enc.se;
    ve = enc.ve;
  } catch (err) {
    return { verdict: 'Undetermined', depth: 0, nodesExplored: 0, reason: err.message };
  }

  const trap = getTrapHalfWidths(x, y, n);
  const { S, V } = trap;
  const trapRegion = isLensParameter ? 'lens' : 'off-lens';

  const s0 = (4.0 * x * y) / rho;
  const v0 = 2.0 * y;

  if (Math.abs(s0) > se || Math.abs(v0) > ve) {
    return { verdict: 'Exterior', depth: 0, nodesExplored: 1 };
  }

  if (Math.abs(s0) < S && Math.abs(v0) < V) {
    return { verdict: interiorVerdict(isLensParameter), depth: 0, nodesExplored: 1, trapRegion };
  }

  let W = [{ s: s0, v: v0, word: [] }];
  let totalNodes = 1;

  for (let k = 1; k <= kMax; k++) {
    const Wprime = [];
    for (const node of W) {
      const t1 = (rho * node.s - ve) / y;
      const t2 = (rho * node.s + ve) / y;
      const tMin = Math.min(t1, t2);
      const tMax = Math.max(t1, t2);

      const a = Math.max(-N + 1, Math.ceil(tMin));
      const b = Math.min(N - 1, Math.floor(tMax));

      if (a <= b) {
        const tStart = firstAlphabetDigitAtOrAbove(a, N);
        for (let t = tStart; t <= b; t += 2) {
          const vPrime = rho * node.s - y * t;
          const sPrime = (2.0 * x / rho) * vPrime - rho * node.v;

          if (Math.abs(sPrime) <= se) {
            const nextWord = node.word.concat([t]);
            if (Math.abs(sPrime) < S && Math.abs(vPrime) < V) {
              return {
                verdict: interiorVerdict(isLensParameter),
                depth: k,
                word: nextWord,
                nodesExplored: totalNodes + Wprime.length + 1,
                trapRegion
              };
            }
            Wprime.push({ s: sPrime, v: vPrime, word: nextWord });
            if (Wprime.length >= LMax) {
              return { verdict: 'Undetermined', depth: k, nodesExplored: totalNodes + Wprime.length };
            }
          }
        }
      }
    }

    totalNodes += Wprime.length;
    if (Wprime.length === 0) {
      return { verdict: 'Exterior', depth: k, nodesExplored: totalNodes };
    }
    W = Wprime;
  }

  return { verdict: 'Undetermined', depth: kMax, nodesExplored: totalNodes };
}

module.exports = {
  DEFAULT_K_MAX,
  DEFAULT_L_MAX,
  DEFAULT_TOL,
  getCanonicalCoordinates,
  inLens,
  chooseTailDepth,
  computeEnclosure,
  getTrapHalfWidths,
  firstAlphabetDigitAtOrAbove,
  inverseIterationTest
};
