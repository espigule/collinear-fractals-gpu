export function withAlpha(ctx, alpha, draw) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  draw();
  ctx.restore();
}

export function circle(ctx, x, y, radius, fillStyle) {
  ctx.beginPath();
  ctx.fillStyle = fillStyle;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
