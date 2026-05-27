#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const explorerPath = path.join(__dirname, '..', 'explorer.js');
const source = fs.readFileSync(explorerPath, 'utf8').split('// Application State')[0];
const context = { console, Math, Number };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'explorer-prefix.js' });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
