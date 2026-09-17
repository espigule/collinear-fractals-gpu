# Collinear Fractals — MATLAB

MATLAB static-class implementation of canonical coordinates, enclosure bounds, alphabet truncation, and inverse iteration.

```matlab
c = 0.5 + 1.1i;
result = collinear_fractals.inverse_iteration_test(c, 3); % default k_max = 37
disp(result.verdict)
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, or `Undetermined`.

See `../docs/QA_REPORT.md` for the publication QA record.

Use the expanding parameter `c` in `z → t + z/c`; the standalone port does not normalize reciprocals. Real parameters and `abs(c) <= 1` return `Undetermined`. Inputs must be finite numeric scalars. Require integer `2 <= n <= 4503599627370495`, nonnegative integer `k_max`, positive integer `l_max`, and finite positive tolerance. Invalid arguments raise an error; valid numeric inputs are converted to double precision. A zero depth budget checks the initial point. Reaching `l_max` admitted nodes at a level stops conservatively.

`stop_reason` distinguishes `outside-domain`, `numerical-range`, `enclosure-escape`, `trap-hit`, `tree-exhausted`, `node-cap`, and `depth-cap`. The alphabet helper returns a parity-compatible ceiling without clipping to the finite alphabet.

Verdicts are **floating-point evidence**, not exact or outward-rounded certificates. `Interior` is an in-lens trap hit; `Interior-offLens` uses the exploratory off-lens rule. The complete enclosure tail is retained if its requested tolerance is capped.

Native regression checks are supplied in `test_collinear.m`. Run `test_collinear` from this directory in MATLAB. A native runtime is required; the [QA report](../docs/QA_REPORT.md) records which checks have actually run.
