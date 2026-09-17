import { inv } from '../math/complex.mjs';
import {
  assertAlphabetSize, assertContractingParameter, assertFiniteNumber,
  assertInteger, MAX_RENDER_POINTS
} from '../math/validation.mjs';
import { colorForPiece } from './palettes.mjs';
import { withAlpha } from './overlay_compositor.mjs';

export function normalizeSeed(seed) {
  assertInteger(seed, 'seed', -Number.MAX_SAFE_INTEGER);
  return seed >>> 0;
}

export function makeLcg(seed) {
  let s = normalizeSeed(seed);
  return function next() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Shared deterministic IFS sampler for the Canvas and worker implementations. */
export function sampleHistogramAttractor(options, visit) {
  const { c, m, seed = 20260227, samples = 50000, burnIn = 64 } = options;
  assertContractingParameter(c);
  assertAlphabetSize(m);
  assertInteger(samples, 'samples', 0, MAX_RENDER_POINTS);
  assertInteger(burnIn, 'burnIn', 0, MAX_RENDER_POINTS);
  const effectiveSeed = normalizeSeed(seed);
  if (typeof visit !== 'function') throw new TypeError('visit must be a function');
  const invC = inv(c);
  const random = makeLcg(effectiveSeed);
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples + burnIn; i++) {
    const piece = Math.floor(random() * m);
    const digit = 2 * piece - m + 1;
    // E(c,m) uses f_t(z) = t + z/c; the selected digit labels the outer map.
    const nextRe = digit + re * invC.re - im * invC.im;
    im = re * invC.im + im * invC.re;
    re = nextRe;
    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      throw new RangeError('histogram orbit exceeded the finite numerical range');
    }
    if (i >= burnIn) visit(re, im, piece);
  }
  return {
    renderer: 'seeded-histogram', m, samples, burn_in: burnIn, seed: effectiveSeed,
    maps: 'z -> t + z/c', proof_status: 'visual-approximation'
  };
}

export function renderHistogramAttractor(ctx, options) {
  const {
    project, opacity = 0.55, firstLevelPieces = true, baseColor = '#111827'
  } = options;
  if (typeof project !== 'function') throw new TypeError('project must be a function');
  assertFiniteNumber(opacity, 'opacity');
  let metadata;
  withAlpha(ctx, opacity, () => {
    metadata = sampleHistogramAttractor(options, (re, im, piece) => {
      const p = project(re, im);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      ctx.fillStyle = firstLevelPieces ? colorForPiece(piece) : baseColor;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    });
  });
  return { ...metadata, first_level_pieces: Boolean(firstLevelPieces) };
}
