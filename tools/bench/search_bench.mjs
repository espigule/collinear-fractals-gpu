#!/usr/bin/env node
import { inverseIterationTestDetailed } from '../../src/compute/inverse_search_reference.mjs';
import { inverseIterationTestFast } from '../../src/compute/inverse_search_kernel.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !/^--iterations=\d+$/.test(args[0]))) {
  throw new Error('Usage: node tools/bench/search_bench.mjs [--iterations=10000]');
}
const iterations = args[0] ? Number(args[0].split('=')[1]) : 10000;
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1000000) {
  throw new RangeError('iterations must be an integer from 1 to 1000000');
}

const cases = [
  { label: 'plane-filling-n5', x: 1, y: 2, n: 5 },
  { label: 'overlap-n4', x: 1.5, y: Math.sqrt(11) / 2, n: 4 },
  { label: 'hole-n13', x: 2.0719, y: 3.0537, n: 13 },
  { label: 'in-lens-n3', x: 0.5, y: 1.1, n: 3 }
];
const verdictCode = { Interior: 1, 'Interior-offLens': 2, Exterior: 3, Undetermined: 4 };
const stopCode = {
  'outside-domain': 1, 'numerical-range': 2, 'enclosure-escape': 3,
  'trap-hit': 4, 'tree-exhausted': 5, 'node-cap': 6, 'depth-cap': 7
};
const warmupIterations = Math.min(1000, Math.max(100, iterations));

function search(searchFunction, item) {
  return searchFunction(item.x, item.y, item.n, 37, 1000, 1e-8);
}

// A discrepancy is a correctness failure, regardless of timing.
for (const item of cases) {
  const expected = search(inverseIterationTestDetailed, item);
  const actual = search(inverseIterationTestFast, item);
  for (const field of ['verdict', 'depth', 'nodesExplored', 'stopReason']) {
    if (actual[field] !== expected[field]) throw new Error(`${item.label}: ${field} mismatch`);
  }
}
for (let i = 0; i < warmupIterations; i++) {
  const item = cases[i % cases.length];
  search(inverseIterationTestDetailed, item);
  search(inverseIterationTestFast, item);
}

function measure(searchFunction) {
  let admittedNodes = 0;
  let checksum = 2166136261;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const found = search(searchFunction, cases[i % cases.length]);
    admittedNodes += found.nodesExplored;
    for (const value of [verdictCode[found.verdict], found.depth, found.nodesExplored, stopCode[found.stopReason]]) {
      checksum = Math.imul(checksum ^ value, 16777619) >>> 0;
    }
  }
  return { elapsed_ms: performance.now() - start, admitted_nodes: admittedNodes, result_checksum: checksum };
}

const detailed = measure(inverseIterationTestDetailed);
const fast = measure(inverseIterationTestFast);
if (detailed.admitted_nodes !== fast.admitted_nodes || detailed.result_checksum !== fast.result_checksum) {
  throw new Error('Detailed and fast benchmark results differ');
}
console.log(JSON.stringify({
  schema_version: '0.2.0',
  benchmark: 'inverse-search',
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  iterations,
  warmup_iterations: warmupIterations,
  parameters: { k_max: 37, L_max: 1000, tol: 1e-8 },
  cases,
  detailed,
  fast,
  measured_ratio: detailed.elapsed_ms / fast.elapsed_ms,
  note: 'This finite corpus measures the current runtime; timing is not a performance guarantee or a pass/fail threshold.',
  artifacts: []
}, null, 2));
