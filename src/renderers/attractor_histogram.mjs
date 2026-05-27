import { alphabet } from '../math/alphabets.mjs';
import { inv, mul } from '../math/complex.mjs';
import { colorForPiece } from './palettes.mjs';

export function makeLcg(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return function next() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function renderHistogramAttractor(ctx, options) {
  const {
    c,
    m,
    seed = 20260227,
    samples = 50000,
    burnIn = 64,
    project,
    opacity = 0.55,
    firstLevelPieces = true,
    baseColor = '#111827'
  } = options;

  const digits = alphabet(m);
  const invC = inv(c);
  const random = makeLcg(seed);
  let z = { re: 0, im: 0 };
  let firstIndex = 0;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  for (let i = 0; i < samples + burnIn; i++) {
    const index = Math.floor(random() * digits.length) % digits.length;
    const digit = digits[index];
    z = mul({ re: z.re + digit, im: z.im }, invC);
    firstIndex = index;
    if (i >= burnIn) {
      const p = project(z.re, z.im);
      ctx.fillStyle = firstLevelPieces ? colorForPiece(firstIndex) : baseColor;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }
  ctx.restore();

  return {
    renderer: 'seeded-histogram',
    m,
    samples,
    burn_in: burnIn,
    seed,
    first_level_pieces: Boolean(firstLevelPieces),
    proof_status: 'visual-approximation'
  };
}
