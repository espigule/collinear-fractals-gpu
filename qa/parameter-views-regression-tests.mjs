import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyParameterView, PARAMETER_VIEW_DEFINITIONS, PARAMETER_VIEW_MODES
} from '../src/compute/parameter_views.mjs';
import { inverseIterationTestFast } from '../src/compute/inverse_search_kernel.mjs';
import { createAttractorMembershipContext, classifyAttractorPoint } from '../src/compute/attractor_membership.mjs';
import { getEffectiveC } from '../src/compute/inverse_search_reference.mjs';
import { alphabet } from '../src/math/alphabets.mjs';

function searchFields(value) {
  const { verdict, depth, nodesExplored, stopReason } = value;
  return { verdict, depth, nodesExplored, stopReason };
}

// Independent Cartesian iteration with a circular enclosure, including the
// first-step complement alphabet. This does not use canonical coordinates.
function survivesDiskBound(x, y, n, depth, complement = false) {
  const rho = Math.hypot(x, y);
  const radius = (n - 1) * rho / (rho - 1);
  let nodes = [{ x, y }];
  if (!complement && rho > radius) return false;
  for (let k = 0; k < depth; k++) {
    const next = [];
    const digits = k === 0 && complement
      ? Array.from({ length: n - 1 }, (_, i) => 2 * i - n + 2) : alphabet(n);
    for (const z of nodes) for (const digit of digits) {
      const candidate = { x: x * (z.x - digit) - y * z.y, y: y * (z.x - digit) + x * z.y };
      if (Math.hypot(candidate.x, candidate.y) <= radius) next.push(candidate);
    }
    if (!next.length) return false;
    nodes = next;
  }
  return true;
}

function classify(x, y, n, mode, options = {}) {
  return classifyParameterView(x, y, n, 12, 1000, 1e-8, mode, options);
}

test('canonical definitions distinguish the initial digit from the tail alphabet', () => {
  assert.deepEqual(PARAMETER_VIEW_MODES, ['mn', 'mn0', 'mn1', 'compare']);
  assert.equal(PARAMETER_VIEW_DEFINITIONS.mn0.membership, 'c in E(c,n)');
  assert.equal(PARAMETER_VIEW_DEFINITIONS.mn1.membership, 'c in A_(n-1)+(1/c)E(c,n)');
  const result = classify(1, 1, 3, 'compare');
  assert.equal(result.set, 'mn');
  assert.equal(result.mn.alphabetSize, 5);
  assert.equal(result.mn.markedPointScale, 2);
  assert.equal(result.mn0.label, 'M_n^0');
  assert.equal(result.mn0.alphabetSize, 3);
  assert.equal(result.mn0.markedPointScale, 1);
  assert.equal(result.mn0.firstStep, 'original');
  assert.equal(result.mn0.usesTrap, false);
  assert.equal(result.mn1, null);
  assert.equal(Object.hasOwn(result, 'rn'), false);
  assert.deepEqual(classify(1, 1, 3, 'rn'), classify(1, 1, 3, 'mn0'));
  assert.equal(result.word, undefined);
});

test('Mn preserves canonical breadth-first classification independently of membership budgets', () => {
  for (const [x, y, n] of [[0.5, 1.1, 3], [1.419643377607, 0.606290729207, 3], [3, 3, 3]]) {
    const direct = inverseIterationTestFast(x, y, n, 12, 100, 1e-8, { canonicalOnly: true });
    for (const options of [{ escapeDepth: 0, boundaryWork: 1 }, { escapeDepth: 30 }]) {
      const adapted = classifyParameterView(x, y, n, 12, 100, 1e-8, 'mn', options);
      assert.deepEqual(searchFields(adapted), searchFields(direct));
      assert.deepEqual(searchFields(adapted.mn), searchFields(direct));
      assert.equal(adapted.mn0, null);
      assert.equal(adapted.mn1, null);
    }
  }
});

test('M0 finite survival retains its explicit orbit without claiming capture', () => {
  // For c=1+i, digits [+1,-1,-1,...] produce c in E(c,2): after the
  // first inverse step z=-1+i, and the digit -1 fixes that tail point.
  const z1 = { x: -1, y: 1 };
  assert.deepEqual({ x: z1.x + 1 - z1.y, y: z1.x + 1 + z1.y }, z1);
  for (const depth of [0, 1, 2, 6, 16]) {
    const result = classify(1, 1, 2, 'mn0', { escapeDepth: depth });
    assert.equal(result.verdict, 'Undetermined');
    assert.equal(result.stopReason, 'depth-cap');
    assert.equal(result.displayReason, 'finite-survival');
    assert.equal(result.depth, depth);
    assert.equal(result.usesTrap, false);
  }
});

test('M1 complement applies once, including the binary zero first digit', () => {
  // For c=1+i, the only A_1 first digit is zero. Its residual c²=2i
  // lies beyond the original E(c,2) vertical support sum 5/3.
  const mn0 = classify(1, 1, 2, 'mn0', { escapeDepth: 12 });
  const mn1 = classify(1, 1, 2, 'mn1', { escapeDepth: 12 });
  assert.equal(mn0.stopReason, 'depth-cap');
  assert.equal(mn1.verdict, 'Exterior');
  assert.equal(mn1.firstStep, 'complement');
  assert.equal(mn1.alphabetSize, 2, 'the tail must retain A_2');
  assert.equal(survivesDiskBound(1, 1, 2, 6, true), false);
  // At c=1.2i, the mixed first-step set has a captured marked point.
  // Replacing the tail by E(c,1)={0} would incorrectly exclude nonzero c.
  const mixed = classify(0, 1.2, 2, 'mn1', { escapeDepth: 30 });
  assert.equal(mixed.verdict, 'Interior');
  assert.ok(mixed.depth >= 1, 'complement capture must follow its required first step');
  assert.equal(mixed.firstDigit, 0);
  assert.equal(mixed.firstLevelIndex, 0);
  assert.equal(classify(0, 1.2, 2, 'mn1', { escapeDepth: 0 }).stopReason, 'depth-cap');
});

test('original-alphabet traps are used only in the strict original lens', () => {
  const captured = classify(0, 1.2, 3, 'mn0', { escapeDepth: 30 });
  assert.equal(captured.usesTrap, true);
  assert.equal(captured.verdict, 'Interior');
  assert.equal(captured.stopReason, 'trap-hit');
  assert.equal(captured.depth, 0, 'parameter views do not delay root capture for piece colors');
  const offLens = classify(1, 1, 3, 'mn0');
  assert.equal(offLens.usesTrap, false);
  assert.notEqual(offLens.verdict, 'Interior-offLens');
  const strictBoundary = classify(1, 1, 4, 'mn0');
  assert.equal(strictBoundary.usesTrap, false, 'rho²+2|x|=m is excluded');
});

test('work caps remain unresolved and membership budgets do not use the Mn frontier cap', () => {
  const limited = classify(1, 1, 2, 'mn0', { escapeDepth: 16, boundaryWork: 1 });
  assert.equal(limited.verdict, 'Undetermined');
  assert.equal(limited.stopReason, 'work-cap');
  assert.equal(limited.displayReason, 'work-cap');
  assert.deepEqual(
    searchFields(classifyParameterView(1, 1, 2, 0, 1, 1e-8, 'mn0', { escapeDepth: 8 })),
    searchFields(classifyParameterView(1, 1, 2, 99, 1000, 1e-8, 'mn0', { escapeDepth: 8 }))
  );
});

test('M0 differs from Mn and comparison retains independent records', () => {
  const result = classify(1.2, 0.9, 2, 'compare');
  assert.equal(result.mn.verdict, 'Undetermined');
  assert.equal(result.mn0.verdict, 'Exterior');
  assert.equal(result.comparison, 'mn0-exterior-mn-unresolved');
  assert.equal(survivesDiskBound(1.2, 0.9, 2, 4), false);
  assert.equal(classify(3, 3, 3, 'compare').comparison, 'outside-both');
  for (let n = 2; n <= 32; n++) {
    const difference = new Set(alphabet(2 * n - 1));
    for (const digit of alphabet(n)) assert.ok(difference.has(2 * digit));
  }
});

test('all views normalize parameter and marked point consistently and preserve domain errors', () => {
  for (const mode of PARAMETER_VIEW_MODES) {
    assert.deepEqual(classify(0.5, -0.5, 3, mode), classify(1, 1, 3, mode));
    for (const [x, y] of [[0, 0], [2, 0], [0, 1]]) {
      assert.equal(classify(x, y, 3, mode).stopReason, 'outside-domain');
    }
    assert.equal(classify(Number.MIN_VALUE, Number.MIN_VALUE, 3, mode).stopReason, 'numerical-range');
  }
});

test('seeded marked-point views match dedicated searches and conjugation', () => {
  let seed = 271828;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 48; i++) {
    const x = -2.5 + 5 * random(), y = 0.08 + 2 * random();
    const n = [2, 3, 8][i % 3], depth = [0, 2, 8][i % 3];
    const effective = getEffectiveC(x, y);
    const context = createAttractorMembershipContext(effective.x, effective.y, n);
    for (const [mode, firstStep] of [['mn0', 'original'], ['mn1', 'complement']]) {
      const result = classify(x, y, n, mode, { escapeDepth: depth });
      const direct = classifyAttractorPoint(context, effective.x, effective.y, depth, {
        firstStep, maxWork: 20000, firstLevelPieces: false, pixelRadius: 0
      });
      assert.deepEqual(searchFields(result), searchFields(direct));
      assert.deepEqual(searchFields(classify(x, -y, n, mode, { escapeDepth: depth })), searchFields(result));
    }
  }
});

test('invalid input and membership budgets fail before search', () => {
  for (const args of [
    [NaN, 1, 3], [1, Infinity, 3], [1, 1, 1], [1, 1, 2.5],
    [1, 1, 3, -1], [1, 1, 3, 4, 0], [1, 1, 3, 4, 10, 0],
    [1, 1, 3, 4, 10, 1e-8, 'unknown']
  ]) assert.throws(() => classifyParameterView(...args));
  for (const options of [{ escapeDepth: -1 }, { escapeDepth: 101 }, { boundaryWork: 0 },
    { boundaryWork: 200001 }, null]) assert.throws(() => classify(1, 1, 3, 'mn0', options));
});
