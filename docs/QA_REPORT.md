# QA Report for v0.1.0-alpha

Date: 2026-05-27

## Scope checked

- Repository structure and release metadata.
- Browser JavaScript syntax and prefix smoke tests for the pure algorithmic functions in `explorer.js`.
- DOM identifier consistency between `index.html` and `explorer.js`.
- Executable companion package tests in JavaScript, Python, and Swift.
- Documentation claims against the implemented files.
- Local-link and stale-version scan.

## Automated checks run

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
cd javascript && npm test
cd python && python3 -m unittest -v test_collinear.py
cd swift && swift test
python3 tools/validate_bundle.py
```

Result: all executable checks passed in this environment. Swift was tested successfully; to reduce memory pressure in CI, prefer a modest job count if the host has many logical cores.

## Browser responsiveness

The browser explorer is a Canvas/CPU reference implementation with the requested default certificate depth `k_max = 37`. To keep the GitHub Pages demo responsive at this depth, the high-depth Canvas preview uses adaptive final resolution:

- parameter plane: 2 px final preview when `k_max >= 30`;
- dynamical plane: 2 px final preview when `k_max >= 30`.

The selected-parameter status bar and certificate JSON still use the full selected `k_max` value.

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

## Known limitations

- Wolfram Language, MATLAB, and Maple implementations were updated formula-by-formula but were not executed here because those runtimes are not available in this environment.
- The browser renderer is a research explorer, not a formal proof checker. Certificate JSON exports are reproducibility artifacts; theorem-level proof still belongs to the mathematical text.
- High-depth full-pixel rendering is intentionally avoided by default for responsiveness. Lower `k_max` if a very fine visual preview is more important than high-depth certification during interactive exploration.
