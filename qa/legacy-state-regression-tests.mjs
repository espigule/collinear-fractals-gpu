#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EXPLORER_STATE, encodeExplorerState } from '../src/state/explorer_state.mjs';
import { decodeExplorerLocation, importLegacyExplorerState } from '../src/state/legacy_state.mjs';

const aspects = { parameterAspect: 1.5, dynamicalAspect: 2 };
const decode = (search, hash = '') => decodeExplorerLocation({ search, hash }, DEFAULT_EXPLORER_STATE, aspects);

test('legacy links restore omitted archived core defaults without changing current search controls', () => {
  const imported = decode('?panels=0010');
  assert.equal(imported.importedLegacy, true);
  assert.equal(imported.source, 'query');
  assert.equal(imported.state.n, 4);
  assert.equal(imported.state.cx, 1.5);
  assert.equal(imported.state.cy, Math.sqrt(11) / 2);
  assert.equal(imported.state.kMax, 37);
  assert.equal(imported.state.LMax, 1000);
  assert.equal(imported.state.tol, 1e-8);
  assert.equal(imported.state.focusedPanel, 'parameter');
  assert.deepEqual(imported.state.paramCenter, { x: 1.5, y: Math.sqrt(11) / 2 });
  assert.equal(imported.state.paramZoom, 1.5);
  assert.equal(imported.state.dynZoom, 2);
  assert.equal(imported.legacyVerticalSpan, 1);
  assert.deepEqual(imported.warnings, []);
});

test('verified legacy panel bits map to the right parameter and dynamical sets', () => {
  const cases = [
    ['0010', 'parameter', 'mn', 'overlay', false, false],
    ['1000', 'parameter', 'rn', 'overlay', false, false],
    ['1010', 'parameter', 'compare', 'overlay', false, false],
    ['0100', 'dynamical', 'mn', 'collinear', true, false],
    ['0001', 'dynamical', 'mn', 'difference', false, true],
    ['0101', 'dynamical', 'mn', 'overlay', true, true],
    ['1100', 'both', 'rn', 'collinear', true, false],
    ['0011', 'both', 'mn', 'difference', false, true],
    ['0110', 'both', 'mn', 'collinear', true, false],
    ['1001', 'both', 'rn', 'difference', false, true],
    ['1111', 'both', 'compare', 'overlay', true, true]
  ];
  for (const [panels, focus, pm, mode, collinear, difference] of cases) {
    const { state, warnings } = decode(`?panels=${panels}`);
    assert.equal(state.focusedPanel, focus, panels);
    assert.equal(state.parameterMode, pm, panels);
    assert.equal(state.comparisonMode, mode, panels);
    assert.equal(state.showCollinear, collinear, panels);
    assert.equal(state.showDifference, difference, panels);
    assert.equal(state.showEscapeStrata, false, panels);
    assert.deepEqual(warnings, []);
  }
  const empty = decode('?panels=0000');
  assert.equal(empty.state.focusedPanel, 'parameter');
  assert.equal(empty.state.parameterMode, 'mn');
  assert.match(empty.warnings.join(' '), /hid every set/);
});

test('camera conversion preserves vertical world span and centers in both target aspects', () => {
  const { state, legacyVerticalSpan } = decode('?n=5&cx=1&cy=2&panels=1111&zoom=0.4&centerX=-2.25&centerY=3.125');
  assert.equal(legacyVerticalSpan, 5);
  assert.equal(state.paramZoom, 7.5);
  assert.equal(state.dynZoom, 10);
  assert.equal(state.paramZoom / aspects.parameterAspect, 5);
  assert.equal(state.dynZoom / aspects.dynamicalAspect, 5);
  assert.deepEqual(state.paramCenter, { x: -2.25, y: 3.125 });
  assert.deepEqual(state.dynCenter, state.paramCenter);
  assert.notEqual(state.paramCenter, state.dynCenter);
});

test('missing target aspect never guesses a zoom conversion', () => {
  const imported = importLegacyExplorerState('#panels=0010&centerX=4&zoom=10');
  assert.deepEqual(imported.state.paramCenter, { x: 4, y: Math.sqrt(11) / 2 });
  assert.equal(imported.state.paramZoom, DEFAULT_EXPLORER_STATE.paramZoom);
  assert.equal(imported.state.dynZoom, DEFAULT_EXPLORER_STATE.dynZoom);
  assert.equal(imported.legacyVerticalSpan, 0.2);
  assert.match(imported.warnings.join(' '), /aspect ratio/);
});

test('shader depth, beam queue and thickness never become current search bounds', () => {
  const imported = decode('?n=7&panels=0011&mmax1=30&mmax2=1&queue=8&thicknessRE=25&depth=99&skipRE=3&useRectTrap=1&pShift=0.2&color1=ff0000');
  assert.equal(imported.state.kMax, 37);
  assert.equal(imported.state.LMax, 1000);
  assert.equal(imported.state.modulo, 3);
  assert.equal(imported.state.originalAttractorOpacity, 0.72);
  assert.equal(imported.state.palette, 'research');
  const warning = imported.warnings.join(' ');
  for (const key of ['mmax1', 'mmax2', 'queue', 'thicknessRE', 'depth', 'skipRE', 'useRectTrap', 'pShift', 'color1']) {
    assert.ok(warning.includes(key), key);
  }
  assert.match(warning, /archived explorer/);
});

test('dangerous nonfinite, blank and malformed legacy numbers use valid archived defaults', () => {
  for (const invalid of ['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999', '0x20', '2oops']) {
    const params = new URLSearchParams({ n: invalid, cx: invalid, cy: invalid, zoom: invalid, centerX: invalid, centerY: invalid });
    const imported = importLegacyExplorerState(params, DEFAULT_EXPLORER_STATE, aspects);
    assert.equal(imported.state.n, 4);
    assert.equal(imported.state.cx, 1.5);
    assert.equal(imported.state.cy, Math.sqrt(11) / 2);
    assert.equal(imported.state.paramZoom, 1.5);
    assert.deepEqual(imported.state.paramCenter, { x: 1.5, y: Math.sqrt(11) / 2 });
    assert.match(imported.warnings.join(' '), /Invalid legacy values/);
  }
  for (const panels of ['111', '11111', '11x1', '1111\n']) {
    const imported = importLegacyExplorerState(new URLSearchParams({ panels }), DEFAULT_EXPLORER_STATE, aspects);
    assert.equal(imported.state.focusedPanel, 'parameter');
    assert.equal(imported.state.parameterMode, 'mn');
    assert.match(imported.warnings.join(' '), /panels/);
  }
  for (const zoom of ['0', '-2']) {
    assert.equal(decode(`?zoom=${zoom}`).state.paramZoom, 1.5);
  }
});

test('finite oversized values clamp safely, including reciprocal camera overflow and underflow', () => {
  const huge = decode('?n=1e99&cx=-1e100&cy=1e100&centerX=-1e100&centerY=1e100&zoom=5e-324');
  assert.equal(huge.state.n, 100);
  assert.equal(huge.state.cx, -1e6);
  assert.equal(huge.state.cy, 1e6);
  assert.deepEqual(huge.state.paramCenter, { x: -1e6, y: 1e6 });
  assert.equal(huge.state.paramZoom, 1e6);
  assert.equal(huge.state.dynZoom, 1e6);
  assert.equal(huge.legacyVerticalSpan, null);
  assert.match(huge.warnings.join(' '), /limited to supported ranges/);
  const tiny = decode('?n=-7&zoom=1e308&panels=0100');
  assert.equal(tiny.state.n, 2);
  assert.equal(tiny.state.paramZoom, 1e-10);
  assert.equal(tiny.state.dynZoom, 1e-10);
});

test('current hash state wins legacy query settings and force markers as a whole', () => {
  const query = '?legacy=1&n=99&cx=55&cy=44&panels=1111&zoom=0.4&queue=128';
  for (const hash of ['#n=5&pm=rn', '#n=5&k=0', '#n=5&pz=0.002', '#n=5&dz=3', '#n=5&layers=1111111']) {
    const imported = decode(query, hash);
    assert.equal(imported.importedLegacy, false, hash);
    assert.equal(imported.source, 'hash', hash);
    assert.equal(imported.state.n, 5, hash);
    assert.equal(imported.state.cx, DEFAULT_EXPLORER_STATE.cx, hash);
    assert.equal(imported.state.cy, DEFAULT_EXPLORER_STATE.cy, hash);
    assert.deepEqual(imported.warnings, [], hash);
  }
  const explicitBadModern = decode(query, '#pm=unsupported');
  assert.equal(explicitBadModern.importedLegacy, false);
  assert.equal(explicitBadModern.state.parameterMode, 'mn');
  assert.equal(explicitBadModern.state.n, 3);
});

test('legacy signature hashes override queries while force flags disambiguate core-only hashes', () => {
  const hashWins = decode('?n=99&cx=8&panels=1111', '#n=5&panels=0100');
  assert.equal(hashWins.importedLegacy, true);
  assert.equal(hashWins.source, 'hash');
  assert.equal(hashWins.state.n, 5);
  assert.equal(hashWins.state.cx, 1.5);
  assert.equal(hashWins.state.focusedPanel, 'dynamical');

  const current = decode('?n=99&panels=1111', '#n=5&cx=1');
  assert.equal(current.importedLegacy, false);
  assert.equal(current.state.cy, DEFAULT_EXPLORER_STATE.cy);
  assert.equal(current.state.focusedPanel, 'both');
  for (const marker of ['?legacy=1', '?from=legacy-collinear']) {
    const legacy = decode(marker, '#n=5&cx=1');
    assert.equal(legacy.importedLegacy, true);
    assert.equal(legacy.state.n, 5);
    assert.equal(legacy.state.cx, 1);
    assert.equal(legacy.state.cy, Math.sqrt(11) / 2);
    assert.equal(legacy.state.focusedPanel, 'parameter');
  }
});

test('unknown anchors and tracking parameters cannot masquerade as explorer state', () => {
  const unknown = decode('?utm_source=example&cRe=12&cIm=13&__proto__=polluted', '#introduction');
  assert.equal(unknown.importedLegacy, false);
  assert.equal(unknown.source, 'default');
  assert.deepEqual(unknown.state, DEFAULT_EXPLORER_STATE);
  const legacy = decode('?n=5&cx=1&cy=2', '#introduction');
  assert.equal(legacy.importedLegacy, true);
  assert.equal(legacy.source, 'query');
  assert.equal(legacy.state.cx, 1);
  assert.equal(legacy.state.cy, 2);
  assert.equal({}.polluted, undefined);
});

test('imported state becomes a self-contained current hash with exact core values', () => {
  const imported = decode('?legacy=1', '#n=13&cx=2.0719&cy=3.0537&panels=1111&centerX=2.05&centerY=3.1&zoom=100');
  const currentHash = `#${encodeExplorerState(imported.state)}`;
  const restored = decode('?legacy=1&n=2&cx=99&cy=99&panels=0001', currentHash);
  assert.equal(restored.importedLegacy, false);
  assert.deepEqual(restored.state, imported.state);
  assert.deepEqual(restored.warnings, []);
});
