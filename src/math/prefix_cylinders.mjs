import { alphabet } from './alphabets.mjs';
import { abs, inv, mul } from './complex.mjs';

export function tailRadius(c, m, depth) {
  const rho = abs(c);
  if (rho <= 1) return Infinity;
  return (m - 1) * Math.pow(rho, -depth) / (rho - 1);
}

export function choosePrefixDepth(c, m, requestedDepth, maxPrefixes = 60000) {
  const safeRequested = Math.max(1, Math.floor(requestedDepth || 1));
  const byWork = Math.max(1, Math.floor(Math.log(maxPrefixes) / Math.log(m)));
  const depth = Math.max(1, Math.min(safeRequested, byWork));
  return {
    depth,
    requestedDepth: safeRequested,
    truncatedByWorkCap: depth < safeRequested,
    estimatedPrefixes: Math.pow(m, depth),
    maxPrefixes
  };
}

export function prefixCenters(c, m, depth, options = {}) {
  const digits = alphabet(m);
  const invC = inv(c);
  let power = { ...invC };
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
    if (options.maxPrefixes && centers.length > options.maxPrefixes) {
      return centers.slice(0, options.maxPrefixes);
    }
  }
  return centers;
}

export function prefixMetadata(c, m, requestedDepth, pixelRadius, maxPrefixes = 60000) {
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
    first_level_pieces: true,
    seed: null,
    proof_status: 'visual-approximation'
  };
}
