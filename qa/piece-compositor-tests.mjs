import test from 'node:test';
import assert from 'node:assert/strict';
import { colorizeRasterTile } from '../src/renderers/hybrid_renderer.mjs';
import {
  PIECE_COLORS, PIECE_OUTLINE_COLOR, colorForPiece, hexToRgb,
  parameterDigitColor, parameterLayerColor, captureShade, UNKNOWN_CAPTURE_DEPTH
} from '../src/renderers/palettes.mjs';

const rgb = color => Object.values(hexToRgb(color));
const table = new Uint8Array(9 * 101 * 4);
for (let code = 0; code < 9; code++) for (let depth = 0; depth <= 100; depth++) {
  table.set([code * 23, depth * 2, 225 - code * 20, 255], (code * 101 + depth) * 4);
}
const colors = { table, exterior: [250, 249, 246], branch: [100, 130, 140] };
const average = (...values) => [0, 1, 2].map(channel => Math.round(
  values.reduce((sum, value) => sum + value[channel], 0) / values.length));
const pixel = (rgba, width, x, y = 0) => [...rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
const dynamics = { kind: 'dynamical', n: 5, originalRenderer: 'boundary',
  showOriginalSurvival: true, showDifference: false, originalOpacity: 1, firstLevelPieces: true,
  captureStyle: 'sets' };

function fixture(width, height, n, maskAt) {
  const words = Math.ceil(n / 32);
  const pieceMasks = new Uint32Array((width + 2) * (height + 2) * words);
  const data = new Uint8Array(width * height * 4);
  const pieces = new Uint8Array(width * height * 2);
  for (let y = -1; y <= height; y++) for (let x = -1; x <= width; x++) {
    const occupied = maskAt(x, y);
    for (const piece of occupied) pieceMasks[((y + 1) * (width + 2) + x + 1) * words + (piece >> 5)] |= 1 << (piece % 32);
    if (x >= 0 && x < width && y >= 0 && y < height && occupied.length) {
      data[(y * width + x) * 4 + 2] = 3;
      pieces[(y * width + x) * 2 + 1] = occupied[0] + 1;
    }
  }
  return { width, height, data, pieces, pieceMasks };
}

test('each exact E(2i,5) piece keeps its border inside overlaps', () => {
  // E(2i,5)=[-16/3,16/3]×[-8/3,8/3]. First pieces are the
  // rectangles [t-4/3,t+4/3]×[-8/3,8/3], t=-4,-2,0,2,4.
  const width = 96, height = 4;
  const tile = fixture(width, height, 5, (x, y) => {
    const zx = -6 + (x + .5) / 8, zy = .5 + (y + .5) / 8;
    return [-4, -2, 0, 2, 4].flatMap((t, piece) =>
      Math.abs(zx - t) <= 4 / 3 && Math.abs(zy) <= 8 / 3 ? [piece] : []);
  });
  const rgba = colorizeRasterTile(tile.data, dynamics, colors, tile.pieces, tile);
  const at = x => pixel(rgba, width, Math.floor((x + 6) * 8), 2);
  assert.deepEqual(at(-1.3), PIECE_OUTLINE_COLOR, 'the entering central piece has a black edge over the earlier piece');
  assert.equal(tile.pieces[(2 * width + Math.floor((-1.3 + 6) * 8)) * 2 + 1], 2,
    'the first-successful digit is still the earlier piece at this hidden edge');
  assert.deepEqual(at(-1), average(rgb(PIECE_COLORS[1]), rgb(PIECE_COLORS[2])), 'overlap fill includes both pieces');
  assert.deepEqual(at(0), rgb(PIECE_COLORS[2]), 'piece interiors stay colored');
  assert.deepEqual(at(5.8), colors.exterior, 'the outline does not expand the attractor into exterior cells');
});

test('tile and viewport clipping never invent borders, and tile assembly is seamless', () => {
  const whole = fixture(9, 4, 3, (x, y) => x < 4 ? [0] : [0, 2]);
  const expected = colorizeRasterTile(whole.data, { ...dynamics, n: 3 }, colors, whole.pieces, whole);
  const assembled = new Uint8ClampedArray(expected.length);
  for (const [start, width] of [[0, 4], [4, 5]]) {
    const tile = fixture(width, 4, 3, (x, y) => x + start < 4 ? [0] : [0, 2]);
    const rgba = colorizeRasterTile(tile.data, { ...dynamics, n: 3 }, colors, tile.pieces, tile);
    for (let row = 0; row < 4; row++) assembled.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), (row * 9 + start) * 4);
  }
  assert.deepEqual(assembled, expected);
  assert.deepEqual(pixel(expected, 9, 0, 0), rgb(PIECE_COLORS[0]), 'viewport border cuts through a filled piece without an artificial rim');
  assert.deepEqual(pixel(expected, 9, 4, 2), PIECE_OUTLINE_COLOR, 'the real overlap edge coincides with a tile boundary');
});

test('an unresolved neighbor cannot create a false piece boundary', () => {
  const tile = fixture(1, 1, 2, (x, y) => x === -1 ? [0] : [0, 1]);
  const unguarded = colorizeRasterTile(tile.data, { ...dynamics, n: 2 }, colors, tile.pieces, tile);
  assert.deepEqual(pixel(unguarded, 1, 0), PIECE_OUTLINE_COLOR);
  tile.pieceUncertainMasks = new Uint32Array(tile.pieceMasks.length);
  tile.pieceUncertainMasks[3] = 2; // left halo cell: second piece hit its resource cap
  const guarded = colorizeRasterTile(tile.data, { ...dynamics, n: 2 }, colors, tile.pieces, tile);
  assert.deepEqual(pixel(guarded, 1, 0), average(rgb(PIECE_COLORS[0]), rgb(PIECE_COLORS[1])));
});

test('piece coverage and outlines work across Uint32 word boundaries', () => {
  const tile = fixture(3, 1, 65, x => x < 1 ? [31, 32, 64] : [31, 32]);
  const rgba = colorizeRasterTile(tile.data, { ...dynamics, n: 65 }, colors, tile.pieces, tile);
  assert.deepEqual(pixel(rgba, 3, 0), PIECE_OUTLINE_COLOR, 'piece64 border is retained');
  assert.deepEqual(pixel(rgba, 3, 2), average(rgb(PIECE_COLORS[31]), rgb(PIECE_COLORS[32])),
    'signed bit31 and next-word bit0 both contribute');
});

test('piece fill survives a capped earlier search and respects opacity and disabled pieces', () => {
  const tile = fixture(1, 1, 3, () => [2]);
  tile.data[2] = 7;
  const job = { ...dynamics, n: 3, originalOpacity: .5 };
  const rgba = colorizeRasterTile(tile.data, job, colors, tile.pieces, tile);
  assert.deepEqual(pixel(rgba, 1, 0), average(colors.exterior, rgb(PIECE_COLORS[2])));
  tile.data[2] = 3;
  const plain = colorizeRasterTile(tile.data, { ...job, firstLevelPieces: false }, colors, tile.pieces, tile);
  assert.deepEqual(pixel(plain, 1, 0), average(colors.exterior, colors.branch));
});

test('several parameter layers and digit subsets stay visible independently', () => {
  const job = { kind: 'parameter', n: 4, parameterLayers: ['mn0', 'mn1'], parameterDigits: [-3], captureStyle: 'sets' };
  const tile = { layerData: Uint8Array.of(1, 3, 0, 5, 3, 16, 0, 5, 1, 4, 0, 4) };
  const rgba = colorizeRasterTile(new Uint8Array(8), job, colors, null, tile);
  assert.deepEqual(pixel(rgba, 2, 0), average(rgb(parameterLayerColor('mn0')), rgb(parameterDigitColor(-3, 4))));
  assert.deepEqual(pixel(rgba, 2, 1), rgb(parameterLayerColor('mn1')));
  const empty = colorizeRasterTile(new Uint8Array(4), { ...job, parameterLayers: [], parameterDigits: [] }, colors,
    null, { layerData: new Uint8Array(0) });
  assert.deepEqual(pixel(empty, 1, 0), colors.exterior);
});

test('parameter resource caps remain distinct from finite escape coverage', () => {
  const job = { kind: 'parameter', n: 2, parameterLayers: ['mn0', 'mn1'], parameterDigits: [], captureStyle: 'sets' };
  const tile = { layerData: Uint8Array.of(0, 8, 7, 6, 8, 5, 3, 16, 0, 7, 0, 12) };
  const rgba = colorizeRasterTile(new Uint8Array(12), job, colors, null, tile);
  assert.deepEqual(pixel(rgba, 3, 0), [...table.slice((7 * 101 + 6) * 4, (7 * 101 + 6) * 4 + 3)]);
  assert.deepEqual(pixel(rgba, 3, 1), rgb(parameterLayerColor('mn1')), 'a covered layer remains visible independently of another capped layer');
  assert.deepEqual(pixel(rgba, 3, 2), [...table.slice(12 * 4, 12 * 4 + 3)], 'the union escapes after its last selected layer');
});

test('parameter digit colors agree with every original first-piece color', () => {
  assert.equal(PIECE_COLORS.length, 100);
  assert.equal(new Set(PIECE_COLORS).size, 100);
  for (const n of [2, 3, 5, 32, 65, 100]) for (let piece = 0; piece < n; piece++) {
    assert.equal(parameterDigitColor(-n + 1 + 2 * piece, n), colorForPiece(piece));
  }
});

test('capture bands distinguish center minima, witnesses and finite coverage for every parameter layer', () => {
  for (const key of ['mn', 'mn0', 'mn1', 'digit:-3', 'digit:0', 'digit:3']) {
    const job = { kind: 'parameter', n: 4, captureStyle: 'depth', modulo: 3,
      parameterLayers: key.startsWith('digit:') ? [] : [key],
      parameterDigits: key.startsWith('digit:') ? [Number(key.slice(6))] : [] };
    const base = rgb(parameterLayerColor(key, 4));
    // Geometry codes are intentionally equal for the first five pixels. The
    // separate center record, not the DFS witness depth, identifies a stratum.
    const tile = { layerData: Uint8Array.of(1, 9, 1, 9, 1, 9, 1, 9, 1, 2, 3, 12),
      layerCaptureDepths: Uint8Array.of(0, 1, 2, 3, UNKNOWN_CAPTURE_DEPTH, UNKNOWN_CAPTURE_DEPTH) };
    const rgba = colorizeRasterTile(new Uint8Array(24), job, colors, null, tile);
    const samples = Array.from({ length: 6 }, (_, index) => pixel(rgba, 6, index));
    assert.equal(new Set([samples[0], samples[1], samples[2], samples[4], samples[5]].map(String)).size, 5,
      `${key}: three strata, a witness and a survivor must remain distinguishable`);
    assert.deepEqual(samples[0], samples[3], `${key}: the q=3 cycle repeats after three minima`);
    assert.deepEqual(samples[4], base, `${key}: an unknown minimum retains the solid witnessed hue`);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(samples[0][channel] < samples[1][channel] && samples[1][channel] < samples[2][channel]);
      assert.ok(samples[2][channel] < samples[4][channel] && samples[4][channel] < samples[5][channel]);
    }
    assert.ok(samples[5].some(value => value < 235), `${key}: finite off-lens coverage retains visible color`);
    const flat = colorizeRasterTile(new Uint8Array(24), { ...job, captureStyle: 'sets' }, colors, null, tile);
    for (let index = 0; index < 6; index++) assert.deepEqual(pixel(flat, 6, index), base);
  }
});

test('q=1 keeps a captured center distinct from an unclassified witness and finite survival', () => {
  const base = [100, 160, 200];
  const capture = captureShade(base, 1, 0, { modulo: 1 });
  assert.deepEqual(captureShade(base, 1, 87, { modulo: 1 }), capture);
  assert.notDeepEqual(captureShade(base, 1, UNKNOWN_CAPTURE_DEPTH, { modulo: 1 }), capture);
  assert.notDeepEqual(captureShade(base, 3, UNKNOWN_CAPTURE_DEPTH, { modulo: 1 }), capture);
  assert.deepEqual(captureShade(Uint8Array.from(base), 1, 2, { modulo: 3 }),
    captureShade(base, 1, 2, { modulo: 3 }), 'byte input must not round intermediate colors');
});

test('center capture survives whole-cell work caps without changing the cell records', () => {
  const job = { kind: 'parameter', n: 4, parameterLayers: ['mn0'], parameterDigits: [], captureStyle: 'depth', modulo: 3 };
  const tile = { layerData: Uint8Array.of(1, 1, 3, 12, 7, 6, 7, 6),
    layerCaptureDepths: Uint8Array.of(1, 1, 1, UNKNOWN_CAPTURE_DEPTH) };
  const before = tile.layerData.slice();
  const rgba = colorizeRasterTile(new Uint8Array(16), job, colors, null, tile);
  assert.deepEqual(pixel(rgba, 4, 0), pixel(rgba, 4, 1), 'a finite cell does not hide a captured center');
  assert.deepEqual(pixel(rgba, 4, 0), pixel(rgba, 4, 2), 'a capped cell does not hide a captured center');
  assert.notDeepEqual(pixel(rgba, 4, 2), pixel(rgba, 4, 3), 'a cap without capture remains diagnostic');
  assert.deepEqual(tile.layerData, before, 'center strata must not rewrite conservative cell geometry');
});

test('capture metadata may be absent without falsely turning a DFS witness into a minimum', () => {
  const job = { kind: 'parameter', n: 4, parameterLayers: ['mn1'], parameterDigits: [], captureStyle: 'depth', modulo: 3 };
  const tile = { layerData: Uint8Array.of(1, 0, 1, 1, 1, 11) };
  for (const minima of [undefined, Uint8Array.of(1), Uint8Array.of(255, 254, 101)]) {
    const rgba = colorizeRasterTile(new Uint8Array(12), job, colors, null, { ...tile, layerCaptureDepths: minima });
    for (let index = 0; index < 3; index++) assert.deepEqual(pixel(rgba, 3, index), rgb(parameterLayerColor('mn1')));
  }
});

test('selected layers shade independently before their overlap colors blend', () => {
  const job = { kind: 'parameter', n: 4, parameterLayers: ['mn0', 'mn1'], parameterDigits: [-3], captureStyle: 'depth', modulo: 3 };
  const tile = { layerData: Uint8Array.of(1, 3, 3, 12, 7, 6), layerCaptureDepths: Uint8Array.of(0, 255, 2) };
  const together = colorizeRasterTile(new Uint8Array(4), job, colors, null, tile);
  const separate = [['mn0'], ['mn1'], []].map((layers, index) => {
    const subjob = { ...job, parameterLayers: layers, parameterDigits: index === 2 ? [-3] : [] };
    const subtile = { layerData: tile.layerData.subarray(2 * index, 2 * index + 2),
      layerCaptureDepths: tile.layerCaptureDepths.subarray(index, index + 1) };
    return pixel(colorizeRasterTile(new Uint8Array(4), subjob, colors, null, subtile), 1, 0);
  });
  const expected = average(...separate);
  const actual = pixel(together, 1, 0);
  actual.forEach((value, channel) => assert.ok(Math.abs(value - expected[channel]) <= 1,
    'averaging after independent shading may differ only by final byte rounding'));
});

test('whole-E center depth zero is independent of piece hues, while overlap contours remain black', () => {
  const tile = fixture(3, 1, 3, x => x < 1 ? [0] : [0, 2]);
  tile.data[2] = tile.data[6] = tile.data[10] = 1;
  tile.captureDepths = Uint8Array.of(255, 0, 255, 0, 255, 0);
  const job = { ...dynamics, n: 3, captureStyle: 'depth', modulo: 3 };
  const bands = colorizeRasterTile(tile.data, job, colors, tile.pieces, tile);
  const flat = colorizeRasterTile(tile.data, { ...job, captureStyle: 'sets' }, colors, tile.pieces, tile);
  assert.deepEqual(pixel(bands, 3, 1), PIECE_OUTLINE_COLOR, 'capture shading cannot tint a real overlap contour');
  assert.deepEqual(pixel(flat, 3, 1), PIECE_OUTLINE_COLOR);
  for (const x of [0, 2]) pixel(bands, 3, x).forEach((value, channel) =>
    assert.ok(Math.abs(value - pixel(flat, 3, x)[channel] * 0.6) <= 1));
  const plain = colorizeRasterTile(tile.data, { ...job, firstLevelPieces: false }, colors, tile.pieces, tile);
  const plainFlat = colorizeRasterTile(tile.data, { ...job, firstLevelPieces: false, captureStyle: 'sets' }, colors, tile.pieces, tile);
  pixel(plain, 3, 0).forEach((value, channel) =>
    assert.ok(Math.abs(value - pixel(plainFlat, 3, 0)[channel] * 0.6) <= 1,
      'disabling piece colors must not shift the center capture from depth zero'));
});

test('center capture does not manufacture a piece outline across an uncertain neighbor', () => {
  const tile = fixture(1, 1, 2, x => x === -1 ? [0] : [0, 1]);
  tile.data[2] = 7;
  tile.captureDepths = Uint8Array.of(255, 0);
  tile.pieceUncertainMasks = new Uint32Array(tile.pieceMasks.length);
  tile.pieceUncertainMasks[3] = 2;
  const rgba = colorizeRasterTile(tile.data, { ...dynamics, n: 2, captureStyle: 'depth' }, colors, tile.pieces, tile);
  assert.notDeepEqual(pixel(rgba, 1, 0), PIECE_OUTLINE_COLOR);
  assert.deepEqual([...tile.pieceUncertainMasks].filter(Boolean), [2]);
});

test('difference-attractor capture mode shares the same minimum and finite-coverage semantics', () => {
  const job = { kind: 'dynamical', n: 3, showDifference: true, showOriginalSurvival: false, captureStyle: 'depth', modulo: 3 };
  const palette = { ...colors, captureInterior: [160, 160, 160], captureOffLens: [130, 170, 210] };
  const data = Uint8Array.of(1, 8, 0, 0, 1, 8, 0, 0, 3, 12, 0, 0, 2, 3, 0, 0);
  const tile = { captureDepths: Uint8Array.of(0, 255, 1, 255, 255, 255, 1, 255) };
  const rgba = colorizeRasterTile(data, job, palette, null, tile);
  assert.notDeepEqual(pixel(rgba, 4, 0), pixel(rgba, 4, 1));
  assert.ok(pixel(rgba, 4, 2)[0] > pixel(rgba, 4, 1)[0]);
  assert.notDeepEqual(pixel(rgba, 4, 1), pixel(rgba, 4, 3), 'off-lens witnesses retain the separate search hue');
  const flat = colorizeRasterTile(data, { ...job, captureStyle: 'sets' }, palette, null, tile);
  assert.deepEqual(pixel(flat, 4, 0), palette.captureInterior);
  assert.deepEqual(pixel(flat, 4, 1), palette.captureInterior);
  assert.deepEqual(pixel(flat, 4, 2), palette.captureInterior);
  const escape = colorizeRasterTile(data, { ...job, showEscapeStrata: true }, palette, null, tile);
  for (let index = 0; index < 4; index++) assert.deepEqual(pixel(escape, 4, index), colors.exterior);
});

test('half-integer custom capture colors round consistently with the GPU palette', () => {
  const job = { kind: 'dynamical', n: 3, showDifference: true, showOriginalSurvival: false,
    captureStyle: 'depth', modulo: 3 };
  const palette = { ...colors, captureInterior: [166, 170, 174] };
  const rgba = colorizeRasterTile(Uint8Array.of(1, 8, 0, 0), job, palette, null,
    { captureDepths: Uint8Array.of(1, 255) });
  assert.deepEqual(pixel(rgba, 1, 0), [125, 128, 131],
    'the 75% band rounds 124.5 and 130.5 upward, instead of Uint8 ties-to-even');
});
