import { assertAlphabetSize, assertArity, MAX_RENDER_POINTS } from './validation.mjs';

export function alphabet(m) {
  assertAlphabetSize(m);
  if (m > MAX_RENDER_POINTS) throw new RangeError('alphabet allocation exceeds the render work cap');
  const digits = [];
  for (let a = -m + 1; a <= m - 1; a += 2) {
    digits.push(a);
  }
  return digits;
}

export function differenceAlphabetIndex(n) {
  assertArity(n);
  return 2 * n - 1;
}
