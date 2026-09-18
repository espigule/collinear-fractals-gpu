import { inverseIterationTestFast } from './inverse_search_kernel.mjs';
import { getEffectiveC, validateSearchLimits } from './inverse_search_reference.mjs';
import { createAttractorMembershipContext, classifyAttractorPoint } from './attractor_membership.mjs';
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
  const boundaryWork = options.boundaryWork ?? 20000;
  assertInteger(escapeDepth, 'escapeDepth', 0, 100);
  assertInteger(boundaryWork, 'boundaryWork', 1, MAX_BOUNDARY_WORK);
  return { escapeDepth, boundaryWork };
}

function labelledResult(value, set, n, usesTrap) {
  return {
    ...value, set,
    label: PARAMETER_VIEW_DEFINITIONS[set].label,
    alphabetSize: set === 'mn' ? 2 * n - 1 : n,
    markedPointScale: PARAMETER_VIEW_DEFINITIONS[set].markedPointScale,
    ...(set === 'mn' ? {} : { firstStep: PARAMETER_VIEW_DEFINITIONS[set].firstStep }),
    usesTrap,
    displayReason: set !== 'mn' && value.stopReason === 'depth-cap'
      ? 'finite-survival' : value.stopReason
  };
}

function classifyMarkedPoint(x, y, n, tol, set, limits) {
  const effective = getEffectiveC(x, y);
  const rho = Math.hypot(effective.x, effective.y);
  if (!Number.isFinite(rho)) {
    return labelledResult({ verdict: 'Undetermined', depth: 0, nodesExplored: 0,
      stopReason: 'numerical-range', status: 'numerical-range', firstDigit: null,
      firstLevelIndex: null }, set, n, false);
  }
  const context = createAttractorMembershipContext(effective.x, effective.y, n, tol);
  const result = classifyAttractorPoint(context, effective.x, effective.y, limits.escapeDepth, {
    firstStep: PARAMETER_VIEW_DEFINITIONS[set].firstStep,
    maxWork: limits.boundaryWork, firstLevelPieces: false, pixelRadius: 0
  });
  return labelledResult(result, set, n, Boolean(context.useTrap));
}

function comparisonCategory(mn, mn0) {
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
 * M_n retains its reference depth/frontier contract. M_n^0 and M_n^1 have an
 * independent finite-orbit depth/work budget. For M_n^1 only the first digit
 * comes from A_(n-1); every subsequent digit belongs to A_n.
 *
 * The legacy input alias rn is accepted, but all emitted fields are canonical.
 * Compare combines M_n with M_n^0. Coordinates, including the marked point,
 * share the browser's reciprocal normalization. Surviving a finite search is
 * Undetermined, while strict original-alphabet trap entry is numerical capture.
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
  const limits = normalizeMembershipLimits(n, options);
  const mn = mode === 'mn' || mode === 'compare'
    ? labelledResult(inverseIterationTestFast(x, y, n, kMax, LMax, tol), 'mn', n, true) : null;
  const mn0 = mode === 'mn0' || mode === 'compare'
    ? classifyMarkedPoint(x, y, n, tol, 'mn0', limits) : null;
  const mn1 = mode === 'mn1' ? classifyMarkedPoint(x, y, n, tol, 'mn1', limits) : null;
  const active = mode === 'mn0' ? mn0 : mode === 'mn1' ? mn1 : mn;
  return {
    ...active, mode, mn, mn0, mn1,
    comparison: mode === 'compare' ? comparisonCategory(mn, mn0) : null
  };
}
