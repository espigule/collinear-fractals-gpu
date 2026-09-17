import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyParameterView, PARAMETER_VIEW_DEFINITIONS, PARAMETER_VIEW_MODES
} from '../src/compute/parameter_views.mjs';
import {
  createInverseSearchContext, inverseIterationTestFast, inverseSearchPointFast
} from '../src/compute/inverse_search_kernel.mjs';
import { getEffectiveC } from '../src/compute/inverse_search_reference.mjs';
import { alphabet } from '../src/math/alphabets.mjs';

function searchFields(value) {
  const { verdict, depth, nodesExplored, stopReason } = value;
  return { verdict, depth, nodesExplored, stopReason };
}

// Independent Cartesian inverse iteration with a circular enclosure. It does not
// use the canonical recurrence or the tighter parallelogram from the core.
function survivesDiskBound(x, y, n, depth) {
  const rho = Math.hypot(x, y);
  const radius = (n - 1) * rho / (rho - 1);
  let nodes = [{ x, y }];
  if (rho > radius) return false;
  for (let k = 0; k < depth; k++) {
    const next = [];
    for (const z of nodes) {
      for (const digit of alphabet(n)) {
        const candidate = {
          x: x * (z.x - digit) - y * z.y,
          y: y * (z.x - digit) + x * z.y
        };
        if (Math.hypot(candidate.x, candidate.y) <= radius) next.push(candidate);
      }
    }
    if (!next.length) return false;
    nodes = next;
  }
  return true;
}

test('parameter definitions keep the alphabet and marked point distinct', () => {
  assert.deepEqual(PARAMETER_VIEW_MODES, ['mn', 'rn', 'compare']);
  assert.equal(PARAMETER_VIEW_DEFINITIONS.rn.membership, 'c in E(c,n)');
  assert.equal(PARAMETER_VIEW_DEFINITIONS.mn.membership, '2c in E(c,2n-1)');
  const result = classifyParameterView(1, 1, 3, 6, 1000, 1e-8, 'compare');
  assert.equal(result.set, 'mn');
  assert.equal(result.mn.label, 'M_n');
  assert.equal(result.mn.alphabetSize, 5);
  assert.equal(result.mn.markedPointScale, 2);
  assert.equal(result.rn.label, 'R_n');
  assert.equal(result.rn.alphabetSize, 3);
  assert.equal(result.rn.markedPointScale, 1);
  assert.equal(result.rn.usesTrap, false);
  assert.equal(result.mn.usesTrap, true);
  assert.equal(result.word, undefined, 'fast view results must not be mistaken for witness records');
});

test('Mn mode preserves the audited fast classification', () => {
  for (const [x, y, n] of [[0.5, 1.1, 3], [1.419643377607, 0.606290729207, 3], [3, 3, 3]]) {
    const direct = inverseIterationTestFast(x, y, n, 12, 100);
    const adapted = classifyParameterView(x, y, n, 12, 100);
    assert.deepEqual(searchFields(adapted), searchFields(direct));
    assert.deepEqual(searchFields(adapted.mn), searchFields(direct));
    assert.equal(adapted.rn, null);
    assert.equal(adapted.mode, 'mn');
    assert.equal(adapted.comparison, null);
  }
});

test('Rn survival remains Undetermined even at a known member', () => {
  // c=1+i satisfies c=2-2/c. The digits [2,-2,0,0,...] give an exact
  // expansion in A_3, independently of the numerical search implementation.
  let z = { x: 1, y: 1 };
  for (const t of [2, -2]) z = { x: z.x - t - z.y, y: z.x - t + z.y };
  assert.deepEqual(z, { x: 0, y: 0 });
  for (const depth of [0, 1, 2, 6, 8]) {
    const result = classifyParameterView(1, 1, 3, depth, 1000, 1e-8, 'rn');
    assert.equal(result.verdict, 'Undetermined');
    assert.equal(result.stopReason, 'depth-cap');
    assert.equal(result.displayReason, 'finite-survival');
    assert.equal(result.depth, depth);
    assert.equal(result.trapRegion, undefined);
    assert.equal(result.mn, null);
    assert.equal(result.set, 'rn');
  }
});

test('node caps are not relabelled as completed finite-depth survival', () => {
  const limited = classifyParameterView(1, 1, 3, 8, 1, 1e-8, 'rn');
  assert.equal(limited.verdict, 'Undetermined');
  assert.equal(limited.stopReason, 'node-cap');
  assert.equal(limited.displayReason, 'node-cap');
  assert.equal(limited.depth, 1);
  assert.equal(limited.nodesExplored, 2);
});

test('Rn differs from Mn, with independent exterior verification', () => {
  const result = classifyParameterView(1.2, 0.9, 2, 12, 100, 1e-8, 'compare');
  assert.equal(result.mn.verdict, 'Interior-offLens');
  assert.equal(result.rn.verdict, 'Exterior');
  assert.equal(result.rn.stopReason, 'tree-exhausted');
  assert.equal(result.comparison, 'mn-trap-rn-exterior');
  assert.equal(survivesDiskBound(1.2, 0.9, 2, 4), false);
  const farAway = classifyParameterView(3, 3, 3, 12, 100, 1e-8, 'compare');
  assert.equal(farAway.comparison, 'outside-both');
  assert.equal(farAway.rn.stopReason, 'enclosure-escape');
  assert.equal(survivesDiskBound(3, 3, 3, 0), false);
});

test('both views normalize the parameter and its marked point consistently', () => {
  for (const mode of PARAMETER_VIEW_MODES) {
    assert.deepEqual(
      classifyParameterView(0.5, -0.5, 3, 6, 1000, 1e-8, mode),
      classifyParameterView(1, 1, 3, 6, 1000, 1e-8, mode)
    );
  }
});

test('unsupported domains and reciprocal overflow remain unresolved', () => {
  for (const [x, y] of [[0, 0], [2, 0], [0, 1]]) {
    const result = classifyParameterView(x, y, 3, 6, 100, 1e-8, 'compare');
    for (const set of ['mn', 'rn']) {
      assert.equal(result[set].verdict, 'Undetermined');
      assert.equal(result[set].displayReason, 'outside-domain');
    }
    assert.equal(result.comparison, 'unresolved');
  }
  const overflow = classifyParameterView(Number.MIN_VALUE, Number.MIN_VALUE, 3, 6, 100, 1e-8, 'compare');
  assert.equal(overflow.mn.stopReason, 'numerical-range');
  assert.equal(overflow.rn.stopReason, 'numerical-range');
});

test('the exact digit inclusion supports Rn subset Mn without promoting survival', () => {
  for (let n = 2; n <= 32; n++) {
    const difference = new Set(alphabet(2 * n - 1));
    for (const digit of alphabet(n)) assert.ok(difference.has(2 * digit));
  }
  const result = classifyParameterView(1, 1, 3, 6, 1000, 1e-8, 'compare');
  assert.equal(result.rn.verdict, 'Undetermined');
  assert.equal(result.mn.verdict, 'Interior');
  assert.equal(result.comparison, 'mn-trap-rn-survival');
});

test('seeded classifications match separate kernel calls and conjugation', () => {
  let seed = 271828;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 96; i++) {
    const x = -2.5 + 5 * random();
    const y = 0.08 + 2 * random();
    const n = [2, 3, 8][i % 3];
    const kMax = [0, 2, 8][i % 3];
    const LMax = [1, 16, 128][i % 3];
    const combined = classifyParameterView(x, y, n, kMax, LMax, 1e-8, 'compare');
    const effective = getEffectiveC(x, y);
    const context = createInverseSearchContext(effective.x, effective.y, n, false, 1e-8, { useTrap: false });
    const rn = inverseSearchPointFast(context, effective.x, effective.y, kMax, LMax);
    assert.deepEqual(searchFields(combined.rn), searchFields(rn));
    assert.deepEqual(searchFields(combined.mn), searchFields(inverseIterationTestFast(x, y, n, kMax, LMax)));
    assert.notEqual(combined.rn.verdict, 'Interior');
    assert.notEqual(combined.rn.verdict, 'Interior-offLens');
    const conjugate = classifyParameterView(x, -y, n, kMax, LMax, 1e-8, 'compare');
    assert.deepEqual(searchFields(conjugate.rn), searchFields(combined.rn));
    assert.equal(conjugate.comparison, combined.comparison);
  }
});

test('invalid input and unknown modes fail before search', () => {
  for (const args of [
    [NaN, 1, 3], [1, Infinity, 3], [1, 1, 1], [1, 1, 2.5],
    [1, 1, 3, -1], [1, 1, 3, 4, 0], [1, 1, 3, 4, 10, 0],
    [1, 1, 3, 4, 10, 1e-8, 'unknown']
  ]) assert.throws(() => classifyParameterView(...args));
});
