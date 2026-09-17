# Collinear Fractals — JavaScript / Node.js

Dependency-free reference implementation of canonical coordinates, analytic enclosure bounds and the inverse search for the marked point `2c`.

```js
const { inverseIterationTest } = require('./index');

const result = inverseIterationTest(1.419643377607, 0.606290729207, 3);
console.log(result.verdict);    // Interior-offLens
console.log(result.word);       // [4, 0]
console.log(result.stopReason); // trap-hit
```

## Parameter and search contract

`inverseIterationTest(x, y, n, kMax = 37, LMax = 1000, tol = 1e-8)` uses the **expanding parameter** `c = x + iy`, with maps `z → t + z/c`. Pass finite coordinates and an integer `n ≥ 2`. This standalone package does not reciprocally normalize a parameter inside the unit disk. Real parameters and `|c| ≤ 1` return `Undetermined` with `outside-domain`.

`kMax` is a nonnegative integer; zero still checks the initial marked point. `LMax` is a positive integer. The search conservatively stops as soon as a level retains `LMax` nodes. `tol` must be finite and positive. Invalid types/nonfinite inputs throw `TypeError`; invalid ranges throw `RangeError`. Integer arguments must be exactly representable, and `n ≤ 4,503,599,627,370,495` keeps the difference alphabet exact. These are representation limits, not practical workload recommendations: runtime also grows with the alphabet and the search budgets.

| Verdict | Meaning |
| --- | --- |
| `Interior` | An inverse image entered the in-lens trap. |
| `Interior-offLens` | An inverse image entered the exploratory off-lens trap. |
| `Exterior` | The initial marked point escaped its enclosure, or all admitted branches were exhausted. |
| `Undetermined` | A budget, an unsupported domain, or numerical range prevented a result. |

These are **floating-point results**, not interval or exact certificates. The theorem behind an in-lens trap does not make its unrounded numerical evaluation a proof. A very small imaginary part or a point near a boundary deserves a separate numerical or exact verification.

Each result contains `verdict`, `depth`, `word`, `nodesExplored`, and `stopReason`. `word` is empty when no witness is reported. Stop reasons are `outside-domain`, `numerical-range`, `enclosure-escape`, `trap-hit`, `tree-exhausted`, `node-cap`, and `depth-cap`. `nodesExplored` counts admitted nodes, including the initial node; it does not count every rejected digit candidate.

## Other exports

- `getCanonicalCoordinates(ux, uy, cx, cy)` returns `{ls, lv}` and requires finite inputs and a finite, nonzero modulus for `c`.
- `inLens(x, y, n)` tests the non-real lens.
- `chooseTailDepth(rho, tol, minM = 30, maxM = 2000)` returns `{M, capped}`. It uses logarithms without an underflow-prone product and checks the computed tail after rounding.
- `computeEnclosure(x, y, n, tol)` returns `se`, `ve`, `truncationDepth`, `tail`, `tailCertifiedToTol`, and `tailCapHit`. The full tail is retained when the depth cap is hit. `tailCertifiedToTol` describes the tail estimate alone, not a rigorous floating-point error bound.
- `getTrapHalfWidths(x, y, n)` returns `{S, V, region}` and requires a non-real expanding parameter.
- `firstAlphabetDigitAtOrAbove(a, m)` returns the first integer at least `a` with parity `m − 1`. It does **not** clip to the finite alphabet; callers must intersect with `[-m + 1, m − 1]`.

## Tests

```bash
npm test
```

The tests cover malformed input, finite arithmetic range, capped tails, zero-depth and frontier budgets, near-real digit bounds, conjugation and an independent Cartesian replay of a reported witness. Repository integration tests additionally compare this package with the browser core and Python port. See [the QA report](../docs/QA_REPORT.md) for verification scope.
