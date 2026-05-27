# Release Checklist

Use this checklist before tagging the GitHub release.

## Required automated checks

```bash
node --check explorer.js
cd javascript && npm test
cd ../python && python3 -m unittest -v test_collinear.py
cd ../swift && swift test
```

## Static checks

- No local absolute filesystem links.
- `VERSION`, `README.md`, `CITATION.cff`, JavaScript `package.json`, and Python `pyproject.toml` agree on the release version.
- The default `k_max` is 37 in the browser and package implementations.
- `Interior` and `Interior-offLens` remain separate verdict labels.
- Zip/tar release archives exclude `__pycache__`, `.build`, `.DS_Store`, and other generated artifacts.

## Manual browser smoke test

Open `index.html` in a modern browser and verify:

- The explorer renders without console errors.
- The default parameter reports an in-lens `Interior` verdict.
- Changing `n`, `k_max`, and `mod q` triggers re-rendering.
- Dragging the red locator updates the dynamical panel and status bar.
- `Copy Certificate JSON` and `Download Certificate JSON` work.

## Optional runtime checks

The Wolfram Language, MATLAB, and Maple implementations should be opened in their native runtimes when available and compared against the JavaScript/Python sample values documented in `docs/VALIDATION.md`.
