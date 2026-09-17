'use strict';

const {
  DEFAULT_K_MAX,
  getCanonicalCoordinates,
  inLens,
  chooseTailDepth,
  computeEnclosure,
  getTrapHalfWidths,
  firstAlphabetDigitAtOrAbove,
  inverseIterationTest
} = require('./index');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Test failed: ${message}`);
    process.exit(1);
  }
}

function assertAlmostEqual(actual, expected, eps, message) {
  assert(Math.abs(actual - expected) <= eps, `${message}; got ${actual}, expected ${expected}`);
}

console.log('Running Collinear Fractals JavaScript package tests...\n');

assert(DEFAULT_K_MAX === 37, 'DEFAULT_K_MAX should be 37');
console.log('✓ default kMax = 37');

const coords = getCanonicalCoordinates(1.0, 1.0, 0.6, 0.8);
assertAlmostEqual(coords.lv, 1.0, 1e-12, 'Vertical coordinate');
assertAlmostEqual(coords.ls, 1.4, 1e-12, 'Slanted coordinate');
console.log('✓ canonical coordinates');

assert(inLens(0.5, 1.2, 3) === true, '0.5+1.2i should be in lens for n=3');
assert(inLens(2.0, 2.0, 3) === false, '2+2i should be off lens for n=3');
console.log('✓ lens predicate');

const enc = computeEnclosure(0.7, 1.4, 3);
assert(enc.se > 0 && enc.ve > 0, 'Enclosure bounds must be positive');
assert(enc.tailCertifiedToTol, 'Tail should be certified to tolerance for this test parameter');
assertAlmostEqual(enc.se, 6.876046013381387, 1e-9, 'SE enclosure bound');
assertAlmostEqual(enc.ve, 5.162714411636048, 1e-9, 'VE enclosure bound');
console.log('✓ enclosure bounds with corrected tail depth');

assert(firstAlphabetDigitAtOrAbove(-3.1, 5) === -2, 'A_5 has even digits');
assert(firstAlphabetDigitAtOrAbove(-3.1, 4) === -3, 'A_4 has odd digits');
console.log('✓ alphabet parity helper');

const inside = inverseIterationTest(0.5, 1.1, 3, DEFAULT_K_MAX, 1000);
assert(inside.verdict === 'Interior', '0.5+1.1i should hit the in-lens trap for n=3');
console.log(`✓ in-lens interior search: depth ${inside.depth}`);

const outside = inverseIterationTest(3.0, 3.0, 3, DEFAULT_K_MAX, 1000);
assert(outside.verdict === 'Exterior', '3+3i should escape the enclosure for n=3');
console.log(`✓ exterior search: depth ${outside.depth}`);

const offLens = inverseIterationTest(1.419643377607, 0.606290729207, 3, DEFAULT_K_MAX, 1000);
assert(inLens(1.419643377607, 0.606290729207, 3) === false, 'off-lens witness should be off lens');
assert(offLens.verdict === 'Interior-offLens', 'off-lens trap hit should be labeled Interior-offLens');
console.log(`✓ off-lens trap label: depth ${offLens.depth}, word ${offLens.word}`);

const strict = require('node:assert/strict');

// Reject malformed inputs before an initial exit can hide an invalid budget.
for (const n of [0, 1, -2, 2.5, NaN, Infinity, '3', true, Number.MAX_SAFE_INTEGER]) {
  strict.throws(() => inverseIterationTest(3, 3, n));
  strict.throws(() => computeEnclosure(0.7, 1.4, n));
}
for (const [k, L, tol] of [[-1, 10, 1e-8], [1.5, 10, 1e-8], [1, 0, 1e-8],
  [1, 1.5, 1e-8], [1, 10, 0], [1, 10, NaN], [Infinity, 10, 1e-8]]) {
  strict.throws(() => inverseIterationTest(3, 3, 3, k, L, tol));
}
for (const bad of [NaN, Infinity, -Infinity, '1', null]) {
  strict.throws(() => inverseIterationTest(bad, 1.4, 3), TypeError);
  strict.throws(() => getCanonicalCoordinates(1, 1, 1, bad), TypeError);
}
strict.throws(() => getTrapHalfWidths(0, 0, 3), RangeError);
strict.throws(() => firstAlphabetDigitAtOrAbove(Infinity, 5), TypeError);
strict.throws(() => firstAlphabetDigitAtOrAbove(Number.MAX_SAFE_INTEGER, 5), RangeError);
strict.throws(() => chooseTailDepth(1.1, 1e-8, -1, 10), RangeError);
strict.throws(() => chooseTailDepth(1.1, 1e-8, 30, 29), RangeError);
strict.deepEqual(chooseTailDepth(2, 1, 0, 0), { M: 0, capped: false });
strict.deepEqual(chooseTailDepth(1 + Number.EPSILON, Number.MIN_VALUE), { M: 2000, capped: true });
const capped = computeEnclosure(1, 1e-6, 3);
strict.equal(capped.tailCapHit, true);
strict.equal(capped.tailCertifiedToTol, false);
strict.ok(capped.ve >= 4 * capped.tail, 'capped enclosure must keep the tail contribution');

// Finite arithmetic range is separate from a mathematical exterior result.
const normalized = getCanonicalCoordinates(1, 1, 1e308, 1e308);
strict.ok(Math.abs(normalized.ls - Math.SQRT2) < 1e-12);
const extreme = inverseIterationTest(1e308, 1e308, 3);
strict.equal(extreme.verdict, 'Undetermined');
strict.equal(extreme.stopReason, 'numerical-range');
for (const [x, y] of [[0, 0], [2, 0], [0, 1], [.2, .3]]) {
  strict.equal(inverseIterationTest(x, y, 3).stopReason, 'outside-domain');
}

const witness = [1.419643377607, 0.606290729207, 3];
const zeroDepth = inverseIterationTest(...witness, 0);
strict.equal(zeroDepth.stopReason, 'depth-cap');
strict.equal(zeroDepth.depth, 0);
strict.equal(zeroDepth.nodesExplored, 1);
const nodeCap = inverseIterationTest(...witness, 37, 1);
strict.equal(nodeCap.verdict, 'Undetermined');
strict.equal(nodeCap.stopReason, 'node-cap');
strict.equal(nodeCap.depth, 1);
strict.equal(nodeCap.nodesExplored, 2);
const nearReal = inverseIterationTest(1.1, Number.MIN_VALUE, 2, 2, 20);
strict.equal(nearReal.stopReason, 'depth-cap');
strict.equal(nearReal.depth, 2);

// Replay the reported witness using Cartesian complex multiplication, independently
// of the canonical recurrence used by the search.
strict.deepEqual(offLens.word, [4, 0]);
let ux = 2 * witness[0], uy = 2 * witness[1];
for (const t of offLens.word) {
  strict.ok(Number.isInteger(t) && t % 2 === 0 && Math.abs(t) <= 4);
  const nextX = witness[0] * (ux - t) - witness[1] * uy;
  uy = witness[1] * (ux - t) + witness[0] * uy;
  ux = nextX;
}
const finalCoordinates = getCanonicalCoordinates(ux, uy, witness[0], witness[1]);
const witnessTrap = getTrapHalfWidths(...witness);
strict.ok(Math.abs(finalCoordinates.ls) < witnessTrap.S);
strict.ok(Math.abs(finalCoordinates.lv) < witnessTrap.V);

for (const n of [2, 3, 8]) {
  for (const [x, y] of [[.5, 1.1], [1.2, .9], [1.6, .4], [2.2, 1.2], [.01, 1.05]]) {
    const upper = inverseIterationTest(x, y, n, 12, 100);
    const lower = inverseIterationTest(x, -y, n, 12, 100);
    strict.equal(lower.verdict, upper.verdict);
    strict.equal(lower.depth, upper.depth);
    strict.deepEqual(lower.word, upper.word);
  }
}
console.log('✓ input validation, numerical range, capped tails, search budgets, witness replay, and conjugation');
console.log('\nAll JavaScript package tests passed.');
