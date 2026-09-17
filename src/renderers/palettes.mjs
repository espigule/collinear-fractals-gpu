export const PIECE_COLORS = [
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#2563eb',
  '#be123c',
  '#15803d',
  '#a16207',
  '#4338ca',
  '#0e7490'
];

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
