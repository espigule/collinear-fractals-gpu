import { assertComplex } from './validation.mjs';

export function complex(re, im) {
  return { re, im };
}

export function abs2(z) {
  return z.re * z.re + z.im * z.im;
}

export function abs(z) {
  return Math.hypot(z.re, z.im);
}

export function add(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function mul(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re
  };
}

export function inv(z) {
  assertComplex(z);
  const magnitude = Math.max(Math.abs(z.re), Math.abs(z.im));
  if (magnitude === 0) throw new RangeError('cannot invert zero');
  // Scaling avoids squaring very large or small components. The reciprocal
  // may still overflow when its true magnitude exceeds the Number range.
  const re = z.re / magnitude;
  const im = z.im / magnitude;
  const denominator = re * re + im * im;
  return { re: (re / denominator) / magnitude, im: (-im / denominator) / magnitude };
}

export function div(a, b) {
  return mul(a, inv(b));
}

export function scale(z, s) {
  return { re: z.re * s, im: z.im * s };
}
