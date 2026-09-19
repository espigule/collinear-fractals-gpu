import test from 'node:test';
import assert from 'node:assert/strict';
import { colorizeRasterTile } from '../src/renderers/hybrid_renderer.mjs';
import {
  PIECE_COLORS, PIECE_OUTLINE_COLOR, colorForPiece, hexToRgb,
  parameterDigitColor, parameterLayerColor
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
  showOriginalSurvival: true, showDifference: false, originalOpacity: 1, firstLevelPieces: true };

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
  const job = { kind: 'parameter', n: 4, parameterLayers: ['mn0', 'mn1'], parameterDigits: [-3] };
  const tile = { layerData: Uint8Array.of(1, 3, 0, 5, 3, 16, 0, 5, 1, 4, 0, 4) };
  const rgba = colorizeRasterTile(new Uint8Array(8), job, colors, null, tile);
  assert.deepEqual(pixel(rgba, 2, 0), average(rgb(parameterLayerColor('mn0')), rgb(parameterDigitColor(-3, 4))));
  assert.deepEqual(pixel(rgba, 2, 1), rgb(parameterLayerColor('mn1')));
  const empty = colorizeRasterTile(new Uint8Array(4), { ...job, parameterLayers: [], parameterDigits: [] }, colors,
    null, { layerData: new Uint8Array(0) });
  assert.deepEqual(pixel(empty, 1, 0), colors.exterior);
});

test('parameter resource caps remain distinct from finite escape coverage', () => {
  const job = { kind: 'parameter', n: 2, parameterLayers: ['mn0', 'mn1'], parameterDigits: [] };
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
