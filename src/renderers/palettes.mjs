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
  const normalized = String(hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6);
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
