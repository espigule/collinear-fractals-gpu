# Implementation Notes

## Verdicts

The implementation uses four primary verdicts:

- `Interior`: in-lens trap entry.
- `Interior-offLens`: off-lens trap entry using the enabled off-lens trap rule.
- `Exterior`: enclosure escape or complete enclosure-admissible tree exhaustion.
- `Undetermined`: depth or node cap reached.

Keeping `Interior-offLens` separate makes the computational provenance explicit while allowing the off-lens trap rule to be used in exploration and package tests.

## Visual and certificate renderers

The browser separates the visual rendering of the original attractor \(E(c,n)\)
from finite-search status rendering for \(\mathcal M_n\), \(1/2 E(c,2n-1)\),
traps, enclosures, and selected certificates.

The default original-attractor renderer is `prefix-cylinder`. It draws prefix
centers with a tail-radius metadata record and first-level piece coloring. The
`seeded-histogram` renderer is available for fast visual previews and is
deterministic for a fixed seed and sample count.

The inverse-survival renderer remains available as an explicit diagnostic mode.
It does not treat `Undetermined` as membership and it no longer applies hidden
dilation or color inversion to the original-attractor overlay.

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
- visual renderer metadata, recorded separately from proof fields;
- enclosure metadata;
- trap half-widths.

This is meant as a lightweight reproducibility artifact for discussion, debugging, and later conversion into formal finite certificates.
