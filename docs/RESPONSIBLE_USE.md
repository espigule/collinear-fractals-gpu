# Interpreting Numerical Results

The explorer produces numerical evidence for collinear-fractal research.
Use the exported parameter, search settings, inverse word, and software
revision to reproduce a result.

## Arithmetic and verdicts

The browser, JavaScript, Python, and Swift implementations use ordinary
floating-point arithmetic. The enclosure tail estimate bounds the omitted
mathematical series; its `tailCertifiedToTol` flag does **not** bound rounding
errors in the coordinates, trigonometric sums, or inverse iterates.

| Verdict | What the computation found |
|---|---|
| `Interior` | Strict entry into the in-lens trap. |
| `Interior-offLens` | Strict entry using the separate off-lens trap rule. |
| `Exterior` | Enclosure escape or exhaustion of the admissible inverse tree. |
| `Undetermined` | A search limit, unsupported domain, or numerical-range limit. |

A result close to an inequality boundary needs error-controlled verification
before it can support a proof. The mathematical hypotheses for the trap and
enclosure must also hold. The software does not supply an interval-arithmetic
checker for those obligations.

`Undetermined` is a lack of conclusion. It is not a boundary classification,
and surviving a finite search does not establish membership.

## Images and JSON

Prefix and histogram renderers produce finite visual approximations. They do
not classify every point covered by a drawn pixel. Changes to visual depth,
seed, sample count, and opacity describe an image, independently of the
selected-parameter search.

The historical JSON field `proof_status: "finite-search-certificate"` means a
finite floating-point search record. It does not assert an independently
verified theorem. Preserve this context when sharing or citing exported JSON.
A JSON Schema check validates the shape of a record, not its mathematical
conclusion.

## Reporting a reproducible issue

Include the share URL, parameter convention (direct $c$ or browser reciprocal
coordinate), `n`, search depth, frontier-width cap, tolerance, and software
commit. Attach the search JSON when available. For a rendering issue, also
include renderer mode, visual depth or sample count, seed, and browser version.
Remove unrelated personal information from screenshots and console logs.

See [implementation notes](IMPLEMENTATION_NOTES.md) for the coordinate and
search contract and [validation notes](VALIDATION.md) for runnable checks.
