# Release Checklist

Use this checklist before tagging the next GitHub release.

Because the post-alpha maintenance pass adds examples, gallery metadata, and
release hygiene, the recommended next public release line is `v0.2.0`. If only
small formatting or metadata corrections are made in a future pass, use a patch
alpha such as `v0.1.1-alpha` instead.

## Required automated checks

```bash
node --check explorer.js
cd javascript && npm test
cd ../python && python3 -m unittest -v test_collinear.py
cd ../swift && swift test
git check-ignore collinear-fractals-gpu_v0.1.0-alpha_final-QA.zip
git check-ignore artifacts/example.txt
git check-ignore dist/out.tar.gz
git check-ignore coverage/index.html
git check-ignore certificates/foo.json
```

## Static checks

- No local absolute filesystem links.
- `VERSION`, `README.md`, `CITATION.cff`, JavaScript `package.json`, and Python `pyproject.toml` agree on the release version.
- The default `k_max` is 37 in the browser and package implementations.
- `Interior` and `Interior-offLens` remain separate verdict labels.
- The browser explorer refines to single-pixel sampling unless an explicit UI
  quality/performance control is added in a later release.
- Key Markdown, YAML, CFF, and gitignore files are not line-collapsed.
- No fake DOI, local filesystem path, secret, or proof-verification overclaim
  is present.
- GitHub Pages deploys only the staged static explorer assets and curated
  gallery assets.
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
