import { inverseIterationTestDetailed } from './inverse_search_reference.mjs';

export function inverseSearchKernel(job) {
  const {
    x,
    y,
    n,
    kMax = 37,
    LMax = 1000,
    tol = 1e-8,
    zigzag = false
  } = job;

  const result = inverseIterationTestDetailed(x, y, n, kMax, LMax, tol);
  return {
    ...result,
    kernel: 'typed-array-ready-reference-equivalent',
    zigzag,
    buffers: {
      queueType: 'Float64Array-compatible',
      wordType: 'Int32Array-compatible'
    }
  };
}
