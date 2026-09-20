/**
 * Classical complex-tree parallelogram, used only to order inverse branches.
 *
 * P = { a + b/c : |a| < m - 1, |b| < B }, where B = 2*kappa matches
 * the archived explorer's 100% complex-tree setting. This is NOT a generally
 * valid self-covering set. Entry supplies neither membership nor a finite-
 * capture level; a guided word still has to complete the ordinary bounded-
 * orbit search with its full enclosure, arithmetic and work-limit checks.
 */
export function createComplexTreeGuidance(x, y, m) {
  const rhoSquared = x * x + y * y;
  if (!Number.isFinite(rhoSquared) || rhoSquared <= 1 || y === 0
    || !Number.isSafeInteger(m) || m < 3 || m % 2 !== 1) return null;
  const n = (m + 1) / 2;
  const kappa = n > 7 ? 1 + Math.floor(n - 2 - 2 * Math.sqrt(n)) : 1;
  const B = 2 * kappa;
  const weight = B / (m - 1);
  const twiceXOverRhoSquared = 2 * x / rhoSquared;
  const rStarFactor = Math.sign(x) * weight
    / (1 + Math.abs(twiceXOverRhoSquared) * weight);
  return {
    x, y, m, rhoSquared, kappa, B, weight, twiceXOverRhoSquared, rStarFactor,
    // Canonical strips are |s| < S and |Im z| < V, where
    // s = (y Re z + x Im z)/|c|. They are geometry, not acceptance tests.
    S: (m - 1) * Math.abs(y) / Math.sqrt(rhoSquared),
    V: B * Math.abs(y) / rhoSquared
  };
}

/**
 * Choose a step-two digit minimizing the child's normalized distance to P.
 * The endpoints must already describe an enclosure-admissible alphabet range.
 * Returns null on invalid geometry; the caller can retain ascending order.
 *
 * For q = y*u + x*v and r = q-y*t, the child score, up to a common positive
 * factor, is max(|r|, B/(m-1) * |2*x*r/|c|^2-v|). This convex piecewise-linear
 * function has a continuous minimum at
 * r* = sign(x)*v*(B/(m-1))/(1 + 2*|x|*B/((m-1)*|c|^2)).
 * Therefore only the two alphabet digits surrounding (q-r*)/y need testing.
 * No inverse branch is removed by this optimization.
 */
export function preferredComplexTreeDigit(guidance, u, v, low, high) {
  if (!guidance || !Number.isFinite(u) || !Number.isFinite(v)
    || !Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low > high) return null;
  // Existing pruning may leave the upper endpoint between alphabet digits.
  high = low + 2 * Math.floor((high - low) / 2);
  const { x, y, weight, twiceXOverRhoSquared, rStarFactor } = guidance;
  const q = y * u + x * v;
  const rStar = v * rStarFactor;
  if (!Number.isFinite(q) || !Number.isFinite(rStar)) return null;
  const ideal = (q - rStar) / y;
  if (Number.isNaN(ideal)) return null;
  if (ideal <= low) return low;
  if (ideal >= high) return high;
  const left = low + 2 * Math.floor((ideal - low) / 2);
  const right = Math.min(high, left + 2);
  const leftResidual = q - y * left, rightResidual = q - y * right;
  const leftScore = Math.max(Math.abs(leftResidual),
    weight * Math.abs(twiceXOverRhoSquared * leftResidual - v));
  const rightScore = Math.max(Math.abs(rightResidual),
    weight * Math.abs(twiceXOverRhoSquared * rightResidual - v));
  if (!Number.isFinite(leftScore) || !Number.isFinite(rightScore)) return null;
  return leftScore <= rightScore ? left : right;
}
