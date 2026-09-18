import { createInverseSearchContext, inverseSearchPointFast } from './inverse_search_kernel.mjs';
import { inLens, validateSearchLimits } from './inverse_search_reference.mjs';
import { classifyParameterView, normalizeMembershipLimits, normalizeParameterViewMode } from './parameter_views.mjs';
import { createAttractorMembershipContext, classifyAttractorPoint } from './attractor_membership.mjs';
import { assertArity, assertFiniteNumber, assertInteger, assertPositiveNumber } from '../math/validation.mjs';

/** Display records, never proof records. RGBA bytes carry two [code, depth] pairs. */
export const RASTER_CODES = Object.freeze({
  EXTERIOR: 0,
  INTERIOR: 1,
  OFF_LENS: 2,
  DEPTH_CAP: 3,
  NODE_CAP: 4,
  OUTSIDE_DOMAIN: 5,
  NUMERICAL_RANGE: 6,
  WORK_CAP: 7,
  PRECISION: 8
});

export const MAX_RASTER_DIMENSION = 16384;
export const MAX_RASTER_TILE_PIXELS = 16384;
const EMPTY_RESULT = Object.freeze({ verdict: 'Exterior', depth: 0, stopReason: 'enclosure-escape' });
const RANGE_RESULT = Object.freeze({ verdict: 'Undetermined', depth: 0, stopReason: 'numerical-range' });
const STOP_CODES = Object.freeze({
  'depth-cap': RASTER_CODES.DEPTH_CAP,
  'node-cap': RASTER_CODES.NODE_CAP,
  'outside-domain': RASTER_CODES.OUTSIDE_DOMAIN,
  'numerical-range': RASTER_CODES.NUMERICAL_RANGE,
  'work-cap': RASTER_CODES.WORK_CAP,
  'stack-cap': RASTER_CODES.WORK_CAP,
  'precision-limit': RASTER_CODES.PRECISION
});

export function rasterResultCode(result) {
  if (result.verdict === 'Exterior') return RASTER_CODES.EXTERIOR;
  if (result.verdict === 'Interior') return RASTER_CODES.INTERIOR;
  if (result.verdict === 'Interior-offLens') return RASTER_CODES.OFF_LENS;
  if (result.verdict === 'Undetermined' && Object.hasOwn(STOP_CODES, result.stopReason)) {
    return STOP_CODES[result.stopReason];
  }
  throw new TypeError(`Unsupported raster search result: ${result.verdict}/${result.stopReason}`);
}

/** Validate a small serializable job; never allocate a full-frame pixel buffer. */
export function normalizeRasterJob(input) {
  if (!input || typeof input !== 'object') throw new TypeError('raster job must be an object');
  if (input.kind !== 'parameter' && input.kind !== 'dynamical') {
    throw new RangeError('raster kind must be parameter or dynamical');
  }
  assertInteger(input.width, 'width', 1, MAX_RASTER_DIMENSION);
  assertInteger(input.height, 'height', 1, MAX_RASTER_DIMENSION);
  assertFiniteNumber(input.center?.x, 'center.x');
  assertFiniteNumber(input.center?.y, 'center.y');
  assertPositiveNumber(input.spanX, 'spanX');
  assertArity(input.n);
  const kMax = input.kMax ?? 37;
  const LMax = input.LMax ?? 1000;
  const tol = input.tol ?? 1e-8;
  validateSearchLimits(kMax, LMax);
  // The record has exactly one depth byte. Reject rather than wrap a deep result.
  assertInteger(kMax, 'raster kMax', 0, 255);
  // Match the browser frontier ceiling and bound each worker's reusable queues.
  assertInteger(LMax, 'raster LMax', 1, 10000);
  assertPositiveNumber(tol, 'tol');
  const parameterMode = normalizeParameterViewMode(input.parameterMode);
  const { escapeDepth, boundaryWork } = normalizeMembershipLimits(input.n, input);
  const originalRenderer = input.originalRenderer ?? 'boundary';
  if (!['boundary', 'survival'].includes(originalRenderer)) throw new RangeError('invalid originalRenderer');
  const firstLevelPieces = input.firstLevelPieces ?? true;
  if (typeof firstLevelPieces !== 'boolean') throw new TypeError('firstLevelPieces must be boolean');
  const originalOpacity = input.originalOpacity ?? 1;
  assertFiniteNumber(originalOpacity, 'originalOpacity');
  if (originalOpacity < 0 || originalOpacity > 1) throw new RangeError('originalOpacity must be between 0 and 1');
  const cx = input.kind === 'dynamical' ? input.cx : (input.cx ?? 0);
  const cy = input.kind === 'dynamical' ? input.cy : (input.cy ?? 0);
  assertFiniteNumber(cx, 'cx');
  assertFiniteNumber(cy, 'cy');
  const survivalOpacity = input.survivalOpacity ?? 0.45;
  assertFiniteNumber(survivalOpacity, 'survivalOpacity');
  if (survivalOpacity < 0 || survivalOpacity > 1) throw new RangeError('survivalOpacity must be between 0 and 1');
  return Object.freeze({
    kind: input.kind, width: input.width, height: input.height,
    center: Object.freeze({ x: input.center.x, y: input.center.y }), spanX: input.spanX,
    n: input.n, cx, cy, kMax, LMax, tol, parameterMode,
    showDifference: input.showDifference === true,
    showOriginalSurvival: input.showOriginalSurvival === true,
    showEscapeStrata: input.showEscapeStrata === true,
    survivalOpacity, escapeDepth, boundaryWork, originalRenderer, firstLevelPieces, originalOpacity
  });
}

/** Dynamical enclosure/trap construction happens once per prepared job. */
export function prepareRasterJob(input) {
  const job = normalizeRasterJob(input);
  let differenceContext = null;
  let originalContext = null;
  if (job.kind === 'dynamical') {
    const context = (m, lens, useTrap) => {
      try {
        const value = createInverseSearchContext(job.cx, job.cy, m, lens, job.tol, { useTrap });
        return value.error ? null : value;
      } catch (error) {
        // Overflow in computed trap widths must leave an invalid dynamical view
        // clear, as the synchronous renderer does. Input validation is above.
        if (error instanceof RangeError || error instanceof TypeError) return null;
        throw error;
      }
    };
    if (job.showDifference) {
      differenceContext = context(2 * job.n - 1, inLens(job.cx, job.cy, job.n), true);
    }
    if (job.showOriginalSurvival) {
      if (job.originalRenderer === 'survival') originalContext = context(job.n, false, false);
      else {
        const value = createAttractorMembershipContext(job.cx, job.cy, job.n, job.tol);
        originalContext = value.error ? null : value;
      }
    }
  }
  return { job, differenceContext, originalContext };
}

function validateTile(job, tile) {
  if (!tile || typeof tile !== 'object') throw new TypeError('tile must be an object');
  assertInteger(tile.x, 'tile.x', 0, job.width - 1);
  assertInteger(tile.y, 'tile.y', 0, job.height - 1);
  assertInteger(tile.width, 'tile.width', 1, job.width - tile.x);
  assertInteger(tile.height, 'tile.height', 1, job.height - tile.y);
  if (tile.width * tile.height > MAX_RASTER_TILE_PIXELS) throw new RangeError('raster tile is too large');
}

function writeResult(data, offset, result) {
  data[offset] = rasterResultCode(result);
  data[offset + 1] = result.depth;
}

function writePiece(pieces, offset, result) {
  if (!pieces) return;
  const index = result.firstLevelIndex;
  // Zero means unavailable. Do not wrap indices beyond this byte-sized format.
  pieces[offset] = Number.isInteger(index) && index >= 0 && index < 255 ? index + 1 : 0;
}

/**
 * Compute one bounded tile in row-major order. Coordinates are full-frame pixel
 * centers, independent of tile boundaries. Parameter compare uses M_n/M_n^0;
 * dynamics uses 2z in E(c,2n-1) / z in E(c,n). Original boundary rendering uses
 * the dedicated membership classifier with a pixel footprint; explicit survival
 * retains the older point-based, trap-disabled diagnostic.
 * Palette, opacity, and escape-strata color interpretation belong to the caller.
 */
export function renderRasterTile(prepared, tile) {
  const { job, differenceContext, originalContext } = prepared;
  validateTile(job, tile);
  const data = new Uint8Array(4 * tile.width * tile.height);
  const output = { x: tile.x, y: tile.y, width: tile.width, height: tile.height, data };
  const pieces = job.firstLevelPieces ? new Uint8Array(2 * tile.width * tile.height) : null;
  if (pieces) output.pieces = pieces;
  if (job.kind === 'dynamical' && !differenceContext && !originalContext) return output;
  const { center, spanX, width, height, n, kMax, LMax, tol, parameterMode, escapeDepth, boundaryWork } = job;
  const pixelRadius = Math.SQRT1_2 * spanX / width;
  const membershipOptions = { escapeDepth, boundaryWork };
  const boundaryOptions = { firstStep: 'original', maxWork: boundaryWork,
    firstLevelPieces: job.firstLevelPieces, pixelRadius };
  for (let row = 0; row < tile.height; row++) {
    const py = tile.y + row;
    const y = center.y + (0.5 - (py + 0.5) / height) * spanX * height / width;
    for (let column = 0; column < tile.width; column++) {
      const px = tile.x + column;
      const x = center.x + ((px + 0.5) / width - 0.5) * spanX;
      const offset = 4 * (row * tile.width + column);
      const finite = Number.isFinite(x) && Number.isFinite(y);
      if (job.kind === 'parameter') {
        if (!finite) {
          writeResult(data, offset, RANGE_RESULT);
          if (parameterMode === 'compare') writeResult(data, offset + 2, RANGE_RESULT);
          continue;
        }
        const result = classifyParameterView(x, y, n, kMax, LMax, tol, parameterMode, membershipOptions);
        writeResult(data, offset, result);
        writePiece(pieces, offset / 2, result);
        if (parameterMode === 'compare') {
          writeResult(data, offset + 2, result.mn0);
          writePiece(pieces, offset / 2 + 1, result.mn0);
        }
      } else {
        if (differenceContext) {
          const result = finite && Number.isFinite(2 * x) && Number.isFinite(2 * y)
            ? inverseSearchPointFast(differenceContext, 2 * x, 2 * y, kMax, LMax) : RANGE_RESULT;
          writeResult(data, offset, result);
        } else writeResult(data, offset, EMPTY_RESULT);
        if (originalContext) {
          const result = !finite ? RANGE_RESULT : job.originalRenderer === 'survival'
            ? inverseSearchPointFast(originalContext, x, y, kMax, LMax)
            : classifyAttractorPoint(originalContext, x, y, escapeDepth, boundaryOptions);
          writeResult(data, offset + 2, result);
          writePiece(pieces, offset / 2 + 1, result);
        }
      }
    }
  }
  return output;
}
