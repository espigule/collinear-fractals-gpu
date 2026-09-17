import {
  createInverseSearchContext, inverseIterationTestFast, inverseSearchPointFast
} from './inverse_search_kernel.mjs';
import { getEffectiveC, validateSearchLimits } from './inverse_search_reference.mjs';
import {
  assertArity, assertFiniteNumber, assertPositiveNumber
} from '../math/validation.mjs';

export const PARAMETER_VIEW_MODES = Object.freeze(['mn', 'rn', 'compare']);

/**
 * Parameter-set definitions use the expanding c in f_t(z) = t + z/c.
 * 2*A_n is contained in A_(2n-1), so 2*E(c,n) is contained in E(c,2n-1)
 * and R_n is contained in M_n. A finite surviving branch is not membership.
 */
export const PARAMETER_VIEW_DEFINITIONS = Object.freeze({
  mn: Object.freeze({ label: 'M_n', membership: '2c in E(c,2n-1)', markedPointScale: 2 }),
  rn: Object.freeze({ label: 'R_n', membership: 'c in E(c,n)', markedPointScale: 1 })
});

function labelledResult(value, set, n) {
  return {
    ...value,
    set,
    label: PARAMETER_VIEW_DEFINITIONS[set].label,
    alphabetSize: set === 'mn' ? 2 * n - 1 : n,
    markedPointScale: PARAMETER_VIEW_DEFINITIONS[set].markedPointScale,
    usesTrap: set === 'mn',
    // Preserve the kernel's actual stop reason; survival is a display category.
    displayReason: set === 'rn' && value.stopReason === 'depth-cap'
      ? 'finite-survival' : value.stopReason
  };
}

function classifyRn(x, y, n, kMax, LMax, tol) {
  const effective = getEffectiveC(x, y);
  const rho = Math.hypot(effective.x, effective.y);
  if (!Number.isFinite(rho)) {
    return { verdict: 'Undetermined', depth: 0, nodesExplored: 0, stopReason: 'numerical-range' };
  }
  // No R_n trap theorem is assumed here. In particular, the exploratory M_n
  // off-lens rule must not become an R_n interior classification by analogy.
  const context = createInverseSearchContext(effective.x, effective.y, n, false, tol, { useTrap: false });
  return inverseSearchPointFast(context, effective.x, effective.y, kMax, LMax);
}

function comparisonCategory(mn, rn) {
  const mnTrap = mn.stopReason === 'trap-hit';
  const rnSurvives = rn.displayReason === 'finite-survival';
  if (mn.verdict === 'Exterior') {
    return rn.verdict === 'Exterior' ? 'outside-both' : 'mn-exterior-rn-unresolved';
  }
  if (rn.verdict === 'Exterior') {
    return mnTrap ? 'mn-trap-rn-exterior' : 'rn-exterior-mn-unresolved';
  }
  if (mnTrap) return rnSurvives ? 'mn-trap-rn-survival' : 'mn-trap-rn-unresolved';
  return rnSurvives ? 'rn-survival-mn-unresolved' : 'unresolved';
}

/**
 * Classify a parameter for M_n, R_n, or their numerical comparison.
 *
 * Coordinates follow the explorer's existing convention: nonzero inputs inside
 * the unit disk are replaced by 1/c for BOTH views, including the marked point.
 * Real and unit-modulus effective parameters remain outside the search domain.
 *
 * The top-level search fields belong to `set`: R_n in rn mode, M_n otherwise.
 * `mn` and `rn` contain independently labelled records, or null if not requested.
 * `comparison` is a display category in compare mode, otherwise null.
 *
 * R_n uses enclosure pruning without a trap. It can return Exterior, or
 * Undetermined with displayReason='finite-survival' after a complete depth
 * budget. A node cap stays node-cap; neither outcome asserts R_n membership.
 * Fast classifications deliberately omit trees and finite certificate words.
 */
export function classifyParameterView(
  x, y, n, kMax = 37, LMax = 1000, tol = 1e-8, mode = 'mn'
) {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(y, 'y');
  assertArity(n);
  validateSearchLimits(kMax, LMax);
  assertPositiveNumber(tol, 'tol');
  if (!PARAMETER_VIEW_MODES.includes(mode)) {
    throw new RangeError('parameter view mode must be mn, rn, or compare');
  }
  const mn = mode === 'rn' ? null
    : labelledResult(inverseIterationTestFast(x, y, n, kMax, LMax, tol), 'mn', n);
  const rn = mode === 'mn' ? null
    : labelledResult(classifyRn(x, y, n, kMax, LMax, tol), 'rn', n);
  const active = mode === 'rn' ? rn : mn;
  return {
    ...active,
    mode,
    mn,
    rn,
    comparison: mode === 'compare' ? comparisonCategory(mn, rn) : null
  };
}
