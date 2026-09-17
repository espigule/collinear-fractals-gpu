export function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

export function assertInteger(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a safe integer between ${min} and ${max}`);
  }
}

export function assertAlphabetSize(m) {
  assertInteger(m, 'alphabet size m', 2);
}

export function assertArity(n) {
  // Keep the difference alphabet 2*n - 1 and its digit increments exact.
  assertInteger(n, 'arity n', 2, Math.floor(Number.MAX_SAFE_INTEGER / 2));
}

export function assertComplex(c) {
  assertFiniteNumber(c?.re, 'c.re');
  assertFiniteNumber(c?.im, 'c.im');
}

export function assertContractingParameter(c) {
  assertComplex(c);
  const rho = Math.hypot(c.re, c.im);
  if (!Number.isFinite(rho) || rho <= 1) {
    throw new RangeError('c must have a finite modulus greater than 1');
  }
  return rho;
}

export function assertPositiveNumber(value, name) {
  assertFiniteNumber(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
}

// Bound allocations and worker messages independently of UI input controls.
export const MAX_RENDER_POINTS = 1000000;
