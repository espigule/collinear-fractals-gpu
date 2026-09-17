import { inv } from './complex.mjs';
import {
  assertArity, assertContractingParameter, assertInteger, assertPositiveNumber
} from './validation.mjs';

const MAX_BOUND_TERMS = 20000;

/**
 * Cartesian support bounds for E(c,n), with expanding c (|c| > 1).
 *
 * The coordinate maxima are (n-1) sum_{j>=0}|Re(c^-j)| and its imaginary
 * counterpart. Each omitted coordinate sum is bounded by the positive norm
 * tail (n-1) rho^(1-terms)/(rho-1), including when maxTerms is reached.
 *
 * These bounds also enclose half of E(c,2n-1), which has the same convex hull.
 * Roundoff padding is for floating-point rendering; this is not an interval
 * arithmetic certificate. Raw reciprocal input must be normalized by callers.
 */
export function attractorBounds(c, n, options = {}) {
  assertArity(n);
  const modulus = assertContractingParameter(c);
  // A rounded-up modulus is unsafe in the tail denominator near |c|=1.
  // Reserve a small downward margin, using either component as an exact lower
  // bound when that is sharper (in particular for real/imaginary parameters).
  const rho = Math.max(Math.abs(c.re), Math.abs(c.im), modulus * (1 - 4 * Number.EPSILON));
  if (rho <= 1) {
    throw new RangeError('c is too close to the unit circle to compute stable finite bounds');
  }
  const tol = options.tol ?? 1e-9;
  const maxTerms = options.maxTerms ?? 2000;
  assertPositiveNumber(tol, 'tol');
  assertInteger(maxTerms, 'maxTerms', 1, MAX_BOUND_TERMS);

  const logRho = Math.log(rho);
  const logDigitRadius = Math.log(n - 1);
  const logGap = Math.log(rho - 1);
  const target = 1 + (logDigitRadius - Math.log(tol) - logGap) / logRho;
  let terms = Math.min(maxTerms, Math.max(1, Math.ceil(target)));
  const normTail = count => {
    // Logarithms avoid an underflowing tolerance product and do not multiply
    // a very small power by a very large prefactor. Preserve a positive tail
    // when the true value lies below the smallest representable Number.
    const value = Math.exp(logDigitRadius + (1 - count) * logRho - logGap);
    return Math.max(Number.MIN_VALUE, value * (1 + 8 * Number.EPSILON));
  };
  let tailRadius = normTail(terms);
  if (terms < maxTerms && tailRadius > tol) {
    terms++;
    tailRadius = normTail(terms);
  }

  const inverse = inv(c);
  let re = 1;
  let im = 0;
  let sumX = 0;
  let sumY = 0;
  for (let j = 0; j < terms; j++) {
    sumX += Math.abs(re);
    sumY += Math.abs(im);
    const nextRe = re * inverse.re - im * inverse.im;
    im = re * inverse.im + im * inverse.re;
    re = nextRe;
  }
  const partialX = (n - 1) * sumX;
  const partialY = (n - 1) * sumY;
  const roundoffPadding = 32 * Number.EPSILON * (terms + 1) *
    (partialX + partialY + tailRadius);
  const xMax = partialX + tailRadius + roundoffPadding;
  const yMax = partialY + tailRadius + roundoffPadding;
  if (!Number.isFinite(xMax) || !Number.isFinite(yMax)) {
    throw new RangeError('attractor bounds exceeded the finite numerical range');
  }
  return {
    xMax, yMax, tailRadius, terms,
    tailCapHit: tailRadius > tol,
    roundoffPadding
  };
}

export const computeAttractorBounds = attractorBounds;
