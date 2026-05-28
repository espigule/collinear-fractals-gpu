#!/usr/bin/env node
'use strict';

(async () => {
  const { prefixMetadata } = await import('../../src/math/prefix_cylinders.mjs');
  const { makeLcg } = await import('../../src/renderers/attractor_histogram.mjs');
  const { inverseSearchKernel } = await import('../../src/compute/inverse_search_kernel.mjs');

  const c = { re: 1.5, im: 1.6583123951777 };
  const prefix = prefixMetadata(c, 4, 7, 0.01, 60000);

  const random = makeLcg(20260227);
  const histogramProbe = Array.from({ length: 8 }, () => random());

  const kernelStart = performance.now();
  const kernel = inverseSearchKernel({
    x: 0.5,
    y: 1.1,
    n: 3,
    kMax: 37,
    LMax: 1000,
    tol: 1e-8
  });
  const kernelElapsedMs = performance.now() - kernelStart;

  console.log(JSON.stringify({
    schema_version: '0.2.0',
    benchmark: 'render-metadata',
    software_version: '0.2.0-alpha',
    generated_at: new Date().toISOString(),
    prefix,
    histogram: {
      renderer: 'seeded-histogram',
      seed: 20260227,
      probe: histogramProbe
    },
    kernel: {
      verdict: kernel.verdict,
      depth: kernel.depth,
      nodes_explored: kernel.nodesExplored,
      elapsed_ms: kernelElapsedMs
    },
    artifacts: []
  }, null, 2));
})();
