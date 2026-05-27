'use strict';

const {
  DEFAULT_K_MAX,
  getCanonicalCoordinates,
  inLens,
  computeEnclosure,
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
assert(inside.verdict === 'Interior', '0.5+1.1i should certify Interior for n=3');
console.log(`✓ in-lens interior search: depth ${inside.depth}`);

const outside = inverseIterationTest(3.0, 3.0, 3, DEFAULT_K_MAX, 1000);
assert(outside.verdict === 'Exterior', '3+3i should certify Exterior for n=3');
console.log(`✓ exterior search: depth ${outside.depth}`);

const offLens = inverseIterationTest(1.419643377607, 0.606290729207, 3, DEFAULT_K_MAX, 1000);
assert(inLens(1.419643377607, 0.606290729207, 3) === false, 'off-lens witness should be off lens');
assert(offLens.verdict === 'Interior-offLens', 'off-lens trap hit should be labeled Interior-offLens');
console.log(`✓ off-lens trap label: depth ${offLens.depth}, word ${offLens.word}`);

console.log('\nAll JavaScript package tests passed.');
