import { inverseIterationTestFast } from './inverse_search_kernel.mjs';
import { getEffectiveC, inLens, validateSearchLimits } from './inverse_search_reference.mjs';
import { createAttractorMembershipContext, classifyAttractorPoint, classifyAttractorParameterCell,
  classifyAttractorCapture, createAttractorCaptureProbeContext } from './attractor_membership.mjs';
import { assertArity, assertFiniteNumber, assertInteger, assertPositiveNumber } from '../math/validation.mjs';

export const PARAMETER_VIEW_MODES = Object.freeze(['mn', 'mn0', 'mn1', 'compare']);
export const MAX_BOUNDARY_WORK = 200000;

/** All definitions use the expanding parameter in f_t(z)=t+z/c. */
export const PARAMETER_VIEW_DEFINITIONS = Object.freeze({
  mn: Object.freeze({ label: 'M_n', membership: '2c in E(c,2n-1)', markedPointScale: 2 }),
  mn0: Object.freeze({ label: 'M_n^0', membership: 'c in E(c,n)', markedPointScale: 1, firstStep: 'original' }),
  mn1: Object.freeze({ label: 'M_n^1', membership: 'c in A_(n-1)+(1/c)E(c,n)', markedPointScale: 1, firstStep: 'complement' })
});

export function normalizeParameterViewMode(mode = 'mn') {
  const canonical = mode === 'rn' ? 'mn0' : mode;
  if (!PARAMETER_VIEW_MODES.includes(canonical)) {
    throw new RangeError('parameter view mode must be mn, mn0, mn1, or compare');
  }
  return canonical;
}

export function normalizeMembershipLimits(n, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('membership options must be an object');
  }
  const escapeDepth = options.escapeDepth ?? (n === 2 ? 16 : 12);
  const captureDepth = options.captureDepth ?? escapeDepth;
  const boundaryWork = options.boundaryWork ?? 20000;
  const parameterRadius = options.parameterRadius ?? 0;
  const captureStyle = options.captureStyle ?? 'depth';
  const minimumCapture = options.minimumCapture ?? false;
  assertFiniteNumber(parameterRadius, 'parameterRadius');
  if (parameterRadius < 0) throw new RangeError('parameterRadius must be nonnegative');
  assertInteger(escapeDepth, 'escapeDepth', 0, 100);
  assertInteger(captureDepth, 'captureDepth', 0, 100);
  assertInteger(boundaryWork, 'boundaryWork', 1, MAX_BOUNDARY_WORK);
  if (!['depth', 'sets'].includes(captureStyle)) throw new RangeError('invalid captureStyle');
  if (typeof minimumCapture !== 'boolean') throw new TypeError('minimumCapture must be boolean');
  return { escapeDepth, captureDepth, boundaryWork, parameterRadius, captureStyle, minimumCapture };
}

function labelledResult(value, set, n, usesTrap) {
  return {
    ...value, set,
    label: PARAMETER_VIEW_DEFINITIONS[set].label,
    alphabetSize: set === 'mn' ? 2 * n - 1 : n,
    markedPointScale: PARAMETER_VIEW_DEFINITIONS[set].markedPointScale,
    ...(set === 'mn' ? {} : { firstStep: PARAMETER_VIEW_DEFINITIONS[set].firstStep }),
    usesTrap,
    displayReason: (set !== 'mn' || value.sampleType === 'parameter-cell') && value.stopReason === 'depth-cap'
      ? 'finite-survival' : value.stopReason
  };
}

function parameterGeometry(x, y, n, tol, limits) {
  const effective = getEffectiveC(x, y);
  const rho = Math.hypot(effective.x, effective.y);
  let radius = limits.parameterRadius;
  let domainBoundary = false;
  // In the reciprocal view use a disk around 1/c0 covering every 1/c in the
  // input disk: |1/c-1/c0| <= r/(|c0| (|c0|-r)). Cells crossing the unit circle
  // have no single expanding chart and remain outside-domain, never exterior.
  const inputRho = Math.hypot(x, y);
  const inputRadius = radius;
  const inputLower = inputRho * (1 - 8 * Number.EPSILON) - inputRadius;
  const inputUpper = inputRho * (1 + 8 * Number.EPSILON) + inputRadius;
  // This bound covers both expanding charts, including a raster disk crossing
  // the unit circle. The circle itself remains outside the defined domain.
  const annulusUpper = Math.max(inputUpper, 1 / inputLower) * (1 + 16 * Number.EPSILON);
  const mnAnnulusCoverage = inputRadius > 0 && inputLower > 0
    && annulusUpper < Math.sqrt(n) * (1 - 8 * Number.EPSILON);
  if (radius > 0 && inputRho < 1) {
    if (inputRho <= radius || inputRho + radius >= 1) domainBoundary = true;
    else radius = radius / inputRho / (inputRho - radius) * (1 + 32 * Number.EPSILON);
  }
  if (radius > 0 && rho * (1 - 8 * Number.EPSILON) - radius <= 1) domainBoundary = true;
  let originalContext = null, differenceContext = null, differenceProbe = null;
  return {
    effective, radius, domainBoundary, mnAnnulusCoverage,
    captureProbe() {
      return differenceProbe ??= createAttractorCaptureProbeContext(effective.x, effective.y, 2 * n - 1, tol);
    },
    context(set) {
      if (set === 'mn') {
        return differenceContext ??= createAttractorMembershipContext(effective.x, effective.y, 2 * n - 1, tol);
      }
      return originalContext ??= createAttractorMembershipContext(effective.x, effective.y, n, tol);
    },
    invalidResult() {
      const reason = !Number.isFinite(rho) || !Number.isFinite(radius) ? 'numerical-range'
        : domainBoundary ? 'outside-domain' : null;
      return reason ? { verdict: 'Undetermined', depth: 0, nodesExplored: 0, work: 0,
        stopReason: reason, status: reason === 'outside-domain' ? 'out-of-domain' : reason,
        firstDigit: null, firstLevelIndex: null,
        ...(limits.parameterRadius > 0 ? { sampleType: 'parameter-cell', parameterRadius: radius,
          coverage: 'parameter-taylor-disk' } : {}) } : null;
    }
  };
}

function classifyMembership(geometry, n, set, limits, digit = null) {
  const analyticAnnulus = set === 'mn' && geometry.mnAnnulusCoverage;
  const invalid = geometry.invalidResult();
  if (invalid && !analyticAnnulus) return { value: invalid, usesTrap: false };
  let context = analyticAnnulus ? geometry.captureProbe() : geometry.context(set);
  const firstStep = digit !== null
    ? ((digit + n - 1) % 2 === 0 ? 'original' : 'complement')
    : PARAMETER_VIEW_DEFINITIONS[set].firstStep ?? 'original';
  const searchOptions = { firstStep, firstDigit: digit, maxWork: limits.boundaryWork,
    firstLevelPieces: false, minimumCapture: false, treeGuidance: set === 'mn' };
  let value = analyticAnnulus ? {
    verdict: 'Interior', depth: 0, nodesExplored: 0, work: 0,
    stopReason: 'analytic-membership', status: 'analytic-member',
    analyticReason: 'mn-inner-annulus', evidenceType: 'analytic',
    minimumCaptureDepth: null, captureDepthSemantics: 'not-captured',
    captureSearchStopReason: 'analytic-classification',
    firstDigit: null, firstLevelIndex: null, sampleType: 'parameter-cell',
    parameterRadius: geometry.radius,
    coverage: geometry.domainBoundary ? 'expanding-chart-domain-intersection' : 'parameter-taylor-disk',
    membershipScope: 'all-valid-parameters',
    ...(geometry.domainBoundary ? { excludedParameterLocus: 'unit-circle' } : {})
  } : limits.parameterRadius > 0
    ? classifyAttractorParameterCell(context, limits.escapeDepth, {
      ...searchOptions, parameterRadius: geometry.radius, markedPointScale: set === 'mn' ? 2 : 1
    })
    : classifyAttractorPoint(context, geometry.effective.x, geometry.effective.y, limits.escapeDepth,
      searchOptions);
  {
    const scale = set === 'mn' ? 2 : 1;
    const zx = scale * geometry.effective.x, zy = scale * geometry.effective.y;
    let centerCapture = classifyAttractorCapture(context, zx, zy,
      analyticAnnulus ? 0 : limits.captureDepth, searchOptions);
    if (analyticAnnulus && centerCapture.stopReason === 'depth-cap' && limits.captureDepth > 0) {
      context = geometry.context(set);
      centerCapture = classifyAttractorCapture(context, zx, zy, limits.captureDepth, searchOptions);
    }
    if (limits.parameterRadius === 0 && limits.minimumCapture && centerCapture.minimumCaptureDepth !== null) {
      value = centerCapture;
    }
    value.captureSample = {
      ...centerCapture,
      sampling: limits.parameterRadius > 0 ? 'parameter-pixel-center' : 'parameter-point', sampleType: 'point',
      markedPoint: { x: zx, y: zy }, markedPointScale: scale,
      usesTrap: Boolean(context.useTrap), arithmetic: 'binary64', maxDepth: limits.captureDepth
    };
  }
  const r = geometry.radius;
  const usesTrap = Boolean(context.useTrap) && (r === 0 || (
    context.rho * (1 - 8 * Number.EPSILON) - r > 1 && Math.abs(context.y) > r
      && (context.rhoUpper + r) ** 2
      + 2 * (Math.abs(context.x) + r) < context.m));
  return { value, usesTrap };
}

function labelledDigitResult(value, digit, n, usesTrap) {
  return {
    ...value, set: `digit:${digit}`, label: `F_{${n},${digit}}`, digit,
    digitIndex: digit + n - 1, alphabetSize: n, markedPointScale: 1,
    firstStep: (digit + n - 1) % 2 === 0 ? 'original' : 'complement', usesTrap,
    displayReason: value.stopReason === 'depth-cap' ? 'finite-survival' : value.stopReason
  };
}

/** Independently selectable F_(n,t): only its first digit is fixed to t. */
export function classifyParameterDigit(x, y, n, digit, tol = 1e-8, options = {}) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  assertArity(n);
  assertInteger(digit, 'digit', -n + 1, n - 1);
  assertPositiveNumber(tol, 'tol');
  const limits = normalizeMembershipLimits(n, options);
  const geometry = parameterGeometry(x, y, n, tol, limits);
  const { value, usesTrap } = classifyMembership(geometry, n, 'mn0', limits, digit);
  return labelledDigitResult(value, digit, n, usesTrap);
}

/** Undefined selections preserve old links; explicit empty arrays hide layers. */
function normalizeSelection(n, mode, options) {
  const defaults = mode === 'compare' ? ['mn', 'mn0'] : [mode];
  const inputLayers = options.parameterLayers ?? defaults;
  const inputDigits = options.parameterDigits ?? [];
  if (!Array.isArray(inputLayers) || !Array.isArray(inputDigits)) {
    throw new TypeError('parameterLayers and parameterDigits must be arrays');
  }
  const allowed = ['mn', 'mn0', 'mn1'];
  for (const layer of inputLayers) {
    if (!allowed.includes(layer)) throw new RangeError('invalid parameter layer');
  }
  for (const digit of inputDigits) assertInteger(digit, 'parameter digit', -n + 1, n - 1);
  return {
    parameterLayers: allowed.filter(layer => inputLayers.includes(layer)),
    parameterDigits: [...new Set(inputDigits)].sort((a, b) => a - b)
  };
}

function comparisonCategory(mn, mn0) {
  if (mn.stopReason === 'analytic-membership' || mn0.stopReason === 'analytic-membership') {
    const category = value => value.verdict === 'Exterior' ? 'exterior'
      : value.stopReason === 'trap-hit' ? 'capture'
        : value.stopReason === 'analytic-membership' ? 'member'
          : value.displayReason === 'finite-survival' ? 'survival' : 'unresolved';
    return `mn-${category(mn)}-mn0-${category(mn0)}`;
  }
  const mnTrap = mn.stopReason === 'trap-hit';
  const mn0Survives = mn0.displayReason === 'finite-survival';
  const mn0Captured = mn0.stopReason === 'trap-hit';
  if (mn.verdict === 'Exterior') {
    return mn0.verdict === 'Exterior' ? 'outside-both' : 'mn-exterior-mn0-unresolved';
  }
  if (mn0.verdict === 'Exterior') {
    return mnTrap ? 'mn-trap-mn0-exterior' : 'mn0-exterior-mn-unresolved';
  }
  if (mnTrap) return mn0Captured ? 'mn-trap-mn0-capture'
    : mn0Survives ? 'mn-trap-mn0-survival' : 'mn-trap-mn0-unresolved';
  return mn0Captured ? 'mn0-capture-mn-unresolved'
    : mn0Survives ? 'mn0-survival-mn-unresolved' : 'unresolved';
}

/**
 * Radius-zero M_n retains its reference depth/frontier contract. The original
 * subsets use an independent depth/work budget and A_n after the first digit.
 * Positive parameterRadius selects a varying-parameter cell outer approximation
 * for every displayed layer, including M_n through 2c in E(c,2n-1).
 *
 * parameterLayers selects any combination of mn/mn0/mn1; parameterDigits selects
 * any D_n first digits independently. Legacy mode-only inputs retain their old
 * selection. Both aggregate and individual results are returned separately so
 * overlapping layers never overwrite one another's classification.
 */
export function classifyParameterView(
  x, y, n, kMax = 37, LMax = 1000, tol = 1e-8, mode = 'mn', options = {}
) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  assertArity(n);
  validateSearchLimits(kMax, LMax);
  assertPositiveNumber(tol, 'tol');
  mode = normalizeParameterViewMode(mode);
  const limits = normalizeMembershipLimits(n, { ...options, captureDepth: options.captureDepth ?? Math.min(kMax, 100) });
  const selection = normalizeSelection(n, mode, options);
  const geometry = parameterGeometry(x, y, n, tol, limits);
  const layers = {}, digits = {};
  for (const set of selection.parameterLayers) {
    if (set === 'mn' && limits.parameterRadius === 0) {
      const point = inverseIterationTestFast(x, y, n, kMax, LMax, tol, { canonicalOnly: true });
      layers.mn = labelledResult({ ...point,
        minimumCaptureDepth: point.stopReason === 'trap-hit' ? point.depth : null,
        captureDepthSemantics: point.stopReason === 'trap-hit' ? 'minimum-verified' : 'not-captured',
        captureSearchStopReason: point.stopReason === 'trap-hit' ? 'minimum-found' : point.stopReason
      }, 'mn', n, !geometry.invalidResult() && inLens(x, y, n));
    } else {
      const { value, usesTrap } = classifyMembership(geometry, n, set, limits);
      layers[set] = labelledResult(value, set, n, usesTrap);
    }
  }
  for (const digit of selection.parameterDigits) {
    const { value, usesTrap } = classifyMembership(geometry, n, 'mn0', limits, digit);
    digits[String(digit)] = labelledDigitResult(value, digit, n, usesTrap);
  }
  const mn = layers.mn ?? null, mn0 = layers.mn0 ?? null, mn1 = layers.mn1 ?? null;
  const preferred = mode === 'compare' ? 'mn' : mode;
  const active = layers[preferred] ?? layers[selection.parameterLayers[0]]
    ?? digits[String(selection.parameterDigits[0])]
    ?? { verdict: 'Exterior', depth: 0, stopReason: 'enclosure-escape', status: 'escaped',
      nodesExplored: 0, work: 0, firstDigit: null, firstLevelIndex: null };
  return {
    ...active, mode, mn, mn0, mn1, layers, digits, ...selection,
    comparison: mode === 'compare' && mn && mn0 ? comparisonCategory(mn, mn0) : null
  };
}
