import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyParameterView, classifyParameterDigit
} from '../src/compute/parameter_views.mjs';
import {
  createAttractorMembershipContext, classifyAttractorPoint, classifyAttractorParameterCell
} from '../src/compute/attractor_membership.mjs';

const options = Object.freeze({ escapeDepth: 32, boundaryWork: 20000 });
const digit = (x, y, n, t, extra = {}) => classifyParameterDigit(x, y, n, t, 1e-8,
  { ...options, ...extra });
const view = (x, y, n, mode, extra = {}) => classifyParameterView(x, y, n, 37, 1000, 1e-8,
  mode, { ...options, ...extra });

test('parameter cells recover an explicit address missed between pixel centers', () => {
  // First digit 3 followed by -3 forever gives c=3-3/(c-1), so
  // (c-3)(c-1)=-3 and c*=2+i*sqrt(2). This is an infinite address,
  // independent of the search implementation or a sampled image fixture.
  const root = { x: 2, y: Math.SQRT2 };
  assert.ok(Math.abs((root.x - 3) * (root.x - 1) - root.y ** 2 + 3) < 1e-14);
  assert.equal((root.x - 3) * root.y + root.y * (root.x - 1), 0);
  const point = digit(root.x + .002, root.y, 4, 3);
  const cell = digit(root.x + .002, root.y, 4, 3, { parameterRadius: .003 });
  assert.equal(point.verdict, 'Exterior');
  assert.equal(point.sampleType, 'point');
  assert.equal(cell.status, 'finite-survivor');
  assert.equal(cell.sampleType, 'parameter-cell');
  assert.equal(cell.coverage, 'parameter-taylor-disk');
  assert.equal(cell.verdict, 'Undetermined', 'pixel coverage is not a point membership claim');
  assert.equal(cell.firstDigit, 3);
  assert.equal(cell.digitIndex, 6);
  assert.equal(cell.usesTrap, false);
  const outside = digit(root.x + .02, root.y, 4, 3, { parameterRadius: .003 });
  assert.equal(outside.verdict, 'Exterior', 'nearby open exterior remains clear');
});

test('varying the parameter is necessary, beyond a fixed-c marked-point footprint', () => {
  const x = 2 - .0024, y = Math.SQRT2, radius = .003;
  const context = createAttractorMembershipContext(x, y, 4);
  // The known parameter in the cell changes all inverse maps, not merely z0.
  const fixedParameter = classifyAttractorPoint(context, x, y, 32,
    { pixelRadius: radius, firstDigit: 3 });
  assert.equal(fixedParameter.verdict, 'Exterior');
  const actual = classifyAttractorParameterCell(context, 32,
    { parameterRadius: radius, firstDigit: 3, maxWork: 20000 });
  assert.equal(actual.status, 'finite-survivor');
  // Shrinking this same parameter cell past the known feature resolves it.
  assert.equal(classifyAttractorParameterCell(context, 32,
    { parameterRadius: radius / 100, firstDigit: 3 }).verdict, 'Exterior');
});

test('parameter footprints shrink with zoom and do not become a persistent band', () => {
  for (const radius of [.03, .003, .0003, .00003]) {
    const covered = digit(2 + .6 * radius, Math.SQRT2, 4, 3,
      { parameterRadius: radius, escapeDepth: 48 });
    const outside = digit(2 + 10 * radius, Math.SQRT2, 4, 3,
      { parameterRadius: radius, escapeDepth: 48 });
    assert.equal(covered.status, 'finite-survivor', `cover radius=${radius}`);
    assert.equal(outside.verdict, 'Exterior', `clear radius=${radius}`);
  }
});

test('all-cell trap capture uses the entire lens and canonical rectangle', () => {
  const center = { x: .1, y: 1.2 };
  const small = view(center.x, center.y, 2, 'mn0', { parameterRadius: .001 });
  assert.equal(small.status, 'captured');
  assert.equal(small.usesTrap, true);
  const crossesLens = view(center.x, center.y, 2, 'mn0', { parameterRadius: .1 });
  assert.equal(crossesLens.verdict, 'Undetermined');
  assert.equal(crossesLens.usesTrap, false);
  for (const n of [2, 3, 4, 5]) {
    for (const mode of ['mn0', 'mn1']) {
      const cell = view(center.x, center.y, n, mode, { parameterRadius: .001 });
      if (cell.status !== 'captured') continue;
      for (let k = 0; k < 12; k++) {
        const angle = k * Math.PI / 6;
        const sample = view(center.x + .001 * Math.cos(angle), center.y + .001 * Math.sin(angle), n, mode);
        assert.notEqual(sample.verdict, 'Exterior', `${n}/${mode} captured disk sample${k}`);
      }
    }
  }
});

test('individual D_n first digits reconstruct both aggregates with A_n tails', () => {
  let seed = 9701;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 48; i++) {
    const n = 2 + i % 4, x = -3 + 6 * random(), y = .1 + 2.5 * random();
    const digits = Array.from({ length: 2 * n - 1 }, (_, k) => k - n + 1);
    const result = view(x, y, n, 'compare', {
      escapeDepth: 8, parameterRadius: i % 2 ? .001 : 0,
      parameterLayers: ['mn0', 'mn1'], parameterDigits: digits
    });
    for (const [set, parity] of [['mn0', 0], ['mn1', 1]]) {
      const selected = digits.filter(t => (t + n - 1) % 2 === parity).map(t => result.digits[t]);
      assert.equal(result.layers[set].verdict === 'Exterior',
        selected.every(v => v.verdict === 'Exterior'), `${set} c=${x}+${y}i n=${n}`);
      for (const value of selected) {
        assert.equal(value.alphabetSize, n);
        assert.equal(value.digitIndex, value.digit + n - 1);
        if (value.firstDigit !== null) assert.equal(value.firstDigit, value.digit);
      }
    }
  }
  // The binary complement is first digit0, then the full {-1,+1} tail.
  assert.equal(digit(0, 1.2, 2, 0).status, 'captured');
  assert.equal(digit(1, 1, 2, 0).verdict, 'Exterior');
  assert.equal(digit(1, 1, 2, 1).status, 'finite-survivor');
});

test('selected aggregates and digits remain independent, including explicit empty layers', () => {
  const selected = view(0, 1.2, 4, 'compare', {
    parameterLayers: ['mn1', 'mn', 'mn0', 'mn1'], parameterDigits: [3, 0, -3, 0], parameterRadius: .001
  });
  assert.deepEqual(selected.parameterLayers, ['mn', 'mn0', 'mn1']);
  assert.deepEqual(selected.parameterDigits, [-3, 0, 3]);
  assert.deepEqual(Object.keys(selected.layers), ['mn', 'mn0', 'mn1']);
  assert.deepEqual(Object.keys(selected.digits).sort(), ['-3', '0', '3']);
  for (const set of ['mn', 'mn0', 'mn1']) {
    assert.equal(selected.layers[set].sampleType, 'parameter-cell');
    assert.equal(selected.layers[set].verdict, view(0, 1.2, 4, set,
      { parameterRadius: .001 }).verdict);
  }
  const onlyDigits = view(2, Math.SQRT2, 4, 'compare', { parameterLayers: [], parameterDigits: [3] });
  assert.equal(onlyDigits.mn, null);
  assert.equal(onlyDigits.mn0, null);
  assert.equal(onlyDigits.mn1, null);
  assert.equal(onlyDigits.set, 'digit:3');
  const empty = view(0, 1.2, 4, 'mn', { parameterLayers: [], parameterDigits: [] });
  assert.deepEqual(empty.layers, {});
  assert.deepEqual(empty.digits, {});
  assert.equal(empty.verdict, 'Exterior');
});

test('reciprocal input disks cover the inverse chart without mixing domain boundaries', () => {
  const rootX = 2, rootY = Math.SQRT2;
  const inverse = { x: rootX / 6, y: -rootY / 6 };
  const cell = digit(inverse.x + .0002, inverse.y, 4, 3, { parameterRadius: .0003 });
  assert.equal(cell.status, 'finite-survivor');
  const inputRho = Math.hypot(inverse.x + .0002, inverse.y);
  assert.ok(cell.parameterRadius >= .0003 / inputRho / (inputRho - .0003));
  for (const [x, y, radius] of [[0, 1.01, .02], [0, .99, .02], [.001, .001, .01]]) {
    const boundary = view(x, y, 3, 'mn0', { parameterRadius: radius });
    assert.equal(boundary.verdict, 'Undetermined');
    assert.equal(boundary.stopReason, 'outside-domain');
  }
});

test('fixed first-digit piece tests force that map before trap entry', () => {
  const context = createAttractorMembershipContext(3, 3, 3);
  const x = 30 / 13, y = -6 / 13; // The fixed point of piece t=2.
  assert.equal(classifyAttractorPoint(context, x, y, 16, { firstDigit: 2 }).status, 'finite-survivor');
  assert.equal(classifyAttractorPoint(context, x, y, 16, { firstDigit: -2 }).verdict, 'Exterior');
  assert.equal(classifyAttractorPoint(context, x, y, 16, { firstDigit: 0 }).verdict, 'Exterior');
  const binary = createAttractorMembershipContext(0, 1.2, 2);
  const complement = classifyAttractorPoint(binary, 0, 1.2, 16, { firstDigit: 0 });
  assert.equal(complement.firstDigit, 0);
  assert.equal(complement.firstLevelIndex, 0, 'fixed complement indices remain integer');
  assert.ok(complement.depth >= 1);
});

test('budget exhaustion stays distinct from boundary survival and invalid selections fail', () => {
  const capped = digit(2.002, Math.SQRT2, 4, 3, { parameterRadius: .003, boundaryWork: 1 });
  assert.equal(capped.stopReason, 'work-cap');
  assert.equal(capped.verdict, 'Undetermined');
  assert.equal(capped.displayReason, 'work-cap');
  for (const extra of [{ parameterRadius: -1 }, { parameterRadius: Infinity },
    { parameterLayers: ['unknown'] }, { parameterDigits: [4] }, { parameterDigits: [1.5] },
    { parameterLayers: 'mn' }, { parameterDigits: '0' }]) {
    assert.throws(() => view(2, Math.SQRT2, 4, 'mn0', extra));
  }
  assert.throws(() => digit(2, Math.SQRT2, 4, -4));
});
