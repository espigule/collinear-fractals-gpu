/**
 * Collinear Fractals GPU Explorer
 * Interactive engine for rendering parameter and dynamical planes.
 * Features: aspect-ratio preservation, locator dragging on both planes,
 * cyclable modulo coloring, and smart zoom resets.
 */

// Math functions and algorithms
function getEffectiveC(x, y) {
  const rho2 = x * x + y * y;
  if (rho2 < 1.0 && rho2 > 0.0) {
    return { x: x / rho2, y: -y / rho2 };
  }
  return { x, y };
}

function inLens(x, y, n) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.sqrt(x * x + y * y);
  const N = 2 * n - 1;
  return rho > 1.0 && y !== 0.0 && (rho * rho + 2 * Math.abs(x) < N);
}

function inLensColl(x, y, n) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.sqrt(x * x + y * y);
  return rho > 1.0 && y !== 0.0 && (rho * rho + 2 * Math.abs(x) < n);
}


function chooseTailDepth(rho, tol, minM = 30, maxM = 2000) {
  const target = -Math.log(tol * (rho - 1.0)) / Math.log(rho);
  let M = Math.max(minM, Math.ceil(target));
  const capped = M > maxM;
  if (capped) M = maxM;
  return { M, capped };
}

function firstAlphabetDigitAtOrAbove(a, m) {
  const parity = ((m - 1) % 2 + 2) % 2;
  let t = Math.ceil(a);
  if (((t - parity) % 2 + 2) % 2 !== 0) t += 1;
  return t;
}

function interiorVerdict(isLens) {
  return isLens ? 'Interior' : 'Interior-offLens';
}

function isInteriorVerdict(verdict) {
  return verdict === 'Interior' || verdict === 'Interior-offLens';
}

function computeEnclosureGeneral(x, y, m, tol = 1e-8) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.sqrt(x * x + y * y);
  if (rho <= 1.0 || y === 0.0) {
    return { se: 0, ve: 0, err: true };
  }
  const theta = Math.atan2(y, x);
  const m_minus_1 = m - 1;

  const { M, capped } = chooseTailDepth(rho, tol);

  let val_sum = 0.0;
  for (let k = 1; k <= M; k++) {
    val_sum += Math.pow(rho, -k) * Math.abs(Math.sin(k * theta));
  }

  const tail = Math.pow(rho, -M) / (rho - 1.0);
  const ve = m_minus_1 * (val_sum + tail);
  const se = m_minus_1 * Math.abs(y) / rho + ve / rho;

  return {
    se,
    ve,
    err: false,
    truncationDepth: M,
    tail,
    tailCertifiedToTol: tail <= tol,
    tailCapHit: capped
  };
}

// Helper function to compute canonical trap half-widths S and V (works for both in-lens and off-lens)
function getTrapHalfWidths(x, y, m, isLens) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.sqrt(x * x + y * y);
  if (isLens) {
    const S = (m * Math.abs(y)) / rho;
    const V = Math.max(0.0, ((m - 2 * Math.abs(x)) * Math.abs(y)) / (rho * rho));
    return { S, V };
  } else {
    const n_prime = (m + 1) / 2.0;
    const kappa = n_prime > 7 ? (1 + Math.floor(-2.0 - 2.0 * Math.sqrt(n_prime) + n_prime)) : 1;
    const S = ((m - 1) * Math.abs(y)) / rho;
    const V = (kappa * Math.abs(y)) / (rho * rho);
    return { S, V };
  }
}

// Certified Inverse Search on general start coordinates (zx, zy)
function inverseIterationTestGeneral(cx, cy, zx, zy, m, isLens, se, ve, kMax, LMax, useTrap = true, customS = null, customV = null, isDiskTrap = false) {
  const rho = Math.sqrt(cx * cx + cy * cy);
  const s0 = (cx * zy + cy * zx) / rho;
  const v0 = zy;

  if (Math.abs(s0) > se || Math.abs(v0) > ve) {
    return { verdict: 'Exterior', depth: 0 };
  }

  let S, V;
  if (useTrap) {
    if (isDiskTrap) {
      if (s0 * s0 + v0 * v0 < customS * customS) {
        return { verdict: interiorVerdict(isLens), depth: 0, trapRegion: isLens ? 'lens' : 'off-lens' };
      }
    } else {
      if (customS !== null && customV !== null) {
        S = customS;
        V = customV;
      } else {
        const trap = getTrapHalfWidths(cx, cy, m, isLens);
        S = trap.S;
        V = trap.V;
      }
      if (Math.abs(s0) < S && Math.abs(v0) < V) {
        return { verdict: interiorVerdict(isLens), depth: 0, trapRegion: isLens ? 'lens' : 'off-lens' };
      }
    }
  }

  let W = [{ s: s0, v: v0 }];
  for (let k = 1; k <= kMax; k++) {
    const W_prime = [];
    for (const node of W) {
      const s = node.s;
      const v = node.v;

      const t1 = (rho * s - ve) / cy;
      const t2 = (rho * s + ve) / cy;
      const tMin = Math.min(t1, t2);
      const tMax = Math.max(t1, t2);

      const a = Math.max(-m + 1, Math.ceil(tMin));
      const b = Math.min(m - 1, Math.floor(tMax));

      if (a <= b) {
        let tStart = firstAlphabetDigitAtOrAbove(a, m);
        for (let t = tStart; t <= b; t += 2) {
          const vPrime = rho * s - cy * t;
          const sPrime = (2 * cx / rho) * vPrime - rho * v;

          if (Math.abs(sPrime) <= se) {
            if (useTrap) {
              if (isDiskTrap) {
                if (sPrime * sPrime + vPrime * vPrime < customS * customS) {
                  return { verdict: interiorVerdict(isLens), depth: k, trapRegion: isLens ? 'lens' : 'off-lens' };
                }
              } else {
                if (Math.abs(sPrime) < S && Math.abs(vPrime) < V) {
                  return { verdict: interiorVerdict(isLens), depth: k, trapRegion: isLens ? 'lens' : 'off-lens' };
                }
              }
            }
            W_prime.push({ s: sPrime, v: vPrime });
            if (W_prime.length >= LMax) {
              return { verdict: 'Undetermined', depth: k };
            }
          }
        }
      }
    }

    if (W_prime.length === 0) {
      return { verdict: 'Exterior', depth: k };
    }
    W = W_prime;
  }

  return { verdict: 'Undetermined', depth: kMax };
}

// Certified Inverse Search on parameter space (starts at 2c, returns full tree details)
function inverseIterationTestDetailed(x, y, n, kMax = 37, LMax = 1000, tol = 1e-8) {
  const eff = getEffectiveC(x, y);
  x = eff.x;
  y = eff.y;
  const rho = Math.sqrt(x * x + y * y);
  if (rho <= 1.0 || y === 0.0) {
    return { verdict: 'Undetermined', depth: 0, nodesExplored: 0, tree: [], reason: 'c outside domain' };
  }

  const N = 2 * n - 1;
  const isLens = inLens(x, y, n);

  const enc = computeEnclosureGeneral(x, y, N, tol);
  if (enc.err) {
    return { verdict: 'Undetermined', depth: 0, nodesExplored: 0, tree: [], reason: 'Enclosure error' };
  }
  const { se, ve } = enc;

  // Compute Trap
  const { S, V } = getTrapHalfWidths(x, y, N, isLens);

  const s0 = (4 * x * y) / rho;
  const v0 = 2 * y;

  const initialNode = { s: s0, v: v0, depth: 0, parentIdx: -1, t: 0 };
  const tree = [[initialNode]];

  if (Math.abs(s0) > se || Math.abs(v0) > ve) {
    return { verdict: 'Exterior', depth: 0, word: [], nodesExplored: 1, tree };
  }

  if (Math.abs(s0) < S && Math.abs(v0) < V) {
    return { verdict: interiorVerdict(isLens), depth: 0, nodesExplored: 1, tree, trapRegion: isLens ? 'lens' : 'off-lens' };
  }

  let totalNodes = 1;

  for (let k = 1; k <= kMax; k++) {
    const W_prev = tree[k - 1];
    const W_prime = [];

    for (let pIdx = 0; pIdx < W_prev.length; pIdx++) {
      const node = W_prev[pIdx];
      const s = node.s;
      const v = node.v;

      const t1 = (rho * s - ve) / y;
      const t2 = (rho * s + ve) / y;
      const tMin = Math.min(t1, t2);
      const tMax = Math.max(t1, t2);

      const a = Math.max(-N + 1, Math.ceil(tMin));
      const b = Math.min(N - 1, Math.floor(tMax));

      if (a <= b) {
        let tStart = firstAlphabetDigitAtOrAbove(a, N);
        for (let t = tStart; t <= b; t += 2) {
          const vPrime = rho * s - y * t;
          const sPrime = (2 * x / rho) * vPrime - rho * v;

          if (Math.abs(sPrime) <= se) {
            const nextNode = { s: sPrime, v: vPrime, depth: k, parentIdx: pIdx, t: t };
            
            if (Math.abs(sPrime) < S && Math.abs(vPrime) < V) {
              W_prime.push(nextNode);
              tree.push(W_prime);
              
              // Reconstruct winning path
              const path = [];
              let curr = nextNode;
              let d = k;
              while (curr && curr.parentIdx !== -1) {
                path.unshift(curr.t);
                curr = tree[d - 1][curr.parentIdx];
                d--;
              }
              return { verdict: interiorVerdict(isLens), depth: k, word: path, nodesExplored: totalNodes + W_prime.length, tree, trapRegion: isLens ? 'lens' : 'off-lens' };
            }
            W_prime.push(nextNode);
            if (W_prime.length >= LMax) {
              tree.push(W_prime);
              return { verdict: 'Undetermined', depth: k, nodesExplored: totalNodes + W_prime.length, tree };
            }
          }
        }
      }
    }

    totalNodes += W_prime.length;
    if (W_prime.length === 0) {
      const path = [];
      if (k > 1 && W_prev && W_prev.length > 0) {
        let curr = W_prev[W_prev.length - 1];
        let d = k - 1;
        while (curr && curr.parentIdx !== -1) {
          path.unshift(curr.t);
          curr = tree[d - 1][curr.parentIdx];
          d--;
        }
      }
      return { verdict: 'Exterior', depth: k, word: path, nodesExplored: totalNodes, tree };
    }
    tree.push(W_prime);
  }

  return { verdict: 'Undetermined', depth: kMax, nodesExplored: totalNodes, tree };
}


// Application State
const state = {
  n: 3,
  kMax: 37,
  LMax: 1000,
  tol: 1e-8,
  modulo: 3,
  
  // Selected c
  cx: 0.5,
  cy: 1.1,
  
  // Layer visibility
  showCollinear: false,
  showDifference: true,
  showTrap: true,
  showEnclosure: true,
  showTree: true,
  showPath: true,
  showEscapeStrata: false,
  comparisonMode: 'overlay',
  palette: 'research',
  customPalette: {
    interior: '#059669',
    offLens: '#2563eb',
    undetermined: '#fbbf24',
    exterior: '#ffffff'
  },
  focusedPanel: 'both',
  
  // Viewports centered with 1:1 aspect ratio zoom width
  paramCenter: { x: 1.207, y: 1.207 }, // Initialized near the first quadrant center of n=3
  paramZoom: 2.414,
  
  dynCenter: { x: 0.0, y: 0.0 },
  dynZoom: 8.0
};

const PARAM_RENDER_STEPS = [8, 4, 2, 1];
const DYN_RENDER_STEPS = [4, 2, 1];
const HISTORY_LIMIT = 50;

const EXAMPLE_PRESETS = [
  {
    id: 'e_c4_overlap',
    title: 'Neighboring overlap for E(c,4)',
    n: 4,
    parameter: { re: 1.6, im: 0.8 },
    k_max: 37,
    l_max: 1000,
    mode: 'collinear-attractor'
  },
  {
    id: 'e_c5_plane_filling',
    title: 'Plane-filling collinear example for E(c,5)',
    n: 5,
    parameter: { re: 1.75, im: 0.95 },
    k_max: 37,
    l_max: 1000,
    mode: 'collinear-attractor'
  },
  {
    id: 'theta0_base_capture',
    title: 'Theta_0 base-capture geometry',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'base-capture'
  },
  {
    id: 'trap_enclosure_n3',
    title: 'Trap/enclosure Interior and Exterior examples',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'trap-enclosure'
  },
  {
    id: 'threshold_n20',
    title: 'n=20 threshold/lens example',
    n: 20,
    parameter: { re: 2.0, im: 4.0 },
    k_max: 37,
    l_max: 1000,
    mode: 'finite-capture-threshold'
  },
  {
    id: 'hole_zoom_n13',
    title: 'n=13 finite-capture hole zoom',
    n: 13,
    parameter: { re: 2.0719, im: 3.0537 },
    k_max: 37,
    l_max: 1000,
    mode: 'finite-capture-zoom'
  },
  {
    id: 'off_lens_witnesses_n2_to_n19',
    title: 'Off-lens witnesses for 2 <= n <= 19',
    n: 13,
    parameter: { re: 0.72, im: 1.38 },
    k_max: 37,
    l_max: 1000,
    mode: 'off-lens-witness'
  },
  {
    id: 'finite_capture_layers_n3',
    title: 'Finite-capture layers for n=3',
    n: 3,
    parameter: { re: 0.5, im: 1.1 },
    k_max: 37,
    l_max: 1000,
    mode: 'finite-capture-layers'
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

function getMaxParamRenderStage() {
  return PARAM_RENDER_STEPS.length - 1;
}

function getMaxDynRenderStage() {
  return DYN_RENDER_STEPS.length - 1;
}

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

// Param clean image data saving
let paramSavedImageData = null;
function saveParamImageData() {
  paramSavedImageData = ctxParam.getImageData(0, 0, canvasParam.width, canvasParam.height);
}

// UI Elements
const elAritySlider = document.getElementById('arity-slider');
const elArityVal = document.getElementById('arity-val');
const elKmax = document.getElementById('param-kmax');
const elLmax = document.getElementById('param-lmax');
const elModulo = document.getElementById('param-modulo');
const elModuloVal = document.getElementById('modulo-val');
const elExamplePreset = document.getElementById('example-preset');
const elComparisonMode = document.getElementById('comparison-mode');
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
let currentRenderStage = 0; // 0: 8x8 blocks, 1: 4x4, 2: 2x2, 3: 1x1 pixels
let renderY = 0;

// Progressive rendering state for Dynamical Plane
let dynRenderRequestId = null;
let currentDynStage = 0; // 0: 4x4 blocks, 1: 2x2, 2: 1x1 pixels
let dynY = 0;
let diffGrid = []; // Grid storage of verdicts for Difference Attractor
let collGrid = []; // Grid storage of 1/0 inside Collinear Attractor
let gridW = 0;
let gridH = 0;

// Drag state for locators
let draggingParamLocator = false;
let draggingDynLocator = false;
const paramDrag = { dragging: false, startX: 0, startY: 0 };
const dynDrag = { dragging: false, startX: 0, startY: 0 };
const undoStack = [];
const redoStack = [];

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
  pushHistory();
  mutator();
  updateControlsFromState();
  renderAfterStateChange(renderTarget);
}

function undoState() {
  if (undoStack.length === 0) return;
  redoStack.push(cloneState());
  applySnapshot(undoStack.pop());
  updateControlsFromState();
  renderAfterStateChange('both');
  updateHistoryButtons();
}

function redoState() {
  if (redoStack.length === 0) return;
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
  if (elAritySlider) elAritySlider.value = state.n;
  if (elArityVal) elArityVal.textContent = state.n;
  if (elKmax) elKmax.value = state.kMax;
  if (elLmax) elLmax.value = state.LMax;
  if (elModulo) elModulo.value = state.modulo;
  if (elModuloVal) elModuloVal.textContent = state.modulo;
  if (elComparisonMode) elComparisonMode.value = state.comparisonMode || 'overlay';
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
    state.showEscapeStrata = false;
  }
}

function togglePanelFocus(panel) {
  state.focusedPanel = state.focusedPanel === panel ? 'both' : panel;
  updatePanelFocus();
  resizeCanvases();
}

function updatePanelFocus() {
  const workspace = document.querySelector('.workspace');
  if (!workspace) return;
  workspace.classList.toggle('focus-parameter', state.focusedPanel === 'parameter');
  workspace.classList.toggle('focus-dynamical', state.focusedPanel === 'dynamical');
  if (elBtnFocusParam) elBtnFocusParam.textContent = state.focusedPanel === 'parameter' ? 'Both' : 'Focus';
  if (elBtnFocusDyn) elBtnFocusDyn.textContent = state.focusedPanel === 'dynamical' ? 'Both' : 'Focus';
}

function roundForUrl(value) {
  return Number(value).toPrecision(10).replace(/\.?0+$/, '');
}

function stateToSearchParams() {
  const params = new URLSearchParams();
  params.set('n', state.n);
  params.set('cx', roundForUrl(state.cx));
  params.set('cy', roundForUrl(state.cy));
  params.set('k', state.kMax);
  params.set('l', state.LMax);
  params.set('q', state.modulo);
  params.set('pcx', roundForUrl(state.paramCenter.x));
  params.set('pcy', roundForUrl(state.paramCenter.y));
  params.set('pz', roundForUrl(state.paramZoom));
  params.set('dcx', roundForUrl(state.dynCenter.x));
  params.set('dcy', roundForUrl(state.dynCenter.y));
  params.set('dz', roundForUrl(state.dynZoom));
  params.set('mode', state.comparisonMode);
  params.set('palette', state.palette);
  params.set('layers', [
    state.showDifference,
    state.showCollinear,
    state.showTrap,
    state.showEnclosure,
    state.showTree,
    state.showPath,
    state.showEscapeStrata
  ].map(Boolean).map(flag => flag ? '1' : '0').join(''));
  return params;
}

function currentShareUrl() {
  const url = new URL(window.location.href);
  url.hash = stateToSearchParams().toString();
  return url.toString();
}

function applyStateFromHash() {
  if (!window.location.hash || window.location.hash.length <= 1) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const readNum = (key, fallback) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  state.n = Math.max(2, Math.round(readNum('n', state.n)));
  state.cx = readNum('cx', state.cx);
  state.cy = readNum('cy', state.cy);
  state.kMax = Math.max(1, Math.round(readNum('k', state.kMax)));
  state.LMax = Math.max(10, Math.round(readNum('l', state.LMax)));
  state.modulo = Math.max(1, Math.round(readNum('q', state.modulo)));
  state.paramCenter = {
    x: readNum('pcx', state.paramCenter.x),
    y: readNum('pcy', state.paramCenter.y)
  };
  state.paramZoom = Math.max(1e-6, readNum('pz', state.paramZoom));
  state.dynCenter = {
    x: readNum('dcx', state.dynCenter.x),
    y: readNum('dcy', state.dynCenter.y)
  };
  state.dynZoom = Math.max(1e-6, readNum('dz', state.dynZoom));
  const mode = params.get('mode');
  if (mode) setComparisonMode(mode);
  const palette = params.get('palette');
  if (palette) state.palette = palette;
  const layers = params.get('layers');
  if (layers && layers.length >= 7) {
    state.showDifference = layers[0] === '1';
    state.showCollinear = layers[1] === '1';
    state.showTrap = layers[2] === '1';
    state.showEnclosure = layers[3] === '1';
    state.showTree = layers[4] === '1';
    state.showPath = layers[5] === '1';
    state.showEscapeStrata = layers[6] === '1';
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
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
    if (response.ok) return response.json();
  } catch (err) {
    console.warn(`Example config ${id} unavailable; using fallback if present.`, err);
  }
  return fallbackExampleConfig(id);
}

function applyExampleConfig(config) {
  if (!config) return;
  const selectedCase = Array.isArray(config.cases) && config.cases.length > 0 ? config.cases[0] : null;
  const parameter = config.parameter || (selectedCase ? selectedCase.parameter : null);
  if (Number.isFinite(config.n)) state.n = config.n;
  if (parameter && Number.isFinite(parameter.re) && Number.isFinite(parameter.im)) {
    state.cx = parameter.re;
    state.cy = parameter.im;
  }
  state.kMax = Math.max(1, Math.round(config.k_max || config.kMax || state.kMax));
  state.LMax = Math.max(10, Math.round(config.l_max || config.LMax || state.LMax));
  if (config.mode === 'collinear-attractor') {
    state.showCollinear = true;
    state.showDifference = true;
    state.comparisonMode = 'overlay';
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

function openModal(title, bodyHtml, actionsHtml = '', showTabs = false) {
  if (!elModalBackdrop) return;
  elModalTitle.textContent = title;
  elModalBody.innerHTML = bodyHtml;
  elModalActions.innerHTML = actionsHtml;
  elModalTabs.hidden = !showTabs;
  elModalBackdrop.hidden = false;
}

function closeModal() {
  if (elModalBackdrop) elModalBackdrop.hidden = true;
}

const ABOUT_TABS = {
  intuition: `
    <p>The explorer visualizes the condition that the marked point <code>2c</code>
    belongs to the difference attractor <code>E(c, 2n - 1)</code>. This is the
    computational view behind connectedness for the collinear family.</p>
    <p>The Canvas renderer is progressive and interruptible. The selected
    certificate payload always uses the full chosen <code>k_max</code> and
    <code>L_max</code>, independent of preview resolution.</p>
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
      <li>Bernat Espigule, David Juher, and Joan Saldana,
      <em>Collinear Fractals and Bandt's Conjecture</em>,
      Fractal and Fractional 8(12), 725, 2024.
      DOI: <code>10.3390/fractalfract8120725</code>.</li>
      <li>Bernat Espigule and David Juher,
      <em>Finite Capture and the Closure of Roots of Restricted Polynomials</em>,
      arXiv:2603.07397, 2026.
      DOI: <code>10.48550/arXiv.2603.07397</code>.</li>
      <li>Bernat Espigule,
      <em>Finite capture and the closure of roots of restricted polynomials</em>,
      IHP audiovisual resource, 2026.
      DOI: <code>10.57987/IHP.2026.T1.WS3.016</code>.</li>
    </ol>
  `
};

function openAboutModal(tab = 'intuition') {
  openModal('About + Cite', ABOUT_TABS[tab] || ABOUT_TABS.intuition, '', true);
  if (elModalTabs) {
    for (const btn of elModalTabs.querySelectorAll('.modal-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
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
  const embed = `<iframe src="${htmlEscape(url)}" width="100%" height="720" loading="lazy" title="Collinear Fractals GPU Explorer"></iframe>`;
  const value = kind === 'embed' ? embed : url;
  openModal(
    kind === 'embed' ? 'Embed Code' : 'Share Current View',
    `<p>The URL records the current parameter, viewports, rendering layers, palette, and search limits.</p><pre>${htmlEscape(value)}</pre>`,
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
    body: 'The right canvas shows the difference attractor, optional collinear overlay, canonical trap, enclosure, and finite inverse-search path.'
  },
  {
    title: 'Search limits',
    body: 'k_max and L_max control the selected finite search and certificate JSON. Preview rendering remains progressive and refines to one pixel.'
  },
  {
    title: 'Reproducibility',
    body: 'Use Share View, Copy Embed, and Copy Certificate JSON to reproduce a state or attach finite-search data to an example.'
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
  const canvases = state.focusedPanel === 'parameter'
    ? [canvasParam]
    : state.focusedPanel === 'dynamical'
      ? [canvasDyn]
      : [canvasParam, canvasDyn];
  const width = canvases.reduce((sum, canvas) => sum + canvas.width, 0);
  const height = Math.max(...canvases.map(canvas => canvas.height));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  let x = 0;
  for (const canvas of canvases) {
    ctx.drawImage(canvas, x, 0);
    x += canvas.width;
  }
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = `collinear-fractals-n${state.n}-k${state.kMax}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Resize handler
function resizeCanvases(options = {}) {
  const pWidth = canvasParam.parentElement.clientWidth;
  const pHeight = canvasParam.parentElement.clientHeight;
  canvasParam.width = pWidth;
  canvasParam.height = pHeight;
  
  const dWidth = canvasDyn.parentElement.clientWidth;
  const dHeight = canvasDyn.parentElement.clientHeight;
  canvasDyn.width = dWidth;
  canvasDyn.height = dHeight;
  
  if (options.resetViewports) {
    resetParamViewportMath();
    resetDynViewportMath();
  }
  
  triggerParamRender();
  triggerDynRender();
}

window.addEventListener('resize', resizeCanvases);

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
  
  state.paramZoom = Math.max(zoomToFitW, zoomToFitH) * 1.05; // 5% margin
}

function resetDynViewportMath() {
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const n = state.n;
  const rho = Math.sqrt(cx * cx + cy * cy);
  
  const enc = computeEnclosureGeneral(cx, cy, 2 * n - 1, state.tol);
  if (!enc.err) {
    const xMaxBound = (enc.se * rho + Math.abs(cx) * enc.ve) / (2.0 * Math.abs(cy));
    const yMaxBound = enc.ve / 2.0;
    
    state.dynCenter = { x: 0.0, y: 0.0 };
    
    const h = canvasDyn.height;
    const w = canvasDyn.width;
    const zoomToFitW = 2.0 * xMaxBound;
    const zoomToFitH = (2.0 * yMaxBound) * (w / h);
    
    state.dynZoom = Math.max(zoomToFitW, zoomToFitH) * 1.15; // 15% margins
  } else {
    state.dynCenter = { x: 0.0, y: 0.0 };
    state.dynZoom = 8.0;
  }
}

// Parameter Plane Rendering
function triggerParamRender() {
  if (renderRequestId) {
    cancelAnimationFrame(renderRequestId);
  }
  paramSavedImageData = null;
  currentRenderStage = 0;
  renderY = 0;
  renderParamStage();
}

function renderParamStage() {
  const width = canvasParam.width;
  const height = canvasParam.height;
  const blockSize = PARAM_RENDER_STEPS[currentRenderStage];
  
  const startTime = performance.now();
  const maxFrameTime = 16.0; // 60 FPS budget
  
  while (renderY < height) {
    for (let x = 0; x < width; x += blockSize) {
      const c = screenToParam(x + blockSize / 2, renderY + blockSize / 2);
      
      let color;
      if (c.y === 0.0) {
        color = '#cbd5e1'; // light axis gray
      } else {
        const test = inverseIterationTestDetailed(c.x, c.y, state.n, state.kMax, state.LMax, state.tol);
        if (isInteriorVerdict(test.verdict)) {
          if (state.showEscapeStrata) {
            color = '#ffffff';
          } else {
            const level = test.depth % state.modulo;
            const rgb = test.verdict === 'Interior-offLens'
              ? getOffLensInteriorColorForLevel(level, test.depth)
              : getColorForLevel(level, test.depth);
            color = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
          }
        } else if (test.verdict === 'Exterior') {
          if (state.showEscapeStrata) {
            color = getEscapeColorString(test.depth);
          } else {
            color = getExteriorColorString();
          }
        } else {
          color = getUndeterminedColorString();
        }
      }
      
      ctxParam.fillStyle = color;
      ctxParam.fillRect(x, renderY, blockSize, blockSize);
    }
    
    renderY += blockSize;
    
    if (performance.now() - startTime > maxFrameTime) {
      renderRequestId = requestAnimationFrame(renderParamStage);
      return;
    }
  }
  
  const maxAllowedStage = getMaxParamRenderStage();
  if (currentRenderStage === maxAllowedStage) {
    saveParamImageData();
  }
  
  drawParameterLensGuides();
  
  if (currentRenderStage < maxAllowedStage) {
    currentRenderStage++;
    renderY = 0;
    renderRequestId = requestAnimationFrame(renderParamStage);
  } else {
    renderRequestId = null;
  }
}

function drawParameterLensGuides() {
  if (paramSavedImageData) {
    ctxParam.putImageData(paramSavedImageData, 0, 0);
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
    
    const N = 2 * state.n - 1;
    const radius = Math.sqrt(2 * state.n);
    
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

// Certified Grid-based Dynamical Plane Rendering
function triggerDynRender() {
  if (dynRenderRequestId) {
    cancelAnimationFrame(dynRenderRequestId);
  }
  currentDynStage = 0;
  startDynStage();
}

function startDynStage() {
  const width = canvasDyn.width;
  const height = canvasDyn.height;
  const step = DYN_RENDER_STEPS[currentDynStage];
  
  gridW = Math.ceil(width / step);
  gridH = Math.ceil(height / step);
  
  diffGrid = [];
  collGrid = [];
  for (let gx = 0; gx < gridW; gx++) {
    diffGrid.push(new Array(gridH).fill('Exterior'));
    collGrid.push(new Array(gridH).fill(0));
  }
  
  dynY = 0;
  renderDynStage();
}

function renderDynStage() {
  const width = canvasDyn.width;
  const height = canvasDyn.height;
  const step = DYN_RENDER_STEPS[currentDynStage];
  
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const n = state.n;
  const rho = Math.sqrt(cx * cx + cy * cy);
  
  if (rho <= 1.0 || cy === 0.0) {
    ctxDyn.fillStyle = getExteriorColorString();
    ctxDyn.fillRect(0, 0, width, height);
    drawDynamicalGuidesAndOverlays();
    return;
  }
  
  const startTime = performance.now();
  const maxFrameTime = 16.0; // 60 FPS budget
  
  // Precompute bounds for 1/2 E(c,N) (arity 2n-1)
  const encN = computeEnclosureGeneral(cx, cy, 2 * n - 1, state.tol);
  const seN = encN.se;
  const veN = encN.ve;
  const isLensN = inLens(cx, cy, n);
  
  // Precompute bounds for E(c,n) (arity n)
  const encn = computeEnclosureGeneral(cx, cy, n, state.tol);
  const sen = encn.se;
  const ven = encn.ve;
  const isLensn = inLensColl(cx, cy, n);
  
  while (dynY < gridH) {
    for (let gx = 0; gx < gridW; gx++) {
      const sx = gx * step;
      const sy = dynY * step;
      
      const w = screenToDyn(sx + step / 2, sy + step / 2);
      
      // 1. Difference Attractor: test z = 2w inside E(c,N) to get 1/2 E(c,N)
      let verdictN = 'Exterior';
      let depthN = 0;
      if (state.showDifference) {
        const res = inverseIterationTestGeneral(cx, cy, 2.0 * w.x, 2.0 * w.y, 2 * n - 1, isLensN, seN, veN, state.kMax, state.LMax);
        verdictN = res.verdict;
        depthN = res.depth;
      }
      diffGrid[gx][dynY] = { verdict: verdictN, depth: depthN };
      
      // 2. Collinear Attractor: test w directly inside E(c,n)
      let inColl = 0;
      if (state.showCollinear) {
        let useTrapNColl = true;
        let isDisk = false;
        let customS = null;
        let customV = null;
        const inLensCollVal = inLensColl(cx, cy, (n + 1) / 2);
        if (!inLensCollVal) {
          isDisk = true;
          const pixelSize = state.dynZoom / canvasDyn.width;
          customS = 1.5 * pixelSize;
        }
        const resn = inverseIterationTestGeneral(cx, cy, w.x, w.y, n, inLensCollVal, sen, ven, state.kMax, state.LMax, useTrapNColl, customS, customV, isDisk);
        if (isInteriorVerdict(resn.verdict) || resn.verdict === 'Undetermined') {
          inColl = 1;
        }
      }
      collGrid[gx][dynY] = inColl;
    }
    
    dynY++;
    
    if (performance.now() - startTime > maxFrameTime) {
      dynRenderRequestId = requestAnimationFrame(renderDynStage);
      return;
    }
  }
  
  drawDynGrid();
  drawDynamicalGuidesAndOverlays();
  
  const maxAllowedStage = getMaxDynRenderStage();
                           
  if (currentDynStage < maxAllowedStage) {
    currentDynStage++;
    startDynStage();
  } else {
    dynRenderRequestId = null;
  }
}

function drawDynGrid() {
  const step = DYN_RENDER_STEPS[currentDynStage];
  
  // $3 \times 3$ grid dilation for collinear attractor E(c,n)
  const dilatedGrid = [];
  for (let gx = 0; gx < gridW; gx++) {
    dilatedGrid.push(new Array(gridH).fill(0));
  }
  
  if (state.showCollinear) {
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        let hasNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              if (collGrid[nx][ny] === 1) {
                hasNeighbor = true;
                break;
              }
            }
          }
          if (hasNeighbor) break;
        }
        dilatedGrid[gx][gy] = hasNeighbor ? 1 : 0;
      }
    }
  }
  
  const width = canvasDyn.width;
  const height = canvasDyn.height;
  const imgData = ctxDyn.createImageData(width, height);
  const data = imgData.data;
  
  for (let gy = 0; gy < gridH; gy++) {
    const syStart = gy * step;
    const syEnd = Math.min(height, syStart + step);
    
    for (let gx = 0; gx < gridW; gx++) {
      const sxStart = gx * step;
      const sxEnd = Math.min(width, sxStart + step);
      
      const node = diffGrid[gx][gy];
      const verdict = node.verdict;
      const depth = node.depth;
      const isColl = dilatedGrid[gx][gy];
      
      // Base color based on difference attractor 1/2 E(c,N)
      let exterior = hexToRgb(getExteriorColorString());
      let r = exterior.r, g = exterior.g, b = exterior.b;
      if (isInteriorVerdict(verdict)) {
        if (state.showEscapeStrata) {
          r = 255; g = 255; b = 255;
        } else {
          const level = depth % state.modulo;
          const rgb = verdict === 'Interior-offLens'
            ? getOffLensInteriorColorForLevel(level, depth)
            : getColorForLevel(level, depth);
          r = rgb.r; g = rgb.g; b = rgb.b;
        }
      } else if (verdict === 'Exterior') {
        if (state.showEscapeStrata) {
          const rgb = getEscapeColor(depth);
          r = rgb.r; g = rgb.g; b = rgb.b;
        } else {
          r = exterior.r; g = exterior.g; b = exterior.b;
        }
      } else if (verdict === 'Undetermined') {
        const rgb = hexToRgb(getUndeterminedColorString());
        r = rgb.r; g = rgb.g; b = rgb.b;
      }
      
      // Color negation effect if inside dilated collinear attractor E(c,n)
      if (isColl === 1) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }
      
      // Write pixels
      for (let py = syStart; py < syEnd; py++) {
        for (let px = sxStart; px < sxEnd; px++) {
          const idx = (py * width + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
  }
  
  ctxDyn.putImageData(imgData, 0, 0);
}

function drawDynamicalGuidesAndOverlays() {
  const width = canvasDyn.width;
  const height = canvasDyn.height;
  
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const n = state.n;
  const rho = Math.sqrt(cx * cx + cy * cy);
  const isLensN = inLens(cx, cy, n);
  
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
  if (state.showEnclosure && rho > 1.0 && cy !== 0.0) {
    const enc = computeEnclosureGeneral(cx, cy, 2 * n - 1, state.tol);
    if (!enc.err) {
      drawParallelogramScaled(enc.se, enc.ve, 'rgba(79, 70, 229, 0.02)', '#4f46e5', false);
    }
  }
  
  // Draw 1/2 Trap
  if (state.showTrap) {
    const N = 2 * n - 1;
    const { S, V } = getTrapHalfWidths(cx, cy, N, isLensN);
    drawParallelogramScaled(S, V, 'rgba(5, 150, 105, 0.04)', '#059669', true);
  }
  
  // Run search test to draw Tree and winning path
  const test = inverseIterationTestDetailed(cx, cy, n, state.kMax, state.LMax, state.tol);
  
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
  ctxDyn.arc(ptC.x, ptC.y, 6.0, 0, Math.PI * 2);
  ctxDyn.fill();
  ctxDyn.stroke();
}

function drawParallelogramScaled(S, V, fillStyle, strokeStyle, isDashed) {
  const eff = getEffectiveC(state.cx, state.cy);
  const cx = eff.x;
  const cy = eff.y;
  const rho = Math.sqrt(cx * cx + cy * cy);
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
  const rho = Math.sqrt(cx * cx + cy * cy);
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
  const eff = getEffectiveC(state.cx, state.cy);
  const x = eff.x;
  const y = eff.y;
  const n = state.n;
  const N = 2 * n - 1;
  const rho = Math.sqrt(x * x + y * y);
  const lens = inLens(x, y, n);
  const test = inverseIterationTestDetailed(x, y, n, state.kMax, state.LMax, state.tol);
  const enc = computeEnclosureGeneral(x, y, N, state.tol);
  const trap = getTrapHalfWidths(x, y, N, lens);

  return {
    schema_version: '0.2.0',
    software: 'Collinear Fractals GPU Explorer',
    software_version: '0.1.0-alpha',
    version: '0.1.0-alpha',
    generatedAt: new Date().toISOString(),
    mode: 'finite-capture',
    renderer: 'canvas-cpu',
    parameter: { re: x, im: y, modulus: rho },
    c: { re: x, im: y },
    arity: n,
    n,
    differenceAlphabetIndex: N,
    N,
    inLens: lens,
    verdict: test.verdict,
    trapRegion: test.trapRegion || (lens ? 'lens' : 'off-lens'),
    depth: test.depth,
    word: test.word || [],
    digits: test.word || [],
    nodesExplored: test.nodesExplored,
    search: { kMax: state.kMax, LMax: state.LMax, tolerance: state.tol },
    k_max: state.kMax,
    L_max: state.LMax,
    enclosure: enc.err ? null : {
      se: enc.se,
      ve: enc.ve,
      truncationDepth: enc.truncationDepth,
      tail: enc.tail,
      tailCertifiedToTol: enc.tailCertifiedToTol,
      tailCapHit: enc.tailCapHit
    },
    trap: { S: trap.S, V: trap.V },
    proof_status: isInteriorVerdict(test.verdict) || test.verdict === 'Exterior'
      ? 'finite-search-certificate'
      : 'bounded-search-undetermined',
    limitations: 'The theorem-level proof remains in the cited paper and thesis.',
    note: test.verdict === 'Interior-offLens'
      ? 'Off-lens trap rule enabled; kept distinct from in-lens Interior.'
      : 'In-lens Interior, Exterior, or Undetermined status from the selected inverse-search settings.'
  };
}

async function copyCertificateJSON() {
  const payload = currentCertificatePayload();
  const text = JSON.stringify(payload, null, 2);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // The async Clipboard API may be unavailable for local file usage or
    // blocked by browser permissions. Fall back to the textarea method below.
    console.warn('Clipboard API unavailable; using textarea fallback.', err);
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Fallback copy command failed.');
  return true;
}

function downloadCertificateJSON() {
  const payload = currentCertificatePayload();
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const re = payload.parameter.re.toFixed(6).replace('-', 'm').replace('.', 'p');
  const im = payload.parameter.im.toFixed(6).replace('-', 'm').replace('.', 'p');
  a.href = url;
  a.download = `collinear-certificate-n${payload.arity}-c${re}_${im}i.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateStatusBar(test) {
  const rho = Math.sqrt(state.cx * state.cx + state.cy * state.cy);
  const isLens = inLens(state.cx, state.cy, state.n);
  
  elStatC.textContent = `${state.cx.toFixed(5)} ${state.cy >= 0 ? '+' : '-'} ${Math.abs(state.cy).toFixed(5)}i`;
  elStatRho.textContent = rho.toFixed(5);
  elStatLens.textContent = isLens ? 'Yes' : 'No';
  elStatLens.style.color = isLens ? '#059669' : '#dc2626';
  
  elStatVerdict.className = `verdict-tag verdict-${test.verdict}`;
  elStatVerdict.textContent = test.verdict;
  elStatNodes.textContent = test.nodesExplored;
  elStatDepth.textContent = test.depth;
  
  if (isInteriorVerdict(test.verdict) && test.word) {
    elStatWord.textContent = `[${test.word.join(', ')}]`;
    elStatWord.style.color = test.verdict === 'Interior-offLens' ? '#2563eb' : '#059669';
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
  const elLocus = document.getElementById('legend-locus-color');
  const elDiff = document.getElementById('legend-diff-color');
  const elOffLens = document.getElementById('legend-offlens-color');
  
  if (state.showEscapeStrata) {
    elLocus.style.background = '#ffffff';
    elLocus.style.border = '1px solid #cbd5e1';
    elDiff.style.background = '#ffffff';
    elDiff.style.border = '1px solid #cbd5e1';
    if (elOffLens) { elOffLens.style.background = '#ffffff'; elOffLens.style.border = '1px solid #cbd5e1'; }
  } else {
    const c0 = getColorForLevel(0, 0);
    const rgbStr = rgbToCss(c0);
    elLocus.style.background = rgbStr;
    elLocus.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    elDiff.style.background = rgbStr;
    elDiff.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    if (elOffLens) {
      const off = getOffLensInteriorColorForLevel(0, 0);
      elOffLens.style.background = rgbToCss(off);
      elOffLens.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    }
  }
}

// User Interaction: Drag and Drop locator or Pan on Parameter Canvas
canvasParam.addEventListener('mousedown', (e) => {
  const dot = paramToScreen(state.cx, state.cy);
  const d = Math.sqrt((e.offsetX - dot.x) ** 2 + (e.offsetY - dot.y) ** 2);
  pushHistory();
  
  if (d <= 12) {
    draggingParamLocator = true;
    paramDrag.dragging = false;
  } else {
    draggingParamLocator = false;
    paramDrag.dragging = true;
    paramDrag.startX = e.clientX;
    paramDrag.startY = e.clientY;
  }
});

canvasParam.addEventListener('mousemove', (e) => {
  const dot = paramToScreen(state.cx, state.cy);
  const d = Math.sqrt((e.offsetX - dot.x) ** 2 + (e.offsetY - dot.y) ** 2);
  
  if (draggingParamLocator) {
    const coord = screenToParam(e.offsetX, e.offsetY);
    state.cx = coord.x;
    state.cy = coord.y;
    drawParameterLensGuides();
    triggerDynRender();
  } else if (paramDrag.dragging) {
    const dx = e.clientX - paramDrag.startX;
    const dy = e.clientY - paramDrag.startY;
    paramDrag.startX = e.clientX;
    paramDrag.startY = e.clientY;
    
    const w = canvasParam.width;
    const h = canvasParam.height;
    const vw = state.paramZoom;
    const vh = vw * (h / w);
    
    state.paramCenter.x -= dx * (vw / w);
    state.paramCenter.y += dy * (vh / h);
    
    triggerParamRender();
  } else {
    // hover cursor state
    if (d <= 12) {
      canvasParam.style.cursor = 'move';
    } else {
      canvasParam.style.cursor = 'crosshair';
    }
  }
});

canvasParam.addEventListener('mouseup', () => {
  draggingParamLocator = false;
  paramDrag.dragging = false;
});
canvasParam.addEventListener('mouseleave', () => {
  draggingParamLocator = false;
  paramDrag.dragging = false;
});

canvasParam.addEventListener('wheel', (e) => {
  e.preventDefault();
  pushHistory();
  const mouse = screenToParam(e.offsetX, e.offsetY);
  const factor = e.deltaY < 0 ? 0.85 : 1.15;
  
  state.paramCenter.x = mouse.x + (state.paramCenter.x - mouse.x) * factor;
  state.paramCenter.y = mouse.y + (state.paramCenter.y - mouse.y) * factor;
  state.paramZoom *= factor;
  
  triggerParamRender();
});

// User Interaction: Drag and Drop locator or Pan on Dynamical Canvas
canvasDyn.addEventListener('mousedown', (e) => {
  const dot = dynToScreen(state.cx, state.cy);
  const d = Math.sqrt((e.offsetX - dot.x) ** 2 + (e.offsetY - dot.y) ** 2);
  pushHistory();
  
  if (d <= 12) {
    draggingDynLocator = true;
    dynDrag.dragging = false;
  } else {
    draggingDynLocator = false;
    dynDrag.dragging = true;
    dynDrag.startX = e.clientX;
    dynDrag.startY = e.clientY;
  }
});

canvasDyn.addEventListener('mousemove', (e) => {
  const dot = dynToScreen(state.cx, state.cy);
  const d = Math.sqrt((e.offsetX - dot.x) ** 2 + (e.offsetY - dot.y) ** 2);
  
  if (draggingDynLocator) {
    const coord = screenToDyn(e.offsetX, e.offsetY);
    state.cx = coord.x;
    state.cy = coord.y;
    drawParameterLensGuides();
    triggerDynRender();
  } else if (dynDrag.dragging) {
    const dx = e.clientX - dynDrag.startX;
    const dy = e.clientY - dynDrag.startY;
    dynDrag.startX = e.clientX;
    dynDrag.startY = e.clientY;
    
    const w = canvasDyn.width;
    const h = canvasDyn.height;
    const vw = state.dynZoom;
    const vh = vw * (h / w);
    
    state.dynCenter.x -= dx * (vw / w);
    state.dynCenter.y += dy * (vh / h);
    
    triggerDynRender();
  } else {
    if (d <= 12) {
      canvasDyn.style.cursor = 'move';
    } else {
      canvasDyn.style.cursor = 'crosshair';
    }
  }
});

canvasDyn.addEventListener('mouseup', () => {
  draggingDynLocator = false;
  dynDrag.dragging = false;
});
canvasDyn.addEventListener('mouseleave', () => {
  draggingDynLocator = false;
  dynDrag.dragging = false;
});

canvasDyn.addEventListener('wheel', (e) => {
  e.preventDefault();
  pushHistory();
  const mouse = screenToDyn(e.offsetX, e.offsetY);
  const factor = e.deltaY < 0 ? 0.85 : 1.15;
  
  state.dynCenter.x = mouse.x + (state.dynCenter.x - mouse.x) * factor;
  state.dynCenter.y = mouse.y + (state.dynCenter.y - mouse.y) * factor;
  state.dynZoom *= factor;
  
  triggerDynRender();
});

// Double click locator positioning
canvasParam.addEventListener('dblclick', (e) => {
  withHistory(() => {
    const coord = screenToParam(e.offsetX, e.offsetY);
    state.cx = coord.x;
    state.cy = coord.y;
  }, 'dyn');
});

canvasDyn.addEventListener('dblclick', (e) => {
  withHistory(() => {
    const coord = screenToDyn(e.offsetX, e.offsetY);
    state.cx = coord.x;
    state.cy = coord.y;
  }, 'dyn');
});

// Mobile Double Tap Gesture helper
function enableDoubleTap(canvas, getCoordFn) {
  let lastTap = 0;
  canvas.addEventListener('touchstart', (e) => {
    const now = Date.now();
    const doubleTapTimeout = 300;
    if (now - lastTap < doubleTapTimeout) {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      const coord = getCoordFn(sx, sy);
      withHistory(() => {
        state.cx = coord.x;
        state.cy = coord.y;
      }, 'dyn');
    }
    lastTap = now;
  }, { passive: false });
}

enableDoubleTap(canvasParam, screenToParam);
enableDoubleTap(canvasDyn, screenToDyn);

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
    state.kMax = parseInt(e.target.value);
  }, 'both');
});

elLmax.addEventListener('change', (e) => {
  withHistory(() => {
    state.LMax = parseInt(e.target.value);
  }, 'both');
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
        elBtnCopyCertificate.textContent = 'Certificate Copied';
        window.setTimeout(() => { elBtnCopyCertificate.textContent = originalText; }, 1200);
      })
      .catch(err => console.error('Could not copy certificate JSON:', err));
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
    const config = await loadExampleConfig(id);
    withHistory(() => applyExampleConfig(config), 'both');
  });
}

if (elComparisonMode) {
  elComparisonMode.addEventListener('change', (e) => {
    withHistory(() => setComparisonMode(e.target.value), 'both');
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
  if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redoState();
    else undoState();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redoState();
  } else if (e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveExplorerImage();
  } else if (e.key.toLowerCase() === 'g') {
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

// Initial startup call
const hasInitialHashState = Boolean(window.location.hash && window.location.hash.length > 1);
applyStateFromHash();
populateExamplePresets();
loadExampleIndex();
updateControlsFromState();
updateLegendColors();
resizeCanvases({ resetViewports: !hasInitialHashState });
updatePanelFocus();
