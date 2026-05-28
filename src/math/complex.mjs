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
  const d = abs2(z);
  if (d === 0) throw new RangeError('cannot invert zero');
  return { re: z.re / d, im: -z.im / d };
}

export function div(a, b) {
  return mul(a, inv(b));
}

export function scale(z, s) {
  return { re: z.re * s, im: z.im * s };
}
