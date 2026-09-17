import { assertFiniteNumber } from '../math/validation.mjs';

export function withAlpha(ctx, alpha, draw) {
  assertFiniteNumber(alpha, 'alpha');
  ctx.save();
  try {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    draw();
  } finally {
    ctx.restore();
  }
}

export function circle(ctx, x, y, radius, fillStyle) {
  ctx.beginPath();
  ctx.fillStyle = fillStyle;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
