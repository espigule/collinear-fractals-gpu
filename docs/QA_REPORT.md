# QA Report for v0.1.0-alpha

Date: 2026-05-27

## Scope checked

- Repository structure and release metadata.
- Browser JavaScript syntax and prefix smoke tests for the pure algorithmic functions in `explorer.js`.
- Prefix-cylinder and seeded-histogram renderer smoke tests.
- Reference-kernel equivalence checks for representative in-lens, off-lens,
  exterior, and larger-arity cases.
- DOM identifier consistency between `index.html` and `explorer.js`.
- Share URL, preset, modal, palette, panel-focus, and certificate-export
  controls through static DOM validation and browser-engine syntax checks.
- Executable companion package tests in JavaScript, Python, and Swift.
- Documentation claims against the implemented files.
- Local-link, fake DOI, stale-version, generated-image, and overclaiming scans.

## Automated checks run

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
node qa/render_smoke_tests.js
node qa/kernel_equivalence_tests.js
cd javascript && npm test
cd python && python3 -m unittest -v test_collinear.py
cd swift && swift test
python3 tools/validate_bundle.py
```

Result: all executable checks passed in this environment. Swift was tested successfully; to reduce memory pressure in CI, prefer a modest job count if the host has many logical cores.

## Browser renderer

The browser explorer is a Canvas/CPU reference implementation with default
certificate depth `k_max = 37`. The Canvas renderer is progressive: it first
draws coarse blocks and then refines to single-pixel sampling.

The original attractor \(E(c,n)\) is now visually rendered by an explicit
prefix-cylinder renderer by default, with a seeded histogram renderer available
as an opt-in preview. The inverse-survival/status renderer is separate and
explicit; it is not used as the default visual overlay.

The selected-parameter status bar and certificate JSON use the full selected
`k_max` value and node cap independently of the visible progressive drawing
stage.

## Formula-level checks

The test suite covers:

- canonical coordinates;
- lens membership;
- enclosure truncation with corrected tail target;
- alphabet parity for both even and odd alphabets;
- in-lens `Interior` verdict;
- `Exterior` verdict;
- off-lens `Interior-offLens` verdict;
- default `k_max = 37` in the primary executable packages.

## Documentation checks

Passed:

- no local file-URL links or user-specific absolute filesystem paths remain;
- visible version is `0.1.0-alpha`;
- README distinguishes Canvas/CPU implementation from the broader GPU-assisted programme;
- README and docs distinguish `Interior` from `Interior-offLens`;
- default `k_max = 37` is documented across the browser and packages;
- licensing files and `CITATION.cff` are present.
- Pages workflow stages only the static explorer, gallery metadata, and safe
  example metadata instead of deploying the whole repository root.
- `examples/`, `gallery/`, `paper_figures/`, and `schemas/` contain
  reproducibility metadata for the alpha-candidate example layer.

## Known limitations

- Wolfram Language, MATLAB, and Maple implementations were updated formula-by-formula but were not executed here because those runtimes are not available in this environment.
- The browser renderer is a research explorer, not a formal proof checker.
  Certificate JSON exports are reproducibility artifacts; theorem-level proof
  still belongs to the mathematical text.
- High-depth rendering can be computationally expensive in the browser. The
  current alpha keeps the behavior explicit by refining to single-pixel
  sampling rather than silently lowering final preview resolution.
- The gallery is metadata-first in this alpha candidate. Large rendered figure
  dumps remain ignored until small curated assets are reviewed and hash-checked.
