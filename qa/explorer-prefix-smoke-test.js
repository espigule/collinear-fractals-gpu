#!/usr/bin/env node
'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
// The browser imports this same module. Browser wiring is exercised separately
// by browser.spec.cjs; source slicing and a VM cannot catch browser failures.
const context = await import('../src/compute/inverse_search_reference.mjs');

assert(context.firstAlphabetDigitAtOrAbove(-3.1, 5) === -2, 'A_5 parity helper failed.');
assert(context.firstAlphabetDigitAtOrAbove(-3.1, 4) === -3, 'A_4 parity helper failed.');

const inLens = context.inverseIterationTestDetailed(0.5, 1.1, 3, 37, 1000, 1e-8);
assert(inLens.verdict === 'Interior', `Expected in-lens Interior, got ${inLens.verdict}.`);

const exterior = context.inverseIterationTestDetailed(3.0, 3.0, 3, 37, 1000, 1e-8);
assert(exterior.verdict === 'Exterior', `Expected Exterior, got ${exterior.verdict}.`);

const offLens = context.inverseIterationTestDetailed(1.419643377607, 0.606290729207, 3, 37, 1000, 1e-8);
assert(offLens.verdict === 'Interior-offLens', `Expected Interior-offLens, got ${offLens.verdict}.`);

const enc = context.computeEnclosureGeneral(0.7, 1.4, 5, 1e-8);
assert(enc.tailCertifiedToTol === true, 'Expected certified enclosure tail.');

console.log('Explorer prefix smoke tests passed.');
console.log(JSON.stringify({
  inLens: inLens.verdict,
  exterior: exterior.verdict,
  offLens: offLens.verdict,
  offLensDepth: offLens.depth,
  enclosureDepth: enc.truncationDepth
}, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
