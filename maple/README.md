# Collinear Fractals — Maple

Reference Maple implementation of canonical coordinates, parameter-lens testing, enclosure bounds, trap half-widths, alphabet parity, and the enclosure-pruned inverse-iteration search.

```maple
read "CollinearFractals.mpl";

c := 0.5 + 1.2*I;
CollinearFractals:-in_lens(c, 3);
CollinearFractals:-compute_enclosure(0.7 + 1.4*I, 3);
result := CollinearFractals:-inverse_iteration_test(0.5 + 1.1*I, 3); # k_max defaults to 37
result["verdict"];
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, and `Undetermined`.

See `../docs/QA_REPORT.md` for the publication QA record.

Use the expanding parameter `c` in `z → t + z/c`; the standalone port does not normalize reciprocals. Real parameters and `abs(c) <= 1` return `Undetermined`. Inputs must be finite numeric values; require integer `2 <= n <= 4503599627370495`, nonnegative integer `k_max`, positive integer `l_max`, and finite positive tolerance. Invalid inputs raise an error. A zero depth budget checks the initial point. Reaching `l_max` admitted nodes at a level stops conservatively, with `stop_reason = "node-cap"`.

The `stop_reason` field distinguishes the domain, trap hit, enclosure escape, tree exhaustion and budget caps. The alphabet helper returns a parity-compatible ceiling without clipping to the finite alphabet.

These are numerical evaluations of analytic bounds, not automatically exact or outward-rounded certificates. `Interior` denotes an in-lens trap hit; `Interior-offLens` uses the exploratory off-lens rule. The complete tail is retained if the requested tolerance is capped. Maple's `Digits` setting may affect boundary decisions.

Native regression checks are supplied in `test_collinear.mpl`. Run from this directory:

```bash
maple test_collinear.mpl
```

A Maple runtime is required; the [QA report](../docs/QA_REPORT.md) records which checks have actually run.
