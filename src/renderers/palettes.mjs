// Light, separated hues keep the black piece contours legible, as in the
// paper's gold/periwinkle figures. The longer palette avoids repeating the
// first nine colors for the larger alphabets supported by the explorer.
const CURATED_PIECE_COLORS = [
  '#edc866', '#91a5ed', '#75c7b3', '#df9cae', '#b49bdd', '#eca67a',
  '#7bb6d5', '#b2c975', '#d2a0c9', '#81c9d0', '#e1b985', '#9eacd0'
];

function rgbToHex(channels) {
  return `#${channels.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function additionalPieceColor(index) {
  const hue = ((index * 137.50776405 + 39) % 360) / 60;
  const saturation = 0.48 + (index % 3) * 0.07;
  const lightness = 0.65 + (index % 2) * 0.045;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const sectors = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x],
    [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
  const offset = lightness - chroma / 2;
  return rgbToHex(sectors[Math.floor(hue)].map(value => (value + offset) * 255));
}

export const PIECE_COLORS = Object.freeze(Array.from({ length: 100 }, (_, index) =>
  CURATED_PIECE_COLORS[index] ?? additionalPieceColor(index)));

export const PIECE_OUTLINE_COLOR = Object.freeze([18, 18, 18]);
export const PARAMETER_LAYER_COLORS = Object.freeze({
  mn: '#697b98', mn0: '#42a995', mn1: '#be79a0'
});

export function hexToRgb(hex) {
  let normalized = String(hex || '#000000').replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(normalized)) {
    normalized = normalized.split('').map(char => char + char).join('');
  }
  if (!/^[\da-f]{6}$/i.test(normalized)) return { r: 0, g: 0, b: 0 };
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

export function colorForPiece(index) {
  return PIECE_COLORS[((index % PIECE_COLORS.length) + PIECE_COLORS.length) % PIECE_COLORS.length];
}

/** The A_n digits match their dynamical pieces; interleaved digits are lighter. */
export function parameterDigitColor(t, n) {
  const position = (t + n - 1) / 2;
  if (Number.isInteger(position)) return colorForPiece(position);
  const a = hexToRgb(colorForPiece(Math.floor(position)));
  const b = hexToRgb(colorForPiece(Math.ceil(position)));
  return rgbToHex(['r', 'g', 'b'].map(channel => 0.46 * (a[channel] + b[channel]) + 0.08 * 255));
}

export function parameterLayerColor(layer, n) {
  if (typeof layer === 'string' && layer.startsWith('digit:')) {
    return parameterDigitColor(Number(layer.slice(6)), n);
  }
  return PARAMETER_LAYER_COLORS[layer] ?? PARAMETER_LAYER_COLORS.mn;
}

/** Canonical raster order, with legacy single-mode jobs still supported. */
export function parameterLayerKeys(job) {
  const mode = job.parameterMode === 'rn' ? 'mn0' : (job.parameterMode ?? 'mn');
  const aggregates = job.parameterLayers ?? (mode === 'compare' ? ['mn', 'mn0'] : [mode]);
  return [...aggregates, ...(job.parameterDigits ?? []).map(t => `digit:${t}`)];
}
