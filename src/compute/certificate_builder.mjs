import { differenceAlphabetIndex } from '../math/alphabets.mjs';
import { assertComplex, assertInteger, assertPositiveNumber } from '../math/validation.mjs';
import { analyticConnectednessResult } from '../math/connectedness_regions.mjs';
import {
  computeEnclosureGeneral, getEffectiveC, getTrapHalfWidths, inLens, validateSearchLimits
} from './inverse_search_reference.mjs';

const VERDICTS = new Set(['Interior', 'Interior-offLens', 'Member', 'Exterior', 'Undetermined']);

export function buildCertificatePayload(result, options) {
  const N = differenceAlphabetIndex(options.n);
  assertComplex(options.c);
  const kMax = options.kMax ?? 37;
  const LMax = options.LMax ?? 1000;
  const tol = options.tol ?? 1e-8;
  validateSearchLimits(kMax, LMax);
  assertPositiveNumber(tol, 'tol');
  if (!VERDICTS.has(result.verdict)) throw new RangeError('unrecognized search verdict');
  assertInteger(result.depth, 'result.depth', 0, kMax);
  const nodesExplored = result.nodesExplored ?? 0;
  assertInteger(nodesExplored, 'result.nodesExplored');
  const word = result.word ?? [];
  if (!Array.isArray(word) || word.some(digit =>
    !Number.isSafeInteger(digit) || Math.abs(digit) > N - 1 || digit % 2 !== 0)) {
    throw new RangeError('certificate word must contain difference-alphabet digits');
  }
  const isInterior = result.verdict === 'Interior' || result.verdict === 'Interior-offLens';
  if (isInterior && word.length !== result.depth) {
    throw new RangeError('an interior search record requires its full inverse word');
  }
  const effective = getEffectiveC(options.c.re, options.c.im);
  const c = Number.isFinite(effective.x) && Number.isFinite(effective.y)
    ? { re: effective.x, im: effective.y } : null;
  if (!c && (result.verdict !== 'Undetermined' || result.stopReason !== 'numerical-range')) {
    throw new RangeError('an unrepresentable effective parameter requires an undetermined numerical-range result');
  }
  const isLens = c ? inLens(c.re, c.im, options.n) : false;
  const canonicalOnly = options.canonicalOnly === true;
  const analytic = result.evidenceType === 'analytic';
  if (analytic) {
    const checked = c ? analyticConnectednessResult(c.re, c.im, options.n) : null;
    if (!checked || checked.verdict !== result.verdict || checked.stopReason !== result.stopReason ||
        checked.analyticReason !== result.analyticReason || result.depth !== 0 || word.length !== 0) {
      throw new RangeError('analytic records must match the supported connectedness criterion');
    }
  } else if (result.verdict === 'Member') {
    throw new RangeError('a membership record requires its analytic criterion');
  }
  if (canonicalOnly && isInterior && !analytic && (!isLens || result.verdict === 'Interior-offLens')) {
    throw new RangeError('canonical-only records require capture inside the strict canonical lens');
  }
  const enc = c && !analytic ? computeEnclosureGeneral(c.re, c.im, N, tol) : { err: true };
  const trap = enc.err || (canonicalOnly && !isLens)
    ? null : getTrapHalfWidths(c.re, c.im, N, isLens);
  const reciprocalInput = Math.hypot(options.c.re, options.c.im) > 0 &&
    Math.hypot(options.c.re, options.c.im) < 1;
  return {
    schema_version: '0.2.0',
    software_version: options.softwareVersion || '0.2.0-alpha',
    mode: 'finite-capture',
    n: options.n,
    N,
    c,
    input_parameter: { re: options.c.re, im: options.c.im },
    parameter_convention: reciprocalInput ? 'reciprocal-input' : 'expanding-parameter',
    k_max: kMax,
    L_max: LMax,
    tol,
    verdict: result.verdict,
    word: [...word],
    depth: result.depth,
    nodes_explored: nodesExplored,
    stop_reason: result.stopReason ?? null,
    in_lens: isLens,
    trap_region: canonicalOnly && !trap ? null : result.trapRegion ?? null,
    enclosure: enc.err ? null : enc,
    trap,
    ...(analytic ? {
      analytic_evidence: {
        reason: result.analyticReason,
        condition: result.analyticReason === 'mn-inner-annulus' ? '1 < |c| < sqrt(n)'
          : result.analyticReason === 'mn-real-interval' ? 'Im(c) = 0 and 1 < |c| <= n'
          : 'Im(c) = 0 and |c| > n',
        source: 'https://doi.org/10.3390/fractalfract8120725',
        basis: result.analyticReason === 'mn-inner-annulus' ? 'Proposition 2.5(i)'
          : 'Real interval IFS and the real bound in Proposition 2.4',
        capture_minimum_assigned: false
      }
    } : {}),
    ...(canonicalOnly ? {
      trap_policy: 'canonical-only',
      minimum_capture_depth: result.stopReason === 'trap-hit' && isLens ? result.depth : null
    } : {}),
    renderer: 'canvas-cpu',
    arithmetic: 'binary64',
    proof_status: analytic ? 'analytic-classification' : result.verdict === 'Undetermined'
      ? 'bounded-search-undetermined'
      : result.verdict === 'Interior-offLens' ? 'exploratory' : 'finite-search-certificate',
    limitations: analytic
      ? 'Analytic classification of the entered binary64 parameter using the stated connectedness criterion. Real-interval membership does not assert interior in the complex plane. No inverse word, trap hit, or minimum capture depth is assigned.'
      : canonicalOnly
      ? 'Floating-point finite-search record; inequalities are not verified with interval arithmetic. Capture uses the canonical self-covering trap only inside its strict lens. The theorem-level proof remains in the cited papers/thesis.'
      : 'Floating-point finite-search record; inequalities are not verified with interval arithmetic. Off-lens trap hits remain exploratory. The theorem-level proof remains in the cited papers/thesis.'
  };
}
