# Contributing

Contributions should make the numerical behavior easier to reproduce, inspect,
or use. A useful report starts with a minimal parameter example or share URL
and the behavior you expected.

## Development setup

The browser explorer has no application build step. Serve the repository root
with `python3 -m http.server 8000`; ES modules and presets need HTTP loading.
See [validation notes](docs/VALIDATION.md) for the complete automated workflow.
The JavaScript and Python reference packages have no runtime dependencies.

Run the checks appropriate to your change. A numerical change needs regression
cases that detect the defect, plus agreement checks across affected ports.
A browser change needs a real browser interaction check in addition to syntax
validation. Schema or preset changes need validation of the checked-in data.

## Numerical contract

- Use the IFS convention $f_t(z)=t+z/c$. The unscaled first digit is part of the
  public convention, including visual renderers.
- Keep `Interior`, `Interior-offLens`, `Exterior`, and `Undetermined` distinct.
  These are numerical search outcomes; do not describe a floating-point
  export as a rigorously verified proof.
- Preserve defaults across implementations: `k_max = 37`, `L_max = 1000`,
  `tol = 1e-8`. `L_max` is a per-depth frontier limit.
- Report unsupported input and exhausted computational limits explicitly.
  Never convert an incomplete search into an exterior conclusion.
- Record changes to parameters, arithmetic, result fields, or reproducibility
  behavior in [CHANGELOG.md](CHANGELOG.md).

## Public material

Keep source, tests, schemas, curated examples, and concise validation summaries
in git. Keep build caches, scratch certificates, large generated images, and
archives out of git. Curated search records should conform to their schema and
include enough settings to reproduce them.

Add references for mathematical claims and retain a clear distinction between
published results, implemented behavior, and planned features. Before a release,
follow [the release process](docs/RELEASE_PROCESS.md) and record which runtimes
were actually exercised.
