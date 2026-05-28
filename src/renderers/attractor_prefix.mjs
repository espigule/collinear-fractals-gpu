import { alphabet } from '../math/alphabets.mjs';
import { choosePrefixDepth, prefixCenters, prefixMetadata, tailRadius } from '../math/prefix_cylinders.mjs';
import { colorForPiece } from './palettes.mjs';
import { circle, withAlpha } from './overlay_compositor.mjs';

export function renderPrefixAttractor(ctx, options) {
  const {
    c,
    m,
    requestedDepth = 7,
    maxPrefixes = 60000,
    project,
    pixelRadius = 1,
    opacity = 0.75,
    firstLevelPieces = true,
    baseColor = '#111827'
  } = options;

  const choice = choosePrefixDepth(c, m, requestedDepth, maxPrefixes);
  const centers = prefixCenters(c, m, choice.depth, { maxPrefixes });
  const digits = alphabet(m);
  const digitIndex = new Map(digits.map((digit, index) => [digit, index]));
  const radiusWorld = tailRadius(c, m, choice.depth);
  const radiusPx = Math.max(0.75, Math.min(8, radiusWorld / Math.max(pixelRadius, 1e-12)));

  withAlpha(ctx, opacity, () => {
    for (const center of centers) {
      const p = project(center.re, center.im);
      const color = firstLevelPieces
        ? colorForPiece(digitIndex.get(center.firstDigit) || 0)
        : baseColor;
      circle(ctx, p.x, p.y, radiusPx, color);
    }
  });

  return {
    ...prefixMetadata(c, m, requestedDepth, pixelRadius, maxPrefixes),
    first_level_pieces: Boolean(firstLevelPieces),
    rendered_prefixes: centers.length
  };
}
