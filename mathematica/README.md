# Collinear Fractals — Wolfram Language

Wolfram Language package for canonical coordinates, enclosure bounds, alphabet truncation, and inverse iteration.

```wolfram
Get["CollinearFractals.wl"]
CollinearInverseIterationTest[0.5 + 1.1 I, 3]  (* default kmax = 37 *)
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, or `Undetermined`.

See `../docs/QA_REPORT.md` for the publication QA record.

The standalone package takes the expanding parameter `c` in `z → t + z/c`; it does not normalize reciprocals. Real parameters and `Abs[c] <= 1` return `Undetermined`. Require an integer `2 <= n <= 4503599627370495`, nonnegative integer `kmax`, positive integer `lmax`, and finite positive tolerance. A zero depth budget still checks the initial point. Reaching `lmax` admitted nodes at a level returns `Undetermined` conservatively.

Search results include `StopReason` to distinguish trap hits, enclosure escape, exhausted branches, domain/range issues, and budget caps. Invalid search inputs return `Undetermined` with `invalid-input`; bound helpers return `$Failed`. The alphabet helper returns a parity-compatible ceiling without clipping to the finite alphabet.

Verdicts are numerical evaluations of the search rules. `Interior` denotes an in-lens trap hit and `Interior-offLens` uses the exploratory off-lens rule; neither is automatically an exact or outward-rounded certificate. The full enclosure tail is retained if its requested tolerance is capped. Different Wolfram Language precision settings can affect boundary decisions.

Native regression checks are supplied in `test_collinear.wlt`. From this directory, run:

```wolfram
TestReport["test_collinear.wlt"]
```

A Wolfram Language runtime is required; the [QA report](../docs/QA_REPORT.md) records which checks have actually run.
