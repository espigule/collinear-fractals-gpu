# Collinear Fractals — Python

Pure-Python reference implementation of canonical coordinates, analytic enclosure bounds and the inverse search for the marked point `2c`.

```python
from collinear_fractals import inverse_iteration_test

result = inverse_iteration_test(complex(1.419643377607, 0.606290729207), n=3)
print(result["verdict"])      # Interior-offLens
print(result["word"])         # [4, 0]
print(result["stop_reason"])  # trap-hit
```

## Parameter and search contract

`inverse_iteration_test(c, n, k_max=37, l_max=1000, tol=1e-8)` uses the **expanding parameter** `c`, with maps `z → t + z/c`. Real parameters and `abs(c) ≤ 1` return `Undetermined` with `outside-domain`. The standalone port does not reciprocally normalize points inside the unit disk.

Inputs must be finite. `n` must be an integer from 2 to 4,503,599,627,370,495; this common bound keeps the difference alphabet exactly representable in the JavaScript and Swift ports too. `k_max` is a nonnegative integer; zero checks only the initial point. `l_max` is a positive integer, and reaching that many admitted nodes at a level conservatively stops the search. `tol` is positive. Boolean inputs are rejected. Invalid types/nonfinite inputs raise `TypeError`; invalid ranges raise `ValueError`. Representation limits are not practical workload recommendations: the alphabet and search budgets determine the cost.

| Verdict | Meaning |
| --- | --- |
| `Interior` | An inverse image entered the in-lens trap. |
| `Interior-offLens` | An inverse image entered the exploratory off-lens trap. |
| `Exterior` | The initial point escaped its enclosure, or the admitted tree was exhausted. |
| `Undetermined` | A budget, unsupported domain, or numerical range prevented a result. |

Results are **floating-point evidence**, not exact or outward-rounded certificates. Every search result includes `verdict`, `depth`, `word`, `nodes_explored`, and `stop_reason`. Stop reasons are `outside-domain`, `numerical-range`, `enclosure-escape`, `trap-hit`, `tree-exhausted`, `node-cap`, and `depth-cap`. `nodes_explored` counts admitted nodes, including the initial node, rather than every rejected digit candidate.

`compute_enclosure(c, n, tol)` returns `(se, ve)`. `compute_enclosure_details` also reports truncation depth, tail estimate and whether the cap was hit. The complete tail remains in the enclosure even if the requested tolerance cannot be reached. The legacy name `tail_certified_to_tol` refers only to the computed analytic tail estimate, not to rounding certification.

`first_alphabet_digit_at_or_above(a, m)` is a parity-compatible ceiling. It does not clip to `[-m + 1, m − 1]`; the search performs that intersection before calling it.

## Tests

```bash
python3 -m unittest discover -v
```

The unit tests cover validation, capped tails, arithmetic range, search budgets, near-real digit bounds, conjugation and independent Cartesian witness replay. In a repository checkout, Node.js enables an additional deterministic corpus comparison with the JavaScript port; that integration test skips when Node.js is absent. See [the QA report](../docs/QA_REPORT.md) for verification scope.
