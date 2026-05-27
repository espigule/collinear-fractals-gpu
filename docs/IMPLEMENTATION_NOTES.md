# Implementation Notes

## Verdicts

The implementation uses four primary verdicts:

- `Interior`: in-lens trap entry.
- `Interior-offLens`: off-lens trap entry using the enabled off-lens trap rule.
- `Exterior`: enclosure escape or complete enclosure-admissible tree exhaustion.
- `Undetermined`: depth or node cap reached.

Keeping `Interior-offLens` separate makes the computational provenance explicit while allowing the off-lens trap rule to be used in exploration and package tests.

## Alphabet parity

The symmetric collinear alphabet is

\[
A_m=\{-m+1,-m+3,\ldots,m-1\}.
\]

The first admissible digit in a truncated interval is therefore determined by the parity of `m-1`. The helper function `firstAlphabetDigitAtOrAbove(a,m)` and its analogues in the companion packages implement this rule.

## Enclosure truncation

The geometric tail used in the enclosure estimate is

\[
\frac{\rho^{-M}}{\rho-1}.
\]

The updated code chooses `M` so that this tail is at most the requested tolerance when possible. If the maximum cap is reached first, the returned metadata records this via `tailCapHit` / `tail_cap_hit`.

## Certificate JSON

The web explorer can export a JSON payload containing:

- selected parameter and arity;
- in-lens status;
- verdict and trap region;
- depth, word, and node count;
- search parameters;
- enclosure metadata;
- trap half-widths.

This is meant as a lightweight reproducibility artifact for discussion, debugging, and later conversion into formal finite certificates.
