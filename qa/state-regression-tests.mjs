#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_EXPLORER_STATE,
  decodeExplorerState,
  encodeExplorerState,
  normalizeExplorerState,
  normalizeParameterDigits,
  normalizeParameterLayers,
  parameterLayersForMode,
  parameterModeForSelection
} from '../src/state/explorer_state.mjs';

const defaults = {
  ...DEFAULT_EXPLORER_STATE,
  n: 13,
  cx: 2.0719,
  cy: 3.0537,
  paramCenter: { x: 2.05, y: 3.1 },
  paramZoom: 0.02,
  dynCenter: { x: -0.5, y: 0.4 },
  dynZoom: 6,
  customPalette: { ...DEFAULT_EXPLORER_STATE.customPalette }
};

test('partial and empty links retain omitted settings and nested coordinates', () => {
  for (const empty of ['', '#', undefined, null, {}, '#unrelated=value']) {
    assert.deepEqual(decodeExplorerState(empty, defaults), defaults);
  }
  assert.deepEqual(decodeExplorerState('#n=21', defaults), { ...defaults, n: 21 });
  assert.deepEqual(decodeExplorerState('#pcx=1.5&dcy=-2', defaults), {
    ...defaults,
    paramCenter: { x: 1.5, y: defaults.paramCenter.y },
    dynCenter: { x: defaults.dynCenter.x, y: -2 }
  });
});

test('blank, nonfinite and nondecimal numbers never overwrite valid defaults', () => {
  for (const invalid of ['', ' ', '\t\n', 'NaN', 'Infinity', '-Infinity', '1e999', '0x10', '0b10', '3oops']) {
    const params = new URLSearchParams({ n: invalid, cx: invalid, cy: invalid, pcx: invalid, pz: invalid, tol: invalid });
    assert.deepEqual(decodeExplorerState(params, defaults), defaults, `Invalid input: ${JSON.stringify(invalid)}`);
  }
  for (const invalid of [null, undefined, true, false, [], {}, NaN, Infinity]) {
    const normalized = normalizeExplorerState({ n: invalid, cx: invalid }, defaults);
    assert.equal(normalized.n, defaults.n);
    assert.equal(normalized.cx, defaults.cx);
  }
  const valid = decodeExplorerState('#cx=-.25&cy=1.25e-7&n=4.6', defaults);
  assert.equal(valid.cx, -0.25);
  assert.equal(valid.cy, 1.25e-7);
  assert.equal(valid.n, 5);
});

test('browser numeric limits clamp malicious or accidental oversized workloads', () => {
  const high = decodeExplorerState('#n=999&k=999&l=999999999&q=999&adepth=999&hsamples=999999999&hseed=1e20&cx=1e30&cy=-1e30&pcx=1e30&dcy=-1e30&pz=1e30&dz=1e30&aop=4&sop=4&tol=4');
  assert.equal(high.n, 100);
  assert.equal(high.kMax, 100);
  assert.equal(high.LMax, 10000);
  assert.equal(high.modulo, 12);
  assert.equal(high.attractorDepth, 12);
  assert.equal(high.histogramSamples, 1000000);
  assert.equal(high.histogramSeed, 4294967295);
  assert.equal(high.cx, 1e6);
  assert.equal(high.cy, -1e6);
  assert.equal(high.paramCenter.x, 1e6);
  assert.equal(high.dynCenter.y, -1e6);
  assert.equal(high.paramZoom, 1e6);
  assert.equal(high.dynZoom, 1e6);
  assert.equal(high.originalAttractorOpacity, 1);
  assert.equal(high.survivalOverlayOpacity, 1);
  assert.equal(high.tol, 1e-2);

  const low = decodeExplorerState('#n=-999&k=-999&l=0&q=0&adepth=0&hsamples=0&hseed=0&pz=0&dz=-1&aop=-1&sop=-1&tol=0');
  assert.equal(low.n, 2);
  assert.equal(low.kMax, 0);
  assert.equal(low.LMax, 1);
  assert.equal(low.modulo, 1);
  assert.equal(low.attractorDepth, 1);
  assert.equal(low.histogramSamples, 1000);
  assert.equal(low.histogramSeed, 1);
  assert.equal(low.paramZoom, 1e-10);
  assert.equal(low.dynZoom, 1e-10);
  assert.equal(low.originalAttractorOpacity, 0);
  assert.equal(low.survivalOverlayOpacity, 0);
  assert.equal(low.tol, 1e-15);
});

test('deep zooms, scientific notation and all view settings roundtrip losslessly', () => {
  const state = {
    ...defaults,
    n: 100,
    kMax: 0,
    LMax: 1,
    modulo: 12,
    cx: 1.0000000000000002,
    cy: 1e-10,
    paramCenter: { x: -0, y: -1.2345678901234567 },
    paramZoom: 1e-10,
    dynCenter: { x: 1e-100, y: -1e-200 },
    dynZoom: 1.0000000000000003e-9,
    tol: 1e-15,
    rendererMode: 'histogram',
    backend: 'gpu',
    parameterMode: 'compare',
    parameterLayers: ['mn', 'mn0'],
    comparisonMode: 'collinear',
    boundaryDepth: 73,
    adaptiveBoundary: false,
    firstLevelPieces: false,
    attractorDepth: 12,
    histogramSeed: 4294967295,
    histogramSamples: 12345,
    originalAttractorOpacity: 0.12345678901234568,
    survivalOverlayOpacity: 0.9876543210987654,
    focusedPanel: 'dynamical',
    showDifference: false,
    showCollinear: true,
    showTrap: false,
    showEnclosure: true,
    showTree: false,
    showPath: true,
    showEscapeStrata: true,
    palette: 'custom',
    customPalette: { interior: '#123abc', offLens: '#ff0099', undetermined: '#fafafa', exterior: '#000001' }
  };
  const params = encodeExplorerState(state);
  assert.ok(params instanceof URLSearchParams);
  assert.equal(params.get('cy'), '1e-10');
  assert.equal(params.get('pcx'), '-0');
  assert.equal(params.get('bdepth'), '73');
  assert.equal(params.get('badapt'), '0');
  assert.equal(params.get('layers'), '0101011');
  for (const form of [params, params.toString(), `#${params}`, `?${params}`]) {
    assert.deepEqual(decodeExplorerState(form, DEFAULT_EXPLORER_STATE), state);
  }
});

test('ordinary historical links still decode with their original field names', () => {
  const linked = decodeExplorerState('#n=4&cx=1.5&cy=1.658312395&k=37&l=1000&q=3&pcx=0&pcy=0&pz=8&dcx=0&dcy=0&dz=8&mode=overlay&renderer=prefix&adepth=7&hseed=20260227&hsamples=50000&pieces=1&aop=0.72&palette=research&layers=1111110');
  assert.equal(linked.n, 4);
  assert.equal(linked.cy, 1.658312395);
  assert.equal(linked.showCollinear, true);
  assert.equal(linked.showEscapeStrata, false);
  assert.deepEqual(linked.paramCenter, { x: 0, y: 0 });
  assert.equal(linked.tol, 1e-8);
  assert.equal(linked.survivalOverlayOpacity, 0.45);
  assert.equal(linked.focusedPanel, 'both');
  assert.equal(linked.rendererMode, 'prefix');
  assert.equal(linked.boundaryDepth, 0);
  assert.equal(linked.adaptiveBoundary, true);
});

test('enum, layer, boolean and color validation rejects unsupported values', () => {
  const invalidModes = decodeExplorerState('#mode=constructor&pm=constructor&renderer=webgl&palette=__proto__&focus=all&pieces=false', defaults);
  assert.deepEqual(invalidModes, defaults);
  for (const layers of ['', '111111', '11111111', '1x11111', 'abcdefg', '1111111\n']) {
    assert.deepEqual(decodeExplorerState(new URLSearchParams({ layers }), defaults), defaults);
  }
  const noLayers = decodeExplorerState('#mode=collinear', defaults);
  assert.equal(noLayers.comparisonMode, 'collinear');
  assert.equal(noLayers.showDifference, defaults.showDifference);
  assert.equal(noLayers.showCollinear, defaults.showCollinear);

  const colors = decodeExplorerState(new URLSearchParams({
    palette: 'custom', ci: '#AABBCC', co: 'red', cu: '#123', ce: 'url(javascript:alert(1))'
  }), defaults);
  assert.equal(colors.palette, 'custom');
  assert.deepEqual(colors.customPalette, { ...defaults.customPalette, interior: '#aabbcc' });
  assert.deepEqual(decodeExplorerState(new URLSearchParams({ ci: '#abcdef\n' }), defaults), defaults);
  assert.deepEqual(decodeExplorerState('#pieces=0', defaults), { ...defaults, firstLevelPieces: false });
});

test('parameter-mode links default to Mn and preserve each canonical mode', () => {
  assert.equal(decodeExplorerState('#n=4&cx=1.5&cy=1.658312395').parameterMode, 'mn');
  for (const parameterMode of ['mn', 'mn0', 'mn1', 'compare']) {
    const state = { ...defaults, parameterMode, parameterLayers: parameterLayersForMode(parameterMode) };
    const params = encodeExplorerState(state);
    assert.equal(params.get('pm'), parameterMode);
    assert.deepEqual(decodeExplorerState(params), state);
  }
  assert.equal(decodeExplorerState('#pm=Rn').parameterMode, 'mn');
  assert.equal(decodeExplorerState('#n=5', { ...defaults, parameterMode: 'mn1', parameterLayers: ['mn1'] }).parameterMode, 'mn1');
});

test('historical Rn URLs and JSON import as Mn0 and only emit the canonical name', () => {
  const oldState = JSON.parse(JSON.stringify({ ...defaults, parameterMode: 'rn' }));
  // Archived JSON has the historical mode and no independent selection arrays.
  delete oldState.parameterLayers;
  delete oldState.parameterDigits;
  const canonical = { ...defaults, parameterMode: 'mn0', parameterLayers: ['mn0'] };
  assert.deepEqual(decodeExplorerState('#pm=rn', defaults), canonical);
  assert.deepEqual(normalizeExplorerState(oldState), canonical);
  assert.equal(oldState.parameterMode, 'rn');
  assert.equal(encodeExplorerState(oldState).get('pm'), 'mn0');
  assert.deepEqual(decodeExplorerState(encodeExplorerState(oldState)), canonical);
  // Old imported state can also supply defaults for a later partial link.
  assert.deepEqual(decodeExplorerState('#n=5', oldState), { ...canonical, n: 5 });
  assert.equal(decodeExplorerState('#pm=unsupported', oldState).parameterMode, 'mn0');
});

test('parameter overlays retain independent aggregates and arbitrary first-digit selections', () => {
  const state = normalizeExplorerState({
    n: 5, parameterMode: 'mn', parameterLayers: ['mn1', 'mn', 'mn0', 'mn0'],
    parameterDigits: [4, -4, 0, 1, 0, -1]
  });
  assert.deepEqual(state.parameterLayers, ['mn', 'mn0', 'mn1']);
  assert.deepEqual(state.parameterDigits, [-4, -1, 0, 1, 4]);
  assert.equal(state.parameterMode, 'compare');
  const params = encodeExplorerState(state);
  assert.equal(params.get('pl'), 'mn,mn0,mn1');
  assert.equal(params.get('pd'), '-4,-1,0,1,4');
  assert.deepEqual(decodeExplorerState(params), state);
  assert.deepEqual(decodeExplorerState('#pm=compare').parameterLayers, ['mn', 'mn0']);
  assert.deepEqual(decodeExplorerState('#pm=mn1&pl=mn,mn0&pd=-1,1').parameterLayers, ['mn', 'mn0']);
  assert.deepEqual(decodeExplorerState('#pm=mn1&pd=0').parameterLayers, ['mn1']);
  assert.deepEqual(decodeExplorerState('#pm=mn1&pd=0').parameterDigits, [0]);
  assert.equal(parameterModeForSelection(['mn0'], []), 'mn0');
  assert.equal(parameterModeForSelection(['mn0'], [0]), 'compare');
});

test('an explicit empty parameter selection survives links and partial updates', () => {
  const hidden = decodeExplorerState('#pl=&pd=');
  assert.deepEqual(hidden.parameterLayers, []);
  assert.deepEqual(hidden.parameterDigits, []);
  assert.equal(hidden.parameterMode, 'compare');
  assert.deepEqual(decodeExplorerState(encodeExplorerState(hidden)), hidden);
  assert.deepEqual(decodeExplorerState('#n=4', hidden).parameterLayers, []);
  const digitsOnly = decodeExplorerState('#n=4&pl=&pd=-3,0,3');
  assert.deepEqual(digitsOnly.parameterLayers, []);
  assert.deepEqual(digitsOnly.parameterDigits, [-3, 0, 3]);
  const legacyModeOverride = decodeExplorerState('#pm=mn1', digitsOnly);
  assert.deepEqual(legacyModeOverride.parameterLayers, ['mn1']);
  assert.deepEqual(legacyModeOverride.parameterDigits, []);
});

test('digit choices use the full supported alphabet and shrink safely with arity', () => {
  const all = Array.from({ length: 199 }, (_, index) => index - 99);
  const state = normalizeExplorerState({ n: 100, parameterLayers: [], parameterDigits: all });
  assert.deepEqual(decodeExplorerState(encodeExplorerState(state)).parameterDigits, all);
  const smaller = decodeExplorerState('#n=2', state);
  assert.deepEqual(smaller.parameterDigits, [-1, 0, 1]);
  assert.deepEqual(state.parameterDigits, all);
  assert.deepEqual(normalizeParameterDigits([-9, -2, -1, 0, 0, 1, 2, 9, 0.5, '1', NaN], 2), [-1, 0, 1]);
  assert.deepEqual(normalizeParameterLayers(['__proto__', 'constructor', 'mn1', 'mn']), ['mn', 'mn1']);
});

test('malformed digit input and accessor arrays cannot inject selections', () => {
  const selected = normalizeExplorerState({ n: 4, parameterLayers: ['mn0'], parameterDigits: [-3, 3] });
  for (const pd of ['NaN', 'Infinity', '0x1', '1.5', '1e0', '1,,2']) {
    assert.deepEqual(decodeExplorerState(new URLSearchParams({ pd }), selected).parameterDigits, [-3, 3], pd);
  }
  const digits = [-1, 0, 1];
  Object.defineProperty(digits, '1', { get() { throw new Error('must not invoke array accessor'); } });
  assert.deepEqual(normalizeParameterDigits(digits, 2), [-1, 1]);
  const layers = ['mn0'];
  Object.defineProperty(layers, '0', { get() { throw new Error('must not invoke array accessor'); } });
  assert.deepEqual(normalizeParameterLayers(layers), []);
  const copied = normalizeExplorerState(selected);
  copied.parameterLayers.push('mn');
  copied.parameterDigits.push(0);
  assert.deepEqual(selected.parameterLayers, ['mn0']);
  assert.deepEqual(selected.parameterDigits, [-3, 3]);
});

test('new and partial links use boundary rendering while explicit historical renderers survive', () => {
  for (const hash of ['', '#n=2', '#pm=mn1', '#renderer=unsupported']) {
    const state = decodeExplorerState(hash);
    assert.equal(state.rendererMode, 'boundary', hash);
    assert.equal(state.boundaryDepth, 0, hash);
    assert.equal(state.adaptiveBoundary, true, hash);
    assert.equal(state.firstLevelPieces, true, hash);
  }
  for (const rendererMode of ['boundary', 'prefix', 'histogram', 'survival']) {
    const state = decodeExplorerState(`#renderer=${rendererMode}`, defaults);
    assert.equal(state.rendererMode, rendererMode);
    assert.deepEqual(decodeExplorerState(encodeExplorerState(state)), state);
    assert.equal(decodeExplorerState('#n=5', state).rendererMode, rendererMode);
  }
});

test('fresh attractors use opaque piece colors while old explicit opacity remains portable', () => {
  assert.equal(decodeExplorerState('').originalAttractorOpacity, 1);
  assert.equal(decodeExplorerState('#n=4').originalAttractorOpacity, 1);
  const transparent = decodeExplorerState('#aop=0.72');
  assert.equal(transparent.originalAttractorOpacity, 0.72);
  assert.equal(decodeExplorerState(encodeExplorerState(transparent)).originalAttractorOpacity, 0.72);
});

test('automatic boundary depth stays zero across zooms while explicit depths are bounded integers', () => {
  for (const hash of ['#n=2&dz=1e-10', '#n=5&dz=1e6', '#n=100&bdepth=0']) {
    const state = decodeExplorerState(hash);
    assert.equal(state.boundaryDepth, 0, hash);
    assert.equal(encodeExplorerState(state).get('bdepth'), '0', hash);
  }
  for (const [input, expected] of [['-1e99', 0], ['0', 0], ['2.49', 2], ['2.5', 3], ['1e2', 100], ['1e99', 100]]) {
    const state = decodeExplorerState(new URLSearchParams({ bdepth: input }));
    assert.equal(state.boundaryDepth, expected, input);
    assert.equal(decodeExplorerState(encodeExplorerState(state)).boundaryDepth, expected, input);
  }
  const custom = { ...defaults, boundaryDepth: 21 };
  for (const invalid of ['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999', '0x10', '7oops']) {
    assert.equal(decodeExplorerState(new URLSearchParams({ bdepth: invalid }), custom).boundaryDepth, 21, invalid);
  }
  for (const invalid of [null, undefined, true, false, NaN, Infinity, [], {}]) {
    assert.equal(normalizeExplorerState({ boundaryDepth: invalid }, custom).boundaryDepth, 21);
  }
});

test('adaptive boundary state is independent of first-level pieces and seven layer bits', () => {
  for (const adaptiveBoundary of [true, false]) {
    for (const firstLevelPieces of [true, false]) {
      const state = { ...defaults, adaptiveBoundary, firstLevelPieces };
      const params = encodeExplorerState(state);
      assert.equal(params.get('badapt'), adaptiveBoundary ? '1' : '0');
      assert.equal(params.get('pieces'), firstLevelPieces ? '1' : '0');
      assert.equal(params.get('layers').length, 7);
      assert.deepEqual(decodeExplorerState(params), state);
      assert.deepEqual(decodeExplorerState('#n=13', state), state);
      for (const invalid of ['', 'true', 'false', '2', '-1', ' 0 ', 'constructor']) {
        assert.deepEqual(decodeExplorerState(new URLSearchParams({ badapt: invalid }), state), state, invalid);
      }
    }
  }
  const state = decodeExplorerState('#badapt=0&pieces=1&layers=0000000');
  assert.equal(state.adaptiveBoundary, false);
  assert.equal(state.firstLevelPieces, true);
  for (const key of ['showDifference', 'showCollinear', 'showTrap', 'showEnclosure', 'showTree', 'showPath', 'showEscapeStrata']) {
    assert.equal(state[key], false, key);
  }
  assert.equal(normalizeExplorerState({ adaptiveBoundary: false }).adaptiveBoundary, false);
  assert.equal(normalizeExplorerState({ adaptiveBoundary: null }).adaptiveBoundary, true);
});

test('backend preferences roundtrip independently of local rendering capabilities', () => {
  for (const backend of ['auto', 'gpu', 'cpu']) {
    const state = { ...defaults, backend };
    const params = encodeExplorerState(state);
    assert.equal(params.get('backend'), backend);
    assert.deepEqual(decodeExplorerState(`#${params}`), state);
    // Unknown runtime capability metadata is not part of the portable state.
    const noGpu = normalizeExplorerState({ ...state, gpuAvailable: false, activeBackend: 'cpu' });
    assert.equal(noGpu.backend, backend);
    assert.equal(Object.hasOwn(noGpu, 'gpuAvailable'), false);
    assert.equal(Object.hasOwn(noGpu, 'activeBackend'), false);
  }
});

test('old links default to automatic backend and invalid preferences retain valid defaults', () => {
  assert.equal(decodeExplorerState('#n=4&cx=1.5&cy=1.658312395').backend, 'auto');
  for (const invalid of ['', 'GPU', 'webgpu', 'constructor', ' cpu ', 'null']) {
    assert.equal(decodeExplorerState(new URLSearchParams({ backend: invalid })).backend, 'auto');
    assert.equal(decodeExplorerState(new URLSearchParams({ backend: invalid }), { ...defaults, backend: 'cpu' }).backend, 'cpu');
  }
  assert.equal(decodeExplorerState('#n=5', { ...defaults, backend: 'gpu' }).backend, 'gpu');
  assert.equal(normalizeExplorerState({ backend: null }).backend, 'auto');
});

test('normalization is nonmutating, copies nested data and validates defaults', () => {
  const frozen = Object.freeze({
    ...defaults,
    paramCenter: Object.freeze({ ...defaults.paramCenter }),
    dynCenter: Object.freeze({ ...defaults.dynCenter }),
    customPalette: Object.freeze({ ...defaults.customPalette })
  });
  const normalized = normalizeExplorerState({ paramCenter: { x: 4 }, customPalette: { interior: '#112233' } }, frozen);
  assert.deepEqual(frozen, defaults);
  assert.deepEqual(normalized.paramCenter, { x: 4, y: defaults.paramCenter.y });
  normalized.dynCenter.x = 999;
  normalized.customPalette.offLens = '#000000';
  assert.equal(frozen.dynCenter.x, -0.5);
  assert.equal(frozen.customPalette.offLens, '#2563eb');
  const safe = normalizeExplorerState(null, { n: NaN, cx: Infinity, paramCenter: null, palette: '__proto__' });
  assert.deepEqual(safe, DEFAULT_EXPLORER_STATE);
});

test('unknown, inherited and accessor properties cannot inject state or prototypes', () => {
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"n":4,"customPalette":{"__proto__":{"polluted":true},"interior":"#123456"}}');
  const normalized = normalizeExplorerState(malicious, defaults);
  assert.equal(normalized.n, 4);
  assert.equal(normalized.customPalette.interior, '#123456');
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(Object.getPrototypeOf(normalized.customPalette), Object.prototype);
  assert.equal(Object.hasOwn(normalized, '__proto__'), false);
  assert.equal(Object.hasOwn(normalized, 'constructor'), false);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(decodeExplorerState('#__proto__[polluted]=true&constructor=evil&unknown=42', defaults), defaults);
  const inherited = Object.create({ n: 99, cx: 99, parameterMode: 'rn', boundaryDepth: 100, adaptiveBoundary: false, customPalette: { interior: '#000000' } });
  Object.defineProperty(inherited, 'cy', { get() { throw new Error('must not invoke accessors'); } });
  Object.defineProperty(inherited, 'adaptiveBoundary', { get() { throw new Error('must not invoke accessors'); } });
  assert.deepEqual(normalizeExplorerState(inherited, defaults), defaults);
});

test('finite IEEE-754 coordinates survive URL serialization across magnitudes', () => {
  const samples = [Number.MIN_VALUE, -Number.MIN_VALUE, -0, 0, 0.1, Math.PI, -Math.E, 999999.9999999999];
  for (let exponent = -300; exponent <= 0; exponent += 10) {
    samples.push(1.2345678901234567 * 10 ** exponent, -9.876543210987654 * 10 ** exponent);
  }
  for (const coordinate of samples) {
    const encoded = encodeExplorerState({ ...defaults, cx: coordinate, cy: -coordinate });
    const decoded = decodeExplorerState(encoded);
    assert.ok(Object.is(decoded.cx, coordinate), `Lost coordinate ${coordinate}`);
    assert.ok(Object.is(decoded.cy, -coordinate), `Lost opposite coordinate ${coordinate}`);
  }
});
