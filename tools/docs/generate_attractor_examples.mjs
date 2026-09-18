#!/usr/bin/env node
/**
 * Reproduce the README gallery with the explorer's shared prefix geometry.
 *
 * Run: node tools/docs/generate_attractor_examples.mjs
 * Check: node tools/docs/generate_attractor_examples.mjs --check
 *
 * Node built-ins are sufficient. PNG encoding is local and deterministic; the
 * SVG embeds those small rasters while retaining accessible vector labels.
 * There is no random sampling, search verdict, or inferred connectivity claim.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { alphabet } from '../../src/math/alphabets.mjs';
import { attractorBounds } from '../../src/math/attractor_bounds.mjs';
import { prefixCenters, tailRadius } from '../../src/math/prefix_cylinders.mjs';
import { colorForPiece, hexToRgb } from '../../src/renderers/palettes.mjs';
import {
  DEFAULT_EXPLORER_STATE, decodeExplorerState, encodeExplorerState, normalizeExplorerState
} from '../../src/state/explorer_state.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SVG_PATH = 'docs/figures/attractor-examples.svg';
const JSON_PATH = 'docs/figures/attractor-examples.json';
const EXPLORER_URL = 'https://complextrees.com/collinear-fractals-gpu/';
const CHECK = process.argv.includes('--check');
assert.ok(process.argv.slice(2).every(value => value === '--check'), 'Only --check is supported');

const DEPTH = 8;
const MAX_PREFIXES = 400000;
const PLOT_WIDTH = 332;
const PLOT_HEIGHT = 220;
const RASTER_SCALE = 2;
const MINIMUM_RASTER_RADIUS = 0.6;
const PIECE_OPACITY = 0.92;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rounded = value => Number(value.toFixed(6));

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([typeBytes, data])) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    // PNG filter 0 makes the byte representation independent of heuristics.
    rgba.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

async function preset(id, label, parameterLabel) {
  const relativePath = `examples/${id}/config.json`;
  const source = JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'));
  return {
    id, label, parameterLabel, source: relativePath, n: source.n,
    c: { re: source.parameter.re, im: source.parameter.im },
    exactParameter: source.parameter.exact
  };
}

function interactiveView(example, spanX) {
  const state = normalizeExplorerState({
    n: example.n, cx: example.c.re, cy: example.c.im,
    comparisonMode: 'collinear', rendererMode: 'boundary',
    boundaryDepth: 0, adaptiveBoundary: true,
    showCollinear: true, showDifference: false, showTrap: false,
    showEnclosure: false, showTree: false, showPath: false, showEscapeStrata: false,
    firstLevelPieces: true, palette: 'research', originalAttractorOpacity: PIECE_OPACITY,
    focusedPanel: 'dynamical', attractorDepth: DEPTH,
    dynCenter: { x: 0, y: 0 }, dynZoom: spanX, backend: 'auto'
  }, DEFAULT_EXPLORER_STATE);
  const encoded = encodeExplorerState(state);
  assert.deepEqual(decodeExplorerState(encoded), state, 'Interactive links must roundtrip the complete state');
  return {
    interactive_url: `${EXPLORER_URL}#${encoded}`,
    interactive_rendering: {
      corresponding_view_only: true,
      renderer_mode: 'boundary',
      requested_boundary_depth: 0,
      automatic_base_depth: example.n === 2 ? 16 : 12,
      adaptive_boundary: true,
      maximum_effective_boundary_depth: 100,
      advanced_prefix_depth: DEPTH,
      resource_cap_result: 'unresolved',
      note: 'This URL opens the corresponding original-attractor view using adaptive capture-and-escape boundary rendering. Its effective depth depends on viewport zoom and raster resolution; GPU previews have separate depth/work caps before automatic CPU refinement. The committed figure remains a complete depth-eight prefix illustration, reproduced by this generator.'
    }
  };
}

function plot(example) {
  const { c, n } = example;
  const bounds = attractorBounds(c, n, { tol: 1e-9, maxTerms: 2000 });
  const halfWidth = 1.12 * Math.max(bounds.xMax, bounds.yMax * PLOT_WIDTH / PLOT_HEIGHT);
  const halfHeight = halfWidth * PLOT_HEIGHT / PLOT_WIDTH;
  const width = PLOT_WIDTH * RASTER_SCALE;
  const height = PLOT_HEIGHT * RASTER_SCALE;
  const pixelsPerUnit = width / (2 * halfWidth);
  const tail = tailRadius(c, n, DEPTH);
  const minimumRadius = example.minimumRasterRadius ?? MINIMUM_RASTER_RADIUS;
  const radius = Math.max(tail * pixelsPerUnit, minimumRadius);
  const centers = prefixCenters(c, n, DEPTH, { maxPrefixes: MAX_PREFIXES });
  assert.equal(centers.length, n ** DEPTH, 'Only complete prefix levels are rendered');
  // An independent closed-form witness catches a leading 1/c scale error:
  // the all-(n-1) word approaches the fixed point (n-1)c/(c-1).
  const denominator = (c.re - 1) ** 2 + c.im ** 2;
  const fixedRe = (n - 1) * (1 + (c.re - 1) / denominator);
  const fixedIm = -(n - 1) * c.im / denominator;
  const last = centers.at(-1);
  assert.ok(Math.hypot(last.re - fixedRe, last.im - fixedIm) <= tail * (1 + 1e-12) + 1e-12,
    'Original E(c,n) coordinates must approach the unscaled affine fixed point');
  const masks = Array.from({ length: n }, () => new Uint8Array(width * height));
  const sampleOffsets = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const radiusSquared = radius * radius;
  for (const center of centers) {
    assert.ok(Math.abs(center.re) <= bounds.xMax && Math.abs(center.im) <= bounds.yMax,
      'Shared prefix coordinates must lie inside shared attractor support bounds');
    const piece = (center.firstDigit + n - 1) / 2;
    const px = (center.re + halfWidth) * pixelsPerUnit;
    const py = (halfHeight - center.im) * pixelsPerUnit;
    assert.ok(px - radius >= 0 && px + radius < width && py - radius >= 0 && py + radius < height,
      'The fitted view must include every displayed prefix disk');
    const xMin = Math.floor(px - radius);
    const xMax = Math.floor(px + radius);
    const yMin = Math.floor(py - radius);
    const yMax = Math.floor(py + radius);
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        let bits = 0;
        for (let sample = 0; sample < sampleOffsets.length; sample++) {
          const dx = x + sampleOffsets[sample][0] - px;
          const dy = y + sampleOffsets[sample][1] - py;
          if (dx * dx + dy * dy <= radiusSquared) bits |= 1 << sample;
        }
        masks[piece][y * width + x] |= bits;
      }
    }
  }
  const colors = Array.from({ length: n }, (_, index) => hexToRgb(colorForPiece(index)));
  const rgba = Buffer.alloc(width * height * 4);
  let occupiedPixels = 0;
  for (let index = 0; index < width * height; index++) {
    if (!masks.some(mask => mask[index])) continue;
    occupiedPixels++;
    let r = 0, g = 0, b = 0;
    // Union the disks within each first-level piece before compositing colors.
    // This avoids mistaking repeated prefix density for geometric evidence.
    for (let sample = 0; sample < sampleOffsets.length; sample++) {
      let sr = 255, sg = 255, sb = 255;
      for (let piece = 0; piece < n; piece++) {
        if (!(masks[piece][index] & (1 << sample))) continue;
        sr = sr * (1 - PIECE_OPACITY) + colors[piece].r * PIECE_OPACITY;
        sg = sg * (1 - PIECE_OPACITY) + colors[piece].g * PIECE_OPACITY;
        sb = sb * (1 - PIECE_OPACITY) + colors[piece].b * PIECE_OPACITY;
      }
      r += sr; g += sg; b += sb;
    }
    rgba[index * 4] = Math.round(r / sampleOffsets.length);
    rgba[index * 4 + 1] = Math.round(g / sampleOffsets.length);
    rgba[index * 4 + 2] = Math.round(b / sampleOffsets.length);
    rgba[index * 4 + 3] = 255;
  }
  const png = encodePng(width, height, rgba);
  return {
    png,
    metadata: {
      id: example.id, label: example.label, source_example: example.source,
      ...interactiveView(example, 2 * halfWidth),
      set: 'E(c,n)', n, parameter: { ...c, exact: example.exactParameter },
      parameter_convention: 'expanding-parameter', displayed_coordinate_scale: 1,
      digits: alphabet(n), maps: 'z -> t + z/c',
      prefix_sum: 'sum_{j=0}^{depth-1} t_j / c^j',
      prefix_depth: DEPTH, prefix_count: centers.length,
      complete_prefix_level: true, maximum_prefixes: MAX_PREFIXES,
      random_sampling: false, seed: null,
      geometric_tail_radius: tail,
      display_radius_world: radius / pixelsPerUnit,
      minimum_display_radius_raster_pixels: minimumRadius,
      minimum_display_radius_applied: radius > tail * pixelsPerUnit,
      viewport: {
        center: { re: 0, im: 0 },
        x_min: -halfWidth, x_max: halfWidth, y_min: -halfHeight, y_max: halfHeight,
        svg_width: PLOT_WIDTH, svg_height: PLOT_HEIGHT,
        raster_width: width, raster_height: height, pixels_per_world_unit: pixelsPerUnit
      },
      support_bounds: bounds,
      first_level_colors: alphabet(n).map((digit, index) => ({ digit, color: colorForPiece(index) })),
      occupied_raster_pixels: occupiedPixels, raster_sha256: sha256(png),
      visual_status: 'visual-approximation', proof_status: 'visual-approximation',
      connectedness_verdict: null, interior_verdict: null,
      limitations: 'Finite prefixes and minimum-sized display marks do not certify overlap, connectedness, interior, or boundary membership. Color overlaps also depend on raster resolution.'
    }
  };
}

function panel(example, result, index) {
  const x = 24 + index * 390;
  const plotX = x + 20;
  const plotY = 171;
  const { viewport } = result.metadata;
  const originX = plotX + PLOT_WIDTH / 2;
  const originY = plotY + PLOT_HEIGHT / 2;
  const axisStyle = 'stroke="#d5dfe8" stroke-width="0.8" stroke-dasharray="3 5"';
  const extent = value => rounded(value).toFixed(2).replace('-', '−');
  const digits = alphabet(example.n);
  const legendStep = 52;
  const legendWidth = (digits.length - 1) * legendStep + 29;
  const legendX = x + (372 - legendWidth) / 2;
  const legend = digits.map((digit, piece) => `<circle cx="${legendX + piece * legendStep}" cy="421" r="4.5" fill="${colorForPiece(piece)}"/><text x="${legendX + piece * legendStep + 10}" y="426" class="digit">${String(digit).replace('-', '−')}</text>`).join('');
  return `<g aria-label="${xml(`E(c,${example.n}); ${example.parameterLabel}; ${example.label}`)}">
    <rect x="${x}" y="94" width="372" height="354" rx="13" fill="#fff" stroke="#dbe3ec"/>
    <text x="${x + 20}" y="125" class="set">E(c, ${example.n})</text>
    <text x="${x + 352}" y="121" text-anchor="end" class="tag">${xml(example.label)}</text>
    <text x="${x + 20}" y="151" class="parameter">${xml(example.parameterLabel)}</text>
    <line x1="${plotX}" y1="${originY}" x2="${plotX + PLOT_WIDTH}" y2="${originY}" ${axisStyle}/>
    <line x1="${originX}" y1="${plotY}" x2="${originX}" y2="${plotY + PLOT_HEIGHT}" ${axisStyle}/>
    <image x="${plotX}" y="${plotY}" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" xlink:href="data:image/png;base64,${result.png.toString('base64')}"/>
    <text x="${plotX}" y="400" class="extent">${extent(viewport.x_min)}</text>
    <text x="${plotX + PLOT_WIDTH}" y="400" text-anchor="end" class="extent">${extent(viewport.x_max)}</text>
    <text x="${plotX + PLOT_WIDTH}" y="${originY - 8}" text-anchor="end" class="axis">Re z</text>
    <text x="${originX + 7}" y="${plotY + 10}" class="axis">Im z</text>
    ${legend}
  </g>`;
}

const examples = [
  await preset('e_c4_overlap', 'OVERLAP PRESET', 'c = (3 + i√11)/2'),
  await preset('e_c5_plane_filling', 'PLANE-FILLING PRESET', 'c = 1 + 2i'),
  {
    id: 'e_c3_sparse', label: 'SPARSE EXAMPLE', parameterLabel: 'c = 3 + 3i',
    source: null, n: 3, c: { re: 3, im: 3 }, exactParameter: '3 + 3i',
    minimumRasterRadius: 1.2
  }
];
const results = examples.map(plot);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="525" viewBox="0 0 1200 525" role="img" aria-labelledby="gallery-title gallery-description">
  <title id="gallery-title">Three collinear attractors in their original coordinates</title>
  <desc id="gallery-description">Original E(c,n), using f_t(z)=t+z/c and complete depth-eight prefixes. Left: n=4, c=(3+i sqrt(11))/2. Middle: n=5, c=1+2i. Right: n=3, c=3+3i. Colors identify the first digit. Each panel has an independently fitted view. These finite-resolution visual approximations are not proof records.</desc>
  <style>
    text { font-family: Arial, Helvetica, sans-serif; fill: #183047; }
    .set { font-family: Georgia, 'Times New Roman', serif; font-size: 25px; font-style: italic; }
    .parameter { font-family: Georgia, 'Times New Roman', serif; font-size: 19px; fill: #385268; }
    .tag { font-size: 10px; letter-spacing: .8px; font-weight: 700; fill: #63778b; }
    .axis { font-size: 12px; fill: #52677b; font-style: italic; }
    .extent { font-size: 11px; fill: #52677b; }
    .digit { font-size: 14px; fill: #52677b; }
  </style>
  <rect width="1200" height="525" rx="18" fill="#f5f8fc"/>
  <text x="24" y="38" font-size="26" font-weight="700">Collinear attractors</text>
  <text x="24" y="67" font-size="16" fill="#536b80">One affine rule: f<tspan baseline-shift="sub" font-size="11">t</tspan>(z) = t + z/c. Colors identify the outermost digit t.</text>
  ${examples.map((example, index) => panel(example, results[index], index)).join('\n')}
  <text x="24" y="478" font-size="14" fill="#52677b">Full E(c,n) coordinates · independently fitted views · complete depth-8 prefixes</text>
  <text x="24" y="502" font-size="13" fill="#52677b">Finite-resolution illustrations. Preset names do not turn the images into connectivity or interior certificates.</text>
</svg>
`;
assert.ok(Buffer.byteLength(svg) < 500000, 'Keep the embedded README gallery under 500 kB');
const sourceModules = [
  'src/math/alphabets.mjs', 'src/math/attractor_bounds.mjs', 'src/math/complex.mjs',
  'src/math/prefix_cylinders.mjs', 'src/math/validation.mjs', 'src/renderers/palettes.mjs',
  'src/state/explorer_state.mjs'
];
const moduleHashes = Object.fromEntries(await Promise.all(sourceModules.map(async source =>
  [source, sha256(await readFile(join(ROOT, source)))])));
const metadata = {
  schema_version: '1.0.0', artifact: SVG_PATH, artifact_sha256: sha256(svg),
  title: 'Three collinear attractors in their original coordinates',
  generator: 'tools/docs/generate_attractor_examples.mjs',
  regenerate: 'node tools/docs/generate_attractor_examples.mjs',
  verify: 'node tools/docs/generate_attractor_examples.mjs --check',
  source_modules_sha256: moduleHashes,
  svg_size: { width: 1200, height: 525 },
  arithmetic: 'binary64', sampling: 'complete-prefix-enumeration',
  rasterization: {
    png: 'RGBA8, PNG filter 0, zlib level 9',
    resolution_scale: RASTER_SCALE, subpixel_samples: 4,
    disk_rule: 'max(geometric tail radius, minimum display radius)',
    default_minimum_display_radius_raster_pixels: MINIMUM_RASTER_RADIUS,
    compositing: 'union within each first-level piece, then ascending-digit source-over on white',
    first_level_piece_opacity: PIECE_OPACITY
  },
  proof_status: 'visual-approximation', rounding_verified: false,
  examples: results.map(result => result.metadata)
};
const files = [[SVG_PATH, svg], [JSON_PATH, `${JSON.stringify(metadata, null, 2)}\n`]];
for (const [relativePath, content] of files) {
  const path = join(ROOT, relativePath);
  if (CHECK) {
    assert.equal(await readFile(path, 'utf8'), content, `${relativePath} is stale; regenerate the gallery`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
}
console.log(`${CHECK ? 'Verified' : 'Generated'} ${SVG_PATH} (${Buffer.byteLength(svg)} bytes), ${JSON_PATH}`);
