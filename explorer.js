/**
 * Collinear Fractals GPU Explorer
 * Interactive engine for rendering parameter and dynamical planes.
 * Features: aspect-ratio preservation, locator dragging on both planes,
 * cyclic capture coloring, and smart zoom resets.
 */

// The browser and exported search records share the same numerical implementation.
import {
  getEffectiveC, inLens, computeEnclosureGeneral, getTrapHalfWidths,
  inverseIterationTestDetailed
} from './src/compute/inverse_search_reference.mjs';
import { PIECE_COLORS } from './src/renderers/palettes.mjs';
import { buildCertificatePayload } from './src/compute/certificate_builder.mjs';
import { renderPrefixAttractor } from './src/renderers/attractor_prefix.mjs';
import { renderHistogramAttractor } from './src/renderers/attractor_histogram.mjs';
import { DEFAULT_EXPLORER_STATE, encodeExplorerState, normalizeExplorerState } from './src/state/explorer_state.mjs';
import { attractorBounds } from './src/math/attractor_bounds.mjs';
import { decodeExplorerLocation } from './src/state/legacy_state.mjs';
import { classifyParameterView } from './src/compute/parameter_views.mjs';
import { createExplorerChrome } from './src/ui/explorer_chrome.mjs';
import { createHybridRenderer, colorizeRasterTile } from './src/renderers/hybrid_renderer.mjs';
import { prepareRasterJob, renderRasterTile } from './src/compute/raster_jobs.mjs';
import { membershipDepthForView, createAttractorMembershipContext } from './src/compute/attractor_membership.mjs';

function isInteriorVerdict(verdict) {
  return verdict === 'Interior' || verdict === 'Interior-offLens';
}

// One validated state contract drives controls, history, shared links and exports.
const DEFAULT_STATE = DEFAULT_EXPLORER_STATE;
const state = structuredClone(DEFAULT_STATE);
let chrome = null;
let legacyImport = null;
let deploymentInfo = null;

const PARAM_RENDER_STEPS = [8, 4, 2, 1];
const DYN_RENDER_STEPS = [4, 2, 1];
const HISTORY_LIMIT = 50;
const BOUNDARY_WORK_LIMIT = 20000;

const EXAMPLE_PRESETS = [
  {
    id: 'e_c4_overlap',
    title: 'Neighboring overlap for E(c,4)',
    n: 4,
    parameter: { re: 1.5, im: 1.6583123951777, exact: '(3 + i sqrt(11))/2' },
    k_max: 37,
    l_max: 1000,
    mode: 'collinear-attractor',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'e_c5_plane_filling',
    title: 'Plane-filling collinear example for E(c,5)',
    n: 5,
    parameter: { re: 1.0, im: 2.0, exact: '1 + 2i' },
    k_max: 37,
    l_max: 1000,
    mode: 'collinear-attractor',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'theta0_base_capture',
    title: 'Theta_0 base-capture geometry',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'base-capture',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'trap_enclosure_n3',
    title: 'Trap/enclosure Interior and Exterior examples',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'trap-enclosure',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'threshold_n20',
    title: 'n=20 threshold/lens example',
    n: 20,
    parameter: { re: 2.0, im: 4.0 },
    k_max: 37,
    l_max: 1000,
    mode: 'finite-capture-threshold',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'hole_zoom_n13',
    title: 'n=13 finite-capture hole zoom',
    n: 13,
    parameter: { re: 2.0719, im: 3.0537 },
    k_max: 37,
    l_max: 1000,
    mode: 'finite-capture-zoom',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'off_lens_witnesses_n2_to_n19',
    title: 'Off-lens search example for n=3',
    n: 3,
    parameter: { re: 1.419643377607, im: 0.606290729207 },
    k_max: 37,
    l_max: 1000,
    mode: 'off-lens-witness',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'finite_capture_layers_n3',
    title: 'Finite-capture layers for n=3',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'finite-capture-layers',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  },
  {
    id: 'level2_boundary_atlas',
    title: 'Level-2 boundary atlas scaffold',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'level2-boundary-atlas',
    renderer_mode: 'boundary',
    visual_renderer: { mode: 'boundary', boundary_depth: 0, adaptive_boundary: true, first_level_pieces: true }
  }
];

const PALETTES = {
  research: {
    interior: '#059669',
    offLens: '#2563eb',
    undetermined: '#fbbf24',
    exterior: '#ffffff',
    branch: '#556b2f'
  },
  print: {
    interior: '#111827',
    offLens: '#475569',
    undetermined: '#d97706',
    exterior: '#ffffff',
    branch: '#374151'
  },
  contrast: {
    interior: '#0072b2',
    offLens: '#cc79a7',
    undetermined: '#e69f00',
    exterior: '#ffffff',
    branch: '#009e73'
  }
};

// Colors HSL helper
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4))
  };
}

function hexToRgb(hex) {
  const normalized = String(hex || '#000000').replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const n = parseInt(value, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
}

function rgbToCss(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function mixWithWhite(rgb, amount) {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * t),
    g: Math.round(rgb.g + (255 - rgb.g) * t),
    b: Math.round(rgb.b + (255 - rgb.b) * t)
  };
}

function activePalette() {
  if (state.palette === 'custom') {
    return {
      ...state.customPalette,
      branch: state.customPalette.interior
    };
  }
  return PALETTES[state.palette] || PALETTES.research;
}

// Map modulo capture levels to research grayscale colors
function getColorForLevel(level, depth) {
  const q = state.modulo;
  if (state.palette !== 'research') {
    const base = hexToRgb(activePalette().interior);
    return mixWithWhite(base, Math.max(0, 0.7 - (level * 0.45) / q));
  }
  // Grayscale mapping for level = depth % q
  const lightness = 70 - (level * 45) / q;
  const gVal = Math.max(10, Math.min(240, Math.round(lightness * 2.55)));
  return { r: gVal, g: gVal, b: gVal };
}

function getOffLensInteriorColorForLevel(level, depth) {
  const q = state.modulo;
  if (state.palette !== 'research') {
    const base = hexToRgb(activePalette().offLens);
    return mixWithWhite(base, Math.max(0, 0.62 - (level * 0.4) / q));
  }
  const base = 112 - (level * 34) / q;
  const v = Math.max(35, Math.min(210, Math.round(base * 2.0)));
  return { r: Math.max(25, v - 28), g: Math.max(35, v - 12), b: Math.min(230, v + 18) };
}

// Grayscale escape speed scheme with mod 11 (excluding white)
function getEscapeColor(depth) {
  const level = depth % 11;
  // Interpolate lightness between 90 (dark gray) and 230 (light gray, distinct from pure white)
  const val = Math.round(90 + (level * 140) / 10);
  return { r: val, g: val, b: val };
}

function getEscapeColorString(depth) {
  const rgb = getEscapeColor(depth);
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function getExteriorColorString() {
  return activePalette().exterior || '#ffffff';
}

function getUndeterminedColorString() {
  return activePalette().undetermined || '#fbbf24';
}

// Keep a clean canvas behind the guides without reading GPU pixels into JS.
let parameterRasterSnapshot = null;
function saveParameterRaster() {
  if (!parameterRasterSnapshot) parameterRasterSnapshot = document.createElement('canvas');
  parameterRasterSnapshot.width = canvasParam.width;
  parameterRasterSnapshot.height = canvasParam.height;
  parameterRasterSnapshot.getContext('2d').drawImage(canvasParam, 0, 0);
}
function clearParameterRaster() {
  if (parameterRasterSnapshot) {
    parameterRasterSnapshot.width = 0;
    parameterRasterSnapshot.height = 0;
    parameterRasterSnapshot = null;
  }
}

// UI Elements
const elParamReal = document.getElementById('param-real');
const elParamImag = document.getElementById('param-imag');
const elParamModulus = document.getElementById('param-modulus');
const elParamArgument = document.getElementById('param-argument');
const elStatReason = document.getElementById('stat-reason');
const elStatEffective = document.getElementById('stat-effective');
const elAritySlider = document.getElementById('arity-slider');
const elArityVal = document.getElementById('arity-val');
const elKmax = document.getElementById('param-kmax');
const elLmax = document.getElementById('param-lmax');
const elModulo = document.getElementById('param-modulo');
const elModuloVal = document.getElementById('modulo-val');
const elExamplePreset = document.getElementById('example-preset');
const elComparisonMode = document.getElementById('comparison-mode');
const elOriginalRendererMode = document.getElementById('original-renderer-mode');
const elRenderBackend = document.getElementById('render-backend');
const elRenderBackendStatus = document.getElementById('render-backend-status');
const elAttractorDepth = document.getElementById('attractor-depth');
const elBoundaryDepth = document.getElementById('boundaryDepth');
const elAdaptiveBoundary = document.getElementById('adaptiveBoundary');
const elHistogramSeed = document.getElementById('histogram-seed');
const elHistogramSamples = document.getElementById('histogram-samples');
const elFirstLevelPieces = document.getElementById('first-level-pieces');
const elOriginalAttractorOpacity = document.getElementById('original-attractor-opacity');
const elOriginalAttractorOpacityVal = document.getElementById('original-attractor-opacity-val');
const elPaletteMode = document.getElementById('palette-mode');
const elPaletteInterior = document.getElementById('palette-interior');
const elPaletteOffLens = document.getElementById('palette-offlens');
const elPaletteUndetermined = document.getElementById('palette-undetermined');
const elPaletteExterior = document.getElementById('palette-exterior');

const elShowCollinear = document.getElementById('show-collinear-attractor');
const elShowDiff = document.getElementById('show-difference-attractor');
const elShowTrap = document.getElementById('show-canonical-trap');
const elShowEnc = document.getElementById('show-canonical-enclosure');
const elShowTree = document.getElementById('show-orbit-tree');
const elShowPath = document.getElementById('show-winning-path');
const elShowEscapeStrata = document.getElementById('show-escape-strata');

const elBtnResetParam = document.getElementById('btn-reset-param');
const elBtnResetDyn = document.getElementById('btn-reset-dyn');
const elBtnCopyCertificate = document.getElementById('btn-copy-certificate');
const elBtnDownloadCertificate = document.getElementById('btn-download-certificate');
const elBtnUndo = document.getElementById('btn-undo');
const elBtnRedo = document.getElementById('btn-redo');
const elBtnShare = document.getElementById('btn-share');
const elBtnEmbed = document.getElementById('btn-embed');
const elBtnSaveImage = document.getElementById('btn-save-image');
const elBtnTour = document.getElementById('btn-tour');
const elBtnAbout = document.getElementById('btn-about');
const elBtnSupport = document.getElementById('btn-support');
const elBtnFocusParam = document.getElementById('btn-focus-param');
const elBtnFocusDyn = document.getElementById('btn-focus-dyn');

const elStatC = document.getElementById('stat-c');
const elStatRho = document.getElementById('stat-rho');
const elStatLens = document.getElementById('stat-lens');
const elStatVerdict = document.getElementById('stat-verdict');
const elStatNodes = document.getElementById('stat-nodes');
const elStatDepth = document.getElementById('stat-depth');
const elStatWord = document.getElementById('stat-word');
const elModalBackdrop = document.getElementById('modal-backdrop');
const elModalTitle = document.getElementById('modal-title');
const elModalBody = document.getElementById('modal-body');
const elModalActions = document.getElementById('modal-actions');
const elModalTabs = document.getElementById('modal-tabs');
const elModalClose = document.getElementById('modal-close');

// Canvas references
const canvasParam = document.getElementById('parameter-canvas');
const ctxParam = canvasParam.getContext('2d');

const canvasDyn = document.getElementById('dynamical-canvas');
const ctxDyn = canvasDyn.getContext('2d');

// Progressive rendering state for Parameter Plane
let renderRequestId = null;

// Progressive rendering state for Dynamical Plane
let dynRenderRequestId = null;
let selectedSearchCache = null;
let selectedParameterViewCache = null;
let overlayCache = null;
let lastPanelFocus = null;
let exampleLoadGeneration = 0;
const mainThreadRuns = { parameter: null, dynamical: null };
const attractorRenderers = { renderPrefixAttractor, renderHistogramAttractor };
let lastAttractorMetadata = null;
const renderingInfo = { parameter: null, dynamical: null };
const hybridRenderer = createHybridRenderer({ onStatus: updateRenderingInfo });

function updateRenderingInfo(kind, metadata) {
  renderingInfo[kind] = metadata;
  if (kind === 'dynamical' && state.rendererMode === 'boundary' && state.showCollinear) {
    updateBoundaryMetadata(metadata);
  }
  const canvas = kind === 'parameter' ? canvasParam : canvasDyn;
  canvas.dataset.renderBackend = metadata.active_backend;
  canvas.dataset.renderPhase = metadata.phase;
  const visible = Object.entries(renderingInfo).filter(([panel, info]) => info &&
    (panel === 'parameter' ? canvasParam : canvasDyn).width > 0);
  const labels = { webgl2: 'GPU preview', 'cpu-worker': 'CPU workers', 'cpu-main-thread': 'CPU fallback', 'cpu-geometry': 'CPU geometry', initializing: 'Starting' };
  if (elRenderBackendStatus) {
    const status = visible.map(([panel, info]) =>
      `${panel === 'parameter' ? 'Parameter' : 'Dynamical'}: ${labels[info.active_backend] || info.active_backend}${info.phase === 'refining' ? ' · refining' : ''}`
    ).join('. ');
    const reason = [...new Set(visible.map(([, info]) => info.fallback_reason).filter(Boolean))].join('; ');
    elRenderBackendStatus.textContent = `${status}${reason ? `. ${reason.length > 240 ? `${reason.slice(0, 237)}…` : reason}` : ''}`;
    elRenderBackendStatus.title = reason;
  }
  // Context loss can start refinement after a GPU-only frame was exportable.
  // Revoke that completion immediately, before the first worker tile arrives.
  if (metadata.phase === 'initializing' || metadata.phase === 'refining') markRendering(canvas, 'rendering');
}

function boundaryDepthFor(kind) {
  const canvas = kind === 'parameter' ? canvasParam : canvasDyn;
  const pixelWidth = canvas.width || 768;
  const aspect = pixelWidth / (canvas.height || 600);
  let referenceSpan = 2 * Math.max(1 + Math.sqrt(state.n - 1), Math.sqrt(state.n + 1) * aspect) * 1.08;
  if (kind === 'dynamical') {
    try {
      const c = getEffectiveC(state.cx, state.cy);
      const bounds = attractorBounds({ re: c.x, im: c.y }, state.n);
      referenceSpan = 2 * Math.max(bounds.xMax, bounds.yMax * aspect) * 1.15;
    } catch { referenceSpan = 8; }
  }
  return membershipDepthForView(state.n, kind === 'parameter' ? state.paramZoom : state.dynZoom, {
    referenceSpan, pixelWidth, baseDepth: state.boundaryDepth, adaptive: state.adaptiveBoundary
  });
}

function updateBoundaryMetadata(info = renderingInfo.dynamical) {
  const c = getEffectiveC(state.cx, state.cy);
  const rho = Math.hypot(c.x, c.y);
  const selfCovering = rho > 1 && c.y !== 0 && rho * rho + 2 * Math.abs(c.x) < state.n;
  const unavailable = ['outside-domain', 'numerical-range'].includes(info?.renderer) ? info.renderer : null;
  const gpuOnly = info?.active_backend === 'webgl2';
  const depth = gpuOnly ? (info.gpu?.effective?.escape_depth ?? boundaryDepthFor('dynamical')) : boundaryDepthFor('dynamical');
  lastAttractorMetadata = {
    renderer: 'capture-escape-boundary', algorithm: 'depth-first inverse search',
    alphabet_size: state.n, available: !unavailable, stop_reason: unavailable,
    effective_depth: unavailable ? 0 : depth,
    requested_base_depth: state.boundaryDepth, adaptive: state.adaptiveBoundary,
    requested_work_limit: BOUNDARY_WORK_LIMIT,
    effective_work_limit: unavailable ? 0 : gpuOnly ? (info.gpu?.effective?.boundary_work ?? BOUNDARY_WORK_LIMIT) : BOUNDARY_WORK_LIMIT,
    self_covering_region: !unavailable && selfCovering,
    self_covering_condition: '|c|^2 + 2|Re c| < n',
    pixel_radius_world: gpuOnly ? (info.gpu?.pixel_radius_world ?? Math.SQRT1_2 * state.dynZoom / Math.max(1, canvasDyn.width)) : Math.SQRT1_2 * state.dynZoom / Math.max(1, canvasDyn.width),
    sampling: 'pixel-footprint', first_level_pieces: state.firstLevelPieces,
    coordinate_scale: 1, maps: 'z -> t + z/c',
    capture: 'canonical self-covering region only',
    finite_survival: 'finite-resolution coverage',
    resource_caps: 'unresolved'
  };
  const note = document.getElementById('boundary-renderer-note');
  if (note) {
    note.hidden = !state.showCollinear || state.rendererMode !== 'boundary';
    note.textContent = unavailable
      ? `Boundary unavailable · ${unavailable === 'outside-domain' ? 'outside the expanding nonreal domain' : 'numerical range exceeded'}`
      : `${selfCovering ? 'Self-covering + escape' : 'Escape boundary'} · depth ${depth}${state.adaptiveBoundary ? ' · adapts to zoom' : ''}`;
  }
}

function rasterJob(kind) {
  const canvas = kind === 'parameter' ? canvasParam : canvasDyn;
  return {
    kind, width: canvas.width, height: canvas.height,
    center: { ...(kind === 'parameter' ? state.paramCenter : state.dynCenter) },
    spanX: kind === 'parameter' ? state.paramZoom : state.dynZoom,
    n: state.n, cx: state.cx, cy: state.cy, kMax: state.kMax, LMax: state.LMax, tol: state.tol,
    parameterMode: state.parameterMode, showDifference: state.showDifference,
    showOriginalSurvival: state.showCollinear && ['boundary', 'survival'].includes(state.rendererMode),
    originalRenderer: state.rendererMode === 'survival' ? 'survival' : 'boundary',
    escapeDepth: boundaryDepthFor(kind), boundaryWork: BOUNDARY_WORK_LIMIT,
    firstLevelPieces: state.firstLevelPieces, originalOpacity: state.originalAttractorOpacity,
    showEscapeStrata: state.showEscapeStrata, survivalOpacity: state.survivalOverlayOpacity,
    backend: state.backend
  };
}

function rasterColors() {
  const table = new Uint8Array(9 * 101 * 4);
  const exterior = hexToRgb(getExteriorColorString());
  const unknown = hexToRgb(getUndeterminedColorString());
  for (let code = 0; code < 9; code++) {
    for (let depth = 0; depth <= 100; depth++) {
      let rgb = unknown;
      if (code === 0) rgb = state.showEscapeStrata ? getEscapeColor(depth) : exterior;
      else if (code === 1) rgb = state.showEscapeStrata ? exterior : getColorForLevel(depth % state.modulo, depth);
      else if (code === 2) rgb = state.showEscapeStrata ? exterior : getOffLensInteriorColorForLevel(depth % state.modulo, depth);
      else if (code === 5) rgb = { r: 203, g: 213, b: 225 };
      table.set([rgb.r, rgb.g, rgb.b, 255], (code * 101 + depth) * 4);
    }
  }
  const branch = hexToRgb(activePalette().branch || '#111827');
  const pieceColors = Uint8Array.from(PIECE_COLORS.flatMap(color => {
    const rgb = hexToRgb(color);
    return [rgb.r, rgb.g, rgb.b];
  }));
  return { table, branch: [branch.r, branch.g, branch.b], exterior: [exterior.r, exterior.g, exterior.b], survivalOpacity: state.survivalOverlayOpacity, pieceColors };
}

function startHybridPanel(kind) {
  const canvas = kind === 'parameter' ? canvasParam : canvasDyn;
  const context = kind === 'parameter' ? ctxParam : ctxDyn;
  hybridRenderer.render(rasterJob(kind), rasterColors(), {
    onFrame({ canvas: frame, complete, metadata }) {
      updateRenderingInfo(kind, metadata);
      context.drawImage(frame, 0, 0);
      if (kind === 'parameter') {
        // Save only the clean completed raster; guides must never erase new tiles.
        if (complete) saveParameterRaster();
        else clearParameterRaster();
        drawParameterLensGuides(true);
      } else {
        drawOriginalAttractorOverlay();
        drawDynamicalGuidesAndOverlays();
      }
      markRendering(canvas, complete ? 'complete' : 'rendering');
    },
    onFallback(metadata) {
      if (kind === 'parameter') triggerParamRender({ skipHybrid: true, metadata });
      else triggerDynRender({ skipHybrid: true, metadata });
    }
  });
}

// Drag state for locators
const undoStack = [];
const redoStack = [];

function cloneStateFromDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function cloneState() {
  return JSON.parse(JSON.stringify(state));
}

function applySnapshot(snapshot) {
  Object.assign(state, JSON.parse(JSON.stringify(snapshot)));
  if (!state.customPalette) {
    state.customPalette = {
      interior: '#059669',
      offLens: '#2563eb',
      undetermined: '#fbbf24',
      exterior: '#ffffff'
    };
  }
}

function pushHistory() {
  undoStack.push(cloneState());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function withHistory(mutator, renderTarget = 'both') {
  exampleLoadGeneration++;
  pushHistory();
  mutator();
  Object.assign(state, normalizeExplorerState(state, DEFAULT_STATE));
  updateControlsFromState();
  renderAfterStateChange(renderTarget);
}

function undoState() {
  if (undoStack.length === 0) return;
  exampleLoadGeneration++;
  redoStack.push(cloneState());
  applySnapshot(undoStack.pop());
  updateControlsFromState();
  renderAfterStateChange('both');
  updateHistoryButtons();
}

function redoState() {
  if (redoStack.length === 0) return;
  exampleLoadGeneration++;
  undoStack.push(cloneState());
  applySnapshot(redoStack.pop());
  updateControlsFromState();
  renderAfterStateChange('both');
  updateHistoryButtons();
}

function updateHistoryButtons() {
  if (elBtnUndo) elBtnUndo.disabled = undoStack.length === 0;
  if (elBtnRedo) elBtnRedo.disabled = redoStack.length === 0;
}

function renderAfterStateChange(target) {
  updateLegendColors();
  updatePanelFocus();
  if (target === 'dyn') drawParameterLensGuides();
  if (target === 'param') {
    triggerParamRender();
  } else if (target === 'dyn') {
    triggerDynRender();
  } else {
    triggerParamRender();
    triggerDynRender();
  }
}

function updateControlsFromState() {
  if (elParamReal) elParamReal.value = state.cx;
  if (elParamImag) elParamImag.value = state.cy;
  if (elParamModulus) elParamModulus.value = Math.hypot(state.cx, state.cy);
  if (elParamArgument) elParamArgument.value = Math.atan2(state.cy, state.cx) * 180 / Math.PI;
  if (elAritySlider) elAritySlider.value = state.n;
  if (elArityVal) elArityVal.textContent = state.n;
  if (elKmax) elKmax.value = state.kMax;
  if (elLmax) elLmax.value = state.LMax;
  if (elModulo) elModulo.value = state.modulo;
  if (elModuloVal) elModuloVal.textContent = state.modulo;
  if (elComparisonMode) elComparisonMode.value = state.comparisonMode || 'overlay';
  if (elOriginalRendererMode) elOriginalRendererMode.value = state.rendererMode || 'boundary';
  if (elRenderBackend) elRenderBackend.value = state.backend;
  if (elAttractorDepth) elAttractorDepth.value = state.attractorDepth;
  if (elBoundaryDepth) elBoundaryDepth.value = state.boundaryDepth;
  if (elAdaptiveBoundary) elAdaptiveBoundary.checked = state.adaptiveBoundary;
  for (const [id, visible] of [
    ['boundary-settings', state.rendererMode === 'boundary' || state.parameterMode !== 'mn'],
    ['prefix-settings', state.rendererMode === 'prefix'],
    ['histogram-settings', state.rendererMode === 'histogram']
  ]) {
    const group = document.getElementById(id);
    if (group) group.hidden = !visible;
  }
  if (elHistogramSeed) elHistogramSeed.value = state.histogramSeed;
  if (elHistogramSamples) elHistogramSamples.value = state.histogramSamples;
  if (elFirstLevelPieces) elFirstLevelPieces.checked = Boolean(state.firstLevelPieces);
  if (elOriginalAttractorOpacity) elOriginalAttractorOpacity.value = Math.round(100 * state.originalAttractorOpacity);
  if (elOriginalAttractorOpacityVal) elOriginalAttractorOpacityVal.textContent = `${Math.round(100 * state.originalAttractorOpacity)}%`;
  if (elPaletteMode) elPaletteMode.value = state.palette || 'research';
  if (elPaletteInterior) elPaletteInterior.value = state.customPalette.interior;
  if (elPaletteOffLens) elPaletteOffLens.value = state.customPalette.offLens;
  if (elPaletteUndetermined) elPaletteUndetermined.value = state.customPalette.undetermined;
  if (elPaletteExterior) elPaletteExterior.value = state.customPalette.exterior;
  if (elShowCollinear) elShowCollinear.checked = state.showCollinear;
  if (elShowDiff) elShowDiff.checked = state.showDifference;
  if (elShowTrap) elShowTrap.checked = state.showTrap;
  if (elShowEnc) elShowEnc.checked = state.showEnclosure;
  if (elShowTree) elShowTree.checked = state.showTree;
  if (elShowPath) elShowPath.checked = state.showPath;
  if (elShowEscapeStrata) elShowEscapeStrata.checked = state.showEscapeStrata;
  chrome?.sync();
  updateHistoryButtons();
}

function setComparisonMode(mode) {
  state.comparisonMode = mode;
  if (mode === 'difference') {
    state.showDifference = true;
    state.showCollinear = false;
    state.showEscapeStrata = false;
  } else if (mode === 'collinear') {
    state.showDifference = false;
    state.showCollinear = true;
    state.showEscapeStrata = false;
  } else if (mode === 'escape') {
    state.showDifference = true;
    state.showCollinear = false;
    state.showEscapeStrata = true;
  } else {
    state.showDifference = true;
    state.showCollinear = true;
    state.showEscapeStrata = false;
  }
}

function togglePanelFocus(panel) {
  state.focusedPanel = state.focusedPanel === panel ? 'both' : panel;
  updatePanelFocus();
}

function updatePanelFocus() {
  const workspace = document.querySelector('.workspace');
  if (!workspace) return;
  workspace.classList.toggle('focus-parameter', state.focusedPanel === 'parameter');
  workspace.classList.toggle('focus-dynamical', state.focusedPanel === 'dynamical');
  if (elBtnFocusParam) elBtnFocusParam.textContent = state.focusedPanel === 'parameter' ? 'Both' : 'Focus';
  if (elBtnFocusDyn) elBtnFocusDyn.textContent = state.focusedPanel === 'dynamical' ? 'Both' : 'Focus';
  if (lastPanelFocus !== state.focusedPanel) {
    lastPanelFocus = state.focusedPanel;
    resizeCanvases();
  }
}

function stateToSearchParams() {
  return encodeExplorerState(state);
}

function currentShareUrl() {
  const url = new URL(window.location.href);
  // Imported legacy settings are translated once; new links carry only current state.
  url.search = '';
  url.hash = stateToSearchParams().toString();
  return url.toString();
}

function applyStateFromHash() {
  const location = { search: window.location.search, hash: window.location.hash };
  const first = decodeExplorerLocation(location, DEFAULT_STATE);
  Object.assign(state, first.state);
  // The legacy camera stores vertical span. Measure after its focus/layout is applied.
  updatePanelFocus();
  const aspect = canvas => {
    const { clientWidth: width, clientHeight: height } = canvas.parentElement;
    return width > 0 && height > 0 ? width / height : undefined;
  };
  legacyImport = decodeExplorerLocation(location, DEFAULT_STATE, {
    parameterAspect: aspect(canvasParam), dynamicalAspect: aspect(canvasDyn)
  });
  Object.assign(state, legacyImport.state);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch { /* Use the selectable local fallback when permission is unavailable. */ }
  }
  const previousFocus = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  previousFocus?.focus();
  if (!ok) throw new Error('Fallback copy command failed.');
}

function populateExamplePresets(items = EXAMPLE_PRESETS) {
  if (!elExamplePreset) return;
  const current = elExamplePreset.value;
  elExamplePreset.innerHTML = '<option value="">Select an example</option>';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.title;
    elExamplePreset.appendChild(opt);
  }
  elExamplePreset.value = current;
}

async function loadExampleIndex() {
  populateExamplePresets();
  try {
    const response = await fetch('examples/examples.json', { cache: 'no-store' });
    if (!response.ok) return EXAMPLE_PRESETS;
    const index = await response.json();
    const items = Array.isArray(index.examples) ? index.examples : [];
    if (items.length > 0) {
      populateExamplePresets(items);
      return items;
    }
  } catch (err) {
    console.warn('Example index unavailable; using built-in presets.', err);
  }
  return EXAMPLE_PRESETS;
}

function fallbackExampleConfig(id) {
  return EXAMPLE_PRESETS.find(item => item.id === id) || null;
}

async function loadExampleConfig(id) {
  try {
    const response = await fetch(`examples/${id}/config.json`, { cache: 'no-store' });
    if (response.ok) {
      const config = await response.json();
      if (config && typeof config === 'object' && !Array.isArray(config)) return config;
    }
  } catch (err) {
    console.warn(`Example config ${id} unavailable; using fallback if present.`, err);
  }
  return fallbackExampleConfig(id);
}

function applyExampleConfig(config) {
  if (!config) return;
  Object.assign(state, cloneStateFromDefaults());
  const selectedCase = Array.isArray(config.cases) && config.cases.length > 0 ? config.cases[0] : null;
  const parameter = config.parameter || (selectedCase ? selectedCase.parameter : null);
  if (Number.isFinite(config.n)) state.n = config.n;
  if (parameter && Number.isFinite(parameter.re) && Number.isFinite(parameter.im)) {
    state.cx = parameter.re;
    state.cy = parameter.im;
  }
  state.kMax = Math.max(0, Math.round(config.k_max ?? config.kMax ?? state.kMax));
  state.LMax = Math.max(1, Math.round(config.l_max ?? config.LMax ?? state.LMax));
  const visual = config.visual_renderer || {};
  if (['boundary', 'prefix', 'histogram', 'survival'].includes(config.renderer_mode || visual.mode)) {
    state.rendererMode = config.renderer_mode || visual.mode;
  }
  if (Number.isFinite(config.boundary_depth ?? visual.boundary_depth)) {
    state.boundaryDepth = Math.max(0, Math.min(100, Math.round(config.boundary_depth ?? visual.boundary_depth)));
  }
  if (typeof (config.adaptive_boundary ?? visual.adaptive_boundary) === 'boolean') {
    state.adaptiveBoundary = config.adaptive_boundary ?? visual.adaptive_boundary;
  }
  if (Number.isFinite(config.attractor_depth || visual.depth)) {
    state.attractorDepth = Math.max(1, Math.min(12, Math.round(config.attractor_depth || visual.depth)));
  }
  if (Number.isFinite(config.histogram_seed || visual.seed)) {
    state.histogramSeed = Math.max(1, Math.round(config.histogram_seed || visual.seed));
  }
  if (Number.isFinite(config.histogram_samples || visual.samples)) {
    state.histogramSamples = Math.max(1000, Math.min(1000000, Math.round(config.histogram_samples || visual.samples)));
  }
  if (typeof config.first_level_pieces === 'boolean') {
    state.firstLevelPieces = config.first_level_pieces;
  } else if (typeof visual.first_level_pieces === 'boolean') {
    state.firstLevelPieces = visual.first_level_pieces;
  }
  if (config.mode === 'collinear-attractor') {
    state.showCollinear = true;
    state.showDifference = false;
    state.comparisonMode = 'collinear';
    if (!config.renderer_mode && !visual.mode) state.rendererMode = 'boundary';
  } else if (config.mode === 'off-lens-witness') {
    state.showCollinear = false;
    state.showDifference = true;
    state.comparisonMode = 'overlay';
  } else {
    state.showDifference = true;
    state.comparisonMode = 'overlay';
  }
  if (config.view) {
    if (config.view.parameter_center) {
      state.paramCenter = { x: config.view.parameter_center.re, y: config.view.parameter_center.im };
    }
    if (Number.isFinite(config.view.parameter_zoom)) state.paramZoom = config.view.parameter_zoom;
    if (config.view.dynamical_center) {
      state.dynCenter = { x: config.view.dynamical_center.re, y: config.view.dynamical_center.im };
    }
    if (Number.isFinite(config.view.dynamical_zoom)) state.dynZoom = config.view.dynamical_zoom;
  } else {
    resetParamViewportMath();
    resetDynViewportMath();
  }
}

function htmlEscape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let modalReturnFocus = null;
function openModal(title, bodyHtml, actionsHtml = '', showTabs = false) {
  if (!elModalBackdrop) return;
  const opening = elModalBackdrop.hidden;
  if (opening) modalReturnFocus = document.activeElement;
  elModalTitle.textContent = title;
  elModalBody.innerHTML = bodyHtml;
  elModalActions.innerHTML = actionsHtml;
  elModalTabs.hidden = !showTabs;
  elModalBackdrop.hidden = false;
  document.querySelector('.container').inert = true;
  document.getElementById('footer-status').inert = true;
  document.body.classList.add('dialog-open');
  if (opening) elModalClose.focus({ preventScroll: true });
}

function closeModal() {
  if (!elModalBackdrop || elModalBackdrop.hidden) return;
  elModalBackdrop.hidden = true;
  document.querySelector('.container').inert = false;
  document.getElementById('footer-status').inert = false;
  document.body.classList.remove('dialog-open');
  chrome?.sync();
  modalReturnFocus?.focus({ preventScroll: true });
  modalReturnFocus = null;
}



const ABOUT_TABS = {
  intuition: `
    <p>For the maps <code>f_t(z) = t + z/c</code>, the explorer visualizes the condition that the marked point <code>2c</code>
    belongs to the difference attractor <code>E(c, 2n - 1)</code>. This is the
    computational view behind connectedness for the collinear family.</p>
    <p>The original attractor <code>E(c,n)</code> uses a sharp boundary renderer.
    It combines canonical self-covering with inverse escape, accounting for each
    pixel's area so thin pieces remain visible. Detail increases as you zoom.
    Prefix-cylinder and seeded-histogram views are available in Controls.</p>
    <p>Automatic rendering starts with a bounded WebGL 2 GPU preview, then
    refines the image in double precision using background workers. CPU rendering
    takes over when acceleration is unavailable or the view needs more precision.
    The selected search record always uses the full chosen <code>k_max</code> and
    <code>L_max</code>, independently of the preview. GPU-only images are explicitly
    marked as previews; neither renderer supplies an interval certificate.</p>
    <p><strong>Mₙ⁰</strong> tests <code>c ∈ E(c,n)</code>.
    <strong>Mₙ¹</strong> tests <code>c ∈ A_(n−1) + E(c,n)/c</code>:
    the first inverse digit uses the complementary alphabet, and all later
    digits use <code>A_n</code>. Both are subsets of <strong>Mₙ</strong>.
    They use the same self-covering and escape search as the original attractor.
    Teal indicates finite survival; Compare also uses teal for Mₙ⁰ capture.
    Amber marks unresolved computation. The main result bar and exported inverse
    word describe Mₙ.</p>
  `,
  framework: `
    <p>The 2024 result uses rectangle-covering and lens-local regular-closedness
    to obtain a global route for large <code>n</code>. The 2026 finite-capture
    framework uses canonical traps, canonical enclosures, finite inverse search,
    and bounded-lag repair to sharpen the lens-containment threshold to
    <code>n >= 20</code>.</p>
    <p>The software supports exploration, figure generation, finite inverse-word
    export, and independent inspection. The theorem-level proofs remain in the
    papers and thesis.</p>
  `,
  references: `
    <ol>
      <li>Bernat Espigule, David Juher, and Joan Saldaña,
      <em>Collinear Fractals and Bandt's Conjecture</em>,
      Fractal and Fractional 8(12), 725, 2024.
      <a href="https://doi.org/10.3390/fractalfract8120725" target="_blank" rel="noopener noreferrer">Published article</a>.</li>
      <li>Bernat Espigule and David Juher,
      <em>Finite Capture and the Closure of Roots of Restricted Polynomials</em>,
      arXiv:2603.07397, 2026.
      <a href="https://arxiv.org/abs/2603.07397" target="_blank" rel="noopener noreferrer">Preprint</a>.</li>
      <li>Bernat Espigule,
      <em>Finite capture and the closure of roots of restricted polynomials</em>,
      IHP audiovisual resource, 2026.
      <a href="https://doi.org/10.57987/IHP.2026.T1.WS3.016" target="_blank" rel="noopener noreferrer">IHP lecture</a>.</li>
    </ol>
  `
};

function openAboutModal(tab = 'intuition') {
  const build = deploymentInfo?.source_commit
    ? `<p class="build-info">Public build <code>${htmlEscape(deploymentInfo.source_commit.slice(0, 12))}</code> · ${htmlEscape(deploymentInfo.version)}. <a href="deployment.json" target="_blank" rel="noopener">Build and asset record</a>.</p>` : '';
  const migration = legacyImport?.importedLegacy
    ? `<p>This view was imported from the earlier explorer.${legacyImport.warnings.length
      ? ` ${legacyImport.warnings.map(htmlEscape).join(' ')}` : ' Its parameter and camera framing have been preserved.'}</p>` : '';
  const archive = '<p><a href="https://complextrees.com/collinear/legacy-2026-09/" target="_blank" rel="noopener">Open the archived WebGL explorer</a> for the historical interface and shader experiments.</p>';
  const actions = tab === 'references'
    ? '<button class="btn" id="btn-copy-software-citation">Copy software citation</button><button class="btn btn-secondary" id="btn-copy-bibtex">Copy BibTeX</button>' : '';
  openModal('About & cite', (ABOUT_TABS[tab] || ABOUT_TABS.intuition) + migration + archive + build, actions, true);
  if (elModalTabs) {
    for (const btn of elModalTabs.querySelectorAll('.modal-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-pressed', String(btn.dataset.tab === tab));
    }
  }
  if (tab === 'references') {
    const revision = deploymentInfo?.source_commit;
    const version = deploymentInfo?.version || '0.2.0-alpha';
    const sourceUrl = `https://github.com/espigule/collinear-fractals-gpu${revision ? `/tree/${revision}` : ''}`;
    const citation = `Bernat Espigule. Collinear Fractals GPU: companion software for collinear fractals, finite capture, and restricted polynomial roots. Version ${version}${revision ? `, commit ${revision}` : ''}. ${sourceUrl}`;
    const bibtex = `@software{espigule_collinear_fractals,\n  author = {Bernat Espigule},\n  title = {Collinear Fractals GPU: companion software for collinear fractals, finite capture, and restricted polynomial roots},\n  version = {${version}},\n  url = {${sourceUrl}}${revision ? `,\n  note = {Source commit ${revision}}` : ''}\n}`;
    for (const [id, value] of [['btn-copy-software-citation', citation], ['btn-copy-bibtex', bibtex]]) {
      const button = document.getElementById(id);
      button.addEventListener('click', () => {
        copyTextToClipboard(value).then(() => { button.textContent = 'Copied'; })
          .catch(() => { chrome?.announce('Copy was unavailable. Citation metadata is available in CITATION.cff in the source repository.'); });
      });
    }
  }
}

function openSupportModal() {
  openModal(
    'Support',
    `
      <p>This repository is open-access research software accompanying work on
      collinear fractals, finite capture, and restricted polynomial roots.</p>
      <p>Small sponsorships help support maintenance, documentation, public
      visualization, and research-software development. Support is optional and
      does not affect access to the code, examples, documentation, issues, or
      citation materials.</p>
      <p>Funding provenance is recorded in the README and NOTICE files.</p>
    `
  );
}

function openShareModal(kind = 'share') {
  const url = currentShareUrl();
  const embed = `<iframe src="${htmlEscape(url)}" width="100%" height="720" loading="lazy" allow="fullscreen" title="Collinear Fractals Explorer"></iframe>`;
  const value = kind === 'embed' ? embed : url;
  openModal(
    kind === 'embed' ? 'Embed Code' : 'Share Current View',
    `<p>The URL records the parameter, mathematical views, viewports, rendering layers, palette, and search limits.</p><pre tabindex="0">${htmlEscape(value)}</pre>`,
    `<button class="btn" id="modal-copy-primary">Copy</button>`
  );
  const copyButton = document.getElementById('modal-copy-primary');
  if (copyButton) {
    copyButton.addEventListener('click', () => {
      copyTextToClipboard(value)
        .then(() => { copyButton.textContent = 'Copied'; })
        .catch(err => console.error('Could not copy share data:', err));
    });
  }
}

const TOUR_STEPS = [
  {
    title: 'Parameter plane',
    body: 'The left canvas samples the parameter plane. Drag to pan, use the wheel to zoom, and move the red marker to choose c.'
  },
  {
    title: 'Dynamical plane',
    body: 'The right canvas starts with the original attractor E(c,n). Use E, ½D, and Overlay to compare the original and half-difference attractors. Controls contains rendering choices and optional trap, enclosure, and inverse-search paths.'
  },
  {
    title: 'Search limits',
    body: 'The depth and node limits control the selected M_n search and its JSON record. A limit produces Undetermined. M_n^0 and M_n^1 use their own boundary depth: capture indicates entry into the original attractor’s self-covering region, while finite survival remains an approximation. In Compare, teal highlights M_n^0 capture or finite survival.'
  },
  {
    title: 'Reproducibility',
    body: 'Use Share to reproduce the complete view, export a completed PNG from More, and copy a search record from Controls. About & cite provides references, software citations, and the public build identity.'
  }
];

function openTour(step = 0) {
  const item = TOUR_STEPS[Math.max(0, Math.min(TOUR_STEPS.length - 1, step))];
  const actions = `
    <button class="btn btn-secondary" id="tour-prev">Previous</button>
    <button class="btn" id="tour-next">${step >= TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</button>
  `;
  openModal(item.title, `<p>${htmlEscape(item.body)}</p>`, actions);
  const prev = document.getElementById('tour-prev');
  const next = document.getElementById('tour-next');
  if (prev) prev.disabled = step === 0;
  if (prev) prev.addEventListener('click', () => openTour(step - 1));
  if (next) next.addEventListener('click', () => {
    if (step >= TOUR_STEPS.length - 1) closeModal();
    else openTour(step + 1);
  });
}

function saveExplorerImage() {
  if (elBtnSaveImage?.disabled) return;
  const canvases = state.focusedPanel === 'parameter' ? [canvasParam]
    : state.focusedPanel === 'dynamical' ? [canvasDyn] : [canvasParam, canvasDyn];
  const width = canvases.reduce((sum, canvas) => sum + canvas.width, 0);
  const plotHeight = Math.max(...canvases.map(canvas => canvas.height));
  const header = 96;
  const footer = 74;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = plotHeight + header + footer;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = '#162238';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText(`Collinear Fractals · n = ${state.n}`, 12, 24, width - 24);
  ctx.font = '12px system-ui, sans-serif';
  const input = `${state.cx.toPrecision(9)} ${state.cy < 0 ? '−' : '+'} ${Math.abs(state.cy).toPrecision(9)}i`;
  ctx.fillText(`Input c = ${input}`, 12, 44, width - 24);
  ctx.fillText(`Requested search: k_max = ${state.kMax} · L_max = ${state.LMax} per level · q = ${state.modulo}`, 12, 63, width - 24);
  let x = 0;
  for (const canvas of canvases) {
    const parameterLabel = { mn: 'Mₙ', mn0: 'Mₙ⁰', mn1: 'Mₙ¹', compare: 'Mₙ and Mₙ⁰' }[state.parameterMode];
    const dynamicalLabel = state.showDifference
      ? (state.showCollinear ? 'E(c,n) and ½E(c,2n−1)' : '½E(c,2n−1)')
      : state.showCollinear ? 'E(c,n)' : 'Guides';
    const title = canvas === canvasParam ? `Parameter plane · ${parameterLabel}` : `Dynamical plane · ${dynamicalLabel}`;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = '#162238';
    ctx.fillText(title, x + 12, 85, canvas.width - 24);
    ctx.drawImage(canvas, x, header);
    x += canvas.width;
  }
  const test = selectedSearchResult();
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#516078';
  ctx.fillText(`Selected Mₙ search: ${test.verdict} · ${test.stopReason}`, 12, header + plotHeight + 21, width - 24);
  const gpuPanels = canvases.map(canvas => ({ canvas,
    info: renderingInfo[canvas === canvasParam ? 'parameter' : 'dynamical'] }))
    .filter(panel => panel.info?.active_backend === 'webgl2');
  const boundaryLimits = gpuPanels.filter(({ canvas }) => canvas === canvasParam
    ? state.parameterMode !== 'mn' : state.showCollinear && state.rendererMode === 'boundary')
    .map(({ info }) => info.gpu.effective);
  const searchLimits = gpuPanels.filter(({ canvas }) => canvas === canvasParam
    ? ['mn', 'compare'].includes(state.parameterMode)
    : state.showDifference || (state.showCollinear && state.rendererMode === 'survival'))
    .map(({ info }) => info.gpu.effective);
  const limitLabels = [];
  if (boundaryLimits.length) limitLabels.push(`E membership: depth ≤ ${Math.max(...boundaryLimits.map(limits => limits.escape_depth))}, work ≤ ${Math.max(...boundaryLimits.map(limits => limits.boundary_work))}`);
  if (searchLimits.length) limitLabels.push(`search: depth ≤ ${Math.max(...searchLimits.map(limits => limits.depth))}, frontier ≤ ${Math.max(...searchLimits.map(limits => limits.frontier))}, work ≤ ${Math.max(...searchLimits.map(limits => limits.work))}`);
  ctx.fillText(gpuPanels.length ? `GPU PREVIEW · float32 · ${limitLabels.join(' · ')}.`
    : 'Double-precision rendering · finite searches and visual approximations.', 12, header + plotHeight + 40, width - 24);
  ctx.fillText('Export the JSON record for parameters, evidence, rendering limits and view metadata.', 12, header + plotHeight + 59, width - 24);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = `collinear-fractals-n${state.n}-k${state.kMax}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Resize handler
function resizeCanvases(options = {}) {
  let changed = false;
  for (const canvas of [canvasParam, canvasDyn]) {
    const width = Math.max(0, Math.floor(canvas.parentElement.clientWidth));
    const height = Math.max(0, Math.floor(canvas.parentElement.clientHeight));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      changed = true;
    }
  }
  if (options.resetViewports) {
    resetParamViewportMath();
    resetDynViewportMath();
  }
  if (changed || options.resetViewports) {
    triggerParamRender();
    triggerDynRender();
  }
}

let resizeRequestId = null;
function scheduleResize() {
  if (resizeRequestId !== null) cancelAnimationFrame(resizeRequestId);
  resizeRequestId = requestAnimationFrame(() => {
    resizeRequestId = null;
    resizeCanvases();
  });
}
window.addEventListener('resize', scheduleResize);
const canvasResizeObserver = new ResizeObserver(scheduleResize);
canvasResizeObserver.observe(canvasParam.parentElement);
canvasResizeObserver.observe(canvasDyn.parentElement);


// Coordinate conversion helpers preserving 1:1 Aspect Ratio (No distortion)
function paramToScreen(x, y) {
  const w = canvasParam.width;
  const h = canvasParam.height;
  const vw = state.paramZoom;
  const vh = vw * (h / w);
  const xMin = state.paramCenter.x - vw / 2;
  const yMin = state.paramCenter.y - vh / 2;
  
  const sx = ((x - xMin) / vw) * w;
  const sy = (1.0 - (y - yMin) / vh) * h;
  return { x: sx, y: sy };
}

function screenToParam(sx, sy) {
  const w = canvasParam.width;
  const h = canvasParam.height;
  const vw = state.paramZoom;
  const vh = vw * (h / w);
  const xMin = state.paramCenter.x - vw / 2;
  const yMin = state.paramCenter.y - vh / 2;
  
  const x = xMin + (sx / w) * vw;
  const y = yMin + (1.0 - sy / h) * vh;
  return { x, y };
}

function dynToScreen(x, y) {
  const w = canvasDyn.width;
  const h = canvasDyn.height;
  const vw = state.dynZoom;
  const vh = vw * (h / w);
  const xMin = state.dynCenter.x - vw / 2;
  const yMin = state.dynCenter.y - vh / 2;
  
  const sx = ((x - xMin) / vw) * w;
  const sy = (1.0 - (y - yMin) / vh) * h;
  return { x: sx, y: sy };
}

function screenToDyn(sx, sy) {
  const w = canvasDyn.width;
  const h = canvasDyn.height;
  const vw = state.dynZoom;
  const vh = vw * (h / w);
  const xMin = state.dynCenter.x - vw / 2;
  const yMin = state.dynCenter.y - vh / 2;
  
  const x = xMin + (sx / w) * vw;
  const y = yMin + (1.0 - sy / h) * vh;
  return { x, y };
}

// Reset viewports mathematically
function resetParamViewportMath() {
  const Rx = 1.0 + Math.sqrt(state.n - 1);
  const Ry = Math.sqrt(state.n + 1);
  
  state.paramCenter = { x: 0.0, y: 0.0 };
  
  const w = canvasParam.width || 800;
  const h = canvasParam.height || 600;
  
  const zoomToFitW = 2.0 * Rx;
  const zoomToFitH = (2.0 * Ry) * (w / h);
  
  // Short panels need room beneath the floating camera controls for the marker.
  state.paramZoom = Math.max(zoomToFitW, zoomToFitH) * (h < 400 ? 1.25 : 1.08);
}

function resetDynViewportMath() {
  const eff = getEffectiveC(state.cx, state.cy);
  try {
    const bounds = attractorBounds({ re: eff.x, im: eff.y }, state.n);
    state.dynCenter = { x: 0.0, y: 0.0 };
    const h = canvasDyn.height || 600;
    const w = canvasDyn.width || 800;
    const fittedZoom = Math.max(2 * bounds.xMax, 2 * bounds.yMax * w / h) * 1.15;
    state.dynZoom = Math.min(1e6, fittedZoom);
    if (fittedZoom > 1e6) chrome?.announce('The attractor exceeds the maximum camera span. Fit shows the widest available view.');
  } catch {
    state.dynCenter = { x: 0.0, y: 0.0 };
    state.dynZoom = 8.0;
    chrome?.announce('A finite automatic fit is unavailable for this parameter. Use the camera controls to explore it.');
  }
}

// Parameter Plane Rendering
function markRendering(canvas, status) {
  canvas.dataset.renderState = status;
  const kind = canvas === canvasParam ? 'parameter' : 'dynamical';
  const info = renderingInfo[kind];
  if (status === 'complete' && info && info.active_backend !== 'webgl2' && info.phase !== 'complete') {
    updateRenderingInfo(kind, { ...info, phase: 'complete' });
  }
  const readout = document.getElementById(canvas === canvasParam ? 'parameter-render-status' : 'dynamical-render-status');
  const statusText = status === 'complete' ? (info?.active_backend === 'webgl2' ? 'GPU preview' : 'Ready') : 'Refining…';
  if (readout && readout.textContent !== statusText) readout.textContent = statusText;
  canvas.setAttribute('aria-busy', status === 'rendering' ? 'true' : 'false');
  updateExportAvailability();
}

function updateExportAvailability() {
  if (!elBtnSaveImage) return;
  const visible = [canvasParam, canvasDyn].filter(canvas => canvas.width > 0 && canvas.height > 0);
  const complete = visible.length > 0 && visible.every(canvas => canvas.dataset.renderState === 'complete');
  elBtnSaveImage.disabled = !complete;
  elBtnSaveImage.title = complete ? 'Download the completed view as PNG' : 'The image will be available when refinement finishes';
}

// Workers and the main-thread fallback share the same sampling and palette code.
// Small tiles bound each synchronous slice; each completed pass covers the full view.
function cancelMainThreadRaster(kind) {
  const run = mainThreadRuns[kind];
  if (run) { run.cancelled = true; run.layer.width = 0; run.layer.height = 0; }
  mainThreadRuns[kind] = null;
}

function startMainThreadRaster(kind, metadata) {
  cancelMainThreadRaster(kind);
  const canvas = kind === 'parameter' ? canvasParam : canvasDyn;
  const context = kind === 'parameter' ? ctxParam : ctxDyn;
  const steps = kind === 'parameter' ? PARAM_RENDER_STEPS : DYN_RENDER_STEPS;
  const fullJob = rasterJob(kind);
  const colors = rasterColors();
  const layer = document.createElement('canvas');
  const run = { layer, cancelled: false, stage: 0, x: 0, y: 0, started: performance.now() };
  mainThreadRuns[kind] = run;
  updateRenderingInfo(kind, { ...metadata, requested_backend: state.backend,
    active_backend: 'cpu-main-thread', phase: 'refining', arithmetic: 'binary64',
    pixels_completed: 0, total_pixels: fullJob.width * fullJob.height,
    requested_limits: { depth: fullJob.kMax, frontier: fullJob.LMax,
      escape_depth: fullJob.escapeDepth, boundary_work: fullJob.boundaryWork, tolerance: fullJob.tol } });

  function prepareStage() {
    const width = Math.max(1, Math.ceil(fullJob.width / steps[run.stage]));
    const height = Math.max(1, Math.ceil(fullJob.height * width / fullJob.width));
    run.prepared = prepareRasterJob({ ...fullJob, width, height });
    layer.width = width; layer.height = height;
    run.layerContext = layer.getContext('2d');
    run.layerContext.fillStyle = `rgb(${colors.exterior.join(',')})`;
    run.layerContext.fillRect(0, 0, width, height);
    run.x = 0; run.y = 0;
  }
  function paint(complete) {
    context.imageSmoothingEnabled = false;
    const scaledHeight = layer.height * canvas.width / layer.width;
    context.drawImage(layer, 0, (canvas.height - scaledHeight) / 2, canvas.width, scaledHeight);
    if (kind === 'parameter') {
      if (complete) saveParameterRaster();
      drawParameterLensGuides(true);
    } else {
      drawOriginalAttractorOverlay();
      drawDynamicalGuidesAndOverlays();
    }
  }
  function schedule() {
    const id = requestAnimationFrame(pump);
    if (kind === 'parameter') renderRequestId = id;
    else dynRenderRequestId = id;
  }
  function pump() {
    if (run.cancelled || mainThreadRuns[kind] !== run) return;
    if (kind === 'parameter') renderRequestId = null;
    else dynRenderRequestId = null;
    const started = performance.now();
    while (run.y < layer.height) {
      const tile = renderRasterTile(run.prepared, {
        x: run.x, y: run.y, width: Math.min(16, layer.width - run.x), height: 1
      });
      const rgba = colorizeRasterTile(tile.data, run.prepared.job, colors, tile.pieces);
      run.layerContext.putImageData(new ImageData(rgba, tile.width, tile.height), tile.x, tile.y);
      run.x += tile.width;
      if (run.x >= layer.width) { run.x = 0; run.y++; }
      if (performance.now() - started >= 8) { paint(false); schedule(); return; }
    }
    const complete = run.stage === steps.length - 1;
    paint(complete);
    if (complete) {
      updateRenderingInfo(kind, { ...renderingInfo[kind], phase: 'complete',
        pixels_completed: fullJob.width * fullJob.height, total_pixels: fullJob.width * fullJob.height,
        elapsed_ms: performance.now() - run.started });
      markRendering(canvas, 'complete');
      mainThreadRuns[kind] = null;
      layer.width = 0; layer.height = 0;
    } else { run.stage++; prepareStage(); schedule(); }
  }
  prepareStage();
  schedule();
}

function triggerParamRender({ skipHybrid = false, metadata = null } = {}) {
  hybridRenderer.cancel('parameter');
  cancelMainThreadRaster('parameter');
  if (renderRequestId !== null) cancelAnimationFrame(renderRequestId);
  renderRequestId = null;
  clearParameterRaster();
  if (!canvasParam.width || !canvasParam.height) return;
  markRendering(canvasParam, 'rendering');
  updateStatusBar(selectedSearchResult());
  if (!skipHybrid) startHybridPanel('parameter');
  else startMainThreadRaster('parameter', metadata);
}

function drawParameterLensGuides(completedStage = false) {
  if (!canvasParam.width || !canvasParam.height) return;
  // Restoring a coarse snapshot during refinement would erase completed rows.
  if (!completedStage && canvasParam.dataset.renderState !== 'complete') return;
  if (parameterRasterSnapshot) {
    ctxParam.drawImage(parameterRasterSnapshot, 0, 0);
  }
  
  if (state.showEscapeStrata) {
    // Escape mode: do not show the lens, just add the circle at |c|=1+\sqrt{n-1}
    ctxParam.save();
    ctxParam.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctxParam.lineWidth = 1.0;
    ctxParam.setLineDash([4, 6]);
    
    const R = 1.0 + Math.sqrt(state.n - 1);
    const origin = paramToScreen(0, 0);
    const screenR = (R / state.paramZoom) * canvasParam.width;
    
    ctxParam.beginPath();
    ctxParam.arc(origin.x, origin.y, screenR, 0, Math.PI * 2);
    ctxParam.stroke();
    ctxParam.restore();
  } else {
    // Default mode: show full lens guides
    ctxParam.save();
    ctxParam.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctxParam.lineWidth = 1.0;
    ctxParam.setLineDash([4, 6]);
    
    const subset = state.parameterMode === 'mn0' || state.parameterMode === 'mn1';
    const radius = Math.sqrt(subset ? state.n + 1 : 2 * state.n);
    
    const leftCenter = paramToScreen(-1.0, 0.0);
    const rightCenter = paramToScreen(1.0, 0.0);
    
    const screenRadius = (radius / state.paramZoom) * canvasParam.width;
    
    // Draw overlapping circles
    ctxParam.beginPath();
    ctxParam.arc(leftCenter.x, leftCenter.y, screenRadius, 0, Math.PI * 2);
    ctxParam.stroke();
    
    ctxParam.beginPath();
    ctxParam.arc(rightCenter.x, rightCenter.y, screenRadius, 0, Math.PI * 2);
    ctxParam.stroke();
    
    // Unit disk guide
    ctxParam.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctxParam.setLineDash([2, 4]);
    const origin = paramToScreen(0, 0);
    const r1 = (1.0 / state.paramZoom) * canvasParam.width;
    ctxParam.beginPath();
    ctxParam.arc(origin.x, origin.y, r1, 0, Math.PI * 2);
    ctxParam.stroke();
    
    // Real axis guide
    ctxParam.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctxParam.setLineDash([]);
    ctxParam.beginPath();
    const left = paramToScreen(state.paramCenter.x - state.paramZoom / 2, 0);
    const right = paramToScreen(state.paramCenter.x + state.paramZoom / 2, 0);
    ctxParam.moveTo(left.x, left.y);
    ctxParam.lineTo(right.x, right.y);
    ctxParam.stroke();
    ctxParam.restore();
  }

  // Selected c marker dot
  const dot = paramToScreen(state.cx, state.cy);
  ctxParam.beginPath();
  ctxParam.fillStyle = '#dc2626'; // primary red select cursor
  ctxParam.strokeStyle = '#ffffff';
  ctxParam.lineWidth = 1.5;
  ctxParam.arc(dot.x, dot.y, 6.0, 0, Math.PI * 2);
  ctxParam.fill();
  ctxParam.stroke();
}

// Progressive finite-search dynamical-plane rendering
function selectedSearchResult() {
  const key = [state.cx, state.cy, state.n, state.kMax, state.LMax, state.tol].join('|');
  if (!selectedSearchCache || selectedSearchCache.key !== key) {
    selectedSearchCache = { key, result: inverseIterationTestDetailed(state.cx, state.cy, state.n, state.kMax, state.LMax, state.tol) };
  }
  return selectedSearchCache.result;
}

function selectedParameterViewResult() {
  const depth = boundaryDepthFor('parameter');
  const key = [state.cx, state.cy, state.n, state.kMax, state.LMax, state.tol, state.parameterMode, depth].join('|');
  if (!selectedParameterViewCache || selectedParameterViewCache.key !== key) {
    selectedParameterViewCache = { key, result: classifyParameterView(
      state.cx, state.cy, state.n, state.kMax, state.LMax, state.tol, state.parameterMode,
      { escapeDepth: depth, boundaryWork: BOUNDARY_WORK_LIMIT }
    ) };
  }
  return selectedParameterViewCache.result;
}

function triggerDynRender({ skipHybrid = false, metadata = null } = {}) {
  hybridRenderer.cancel('dynamical');
  cancelMainThreadRaster('dynamical');
  if (dynRenderRequestId !== null) cancelAnimationFrame(dynRenderRequestId);
  dynRenderRequestId = null;
  lastAttractorMetadata = null;
  updateStatusBar(selectedSearchResult());
  if (!canvasDyn.width || !canvasDyn.height) return;
  // The context normalizes reciprocal inputs and reports overflow explicitly.
  const geometry = createAttractorMembershipContext(state.cx, state.cy, state.n, state.tol);
  markRendering(canvasDyn, 'rendering');
  if (geometry.error) {
    updateRenderingInfo('dynamical', { requested_backend: state.backend, active_backend: 'cpu-geometry',
      phase: 'refining', arithmetic: 'binary64', renderer: geometry.error });
    dynRenderRequestId = requestAnimationFrame(() => {
      ctxDyn.fillStyle = getExteriorColorString();
      ctxDyn.fillRect(0, 0, canvasDyn.width, canvasDyn.height);
      drawDynamicalGuidesAndOverlays();
      dynRenderRequestId = null;
      markRendering(canvasDyn, 'complete');
    });
    return;
  }
  if (!state.showDifference && !(state.showCollinear && ['boundary', 'survival'].includes(state.rendererMode))) {
    updateRenderingInfo('dynamical', { requested_backend: state.backend, active_backend: 'cpu-geometry',
      phase: 'refining', arithmetic: 'binary64', renderer: state.rendererMode });
    dynRenderRequestId = requestAnimationFrame(() => {
      ctxDyn.fillStyle = getExteriorColorString();
      ctxDyn.fillRect(0, 0, canvasDyn.width, canvasDyn.height);
      drawOriginalAttractorOverlay();
      drawDynamicalGuidesAndOverlays();
      dynRenderRequestId = null;
      markRendering(canvasDyn, 'complete');
    });
    return;
  }
  if (!skipHybrid) startHybridPanel('dynamical');
  else startMainThreadRaster('dynamical', metadata);
}

function drawOriginalAttractorOverlay() {
  if (state.rendererMode === 'boundary') return;
  lastAttractorMetadata = null;
  if (!state.showCollinear || state.rendererMode === 'survival') return;

  const eff = getEffectiveC(state.cx, state.cy);
  const c = { re: eff.x, im: eff.y };
  const rho = Math.hypot(c.re, c.im);
  if (!Number.isFinite(rho) || rho <= 1 || c.im === 0) return;

  const cacheKey = JSON.stringify([state.cx, state.cy, state.n, state.rendererMode, state.attractorDepth,
    state.histogramSeed, state.histogramSamples, state.firstLevelPieces, state.originalAttractorOpacity,
    activePalette().branch, state.dynCenter, state.dynZoom, canvasDyn.width, canvasDyn.height]);
  if (overlayCache?.key === cacheKey) {
    ctxDyn.drawImage(overlayCache.canvas, 0, 0);
    lastAttractorMetadata = overlayCache.metadata;
    return;
  }
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = canvasDyn.width;
  layerCanvas.height = canvasDyn.height;
  const layerContext = layerCanvas.getContext('2d');
  const project = (x, y) => dynToScreen(x, y);
  const pixelRadius = state.dynZoom / Math.max(1, canvasDyn.width);
  const shared = {
    c,
    m: state.n,
    project,
    opacity: state.originalAttractorOpacity,
    firstLevelPieces: state.firstLevelPieces,
    baseColor: activePalette().branch || '#111827'
  };

  if (state.rendererMode === 'histogram') {
    lastAttractorMetadata = attractorRenderers.renderHistogramAttractor(layerContext, {
      ...shared,
      seed: state.histogramSeed,
      samples: state.histogramSamples
    });
  } else {
    lastAttractorMetadata = attractorRenderers.renderPrefixAttractor(layerContext, {
      ...shared,
      requestedDepth: state.attractorDepth,
      pixelRadius
    });
  }
  overlayCache = { key: cacheKey, canvas: layerCanvas, metadata: lastAttractorMetadata };
  ctxDyn.drawImage(layerCanvas, 0, 0);
}

function drawDynamicalGuidesAndOverlays() {
  const width = canvasDyn.width;
  const height = canvasDyn.height;
  
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const n = state.n;
  const rho = Math.hypot(cx, cy);
  const isLensN = inLens(state.cx, state.cy, n);
  
  // Real and Imaginary axes
  ctxDyn.save();
  ctxDyn.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctxDyn.lineWidth = 1.0;
  const origin = dynToScreen(0, 0);
  
  ctxDyn.beginPath();
  ctxDyn.moveTo(origin.x, 0);
  ctxDyn.lineTo(origin.x, height);
  ctxDyn.stroke();
  
  ctxDyn.beginPath();
  ctxDyn.moveTo(0, origin.y);
  ctxDyn.lineTo(width, origin.y);
  ctxDyn.stroke();
  
  // Unit circle scaled down by 2 (radius 0.5)
  ctxDyn.strokeStyle = 'rgba(0, 0, 0, 0.03)';
  const radius05 = (0.5 / state.dynZoom) * width;
  ctxDyn.beginPath();
  ctxDyn.arc(origin.x, origin.y, radius05, 0, Math.PI * 2);
  ctxDyn.stroke();
  ctxDyn.restore();
  
  // Draw 1/2 Enclosure
  if (state.showEnclosure && Number.isFinite(rho) && rho > 1 && cy !== 0) {
    const enc = computeEnclosureGeneral(state.cx, state.cy, 2 * n - 1, state.tol);
    if (!enc.err) {
      drawParallelogramScaled(enc.se, enc.ve, 'rgba(79, 70, 229, 0.02)', '#4f46e5', false);
    }
  }
  
  // Draw 1/2 Trap
  if (state.showTrap && rho > 1 && cy !== 0 && Number.isFinite(rho)) {
    const N = 2 * n - 1;
    const { S, V } = getTrapHalfWidths(cx, cy, N, isLensN);
    drawParallelogramScaled(S, V, 'rgba(5, 150, 105, 0.04)', '#059669', true);
  }
  
  // Run search test to draw Tree and winning path
  const test = selectedSearchResult();
  
  updateStatusBar(test);
  
  // Draw Tree (scaled down by 2)
  if (state.showTree && test.tree) {
    drawOrbitTreeScaled(test.tree);
  }
  
  // Draw winning or escape path (scaled down by 2)
  if (state.showPath && test.tree && test.word && test.word.length > 0) {
    drawWinningPathScaled(test.tree, test.word, test.verdict);
  }
  
  // Draw origin reference dot
  ctxDyn.beginPath();
  ctxDyn.fillStyle = '#475569';
  ctxDyn.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
  ctxDyn.fill();
  
  // Draw parameter c marker dot (drag and drop enabled)
  const ptC = dynToScreen(cx, cy);
  ctxDyn.beginPath();
  ctxDyn.fillStyle = '#dc2626'; // primary red
  ctxDyn.strokeStyle = '#ffffff';
  ctxDyn.lineWidth = 1.5;
  if (Number.isFinite(ptC.x) && Number.isFinite(ptC.y)) ctxDyn.arc(ptC.x, ptC.y, 6.0, 0, Math.PI * 2);
  ctxDyn.fill();
  ctxDyn.stroke();
}

function drawParallelogramScaled(S, V, fillStyle, strokeStyle, isDashed) {
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const rho = Math.hypot(cx, cy);
  if (cy === 0.0 || rho === 0.0) return;
  
  // Corners divided by 2
  const tr = dynToScreen((S * rho - cx * V) / (2.0 * cy), V / 2.0);
  const tl = dynToScreen((-S * rho - cx * V) / (2.0 * cy), V / 2.0);
  const bl = dynToScreen((-S * rho + cx * V) / (2.0 * cy), -V / 2.0);
  const br = dynToScreen((S * rho + cx * V) / (2.0 * cy), -V / 2.0);
  
  ctxDyn.save();
  ctxDyn.fillStyle = fillStyle;
  ctxDyn.strokeStyle = strokeStyle;
  ctxDyn.lineWidth = 1.0;
  if (isDashed) {
    ctxDyn.setLineDash([3, 4]);
  }
  
  ctxDyn.beginPath();
  ctxDyn.moveTo(tr.x, tr.y);
  ctxDyn.lineTo(tl.x, tl.y);
  ctxDyn.lineTo(bl.x, bl.y);
  ctxDyn.lineTo(br.x, br.y);
  ctxDyn.closePath();
  ctxDyn.fill();
  ctxDyn.stroke();
  ctxDyn.restore();
}

function canonicalToComplex(s, v) {
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const rho = Math.hypot(cx, cy);
  if (cy === 0.0 || rho === 0.0) return { re: 0.0, im: 0.0 };
  const u = (s * rho - cx * v) / cy;
  return { re: u, im: v };
}

function drawOrbitTreeScaled(tree) {
  ctxDyn.save();
  const branch = hexToRgb(activePalette().branch);
  ctxDyn.strokeStyle = `rgba(${branch.r}, ${branch.g}, ${branch.b}, 0.24)`;
  ctxDyn.lineWidth = 1.0;
  
  for (let k = 1; k < tree.length; k++) {
    const W_prev = tree[k - 1];
    const W_curr = tree[k];
    
    for (const node of W_curr) {
      if (node.parentIdx !== -1 && node.parentIdx < W_prev.length) {
        const parent = W_prev[node.parentIdx];
        
        const zChild = canonicalToComplex(node.s, node.v);
        const zParent = canonicalToComplex(parent.s, parent.v);
        
        const ptChild = dynToScreen(zChild.re / 2.0, zChild.im / 2.0);
        const ptParent = dynToScreen(zParent.re / 2.0, zParent.im / 2.0);
        
        ctxDyn.beginPath();
        ctxDyn.moveTo(ptParent.x, ptParent.y);
        ctxDyn.lineTo(ptChild.x, ptChild.y);
        ctxDyn.stroke();
      }
    }
  }
  ctxDyn.restore();
}

function drawWinningPathScaled(tree, word, verdict) {
  if (!word || word.length === 0) return;
  
  ctxDyn.save();
  ctxDyn.strokeStyle = '#dc2626'; // Red for both captured and escaping orbits
  ctxDyn.lineWidth = 1.8;
  if (verdict === 'Exterior') {
    ctxDyn.setLineDash([4, 4]); // Dashed line path when exterior
  } else {
    ctxDyn.setLineDash([]); // Solid path when interior
  }
  
  let currIdx = 0;
  let zCurr = canonicalToComplex(tree[0][0].s, tree[0][0].v);
  let ptCurr = dynToScreen(zCurr.re / 2.0, zCurr.im / 2.0);
  
  for (let k = 1; k < tree.length; k++) {
    const W_curr = tree[k];
    const targetDigit = word[k - 1];
    let nextNode = null;
    let nextIdx = -1;
    
    for (let i = 0; i < W_curr.length; i++) {
      if (W_curr[i].parentIdx === currIdx && W_curr[i].t === targetDigit) {
        nextNode = W_curr[i];
        nextIdx = i;
        break;
      }
    }
    
    if (!nextNode) break;
    
    const zNext = canonicalToComplex(nextNode.s, nextNode.v);
    const ptNext = dynToScreen(zNext.re / 2.0, zNext.im / 2.0);
    
    ctxDyn.beginPath();
    ctxDyn.moveTo(ptCurr.x, ptCurr.y);
    ctxDyn.lineTo(ptNext.x, ptNext.y);
    ctxDyn.stroke();
    
    ptCurr = ptNext;
    currIdx = nextIdx;
  }
  ctxDyn.restore();
}

function currentCertificatePayload() {
  const record = buildCertificatePayload(selectedSearchResult(), {
    n: state.n, c: { re: state.cx, im: state.cy },
    kMax: state.kMax, LMax: state.LMax, tol: state.tol
  });
  const parameterView = selectedParameterViewResult();
  return {
    ...record,
    parameter_view: {
      mode: state.parameterMode,
      definition: {
        mn: '2c in E(c,2n-1)', mn0: 'c in E(c,n)',
        mn1: 'c in A_(n-1) + (1/c)E(c,n)', compare: 'M_n and M_n^0'
      }[state.parameterMode],
      search_record_set: 'M_n',
      escape_depth: boundaryDepthFor('parameter'), work_limit: BOUNDARY_WORK_LIMIT,
      mn: parameterView.mn, mn0: parameterView.mn0, mn1: parameterView.mn1
    },
    deployment: deploymentInfo ? { source_commit: deploymentInfo.source_commit, version: deploymentInfo.version } : null,
    software: 'Collinear Fractals GPU Explorer',
    version: record.software_version,
    generatedAt: new Date().toISOString(),
    // Keep the legacy browser field names for existing consumers.
    parameter: record.c ? { ...record.c, modulus: Math.hypot(record.c.re, record.c.im) } : null,
    arity: record.n,
    differenceAlphabetIndex: record.N,
    inLens: record.in_lens,
    trapRegion: record.trap_region,
    digits: record.word,
    nodesExplored: record.nodes_explored,
    search: { kMax: state.kMax, LMax: state.LMax, tolerance: state.tol },
    share_url: currentShareUrl(),
    view: {
      focused_panel: state.focusedPanel,
      parameter_center: { re: state.paramCenter.x, im: state.paramCenter.y },
      parameter_zoom: state.paramZoom,
      dynamical_center: { re: state.dynCenter.x, im: state.dynCenter.y },
      dynamical_zoom: state.dynZoom,
      dynamical_difference_scale: 0.5,
      original_attractor_scale: 1
    },
    visual_renderer: {
      role: 'visual-renderer',
      renderer_mode: state.rendererMode,
      visible: state.showCollinear && canvasDyn.width > 0 && canvasDyn.height > 0,
      render_status: canvasDyn.width > 0 && canvasDyn.height > 0 ? canvasDyn.dataset.renderState : 'hidden',
      ...lastAttractorMetadata,
      proof_status: 'visual-approximation'
    },
    rendering: {
      requested_backend: state.backend,
      parameter: canvasParam.width > 0 && canvasParam.height > 0 ? renderingInfo.parameter : null,
      dynamical: canvasDyn.width > 0 && canvasDyn.height > 0 ? renderingInfo.dynamical : null,
      selected_record_arithmetic: 'binary64',
      selected_record_uses_full_requested_limits: true
    },
    rounding_verified: false,
    note: 'The dynamical plane displays ½E(c,2n−1) and the original E(c,n) at their stated scales.'
  };
}

async function copyCertificateJSON() {
  await copyTextToClipboard(JSON.stringify(currentCertificatePayload(), null, 2));
  return true;
}

function downloadCertificateJSON() {
  const payload = currentCertificatePayload();
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const re = state.cx.toPrecision(7).replace(/[^0-9a-z]/gi, '_');
  const im = state.cy.toPrecision(7).replace(/[^0-9a-z]/gi, '_');
  a.href = url;
  a.download = `collinear-certificate-n${payload.arity}-c${re}_${im}i.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateStatusBar(test) {
  const rho = Math.hypot(state.cx, state.cy);
  const isLens = inLens(state.cx, state.cy, state.n);
  
  elStatC.textContent = `${state.cx.toFixed(5)} ${state.cy >= 0 ? '+' : '-'} ${Math.abs(state.cy).toFixed(5)}i`;
  elStatRho.textContent = rho.toFixed(5);
  elStatLens.textContent = isLens ? 'Yes' : 'No';
  elStatLens.style.color = isLens ? 'var(--color-interior)' : '#dc2626';
  
  elStatVerdict.className = `verdict-tag verdict-${test.verdict}`;
  elStatVerdict.textContent = test.verdict;
  elStatNodes.textContent = (test.nodesExplored ?? 0).toLocaleString();
  elStatDepth.textContent = test.depth;
  const viewDetail = document.getElementById('stat-view-detail');
  if (viewDetail) {
    viewDetail.hidden = state.parameterMode === 'mn';
    if (!viewDetail.hidden) {
      const view = selectedParameterViewResult();
      const subset = state.parameterMode === 'mn1' ? view.mn1 : view.mn0;
      const label = state.parameterMode === 'mn1' ? 'Mₙ¹' : 'Mₙ⁰';
      const description = subset.stopReason === 'trap-hit' ? 'canonical self-covering reached'
        : subset.displayReason === 'finite-survival' ? `survives depth ${subset.depth}`
        : `${subset.verdict} (${subset.stopReason})`;
      viewDetail.textContent = `${label}: ${description}. The main search record describes Mₙ.`;
    }
  }
  const reasons = {
    'outside-domain': 'Real axis / unit circle unsupported',
    'numerical-range': 'Numerical range exceeded',
    'enclosure-escape': 'Marked point outside enclosure',
    'trap-hit': 'Trap reached',
    'tree-exhausted': 'Admissible tree exhausted',
    'node-cap': 'Per-level node cap reached',
    'depth-cap': 'Depth limit reached'
  };
  if (elStatReason) elStatReason.textContent = reasons[test.stopReason] || test.stopReason || '';
  if (elStatEffective) {
    const effective = getEffectiveC(state.cx, state.cy);
    const reciprocal = Math.hypot(state.cx, state.cy) > 0 && Math.hypot(state.cx, state.cy) < 1;
    elStatEffective.hidden = !reciprocal;
    elStatEffective.textContent = reciprocal
      ? `Evaluated at 1/c = ${effective.x.toPrecision(7)} ${effective.y < 0 ? '−' : '+'} ${Math.abs(effective.y).toPrecision(7)}i` : '';
  }
  // Status is also refreshed asynchronously during rendering. Controls are
  // synchronized by state-changing actions so an unfinished edit survives here.

  if (isInteriorVerdict(test.verdict) && test.word) {
    elStatWord.textContent = `[${test.word.join(', ')}]`;
    elStatWord.style.color = test.verdict === 'Interior-offLens' ? '#2563eb' : 'var(--color-interior)';
  } else if (test.verdict === 'Exterior' && test.word && test.word.length > 0) {
    elStatWord.textContent = `[${test.word.join(', ')}]`;
    elStatWord.style.color = '#dc2626'; // distinguished red for escape word
  } else {
    elStatWord.textContent = 'None';
    elStatWord.style.color = 'var(--text-secondary)';
  }
}

// Update color boxes in Legend overlays
function updateLegendColors() {
  const swatch = (id, color) => {
    const element = document.getElementById(id);
    if (element) element.style.background = color;
    return element;
  };
  const interior = state.showEscapeStrata ? getExteriorColorString() : rgbToCss(getColorForLevel(0, 0));
  swatch('legend-locus-color', interior);
  swatch('legend-diff-color', interior);
  swatch('legend-offlens-color', state.showEscapeStrata ? getExteriorColorString() : rgbToCss(getOffLensInteriorColorForLevel(0, 0)));
  swatch('legend-undetermined-color', getUndeterminedColorString());
  const exterior = swatch('legend-exterior-color', state.showEscapeStrata
    ? `linear-gradient(90deg, ${getEscapeColorString(0)}, ${getEscapeColorString(10)})` : getExteriorColorString());
  if (exterior) exterior.nextElementSibling.textContent = state.showEscapeStrata ? 'Escape depth (mod 11)' : 'Exterior';
  swatch('legend-coll-color', state.firstLevelPieces && state.rendererMode !== 'survival'
    ? `linear-gradient(90deg, ${PIECE_COLORS.slice(0, state.n).join(', ')})` : activePalette().branch);
  for (const [selector, visible] of [
    ['#legend-diff-color', state.showDifference],
    ['#legend-coll-color', state.showCollinear],
    ['.legend-trap', state.showTrap],
    ['.legend-enclosure', state.showEnclosure]
  ]) {
    const element = document.querySelector(selector);
    if (element) element.closest('.legend-item').hidden = !visible;
  }
  const subsetOnly = state.parameterMode === 'mn0' || state.parameterMode === 'mn1';
  const subsetLabel = state.parameterMode === 'mn1' ? 'Mₙ¹' : 'Mₙ⁰';
  const locus = document.getElementById('legend-locus-color');
  if (locus) {
    locus.style.background = interior;
    locus.nextElementSibling.textContent = subsetOnly ? `${subsetLabel} self-covering capture` : 'Mₙ in-lens capture (depth mod q)';
  }
  document.getElementById('legend-offlens-color')?.closest('.legend-item')?.toggleAttribute('hidden', subsetOnly);
  const lens = document.querySelector('.legend-lens');
  if (lens?.nextElementSibling) lens.nextElementSibling.textContent = subsetOnly ? 'Original-attractor self-covering lens' : 'Parameter lens';
  const survivalLegend = document.getElementById('legend-subset-survival');
  survivalLegend.lastElementChild.textContent = state.parameterMode === 'compare'
    ? 'Mₙ⁰ capture or finite-depth survival' : `${subsetLabel} finite-depth survivors`;
  survivalLegend.hidden = state.parameterMode === 'mn';
  const boundaryNote = document.getElementById('boundary-renderer-note');
  if (boundaryNote) boundaryNote.hidden = state.rendererMode !== 'boundary' || !state.showCollinear;
  if (state.rendererMode === 'boundary' && state.showCollinear) updateBoundaryMetadata();
}

// Pointer capture keeps drags stable across canvas boundaries; the same controls work by touch.
function bindCanvasInteractions(canvas, panel) {
  const isParam = panel === 'param';
  const fromScreen = isParam ? screenToParam : screenToDyn;
  const toScreen = isParam ? paramToScreen : dynToScreen;
  const centerKey = isParam ? 'paramCenter' : 'dynCenter';
  const zoomKey = isParam ? 'paramZoom' : 'dynZoom';
  const rerender = isParam ? triggerParamRender : triggerDynRender;
  const pointers = new Map();
  let dragLocator = false;
  let lastPoint = null;
  let pinch = null;
  let lastTap = null;
  let wheelTime = -Infinity;
  const localPoint = e => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * canvas.width / rect.width,
      y: (e.clientY - rect.top) * canvas.height / rect.height };
  };
  const selectPoint = point => {
    const coord = fromScreen(point.x, point.y);
    state.cx = coord.x;
    state.cy = coord.y;
    Object.assign(state, normalizeExplorerState(state, DEFAULT_STATE));
    updateControlsFromState();
    drawParameterLensGuides();
    triggerDynRender();
  };
  const zoomAt = (point, factor) => {
    const anchor = fromScreen(point.x, point.y);
    const nextZoom = Math.max(1e-10, Math.min(1e6, state[zoomKey] * factor));
    const ratio = nextZoom / state[zoomKey];
    state[centerKey].x = anchor.x + (state[centerKey].x - anchor.x) * ratio;
    state[centerKey].y = anchor.y + (state[centerKey].y - anchor.y) * ratio;
    state[zoomKey] = nextZoom;
    Object.assign(state, normalizeExplorerState(state, DEFAULT_STATE));
  };
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.focus({ preventScroll: true });
    const point = localPoint(e);
    pointers.set(e.pointerId, point);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      pushHistory();
      exampleLoadGeneration++;
      const effective = getEffectiveC(state.cx, state.cy);
      const dot = isParam ? toScreen(state.cx, state.cy) : toScreen(effective.x, effective.y);
      dragLocator = Math.hypot(point.x - dot.x, point.y - dot.y) <= (e.pointerType === 'touch' ? 24 : 12);
      lastPoint = point;
      const now = performance.now();
      if (e.pointerType === 'touch' && lastTap && now - lastTap.time < 300 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 24) {
        selectPoint(point);
        lastTap = null;
      } else {
        lastTap = { ...point, time: now };
      }
    } else if (pointers.size === 2) {
      dragLocator = false;
      pinch = pinchState();
      lastTap = null;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const point = localPoint(e);
    pointers.set(e.pointerId, point);
    if (pointers.size === 2) {
      const next = pinchState();
      if (pinch && next.distance > 1 && pinch.distance > 1) {
        zoomAt(next, pinch.distance / next.distance);
        state[centerKey].x -= (next.x - pinch.x) * state[zoomKey] / canvas.width;
        state[centerKey].y += (next.y - pinch.y) * state[zoomKey] / canvas.width;
        Object.assign(state, normalizeExplorerState(state, DEFAULT_STATE));
        rerender();
      }
      pinch = next;
    } else if (dragLocator) {
      selectPoint(point);
    } else if (lastPoint) {
      state[centerKey].x -= (point.x - lastPoint.x) * state[zoomKey] / canvas.width;
      state[centerKey].y += (point.y - lastPoint.y) * state[zoomKey] / canvas.width;
      Object.assign(state, normalizeExplorerState(state, DEFAULT_STATE));
      rerender();
    }
    lastPoint = point;
  });
  const endPointer = e => {
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    pinch = null;
    lastPoint = pointers.size ? [...pointers.values()][0] : null;
    if (!pointers.size) dragLocator = false;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', e => { pointers.delete(e.pointerId); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    exampleLoadGeneration++;
    const now = performance.now();
    if (now - wheelTime > 250) pushHistory();
    wheelTime = now;
    zoomAt(localPoint(e), Math.exp(Math.max(-0.35, Math.min(0.35, e.deltaY * 0.0015))));
    rerender();
  }, { passive: false });
  canvas.addEventListener('dblclick', e => withHistory(() => selectPoint(localPoint(e)), 'dyn'));
  canvas.addEventListener('keydown', e => {
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key]) {
      e.preventDefault();
      withHistory(() => {
        const [dx, dy] = arrows[e.key];
        const distance = state[zoomKey] * (e.shiftKey ? 0.005 : 0.08);
        if (e.shiftKey) { state.cx += dx * distance; state.cy += dy * distance; }
        else { state[centerKey].x += dx * distance; state[centerKey].y += dy * distance; }
      }, e.shiftKey ? 'dyn' : panel);
    } else if (['+', '=', '-', '_'].includes(e.key)) {
      e.preventDefault();
      withHistory(() => zoomAt({ x: canvas.width / 2, y: canvas.height / 2 }, ['+', '='].includes(e.key) ? 0.8 : 1.25), panel);
    } else if (e.key === 'Home') {
      e.preventDefault();
      withHistory(isParam ? resetParamViewportMath : resetDynViewportMath, panel);
    }
  });
}
bindCanvasInteractions(canvasParam, 'param');
bindCanvasInteractions(canvasDyn, 'dyn');



function readNumericInput(element, fallback) {
  if (!element.value.trim()) return fallback;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : fallback;
}

chrome = createExplorerChrome({
  state,
  changeArity: value => withHistory(() => {
    state.n = Math.max(2, Math.min(100, Math.round(value)));
    resetParamViewportMath();
    resetDynViewportMath();
  }, 'both'),
  changeView: view => withHistory(() => { state.focusedPanel = view; }, 'both'),
  changeScene: mode => withHistory(() => setComparisonMode(mode), 'dyn'),
  changeParameterMode: mode => {
    withHistory(() => { state.parameterMode = mode; }, 'param');
    updateStatusBar(selectedSearchResult());
  },
  zoom: (panel, factor) => withHistory(() => {
    const key = panel === 'param' ? 'paramZoom' : 'dynZoom';
    state[key] *= factor;
  }, panel)
});

for (const input of [elParamModulus, elParamArgument]) {
  input?.addEventListener('change', () => {
    withHistory(() => {
      const radius = Math.max(0, Math.min(1e6, readNumericInput(elParamModulus, Math.hypot(state.cx, state.cy))));
      const degrees = Math.max(-180, Math.min(180, readNumericInput(elParamArgument, Math.atan2(state.cy, state.cx) * 180 / Math.PI)));
      const radians = degrees * Math.PI / 180;
      state.cx = radius * Math.cos(radians);
      state.cy = radius * Math.sin(radians);
      // Exact cardinal directions avoid turning a real-axis input into a tiny
      // imaginary parameter merely through trigonometric rounding.
      if (degrees === 0 || Math.abs(degrees) === 180) state.cy = 0;
      if (Math.abs(degrees) === 90) state.cx = 0;
    }, 'dyn');
  });
}

for (const input of [elParamReal, elParamImag]) {
  if (input) input.addEventListener('change', () => {
    withHistory(() => {
      state.cx = readNumericInput(elParamReal, state.cx);
      state.cy = readNumericInput(elParamImag, state.cy);
    }, 'dyn');
    elParamReal.value = state.cx;
    elParamImag.value = state.cy;
  });
}

// Event Listeners for Sidebar Controls
elAritySlider.addEventListener('input', (e) => {
  withHistory(() => {
    state.n = parseInt(e.target.value);
    resetParamViewportMath();
    resetDynViewportMath();
  }, 'both');
});

elKmax.addEventListener('change', (e) => {
  withHistory(() => {
    state.kMax = readNumericInput(e.target, state.kMax);
  }, 'both');
});

elLmax.addEventListener('change', (e) => {
  withHistory(() => {
    state.LMax = readNumericInput(e.target, state.LMax);
  }, 'both');
});

elRenderBackend?.addEventListener('change', event => {
  withHistory(() => { state.backend = event.target.value; }, 'both');
});

// Modulo & Palette inputs
elModulo.addEventListener('input', (e) => {
  withHistory(() => {
    state.modulo = Math.max(1, parseInt(e.target.value) || 3);
  }, 'both');
});

// Checklist layers visibility toggles
elShowCollinear.addEventListener('change', (e) => {
  withHistory(() => {
    state.showCollinear = e.target.checked;
  }, 'dyn');
});

elShowDiff.addEventListener('change', (e) => {
  withHistory(() => {
    state.showDifference = e.target.checked;
  }, 'dyn');
});

elShowTrap.addEventListener('change', (e) => {
  withHistory(() => {
    state.showTrap = e.target.checked;
  }, 'dyn');
});

elShowEnc.addEventListener('change', (e) => {
  withHistory(() => {
    state.showEnclosure = e.target.checked;
  }, 'dyn');
});

elShowTree.addEventListener('change', (e) => {
  withHistory(() => {
    state.showTree = e.target.checked;
  }, 'dyn');
});

elShowPath.addEventListener('change', (e) => {
  withHistory(() => {
    state.showPath = e.target.checked;
  }, 'dyn');
});

elShowEscapeStrata.addEventListener('change', (e) => {
  withHistory(() => {
    state.showEscapeStrata = e.target.checked;
  }, 'both');
});

// Reset viewports mathematically
elBtnResetParam.addEventListener('click', () => {
  withHistory(resetParamViewportMath, 'param');
});

elBtnResetDyn.addEventListener('click', () => {
  withHistory(resetDynViewportMath, 'dyn');
});

if (elBtnCopyCertificate) {
  elBtnCopyCertificate.addEventListener('click', () => {
    const originalText = elBtnCopyCertificate.textContent;
    copyCertificateJSON()
      .then(() => {
        elBtnCopyCertificate.textContent = 'Search record copied';
        window.setTimeout(() => { elBtnCopyCertificate.textContent = originalText; }, 1200);
      })
      .catch(() => openModal('Copy search record', `<p>Copy the record below.</p><pre tabindex="0">${htmlEscape(JSON.stringify(currentCertificatePayload(), null, 2))}</pre>`));
  });
}

if (elBtnDownloadCertificate) {
  elBtnDownloadCertificate.addEventListener('click', downloadCertificateJSON);
}

if (elBtnUndo) elBtnUndo.addEventListener('click', undoState);
if (elBtnRedo) elBtnRedo.addEventListener('click', redoState);
if (elBtnShare) elBtnShare.addEventListener('click', () => openShareModal('share'));
if (elBtnEmbed) elBtnEmbed.addEventListener('click', () => openShareModal('embed'));
if (elBtnSaveImage) elBtnSaveImage.addEventListener('click', saveExplorerImage);
if (elBtnTour) elBtnTour.addEventListener('click', () => openTour(0));
if (elBtnAbout) elBtnAbout.addEventListener('click', () => openAboutModal('intuition'));
if (elBtnSupport) elBtnSupport.addEventListener('click', openSupportModal);
if (elBtnFocusParam) elBtnFocusParam.addEventListener('click', () => withHistory(() => togglePanelFocus('parameter'), 'both'));
if (elBtnFocusDyn) elBtnFocusDyn.addEventListener('click', () => withHistory(() => togglePanelFocus('dynamical'), 'both'));

if (elExamplePreset) {
  elExamplePreset.addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) return;
    const generation = ++exampleLoadGeneration;
    const config = await loadExampleConfig(id);
    if (generation !== exampleLoadGeneration || e.target.value !== id) return;
    withHistory(() => applyExampleConfig(config), 'both');
    elExamplePreset.value = id;
  });
}

if (elComparisonMode) {
  elComparisonMode.addEventListener('change', (e) => {
    withHistory(() => setComparisonMode(e.target.value), 'both');
  });
}

if (elOriginalRendererMode) {
  elOriginalRendererMode.addEventListener('change', (e) => {
    withHistory(() => {
      state.rendererMode = e.target.value;
    }, 'dyn');
  });
}

elBoundaryDepth?.addEventListener('change', event => {
  withHistory(() => {
    state.boundaryDepth = Math.max(0, Math.min(100, Math.round(readNumericInput(event.target, state.boundaryDepth))));
  }, 'both');
});

elAdaptiveBoundary?.addEventListener('change', event => {
  withHistory(() => { state.adaptiveBoundary = event.target.checked; }, 'both');
});

if (elAttractorDepth) {
  elAttractorDepth.addEventListener('change', (e) => {
    withHistory(() => {
      state.attractorDepth = Math.max(1, Math.min(12, parseInt(e.target.value) || 7));
    }, 'dyn');
  });
}

if (elHistogramSeed) {
  elHistogramSeed.addEventListener('change', (e) => {
    withHistory(() => {
      state.histogramSeed = Math.max(1, parseInt(e.target.value) || 20260227);
    }, 'dyn');
  });
}

if (elHistogramSamples) {
  elHistogramSamples.addEventListener('change', (e) => {
    withHistory(() => {
      state.histogramSamples = Math.max(1000, Math.min(1000000, parseInt(e.target.value) || 50000));
    }, 'dyn');
  });
}

if (elFirstLevelPieces) {
  elFirstLevelPieces.addEventListener('change', (e) => {
    withHistory(() => {
      state.firstLevelPieces = e.target.checked;
    }, 'dyn');
  });
}

if (elOriginalAttractorOpacity) {
  elOriginalAttractorOpacity.addEventListener('input', (e) => {
    withHistory(() => {
      state.originalAttractorOpacity = Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100));
    }, 'dyn');
  });
}

if (elPaletteMode) {
  elPaletteMode.addEventListener('change', (e) => {
    withHistory(() => {
      state.palette = e.target.value;
    }, 'both');
  });
}

for (const [element, key] of [
  [elPaletteInterior, 'interior'],
  [elPaletteOffLens, 'offLens'],
  [elPaletteUndetermined, 'undetermined'],
  [elPaletteExterior, 'exterior']
]) {
  if (element) {
    element.addEventListener('input', (e) => {
      withHistory(() => {
        state.palette = 'custom';
        state.customPalette[key] = e.target.value;
      }, 'both');
    });
  }
}

if (elModalClose) elModalClose.addEventListener('click', closeModal);
if (elModalBackdrop) {
  elModalBackdrop.addEventListener('click', (e) => {
    if (e.target === elModalBackdrop) closeModal();
  });
}
if (elModalTabs) {
  elModalTabs.addEventListener('click', (e) => {
    const button = e.target.closest('.modal-tab');
    if (button) openAboutModal(button.dataset.tab);
  });
}

document.getElementById('parameter-panel').addEventListener('dblclick', (e) => {
  if (e.target.closest('.panel-header')) {
    withHistory(() => togglePanelFocus('parameter'), 'both');
  }
});

document.getElementById('dynamical-panel').addEventListener('dblclick', (e) => {
  if (e.target.closest('.panel-header')) {
    withHistory(() => togglePanelFocus('dynamical'), 'both');
  }
});

document.addEventListener('keydown', (e) => {
  if (elModalBackdrop && !elModalBackdrop.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (e.key === 'Tab') {
      const focusables = [...elModalBackdrop.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
        .filter(element => !element.disabled && element.getClientRects().length > 0);
      const first = focusables[0], last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (chrome?.handleKeydown(e)) return;
  if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redoState();
    else undoState();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redoState();
  } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveExplorerImage();
  } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    openShareModal('share');
  } else if (e.key === '?') {
    e.preventDefault();
    openTour(0);
  } else if (e.key === 'Escape') {
    if (elModalBackdrop && !elModalBackdrop.hidden) closeModal();
    else if (state.focusedPanel !== 'both') withHistory(() => { state.focusedPanel = 'both'; }, 'both');
  }
});

// Initial startup and externally navigated share states.
const controlsDisclosure = document.getElementById('controls-disclosure');
if (controlsDisclosure) controlsDisclosure.open = true;
applyStateFromHash();
const hasInitialHashState = legacyImport?.source !== 'default';
if (!hasInitialHashState) {
  applyExampleConfig(fallbackExampleConfig('e_c4_overlap'));
  setComparisonMode('collinear');
  state.showTrap = false;
  state.showEnclosure = false;
  state.showTree = false;
  state.showPath = false;
}
populateExamplePresets();
if (!hasInitialHashState && elExamplePreset) elExamplePreset.value = 'e_c4_overlap';
loadExampleIndex();
updateControlsFromState();
updateLegendColors();
updatePanelFocus();
resizeCanvases({ resetViewports: !hasInitialHashState });
triggerParamRender();
triggerDynRender();
if (legacyImport?.importedLegacy) {
  chrome.announce(legacyImport.warnings.length
    ? 'Imported the legacy parameter and view. Older shader settings stay in the archived explorer; see About.'
    : 'Imported the legacy parameter and view. New share links use this explorer.');
}
fetch('deployment.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
  .then(info => {
    if (info && info.schema_version === 1 && typeof info.source_commit === 'string' && /^[0-9a-f]{40}$/.test(info.source_commit)) {
      deploymentInfo = info;
      document.documentElement.dataset.sourceCommit = info.source_commit;
    }
  }).catch(() => { /* The explorer also runs from a source checkout without a deployment record. */ });
window.addEventListener('hashchange', () => {
  pushHistory();
  exampleLoadGeneration++;
  applyStateFromHash();
  updateControlsFromState();
  renderAfterStateChange('both');
});
window.addEventListener('pagehide', event => {
  if (!event.persisted) hybridRenderer.dispose();
});
