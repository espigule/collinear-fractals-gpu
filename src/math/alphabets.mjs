export function alphabet(m) {
  if (!Number.isInteger(m) || m < 2) {
    throw new RangeError('alphabet size m must be an integer >= 2');
  }
  const digits = [];
  for (let a = -m + 1; a <= m - 1; a += 2) {
    digits.push(a);
  }
  return digits;
}

export function differenceAlphabetIndex(n) {
  if (!Number.isInteger(n) || n < 2) {
    throw new RangeError('arity n must be an integer >= 2');
  }
  return 2 * n - 1;
}
