/**
 * Import the archived WebGL explorer's share state without importing its
 * thickness, beam queue, or shader modes into current search semantics.
 *
 * Mapping verified against the archived explorer's DEFAULT_PARAMS,
 * loadParamsFromHash(), and getWorldCoords(): legacy keys are n, cx, cy,
 * panels, centerX, centerY, zoom. The four panel bits are M_n^0 (formerly Rn) /
 * E(c,n) / Mn / half-E(c,2n-1); the archive has no M_n^1 bit.
 * The legacy camera's vertical world span is 2 / zoom;
 * the current camera stores horizontal world width, so target aspect ratios
 * are required to translate its zoom. No cRe/cIm aliases are assumed.
 */
import {
  DEFAULT_EXPLORER_STATE,
  decodeExplorerState,
  encodeExplorerState,
  normalizeExplorerState
} from './explorer_state.mjs';

const LEGACY_DEFAULTS = Object.freeze({
  n: 4,
  cx: 1.5,
  cy: Math.sqrt(11) / 2,
  centerX: 1.5,
  centerY: Math.sqrt(11) / 2,
  zoom: 2,
  panels: '0010'
});

const CORE_KEYS = ['n', 'cx', 'cy'];
const VIEW_KEYS = ['panels', 'zoom', 'centerX', 'centerY'];
const UNSUPPORTED_KEYS = [
  'mmin1', 'mmax1', 'mmin2', 'mmax2', 'queue',
  'thicknessRE', 'thicknessME', 'pShift', 'gShift', 'res',
  'realBandEnabled', 'realBandHeight', 'useCustomColors', 'bgColor',
  'color1', 'color2', 'color3', 'color4', 'color5', 'color6', 'color7', 'color8',
  'darkenBoundaryHits', 'showStructureColoring', 'useTrapOnly', 'useParaTrapOnly',
  'autoPerf', 'autoQueue', 'autoResolution', 'animate', 'controls',
  // Backward-compatible aliases present in the archived loader.
  'heightRE', 'heightME', 'depth', 'skipRE', 'skipME', 'useRectTrap'
];
const LEGACY_SPECIFIC_KEYS = [...VIEW_KEYS, ...UNSUPPORTED_KEYS];
const LEGACY_KEYS = [...CORE_KEYS, ...LEGACY_SPECIFIC_KEYS];
const MODERN_KEYS = [...encodeExplorerState(DEFAULT_EXPLORER_STATE).keys()];
const MODERN_SPECIFIC_KEYS = MODERN_KEYS.filter(key => !CORE_KEYS.includes(key));
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function asParams(value) {
  return value instanceof URLSearchParams
    ? new URLSearchParams(value)
    : new URLSearchParams(typeof value === 'string' ? value.replace(/^[#?]/, '') : '');
}

function ownValue(object, key) {
  if (object === null || typeof object !== 'object' || Array.isArray(object)) return undefined;
  const property = Object.getOwnPropertyDescriptor(object, key);
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

function hasAny(params, keys) {
  return keys.some(key => params.has(key));
}

function isForcedLegacy(params) {
  return params.get('legacy') === '1' || params.get('from') === 'legacy-collinear';
}

function panelsToState(panels) {
  const mn0 = panels[0] === '1';
  const collinear = panels[1] === '1';
  const mn = panels[2] === '1';
  const difference = panels[3] === '1';
  const parameter = mn0 || mn;
  const dynamical = collinear || difference;
  return {
    parameterMode: mn0 ? (mn ? 'compare' : 'mn0') : 'mn',
    focusedPanel: parameter && dynamical ? 'both' : dynamical ? 'dynamical' : 'parameter',
    comparisonMode: collinear && difference ? 'overlay' : collinear ? 'collinear' : difference ? 'difference' : 'overlay',
    showCollinear: collinear,
    showDifference: difference,
    showEscapeStrata: false
  };
}

/**
 * Map a legacy query/hash parameter string into a fresh current state.
 *
 * viewport.parameterAspect and viewport.dynamicalAspect are the current
 * target canvas width / height. If unavailable, centers still import and
 * widths retain current defaults; the returned legacyVerticalSpan allows
 * the caller to repeat import after applying focus and measuring layout.
 * Legacy links omit default-valued fields, so missing legacy fields use
 * the archived defaults, while current search/render settings use defaults.
 */
export function importLegacyExplorerState(input, defaults = DEFAULT_EXPLORER_STATE, viewport = {}) {
  const params = asParams(input);
  const detected = hasAny(params, LEGACY_KEYS) || isForcedLegacy(params) || ownValue(viewport, 'forceLegacy') === true;
  if (!detected) {
    return { state: normalizeExplorerState(defaults), importedLegacy: false, warnings: [], legacyVerticalSpan: null };
  }

  const warnings = [];
  const invalid = [];
  const limited = [];
  const legacy = {};
  for (const key of [...CORE_KEYS, 'centerX', 'centerY', 'zoom']) {
    let value = params.has(key) ? finiteNumber(params.get(key)) : LEGACY_DEFAULTS[key];
    if (value === undefined || (key === 'zoom' && value <= 0)) {
      invalid.push(key);
      value = LEGACY_DEFAULTS[key];
    }
    legacy[key] = value;
  }
  let panels = params.has('panels') ? params.get('panels') : LEGACY_DEFAULTS.panels;
  if (panels.length !== 4 || !/^[01]{4}$/.test(panels)) {
    invalid.push('panels');
    panels = LEGACY_DEFAULTS.panels;
  }
  if (panels === '0000') {
    warnings.push('The legacy link hid every set; the connectedness-locus panel is shown.');
  }

  const candidate = {
    n: legacy.n,
    cx: legacy.cx,
    cy: legacy.cy,
    paramCenter: { x: legacy.centerX, y: legacy.centerY },
    dynCenter: { x: legacy.centerX, y: legacy.centerY },
    ...panelsToState(panels)
  };
  const missingAspects = [];
  for (const [aspectKey, zoomKey, panelName] of [
    ['parameterAspect', 'paramZoom', 'parameter'],
    ['dynamicalAspect', 'dynZoom', 'dynamical']
  ]) {
    const aspect = finiteNumber(ownValue(viewport, aspectKey));
    if (aspect === undefined || aspect <= 0) {
      const visible = candidate.focusedPanel === 'both' || candidate.focusedPanel === panelName;
      if (visible) missingAspects.push(panelName);
      continue;
    }
    // Division first avoids overflow when both aspect and zoom are large.
    const width = 2 * (aspect / legacy.zoom);
    candidate[zoomKey] = width === Infinity ? 1e6 : width;
    if (width > 1e6 || width < 1e-10) limited.push(zoomKey);
  }
  const state = normalizeExplorerState(candidate, defaults);
  for (const key of CORE_KEYS) {
    if (state[key] !== candidate[key]) limited.push(key);
  }
  if (state.paramCenter.x !== legacy.centerX) limited.push('centerX');
  if (state.paramCenter.y !== legacy.centerY) limited.push('centerY');
  if (invalid.length) warnings.push(`Invalid legacy values used archived defaults: ${invalid.join(', ')}.`);
  if (limited.length) warnings.push(`Legacy values were limited to supported ranges: ${limited.join(', ')}.`);
  if (missingAspects.length) {
    warnings.push(`Legacy zoom needs the target canvas aspect ratio; ${missingAspects.join(' and ')} view widths retain current defaults.`);
  }
  const unsupported = UNSUPPORTED_KEYS.filter(key => params.has(key));
  if (unsupported.length) {
    warnings.push(`Legacy shader, appearance, or interface settings were not imported: ${unsupported.join(', ')}. The archived explorer preserves those settings.`);
  }
  const verticalSpan = 2 / legacy.zoom;
  return {
    state,
    importedLegacy: true,
    warnings,
    legacyVerticalSpan: Number.isFinite(verticalSpan) ? verticalSpan : null
  };
}

/**
 * Resolve current hash links and archived links with explicit precedence:
 * 1. Any current-only hash key (backend, pm, pl, pd, bdepth, badapt, k, ...) selects current decoding.
 * 2. A legacy-specific hash key selects legacy decoding of the whole hash.
 * 3. An n/cx/cy-only hash stays current unless the query has legacy=1 or
 *    from=legacy-collinear, supplied by the archived-route redirect.
 * 4. With no recognized hash state, import a recognized legacy query.
 * 5. Otherwise retain current defaults.
 * A recognized hash is authoritative as a whole; stale query fields never
 * supplement it. Unknown anchors and tracking parameters are not state.
 */
export function decodeExplorerLocation(location, defaults = DEFAULT_EXPLORER_STATE, viewport = {}) {
  const query = asParams(ownValue(location, 'search'));
  const hash = asParams(ownValue(location, 'hash'));
  const forced = isForcedLegacy(query);
  if (hasAny(hash, MODERN_SPECIFIC_KEYS)) {
    return { state: decodeExplorerState(hash, defaults), importedLegacy: false, warnings: [], legacyVerticalSpan: null, source: 'hash' };
  }
  if (hasAny(hash, LEGACY_SPECIFIC_KEYS) || (forced && hasAny(hash, CORE_KEYS))) {
    return { ...importLegacyExplorerState(hash, defaults, viewport), source: 'hash' };
  }
  if (hasAny(hash, CORE_KEYS)) {
    return { state: decodeExplorerState(hash, defaults), importedLegacy: false, warnings: [], legacyVerticalSpan: null, source: 'hash' };
  }
  const imported = importLegacyExplorerState(query, defaults, viewport);
  return { ...imported, source: imported.importedLegacy ? 'query' : 'default' };
}
