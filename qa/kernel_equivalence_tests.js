#!/usr/bin/env node
'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const reference = await import('../src/compute/inverse_search_reference.mjs');
  const kernel = await import('../src/compute/inverse_search_kernel.mjs');

  const cases = [
    { label: 'n3-in-lens', x: 0.5, y: 1.1, n: 3, limits: [[5, 1000], [10, 1000], [37, 1000]] },
    { label: 'n3-exterior', x: 3.0, y: 3.0, n: 3, limits: [[5, 1000], [10, 1000], [37, 1000]] },
    { label: 'n3-off-lens', x: 1.419643377607, y: 0.606290729207, n: 3, limits: [[5, 1000], [10, 1000], [37, 1000]] },
    { label: 'n2-small-depth', x: 0.75, y: 1.25, n: 2, limits: [[5, 128], [10, 256]] },
    { label: 'n4-prefix', x: 1.5, y: 1.6583123951777, n: 4, limits: [[5, 256], [10, 1000]] },
    { label: 'n5-prefix', x: 1.0, y: 2.0, n: 5, limits: [[5, 256], [10, 1000]] },
    { label: 'n13-hole', x: 2.0719, y: 3.0537, n: 13, limits: [[5, 256], [10, 1000], [20, 1000]] },
    { label: 'n20-threshold', x: 2.0, y: 4.0, n: 20, limits: [[5, 256], [10, 1000], [20, 1000]] }
  ];

  for (const item of cases) {
    for (const [kMax, LMax] of item.limits) {
      const expected = reference.inverseIterationTestDetailed(item.x, item.y, item.n, kMax, LMax, 1e-8);
      const actual = kernel.inverseSearchKernel({
        x: item.x,
        y: item.y,
        n: item.n,
        kMax,
        LMax,
        tol: 1e-8,
        zigzag: true
      });
      assert(
        expected.verdict === actual.verdict,
        `${item.label} k=${kMax} L=${LMax}: expected ${expected.verdict}, got ${actual.verdict}`
      );
      assert(
        expected.depth === actual.depth,
        `${item.label} k=${kMax} L=${LMax}: expected depth ${expected.depth}, got ${actual.depth}`
      );
      assert(
        JSON.stringify(expected.word || []) === JSON.stringify(actual.word || []),
        `${item.label} k=${kMax} L=${LMax}: certificate word changed`
      );
    }
  }

  console.log('Kernel equivalence tests passed.');
  console.log(JSON.stringify({ cases: cases.length }, null, 2));
})();
