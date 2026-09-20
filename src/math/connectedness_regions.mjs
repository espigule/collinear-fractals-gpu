import { assertArity, assertFiniteNumber } from './validation.mjs';

/**
 * Analytic M_n membership for an expanding parameter, without an inverse word.
 * The real antenna is membership, not a claim of interior in the complex plane.
 * The strict annulus follows Proposition 2.5 of the 2024 paper. The real trace
 * follows the interval IFS for E(c,n), including its touching endpoints ±n.
 */
export function analyticConnectednessResult(x, y, n) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  assertArity(n);
  const rho = Math.hypot(x, y);
  if (!(rho > 1) || !Number.isFinite(rho)) return null;
  let verdict, analyticReason;
  if (y === 0) {
    verdict = Math.abs(x) <= n ? 'Member' : 'Exterior';
    analyticReason = verdict === 'Member' ? 'mn-real-interval' : 'mn-real-exterior';
  } else if (rho * (1 + 8 * Number.EPSILON) < Math.sqrt(n) * (1 - 8 * Number.EPSILON)) {
    verdict = 'Interior';
    analyticReason = 'mn-inner-annulus';
  } else return null;
  return {
    verdict, depth: 0, nodesExplored: 0, work: 0, word: [], tree: [],
    stopReason: verdict === 'Exterior' ? 'analytic-exterior' : 'analytic-membership',
    analyticReason, evidenceType: 'analytic',
    minimumCaptureDepth: null, captureDepthSemantics: 'not-captured',
    captureSearchStopReason: 'analytic-classification'
  };
}
