import { alphabet } from './alphabets.mjs';
import { inv, mul } from './complex.mjs';
import {
  assertAlphabetSize, assertComplex, assertContractingParameter,
  assertInteger, assertPositiveNumber, MAX_RENDER_POINTS
} from './validation.mjs';

export function tailRadius(c, m, depth) {
  assertComplex(c);
  assertAlphabetSize(m);
  assertInteger(depth, 'depth');
  const rho = Math.hypot(c.re, c.im);
  if (rho <= 1) return Infinity;
  if (!Number.isFinite(rho)) throw new RangeError('c must have a finite modulus');
  // E(c,m) = sum_{j>=0} a_j / c^j: after d digits the remainder is
  // bounded by (m-1) * rho^(1-d) / (rho-1).
  return ((m - 1) / (1 - 1 / rho)) * Math.pow(rho, -depth);
}

export function choosePrefixDepth(c, m, requestedDepth, maxPrefixes = 60000) {
  assertContractingParameter(c);
  assertAlphabetSize(m);
  assertInteger(requestedDepth, 'requestedDepth');
  assertInteger(maxPrefixes, 'maxPrefixes', 1, MAX_RENDER_POINTS);
  // Whole levels keep every first-level piece equally represented. Use integer
  // products so exact power budgets do not lose a level to logarithm rounding.
  let depth = 0;
  let estimatedPrefixes = 1;
  while (depth < requestedDepth && estimatedPrefixes <= maxPrefixes / m) {
    estimatedPrefixes *= m;
    depth++;
  }
  return {
    depth,
    requestedDepth,
    truncatedByWorkCap: depth < requestedDepth,
    estimatedPrefixes,
    maxPrefixes
  };
}

export function prefixCenters(c, m, depth, options = {}) {
  const maxPrefixes = options.maxPrefixes ?? 60000;
  const choice = choosePrefixDepth(c, m, depth, maxPrefixes);
  if (choice.depth !== depth) {
    throw new RangeError('requested prefix depth exceeds maxPrefixes; use choosePrefixDepth first');
  }
  if (depth === 0) return [{ re: 0, im: 0, firstDigit: null }];
  const digits = alphabet(m);
  const invC = inv(c);
  let power = { re: 1, im: 0 };
  let centers = [{ re: 0, im: 0, firstDigit: null }];

  for (let level = 0; level < depth; level++) {
    const next = [];
    for (const center of centers) {
      for (const digit of digits) {
        const z = {
          re: center.re + digit * power.re,
          im: center.im + digit * power.im,
          firstDigit: center.firstDigit === null ? digit : center.firstDigit
        };
        next.push(z);
      }
    }
    centers = next;
    power = mul(power, invC);
  }
  return centers;
}

export function prefixMetadata(c, m, requestedDepth, pixelRadius, maxPrefixes = 60000) {
  assertPositiveNumber(pixelRadius, 'pixelRadius');
  const choice = choosePrefixDepth(c, m, requestedDepth, maxPrefixes);
  return {
    renderer: 'prefix-cylinder',
    m,
    depth: choice.depth,
    requested_depth: choice.requestedDepth,
    estimated_prefixes: choice.estimatedPrefixes,
    truncated_by_work_cap: choice.truncatedByWorkCap,
    tail_radius: tailRadius(c, m, choice.depth),
    pixel_radius: pixelRadius,
    first_level_pieces: choice.depth > 0,
    maps: 'z -> t + z/c',
    seed: null,
    proof_status: 'visual-approximation'
  };
}
