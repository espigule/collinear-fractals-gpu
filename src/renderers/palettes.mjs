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

/** A byte-sized unknown minimum never turns a capture witness into a stratum. */
export const UNKNOWN_CAPTURE_DEPTH = 255;
export const CAPTURE_SHADING = Object.freeze({
  minimumScale: 0.6,
  scaleRange: 0.3,
  singleBandScale: 0.75,
  survivorWhite: 0.28
});

/**
 * Hue identifies the selected set or first-level geometry. In capture mode,
 * lightness identifies a minimum capture depth at the pixel center, a capture
 * witness whose minimum remains unknown, or finite escape coverage. Center
 * capture does not assert capture of the whole pixel footprint. A known witness
 * keeps the base hue, so a search limit cannot turn it into an unresolved pixel.
 *
 * The palette deliberately retains 72% of the hue for finite survivors: the
 * exterior approximation must remain legible for attractors without a trap.
 * These constants and operations are mirrored by the WebGL palette shader.
 */
export function captureShade(base, code, minimumDepth = UNKNOWN_CAPTURE_DEPTH, {
  captureStyle = 'depth', modulo = 3
} = {}) {
  if (captureStyle === 'sets') return base;
  if (knownCaptureDepth(minimumDepth)) {
    const q = Math.max(1, Math.min(12, Math.round(modulo) || 3));
    const scale = q === 1 ? CAPTURE_SHADING.singleBandScale
      : CAPTURE_SHADING.minimumScale + CAPTURE_SHADING.scaleRange * (minimumDepth % q) / (q - 1);
    return Array.from(base, value => value * scale);
  }
  if (code === 3) return Array.from(base, value => value + (255 - value) * CAPTURE_SHADING.survivorWhite);
  return base;
}

export function knownCaptureDepth(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

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
