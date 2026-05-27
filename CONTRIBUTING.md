# Contributing

This repository is research software. Contributions should make the numerical behavior easier to reproduce, audit, or use.

## Development setup

No build step is required for the browser explorer. Open `index.html` directly or serve the repository root:

```bash
python3 -m http.server 8000
```

Run the release checks before opening a pull request:

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
cd javascript && npm test
cd ../python && python3 -m unittest -v test_collinear.py
cd ../swift && swift test
cd .. && python3 tools/validate_bundle.py
```

## Contribution standards

- Keep theorem-level `Interior` separate from exploratory `Interior-offLens`.
- Preserve the default `k_max = 37` unless a release deliberately changes it across all implementations.
- Add or update tests for changes to numerical behavior.
- Include certificate JSON or reproducible parameter values for validation reports.
- Do not commit generated archives, caches, local certificates, or runtime build output.

## Public release material

Source code, package tests, `qa/`, `tools/validate_bundle.py`, release notes, citation metadata, and QA summaries are public and versioned. Generated release archives belong on GitHub Releases, not in git history.
