import { choosePrefixDepth, prefixCenters, prefixMetadata, tailRadius } from '../math/prefix_cylinders.mjs';
import { assertFiniteNumber, assertPositiveNumber } from '../math/validation.mjs';
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

  if (typeof project !== 'function') throw new TypeError('project must be a function');
  assertFiniteNumber(opacity, 'opacity');
  assertPositiveNumber(pixelRadius, 'pixelRadius');
  const choice = choosePrefixDepth(c, m, requestedDepth, maxPrefixes);
  const centers = prefixCenters(c, m, choice.depth, { maxPrefixes });
  const radiusWorld = tailRadius(c, m, choice.depth);
  const radiusPx = Math.max(0.75, Math.min(8, radiusWorld / pixelRadius));
  const showPieces = Boolean(firstLevelPieces) && choice.depth > 0;

  withAlpha(ctx, opacity, () => {
    for (const center of centers) {
      const p = project(center.re, center.im);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const color = showPieces
        ? colorForPiece((center.firstDigit + m - 1) / 2)
        : baseColor;
      circle(ctx, p.x, p.y, radiusPx, color);
    }
  });

  return {
    ...prefixMetadata(c, m, requestedDepth, pixelRadius, maxPrefixes),
    first_level_pieces: showPieces,
    display_radius_px: radiusPx,
    tail_disks_clipped: radiusWorld / pixelRadius > radiusPx,
    rendered_prefixes: centers.length
  };
}
