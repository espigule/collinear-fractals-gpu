/**
 * Validated, DOM-independent state for the browser explorer.
 *
 * Existing URL keys remain compatible. New links also retain the enclosure
 * tolerance, survival-overlay opacity, focused panel, custom palette, and
 * requested rendering backend and adaptive boundary settings. The historical
 * parameter mode rn imports as mn0; only canonical names are emitted.
 * Backend preferences are portable; runtime
 * capability checks must not rewrite the user's requested setting.
 * Missing or invalid fields retain their defaults; finite out-of-range values
 * are clamped to browser work limits. Only explicitly supported own properties
 * are read, so URL parameters and imported JSON cannot alter object prototypes.
 */

export const DEFAULT_EXPLORER_STATE = Object.freeze({
  n: 3,
  kMax: 37,
  LMax: 1000,
  tol: 1e-8,
  modulo: 3,
  captureStyle: 'depth',
  cx: 0.5,
  cy: 1.1,
  showCollinear: false,
  showDifference: true,
  showTrap: true,
  showEnclosure: true,
  showTree: true,
  showPath: true,
  showEscapeStrata: false,
  parameterMode: 'mn',
  parameterLayers: Object.freeze(['mn']),
  parameterDigits: Object.freeze([]),
  backend: 'auto',
  comparisonMode: 'overlay',
  rendererMode: 'boundary',
  boundaryDepth: 0,
  adaptiveBoundary: true,
  attractorDepth: 7,
  histogramSeed: 20260227,
  histogramSamples: 50000,
  firstLevelPieces: true,
  originalAttractorOpacity: 1,
  survivalOverlayOpacity: 0.45,
  palette: 'research',
  customPalette: Object.freeze({
    interior: '#059669',
    offLens: '#2563eb',
    undetermined: '#fbbf24',
    exterior: '#ffffff'
  }),
  focusedPanel: 'both',
  paramCenter: Object.freeze({ x: 1.207, y: 1.207 }),
  paramZoom: 2.414,
  dynCenter: Object.freeze({ x: 0, y: 0 }),
  dynZoom: 8
});

// [state key, URL key, minimum, maximum, integer]
const NUMBER_FIELDS = [
  ['n', 'n', 2, 100, true],
  ['kMax', 'k', 0, 100, true],
  ['LMax', 'l', 1, 10000, true],
  ['tol', 'tol', 1e-15, 1e-2, false],
  ['modulo', 'q', 1, 12, true],
  ['cx', 'cx', -1e6, 1e6, false],
  ['cy', 'cy', -1e6, 1e6, false],
  ['paramZoom', 'pz', 1e-10, 1e6, false],
  ['dynZoom', 'dz', 1e-10, 1e6, false],
  // Zero requests automatic depth; the renderer resolves it for the view.
  ['boundaryDepth', 'bdepth', 0, 100, true],
  ['attractorDepth', 'adepth', 1, 12, true],
  ['histogramSeed', 'hseed', 1, 0xffffffff, true],
  ['histogramSamples', 'hsamples', 1000, 1000000, true],
  ['originalAttractorOpacity', 'aop', 0, 1, false],
  ['survivalOverlayOpacity', 'sop', 0, 1, false]
];

const CENTER_FIELDS = [
  ['paramCenter', 'pcx', 'pcy'],
  ['dynCenter', 'dcx', 'dcy']
];

const ENUM_FIELDS = [
  ['backend', 'backend', ['auto', 'gpu', 'cpu']],
  ['parameterMode', 'pm', ['mn', 'mn0', 'mn1', 'compare']],
  ['comparisonMode', 'mode', ['overlay', 'difference', 'collinear', 'escape']],
  ['rendererMode', 'renderer', ['boundary', 'prefix', 'histogram', 'survival']],
  ['palette', 'palette', ['research', 'print', 'contrast', 'custom']],
  ['captureStyle', 'capture', ['depth', 'sets']],
  ['focusedPanel', 'focus', ['both', 'parameter', 'dynamical']]
];

const BOOLEAN_FIELDS = [
  ['firstLevelPieces', 'pieces'],
  ['adaptiveBoundary', 'badapt']
];

const COLOR_FIELDS = [
  ['interior', 'ci'],
  ['offLens', 'co'],
  ['undetermined', 'cu'],
  ['exterior', 'ce']
];

// This ordering is part of the public link format; preserve it for old links.
const LAYER_FIELDS = [
  'showDifference',
  'showCollinear',
  'showTrap',
  'showEnclosure',
  'showTree',
  'showPath',
  'showEscapeStrata'
];

const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const PARAMETER_LAYER_NAMES = Object.freeze(['mn', 'mn0', 'mn1']);

/** The historical comparison contained M_n and M_n^0 only. */
export function parameterLayersForMode(mode) {
  if (mode === 'compare') return ['mn', 'mn0'];
  if (mode === 'rn') return ['mn0'];
  return [PARAMETER_LAYER_NAMES.includes(mode) ? mode : 'mn'];
}

/** Compatibility field for older consumers; the arrays retain every selection. */
export function parameterModeForSelection(layers, digits = []) {
  return layers.length === 1 && digits.length === 0 ? layers[0] : 'compare';
}

function arrayValues(value, maximumLength) {
  if (!Array.isArray(value)) return undefined;
  const values = [];
  for (let index = 0; index < Math.min(value.length, maximumLength); index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    // Imported JavaScript objects receive the same accessor protection as state.
    if (property && Object.hasOwn(property, 'value')) values.push(property.value);
  }
  return values;
}

/** Stable ordering keeps links, worker jobs, and visual compositing reproducible. */
export function normalizeParameterLayers(value, fallback = ['mn']) {
  const values = arrayValues(value, 199);
  return PARAMETER_LAYER_NAMES.filter(layer => (values ?? fallback).includes(layer));
}

/** Independent first digits belong to D_n = {1-n, ..., n-1}; no bit-width limit. */
export function normalizeParameterDigits(value, n, fallback = []) {
  const values = arrayValues(value, 199) ?? fallback;
  return [...new Set(values.filter(digit => Number.isInteger(digit) && digit >= 1 - n && digit <= n - 1))]
    .sort((a, b) => a - b);
}

function ownValue(object, key) {
  if (object === null || typeof object !== 'object' || Array.isArray(object)) return undefined;
  const property = Object.getOwnPropertyDescriptor(object, key);
  // Do not invoke accessors or inherit values from a supplied object's prototype.
  return property && Object.hasOwn(property, 'value') ? property.value : undefined;
}

function finiteNumber(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!DECIMAL_NUMBER.test(trimmed)) return undefined;
    value = Number(trimmed);
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boundedNumber(value, fallback, min, max, integer = false) {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return fallback;
  const number = integer ? Math.round(parsed) : parsed;
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function booleanValue(value, fallback) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return fallback;
}

function sanitizeState(input, fallback) {
  const result = {};
  for (const [key, , min, max, integer] of NUMBER_FIELDS) {
    result[key] = boundedNumber(ownValue(input, key), fallback[key], min, max, integer);
  }
  for (const [key] of CENTER_FIELDS) {
    const point = ownValue(input, key);
    result[key] = {
      x: boundedNumber(ownValue(point, 'x'), fallback[key].x, -1e6, 1e6),
      y: boundedNumber(ownValue(point, 'y'), fallback[key].y, -1e6, 1e6)
    };
  }
  for (const [key, , choices] of ENUM_FIELDS) {
    const supplied = ownValue(input, key);
    // Rn is the archived name for M_n^0, including in exported JSON state.
    const value = key === 'parameterMode' && supplied === 'rn' ? 'mn0' : supplied;
    result[key] = choices.includes(value) ? value : fallback[key];
  }
  const layers = ownValue(input, 'parameterLayers');
  const digits = ownValue(input, 'parameterDigits');
  const suppliedMode = ownValue(input, 'parameterMode');
  const hasLegacyMode = ['mn', 'mn0', 'mn1', 'compare', 'rn'].includes(suppliedMode);
  const legacyLayers = hasLegacyMode && !Array.isArray(layers);
  const legacySelection = legacyLayers && !Array.isArray(digits);
  result.parameterLayers = normalizeParameterLayers(layers, legacyLayers
    ? parameterLayersForMode(suppliedMode) : fallback.parameterLayers);
  result.parameterDigits = normalizeParameterDigits(digits, result.n, legacySelection ? [] : fallback.parameterDigits);
  result.parameterMode = parameterModeForSelection(result.parameterLayers, result.parameterDigits);
  for (const key of [...LAYER_FIELDS, ...BOOLEAN_FIELDS.map(([key]) => key)]) {
    result[key] = booleanValue(ownValue(input, key), fallback[key]);
  }
  const colors = ownValue(input, 'customPalette');
  result.customPalette = {};
  for (const [key] of COLOR_FIELDS) {
    const value = ownValue(colors, key);
    result.customPalette[key] = typeof value === 'string' && value.length === 7 && HEX_COLOR.test(value)
      ? value.toLowerCase()
      : fallback.customPalette[key];
  }
  return result;
}

/** Return a fresh supported state, retaining valid defaults for omitted fields. */
export function normalizeExplorerState(state, defaults = DEFAULT_EXPLORER_STATE) {
  const fallback = sanitizeState(defaults, DEFAULT_EXPLORER_STATE);
  return sanitizeState(state, fallback);
}

function numberToString(value) {
  // JavaScript's shortest decimal representation roundtrips without rounding.
  // Keep signed zero as well; trimming trailing zeroes corrupts exponents.
  return Object.is(value, -0) ? '-0' : String(value);
}

/** Encode all supported fields so a link reproduces the current view exactly. */
export function encodeExplorerState(state) {
  const normalized = normalizeExplorerState(state);
  const params = new URLSearchParams();
  for (const [key, urlKey] of NUMBER_FIELDS) {
    params.set(urlKey, numberToString(normalized[key]));
  }
  for (const [key, xKey, yKey] of CENTER_FIELDS) {
    params.set(xKey, numberToString(normalized[key].x));
    params.set(yKey, numberToString(normalized[key].y));
  }
  for (const [key, urlKey] of ENUM_FIELDS) params.set(urlKey, normalized[key]);
  params.set('pl', normalized.parameterLayers.join(','));
  params.set('pd', normalized.parameterDigits.join(','));
  for (const [key, urlKey] of BOOLEAN_FIELDS) params.set(urlKey, normalized[key] ? '1' : '0');
  params.set('layers', LAYER_FIELDS.map(key => normalized[key] ? '1' : '0').join(''));
  for (const [key, urlKey] of COLOR_FIELDS) params.set(urlKey, normalized.customPalette[key]);
  return params;
}

/**
 * Decode a location.hash, a bare query string, or a URLSearchParams instance.
 * Unknown parameters are ignored. A malformed layer string has no effect,
 * and omitted fields do not silently turn into zero or reset the view.
 */
export function decodeExplorerState(hash, defaults = DEFAULT_EXPLORER_STATE) {
  const params = hash instanceof URLSearchParams
    ? hash
    : new URLSearchParams(typeof hash === 'string' ? hash.replace(/^[#?]/, '') : '');
  const candidate = {};
  for (const [key, urlKey] of NUMBER_FIELDS) {
    if (params.has(urlKey)) candidate[key] = params.get(urlKey);
  }
  for (const [key, xKey, yKey] of CENTER_FIELDS) {
    candidate[key] = {};
    if (params.has(xKey)) candidate[key].x = params.get(xKey);
    if (params.has(yKey)) candidate[key].y = params.get(yKey);
  }
  for (const [key, urlKey] of ENUM_FIELDS) {
    if (params.has(urlKey)) candidate[key] = params.get(urlKey);
  }
  if (params.has('pl')) candidate.parameterLayers = params.get('pl').split(',').filter(Boolean);
  if (params.has('pd')) {
    const value = params.get('pd');
    if (value === '') candidate.parameterDigits = [];
    else {
      const digits = value.split(',');
      if (digits.length <= 199 && digits.every(digit => /^[+-]?\d+$/.test(digit))) {
        candidate.parameterDigits = digits.map(Number);
      }
    }
  }
  for (const [key, urlKey] of BOOLEAN_FIELDS) {
    const value = params.get(urlKey);
    if (value === '0' || value === '1') candidate[key] = value === '1';
  }
  const layers = params.get('layers');
  if (layers !== null && layers.length === 7 && /^[01]{7}$/.test(layers)) {
    LAYER_FIELDS.forEach((key, index) => { candidate[key] = layers[index] === '1'; });
  }
  candidate.customPalette = {};
  for (const [key, urlKey] of COLOR_FIELDS) {
    if (params.has(urlKey)) candidate.customPalette[key] = params.get(urlKey);
  }
  return normalizeExplorerState(candidate, defaults);
}
