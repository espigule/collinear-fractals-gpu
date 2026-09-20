#!/usr/bin/env node
/**
 * Reproduce the README gallery with the explorer's capture/escape renderer.
 *
 * Run: node tools/docs/generate_attractor_examples.mjs
 * Check: node tools/docs/generate_attractor_examples.mjs --check
 *
 * Node built-ins are sufficient. PNG encoding is local and deterministic; the
 * SVG embeds those small rasters while retaining accessible vector labels.
 * There is no random sampling or inferred connectivity claim. Finite escape
 * coverage and binary64 trap hits remain visualization data, not proof records.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { alphabet } from '../../src/math/alphabets.mjs';
import { attractorBounds } from '../../src/math/attractor_bounds.mjs';
import { prepareRasterJob, renderRasterTile, RASTER_CODES } from '../../src/compute/raster_jobs.mjs';
import { createAttractorMembershipContext, classifyAttractorCapture } from '../../src/compute/attractor_membership.mjs';
import { colorizeRasterTile } from '../../src/renderers/hybrid_renderer.mjs';
import { captureShade, colorForPiece, hexToRgb, parameterLayerColor, PIECE_OUTLINE_COLOR } from '../../src/renderers/palettes.mjs';
import {
  DEFAULT_EXPLORER_STATE, decodeExplorerState, encodeExplorerState, normalizeExplorerState
} from '../../src/state/explorer_state.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SVG_PATH = 'docs/figures/attractor-examples.svg';
const JSON_PATH = 'docs/figures/attractor-examples.json';
const CAPTURE_SVG_PATH = 'docs/figures/finite-capture-layers.svg';
const CAPTURE_JSON_PATH = 'docs/figures/finite-capture-layers.json';
const EXPLORER_URL = 'https://complextrees.com/collinear-fractals-gpu/';
const CHECK = process.argv.includes('--check');
assert.ok(process.argv.slice(2).every(value => value === '--check'), 'Only --check is supported');

const BOUNDARY_WORK = 20000;
const PLOT_WIDTH = 332;
const PLOT_HEIGHT = 220;
const RASTER_SCALE = 2;
const PIECE_OPACITY = 1;
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

function interactiveView(example, spanX, depth) {
  const state = normalizeExplorerState({
    n: example.n, cx: example.c.re, cy: example.c.im,
    comparisonMode: 'collinear', rendererMode: 'boundary',
    boundaryDepth: depth, adaptiveBoundary: true,
    showCollinear: true, showDifference: false, showTrap: false,
    showEnclosure: false, showTree: false, showPath: false, showEscapeStrata: false,
    firstLevelPieces: true, palette: 'research', originalAttractorOpacity: PIECE_OPACITY,
    captureStyle: 'sets', modulo: 3,
    focusedPanel: 'dynamical',
    dynCenter: { x: 0, y: 0 }, dynZoom: spanX, backend: 'auto'
  }, DEFAULT_EXPLORER_STATE);
  const encoded = encodeExplorerState(state);
  assert.deepEqual(decodeExplorerState(encoded), state, 'Interactive links must roundtrip the complete state');
  return {
    interactive_url: `${EXPLORER_URL}#${encoded}`,
    interactive_rendering: {
      corresponding_view_only: true,
      renderer_mode: 'boundary',
      capture_style: 'sets',
      requested_boundary_depth: depth,
      adaptive_boundary: true,
      maximum_effective_boundary_depth: 100,
      boundary_work_per_piece: BOUNDARY_WORK,
      resource_cap_result: 'unresolved',
      note: 'This URL opens the same original-attractor view, palette and piece contours, with the figure depth as its starting depth. Interactive depth increases with zoom and raster resolution. The committed figure uses fixed-depth production CPU rendering; the explorer first attempts a GPU preview and then refines with the CPU renderer. Pixel footprints depend on the live viewport resolution.'
    }
  };
}

function plot(example) {
  const { c, n } = example;
  const depth = n === 2 ? 16 : 12;
  const bounds = attractorBounds(c, n, { tol: 1e-9, maxTerms: 2000 });
  const halfWidth = 1.12 * Math.max(bounds.xMax, bounds.yMax * PLOT_WIDTH / PLOT_HEIGHT);
  const halfHeight = halfWidth * PLOT_HEIGHT / PLOT_WIDTH;
  const width = PLOT_WIDTH * RASTER_SCALE;
  const height = PLOT_HEIGHT * RASTER_SCALE;
  const pixelsPerUnit = width / (2 * halfWidth);
  const job = {
    kind: 'dynamical', width, height, center: { x: 0, y: 0 }, spanX: 2 * halfWidth,
    n, cx: c.re, cy: c.im, tol: 1e-8, kMax: 37, LMax: 1000,
    originalRenderer: 'boundary', showOriginalSurvival: true, showDifference: false,
    firstLevelPieces: true, originalOpacity: PIECE_OPACITY,
    captureStyle: 'sets', modulo: 3,
    escapeDepth: depth, boundaryWork: BOUNDARY_WORK
  };
  const prepared = prepareRasterJob(job);
  assert.ok(prepared.originalContext && !prepared.originalContext.error, 'The gallery requires a valid expanding parameter');
  const colors = { table: new Uint8Array(9 * 101 * 4), exterior: [255, 255, 255], branch: [66, 169, 149] };
  for (let code = 0; code < 9; code++) for (let level = 0; level <= 100; level++) {
    colors.table.set(code === RASTER_CODES.EXTERIOR ? [255, 255, 255, 255] : [230, 159, 0, 255],
      (code * 101 + level) * 4);
  }
  const rgba = Buffer.alloc(width * height * 4);
  const coverage = new Uint32Array(width * height);
  const codes = new Uint8Array(width * height);
  const counts = { captured: 0, finite_survivor: 0, exterior: 0, unresolved: 0, occupied: 0, outlined: 0, overlap: 0 };
  for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 64) {
    const tile = renderRasterTile(prepared, { x, y, width: Math.min(64, width - x), height: Math.min(16, height - y) });
    const pixels = colorizeRasterTile(tile.data, prepared.job, colors, tile.pieces, tile);
    for (let row = 0; row < tile.height; row++) for (let column = 0; column < tile.width; column++) {
      const local = row * tile.width + column;
      const index = (y + row) * width + x + column;
      const mask = tile.pieceMasks[(row + 1) * (tile.width + 2) + column + 1];
      const code = tile.data[local * 4 + 2];
      coverage[index] = mask;
      codes[index] = code;
      rgba.set(pixels.subarray(local * 4, local * 4 + 4), index * 4);
      if (code === RASTER_CODES.INTERIOR) counts.captured++;
      else if (code === RASTER_CODES.DEPTH_CAP) counts.finite_survivor++;
      else if (code === RASTER_CODES.EXTERIOR) counts.exterior++;
      else counts.unresolved++;
      if (mask) {
        counts.occupied++;
        if (mask & (mask - 1)) counts.overlap++;
        if (PIECE_OUTLINE_COLOR.every((value, channel) => rgba[index * 4 + channel] === value)) counts.outlined++;
      } else if (code === RASTER_CODES.EXTERIOR) {
        // Transparent exterior lets the SVG axes show through the open plane.
        rgba[index * 4 + 3] = 0;
      }
    }
  }
  assert.equal(counts.unresolved, 0, 'The committed examples must finish without work or arithmetic caps');
  assert.ok(counts.occupied > 0 && counts.outlined > 0, 'Each example must contain visible geometry and piece contours');
  const pixelAt = (re, im) => {
    const x = Math.floor((re + halfWidth) * pixelsPerUnit);
    const y = Math.floor((halfHeight - im) * pixelsPerUnit);
    assert.ok(x >= 0 && x < width && y >= 0 && y < height, 'Validation witness is inside the fitted view');
    return y * width + x;
  };
  // Independent exact witness: repeating digit n-1 gives (n-1)c/(c-1).
  // Also use a witness beyond the support disk of E/c, detecting the former
  // leading-1/c error in the actual displayed pixels, not just the labels.
  const denominator = (c.re - 1) ** 2 + c.im ** 2;
  const fixedRe = (n - 1) * (1 + (c.re - 1) / denominator);
  const fixedIm = -(n - 1) * c.im / denominator;
  const scaledSupportRadius = (n - 1) / (Math.hypot(c.re, c.im) - 1);
  const scaleWitness = example.id === 'e_c5_piece_overlap' ? [16 / 3, 8 / 3] : [fixedRe, fixedIm];
  assert.ok(Math.hypot(...scaleWitness) > scaledSupportRadius + 1 / pixelsPerUnit,
    'The coordinate witness must distinguish full E from E/c');
  assert.ok(coverage[pixelAt(fixedRe, fixedIm)] & (1 << (n - 1)),
    'The full-coordinate affine fixed point must be visible in its first-level piece');
  assert.ok(coverage[pixelAt(...scaleWitness)] & (1 << (n - 1)),
    'The full-coordinate witness beyond E/c must be visible in its first-level piece');
  for (let x = 0; x < width; x++) assert.equal(coverage[x] | coverage[(height - 1) * width + x], 0, 'Vertical plot padding must be clear');
  for (let y = 0; y < height; y++) assert.equal(coverage[y * width] | coverage[y * width + width - 1], 0, 'Horizontal plot padding must be clear');
  const checks = ['full-E witness beyond E/c support disk', 'affine fixed point in its first-level piece',
    'no work or arithmetic caps', 'clear fitted margins', 'independent piece contours'];
  if (example.id === 'e_c4_overlap') {
    for (const x of [-2, 0, 2]) {
      assert.equal(coverage[pixelAt(x, 0)], 0, 'The three main E4 holes must stay open');
      assert.equal(codes[pixelAt(x, 0)], RASTER_CODES.EXTERIOR, 'The E4 hole centers are exhausted by the escape search');
    }
    checks.push('E4 main holes at -2, 0, 2 remain exterior');
  }
  if (example.id === 'e_c5_plane_filling') {
    assert.ok(coverage[pixelAt(0, 0)], 'The central E5 tile is covered');
    checks.push('central E5 tile covered');
  }
  if (example.id === 'e_c5_piece_overlap') {
    assert.ok(prepared.originalContext.useTrap && counts.captured > 0, 'The rectangle example must exercise self-covering capture');
    assert.equal(coverage[pixelAt(1, .7)] & 12, 12, 'Both first pieces cover the overlap interior');
    for (const x of [2 / 3, 4 / 3]) {
      const index = pixelAt(x, .7);
      let outlined = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const offset = (index + dy * width + dx) * 4;
        if (PIECE_OUTLINE_COLOR.every((value, channel) => rgba[offset + channel] === value)) outlined = true;
      }
      assert.ok(outlined, 'Each exact rectangular piece edge remains black inside the overlap');
    }
    checks.push('E(2i,5) outer corner visible', 'canonical self-covering capture exercised',
      'both overlapping rectangle pieces retained', 'internal contours at 2/3 and 4/3 visible');
  }
  const png = encodePng(width, height, rgba);
  return {
    png,
    metadata: {
      id: example.id, label: example.label, source_example: example.source,
      ...interactiveView(example, 2 * halfWidth, depth),
      set: 'E(c,n)', n, parameter: { ...c, exact: example.exactParameter },
      parameter_convention: 'expanding-parameter', displayed_coordinate_scale: 1,
      digits: alphabet(n), maps: 'z -> t + z/c', inverse_maps: 'z -> c(z-t)',
      renderer: 'capture-escape-boundary', escape_depth: depth, capture_depth_limit: 37,
      capture_style: 'sets',
      boundary_work_per_piece: BOUNDARY_WORK, self_covering_trap_enabled: prepared.originalContext.useTrap,
      pixel_radius_world: Math.SQRT1_2 / pixelsPerUnit,
      first_level_piece_masks: true, uncertain_neighbor_guard: true, raster_halo: 1,
      random_sampling: false, seed: null,
      viewport: {
        center: { re: 0, im: 0 },
        x_min: -halfWidth, x_max: halfWidth, y_min: -halfHeight, y_max: halfHeight,
        svg_width: PLOT_WIDTH, svg_height: PLOT_HEIGHT,
        raster_width: width, raster_height: height, pixels_per_world_unit: pixelsPerUnit
      },
      support_bounds: bounds,
      first_level_colors: alphabet(n).map((digit, index) => ({ digit, color: colorForPiece(index) })),
      pixel_counts: counts, geometric_checks: checks, raster_sha256: sha256(png),
      visual_status: 'visual-approximation', proof_status: 'visual-approximation',
      connectedness_verdict: null, interior_verdict: null,
      limitations: 'Finite-depth pixel coverage and piece contours approximate geometry at the stated resolution. They are not exact set boundaries or connectedness/interior certificates. Resource and arithmetic caps remain unresolved, and overlaps depend on raster resolution.'
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
    <text x="${originX}" y="400" text-anchor="middle" class="axis">Re z</text>
    <text x="${originX + 7}" y="${plotY + 10}" class="axis">Im z</text>
    ${legend}
  </g>`;
}

function capturePlot(specification) {
  const width = PLOT_WIDTH * RASTER_SCALE;
  const height = PLOT_HEIGHT * RASTER_SCALE;
  const { center, spanX, n, kind } = specification;
  const depth = 12;
  const input = {
    kind, n, width, height, center, spanX, escapeDepth: depth,
    boundaryWork: BOUNDARY_WORK, kMax: depth, LMax: 1000, tol: 1e-8,
    captureStyle: 'depth', modulo: 3,
    parameterLayers: specification.layers ?? [], parameterDigits: specification.digits ?? [],
    cx: 0, cy: 2, originalRenderer: 'boundary', firstLevelPieces: true,
    showOriginalSurvival: kind === 'dynamical', showDifference: false,
    originalOpacity: 1
  };
  const prepared = prepareRasterJob(input);
  const table = new Uint8Array(9 * 101 * 4);
  for (let code = 0; code < 9; code++) for (let level = 0; level <= 100; level++) {
    table.set(code === RASTER_CODES.EXTERIOR ? [255, 255, 255, 255]
      : code === RASTER_CODES.DEPTH_CAP ? [190, 200, 215, 255]
        : code === RASTER_CODES.INTERIOR ? [105, 123, 152, 255]
          : [225, 229, 235, 255], (code * 101 + level) * 4);
  }
  const colors = { table, exterior: [255, 255, 255], branch: [66, 169, 149] };
  const rgba = Buffer.alloc(width * height * 4);
  const minima = new Uint8Array(width * height).fill(255);
  const coverageCodes = new Uint8Array(width * height);
  const minimumCounts = {};
  const coverageCounts = {};
  let outlines = 0;
  for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 64) {
    const tile = renderRasterTile(prepared, { x, y, width: Math.min(64, width - x), height: Math.min(16, height - y) });
    const pixels = colorizeRasterTile(tile.data, prepared.job, colors, tile.pieces, tile);
    for (let row = 0; row < tile.height; row++) for (let column = 0; column < tile.width; column++) {
      const local = row * tile.width + column;
      const index = (y + row) * width + x + column;
      const minimum = kind === 'parameter' ? tile.layerCaptureDepths[local]
        : tile.captureDepths[local * 2 + 1];
      const code = kind === 'parameter' ? tile.layerData[local * 2] : tile.data[local * 4 + 2];
      minima[index] = minimum;
      coverageCodes[index] = code;
      minimumCounts[minimum] = (minimumCounts[minimum] ?? 0) + 1;
      coverageCounts[code] = (coverageCounts[code] ?? 0) + 1;
      rgba.set(pixels.subarray(local * 4, local * 4 + 4), index * 4);
      if (PIECE_OUTLINE_COLOR.every((value, channel) => rgba[index * 4 + channel] === value)) outlines++;
      if (code === RASTER_CODES.EXTERIOR && minimum === 255) rgba[index * 4 + 3] = 0;
    }
  }
  const observedLevels = Object.keys(minimumCounts).map(Number).filter(value => value !== 255).sort((a, b) => a - b);
  assert.ok(observedLevels.length >= 3, 'Each capture panel must contain multiple computed levels');
  assert.ok((coverageCounts[RASTER_CODES.EXTERIOR] ?? 0) > 0, 'Each capture panel must retain visible exterior');
  assert.equal(coverageCounts[RASTER_CODES.OFF_LENS] ?? 0, 0, 'No historical off-lens captures in current figures');
  const checks = ['multiple minimum-capture levels computed independently of coverage',
    'coverage and center capture stored separately', 'no historical off-lens acceptance'];
  if (kind === 'parameter') {
    assert.ok((coverageCounts[RASTER_CODES.DEPTH_CAP] ?? 0) > 0, 'Parameter figures retain finite cell coverage');
    if (specification.digits?.length) {
      assert.equal(minimumCounts[0] ?? 0, 0, 'Required first digit cannot capture at level zero');
      checks.push('forced first digit counts as one step; original alphabet tail');
    } else {
      assert.ok((minimumCounts[0] ?? 0) > 0, 'The full locus includes its base capture set');
      checks.push('unrestricted base capture level zero retained');
    }
  } else {
    assert.ok(outlines > 0, 'Capture shading must preserve black piece contours');
    const context = createAttractorMembershipContext(0, 2, 5);
    const fixturePoints = [[0, 0, 0], [5.1, 0, 1], [0, 2.55, 2]];
    for (const [zx, zy, expected] of fixturePoints) {
      const result = classifyAttractorCapture(context, zx, zy, depth, { maxWork: BOUNDARY_WORK });
      assert.equal(result.minimumCaptureDepth, expected, 'Exact rectangle fixture must keep its capture level');
      const px = Math.floor((zx - center.x + spanX / 2) * width / spanX);
      const py = Math.floor((center.y + spanX * height / width / 2 - zy) * width / spanX);
      assert.equal(minima[py * width + px], expected, 'Displayed rectangle samples must match fixture levels');
    }
    checks.push('E(2i,5) fixture minima 0, 1, 2', 'black contours preserved under capture shading');
  }
  const state = normalizeExplorerState({
    n, cx: kind === 'dynamical' ? 0 : center.x, cy: kind === 'dynamical' ? 2 : center.y,
    comparisonMode: 'collinear', rendererMode: 'boundary', boundaryDepth: depth,
    adaptiveBoundary: true, captureStyle: 'depth', modulo: 3, kMax: depth,
    parameterLayers: specification.layers ?? ['mn'], parameterDigits: specification.digits ?? [],
    firstLevelPieces: true, originalAttractorOpacity: 1, palette: 'research',
    showCollinear: true, showDifference: false, showTrap: false, showEnclosure: false,
    showTree: false, showPath: false, showEscapeStrata: false,
    focusedPanel: kind, backend: 'auto',
    ...(kind === 'parameter' ? { paramCenter: center, paramZoom: spanX }
      : { dynCenter: center, dynZoom: spanX })
  }, DEFAULT_EXPLORER_STATE);
  const encoded = encodeExplorerState(state);
  assert.deepEqual(decodeExplorerState(encoded), state, 'Capture link must preserve its complete state');
  const png = encodePng(width, height, rgba);
  return {
    png,
    metadata: {
      id: specification.id, set: specification.set, kind, n,
      parameter: kind === 'dynamical' ? { re: 0, im: 2, exact: '2i' } : null,
      parameter_layers: specification.layers ?? [], parameter_digits: specification.digits ?? [],
      viewport: { center, span_x: spanX, span_y: spanX * height / width, width, height },
      coordinate_convention: 'expanding-parameter; original unscaled E(c,n) dynamical coordinates',
      capture_style: 'depth', capture_modulo: 3, capture_sampling: 'pixel-center',
      capture_search: 'iterative-deepening-with-independent-work-budget',
      minimum_depth_unknown: 255, minimum_depth_counts: minimumCounts,
      observed_minimum_depths: observedLevels, capture_depth_limit: depth, capture_work: BOUNDARY_WORK,
      coverage_sampling: kind === 'parameter' ? 'complex-taylor-parameter-disk' : 'pixel-footprint',
      geometric_radius_world: Math.SQRT1_2 * spanX / width,
      coverage_codes: RASTER_CODES, coverage_code_counts: coverageCounts,
      escape_depth: depth, boundary_work: BOUNDARY_WORK,
      first_level_piece_masks: kind === 'dynamical', outlined_pixels: outlines,
      fixture_checks: checks, raster_sha256: sha256(png),
      interactive_url: `${EXPLORER_URL}#${encoded}`,
      interactive_note: 'Same view and shading; capture depth limit12, boundary depth starts at12 and adapts with zoom/resolution. The figure uses fixed-depth binary64 CPU rendering.',
      proof_status: 'visual-approximation',
      limitations: 'A minimum describes a completed numerical search at the pixel center, not the full geometric cell or an interval-certified theorem. Coverage can remain unresolved or survive without a center capture.'
    }
  };
}

function capturePanel(specification, result, index) {
  const x = 24 + index * 390;
  const plotX = x + 20;
  const plotY = 166;
  const { center, span_x: spanX, span_y: spanY } = result.metadata.viewport;
  const baseHex = specification.kind === 'parameter'
    ? parameterLayerColor(specification.layers?.[0] ?? `digit:${specification.digits[0]}`, specification.n)
    : colorForPiece(0);
  const rgb = hexToRgb(baseHex);
  const base = [rgb.r, rgb.g, rgb.b];
  const shade = level => `rgb(${captureShade(base, 1, level, { captureStyle: 'depth', modulo: 3 }).map(Math.round).join(',')})`;
  const legend = [0, 1, 2].map(level => `<rect x="${x + 21 + level * 82}" y="418" width="16" height="12" rx="2" fill="${shade(level)}"/><text x="${x + 44 + level * 82}" y="429" class="key">${level} mod 3</text>`).join('');
  const extent = value => rounded(value).toFixed(2).replace('-', '−');
  const axes = specification.kind === 'parameter' ? ['Re c', 'Im c'] : ['Re z', 'Im z'];
  return `<g aria-label="${xml(specification.description)}">
    <rect x="${x}" y="94" width="372" height="371" rx="13" fill="#fff" stroke="#dbe3ec"/>
    <text x="${x + 20}" y="126" class="set">${specification.heading}</text>
    <text x="${x + 352}" y="122" text-anchor="end" class="tag">${xml(specification.tag)}</text>
    <text x="${x + 20}" y="150" class="parameter">${xml(specification.subtitle)}</text>
    <image x="${plotX}" y="${plotY}" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" xlink:href="data:image/png;base64,${result.png.toString('base64')}"/>
    <rect x="${plotX}" y="${plotY}" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" fill="none" stroke="#d5dfe8" stroke-width=".7"/>
    <text x="${plotX}" y="402" class="extent">${extent(center.x - spanX / 2)}</text>
    <text x="${plotX + PLOT_WIDTH}" y="402" text-anchor="end" class="extent">${extent(center.x + spanX / 2)}</text>
    <text x="${plotX + PLOT_WIDTH / 2}" y="402" text-anchor="middle" class="axis">${axes[0]}</text>
    <text transform="translate(${plotX - 6} ${plotY + PLOT_HEIGHT / 2}) rotate(-90)" text-anchor="middle" class="extent">${axes[1]}: ${extent(center.y - spanY / 2)} to ${extent(center.y + spanY / 2)}</text>
    ${legend}
    <text x="${x + 20}" y="452" class="key">${xml(specification.note)}</text>
  </g>`;
}

const captureSpecifications = [
  {
    id: 'mn3_capture', set: 'M_3', kind: 'parameter', n: 3, layers: ['mn'], digits: [],
    center: { x: .9, y: 1.6 }, spanX: 1.8,
    heading: 'M<tspan baseline-shift="sub" font-size="16">3</tspan>', tag: 'CONNECTEDNESS',
    subtitle: '2c ∈ E(c,5)', note: 'Base capture and successive inverse levels',
    description: 'M3 parameter cells with minimum capture of 2c in the five-map difference attractor.'
  },
  {
    id: 'f5_0_capture', set: 'F_(5,0)', kind: 'parameter', n: 5, layers: [], digits: [0],
    center: { x: .75, y: 1.67 }, spanX: 2,
    heading: 'F<tspan baseline-shift="sub" font-size="16">5,0</tspan>', tag: 'FIXED FIRST DIGIT',
    subtitle: 'c ∈ 0 + E(c,5)/c', note: 'First digit 0; every later digit belongs to A₅',
    description: 'The F5,0 parameter subset with first digit0 and original A5 tail; minimum capture begins at one.'
  },
  {
    id: 'e2i5_capture', set: 'E(2i,5)', kind: 'dynamical', n: 5,
    center: { x: 0, y: 0 }, spanX: 11.95,
    heading: 'E(2i,5)', tag: 'DYNAMICAL PLANE',
    subtitle: 'Five overlapping rectangular pieces', note: 'Whole-set depth starts at 0; piece edges stay black',
    description: 'E(2i,5) with minimum center capture levels and black contours around every overlapping first-level piece.'
  }
];

const examples = [
  await preset('e_c4_overlap', 'OVERLAP PRESET', 'c = (3 + i√11)/2'),
  await preset('e_c5_plane_filling', 'PLANE-FILLING PRESET', 'c = 1 + 2i'),
  {
    id: 'e_c5_piece_overlap', label: 'OVERLAPPING PIECES', parameterLabel: 'c = 2i',
    source: null, n: 5, c: { re: 0, im: 2 }, exactParameter: '2i'
  }
];
const results = examples.map(plot);
const captureResults = captureSpecifications.map(capturePlot);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="525" viewBox="0 0 1200 525" role="img" aria-labelledby="gallery-title gallery-description">
  <title id="gallery-title">Three collinear attractors in their original coordinates</title>
  <desc id="gallery-description">Original E(c,n), using f_t(z)=t+z/c, depth-twelve capture/escape coverage and independently outlined first-level pieces. Left: n=4, c=(3+i sqrt(11))/2. Middle: n=5, c=1+2i. Right: the overlapping rectangular pieces of n=5, c=2i. Colors identify the first digit and blend in overlaps; black contours trace every first-level piece. Each panel has an independently fitted view. These finite-resolution visual approximations are not proof records.</desc>
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
  <text x="24" y="67" font-size="16" fill="#536b80">One affine rule: f<tspan baseline-shift="sub" font-size="11">t</tspan>(z) = t + z/c. Colors identify the outermost digit t; black contours remain visible in overlaps.</text>
  ${examples.map((example, index) => panel(example, results[index], index)).join('\n')}
  <text x="24" y="478" font-size="14" fill="#52677b">Full E(c,n) coordinates · production boundary renderer · depth 12 · independent piece contours</text>
  <text x="24" y="502" font-size="13" fill="#52677b">Finite-resolution coverage with blended overlap colors. Linked explorer views increase detail as you zoom.</text>
</svg>
`;
assert.ok(Buffer.byteLength(svg) < 500000, 'Keep the embedded README gallery under 500 kB');
const sourceModules = [
  'src/math/alphabets.mjs', 'src/math/attractor_bounds.mjs', 'src/math/complex.mjs',
  'src/math/validation.mjs', 'src/math/connectedness_regions.mjs', 'src/compute/attractor_membership.mjs',
  'src/compute/inverse_search_kernel.mjs', 'src/compute/inverse_search_reference.mjs',
  'src/compute/parameter_views.mjs', 'src/compute/raster_jobs.mjs', 'src/compute/tree_guidance.mjs',
  'src/renderers/palettes.mjs', 'src/renderers/hybrid_renderer.mjs',
  'src/state/explorer_state.mjs'
];
const moduleHashes = Object.fromEntries(await Promise.all(sourceModules.map(async source =>
  [source, sha256(await readFile(join(ROOT, source)))])));
const metadata = {
  schema_version: '3.0.0', artifact: SVG_PATH, artifact_sha256: sha256(svg),
  title: 'Three collinear attractors in their original coordinates',
  generator: 'tools/docs/generate_attractor_examples.mjs',
  regenerate: 'node tools/docs/generate_attractor_examples.mjs',
  verify: 'node tools/docs/generate_attractor_examples.mjs --check',
  source_modules_sha256: moduleHashes,
  generator_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  svg_size: { width: 1200, height: 525 },
  arithmetic: 'binary64', sampling: 'capture-escape-pixel-footprints',
  rasterization: {
    png: 'RGBA8, PNG filter 0, zlib level 9',
    resolution_scale: RASTER_SCALE,
    pixel_rule: 'disk enclosing each raster pixel; radius equals its half-diagonal',
    compositing: 'mean colors of all occupied first-level pieces, then black contours on each piece',
    outline_color: PIECE_OUTLINE_COLOR, outline_width_raster_pixels: 1,
    outline_rule: 'occupied piece absent in a cardinal neighbor, except unresolved neighbors',
    tile_halo_raster_pixels: 1,
    first_level_piece_opacity: PIECE_OPACITY
  },
  capture_style: 'sets',
  proof_status: 'visual-approximation', rounding_verified: false,
  examples: results.map(result => result.metadata)
};
const captureSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="575" viewBox="0 0 1200 575" role="img" aria-labelledby="capture-title capture-description">
  <title id="capture-title">Finite capture in parameter and dynamical planes</title>
  <desc id="capture-description">Three independently computed binary64 production rasters: M3, the fixed-first-digit subset F5,0, and E(2i,5). Shade cycles by the minimum inverse depth at each pixel center. Geometric parameter-cell or dynamical-footprint coverage remains separate and pale when it survives without capture. E(2i,5) retains the color and black boundary of every first-level piece. Minimum depths are numerical search results, not full-cell or interval certificates.</desc>
  <style>
    text { font-family: Arial, Helvetica, sans-serif; fill: #183047; }
    .set { font-family: Georgia, 'Times New Roman', serif; font-size: 25px; font-style: italic; }
    .parameter { font-family: Georgia, 'Times New Roman', serif; font-size: 18px; fill: #385268; }
    .tag { font-size: 10px; letter-spacing: .7px; font-weight: 700; fill: #63778b; }
    .axis { font-size: 12px; fill: #52677b; font-style: italic; }
    .extent { font-size: 11px; fill: #52677b; }
    .key { font-size: 11px; fill: #52677b; }
  </style>
  <rect width="1200" height="575" rx="18" fill="#f5f8fc"/>
  <text x="24" y="38" font-size="26" font-weight="700">Finite capture in parameter and dynamical planes</text>
  <text x="24" y="67" font-size="16" fill="#536b80">Shade records minimum inverse depth at the pixel center. Whole-pixel coverage keeps the fine structure visible.</text>
  ${captureSpecifications.map((specification, index) => capturePanel(specification, captureResults[index], index)).join('\n')}
  <text x="24" y="495" font-size="14" fill="#52677b">Dark bands: minimum capture depth mod 3 · solid hue: capture with minimum unconfirmed · pale hue: finite escape coverage</text>
  <text x="24" y="521" font-size="13" fill="#52677b">Capture limit 12 · escape depth 12 · canonical strict-lens capture only · fixed first digits count as one step</text>
  <text x="24" y="547" font-size="13" fill="#52677b">Inside the original lens: M⁰ₙ captures at 0, M¹ₙ at 1. Individual first digits can require later capture.</text>
</svg>
`;
assert.ok(Buffer.byteLength(captureSvg) < 500000, 'Keep the capture figure under 500 kB');
const captureMetadata = {
  schema_version: '1.0.0', artifact: CAPTURE_SVG_PATH, artifact_sha256: sha256(captureSvg),
  title: 'Finite capture in parameter and dynamical planes',
  generator: metadata.generator, regenerate: metadata.regenerate, verify: metadata.verify,
  generator_sha256: metadata.generator_sha256, source_modules_sha256: moduleHashes,
  svg_size: { width: 1200, height: 575 }, arithmetic: 'binary64', rounding_verified: false,
  proof_status: 'visual-approximation',
  mathematical_reference: 'https://arxiv.org/html/2603.07397v1',
  capture_field: 'Minimum inverse depth to the canonical trap at each pixel center, with all shallower numerical searches completed before a minimum is assigned.',
  coverage_field: 'Separate finite parameter-cell or dynamical-footprint search; capture of a center is not capture of the full cell.',
  shade_encoding: { modulo: 3, known_minimum_rgb_scale: '.6+.3*(depth%3)/2',
    witness_unknown_minimum: 'base hue', finite_survivor: '72% base hue +28% white' },
  panels: captureResults.map(result => result.metadata)
};
const files = [[SVG_PATH, svg], [JSON_PATH, `${JSON.stringify(metadata, null, 2)}\n`],
  [CAPTURE_SVG_PATH, captureSvg], [CAPTURE_JSON_PATH, `${JSON.stringify(captureMetadata, null, 2)}\n`]];
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
console.log(`${CHECK ? 'Verified' : 'Generated'} ${CAPTURE_SVG_PATH} (${Buffer.byteLength(captureSvg)} bytes), ${CAPTURE_JSON_PATH}`);
