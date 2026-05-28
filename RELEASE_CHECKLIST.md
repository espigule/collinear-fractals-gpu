# Release Checklist

Use this checklist before tagging the next GitHub release.

Because the follow-up pass adds staged Pages deployment, share URLs, presets,
example metadata, gallery index metadata, JSON schemas, and runnable
reproducibility starting points, the recommended next public release line is
`v0.2.0-alpha` after CI and Pages pass.

Use `v0.1.1-alpha` only if this scope is reduced to formatting, citation,
funding, support, and directory scaffolding without usable example presets.

## Required automated checks

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
node qa/render_smoke_tests.js
node qa/kernel_equivalence_tests.js
node tools/bench/render_metadata_bench.js
cd javascript && npm test
cd ../python && python3 -m unittest -v test_collinear.py
cd ../swift && swift test
git check-ignore collinear-fractals-gpu_v0.1.0-alpha_final-QA.zip
git check-ignore artifacts/example.txt
git check-ignore dist/out.tar.gz
git check-ignore coverage/index.html
git check-ignore certificates/generated/foo.json
git check-ignore certificates/scratch/foo.json
git check-ignore paper_figures/output/example.png
! git check-ignore examples/e_c4_overlap/config.json
! git check-ignore examples/trap_enclosure_n3/certificate_interior.json
! git check-ignore certificates/verified/example.json
```

## Static checks

- No local absolute filesystem links.
- `VERSION`, `README.md`, `CITATION.cff`, JavaScript `package.json`, and Python `pyproject.toml` agree on the release version.
- The default `k_max` is 37 in the browser and package implementations.
- `Interior` and `Interior-offLens` remain separate verdict labels.
- The browser explorer refines to single-pixel sampling unless an explicit UI
  quality/performance control is added in a later release.
- The original-attractor visual renderer is separate from finite-search
  certificate/status rendering.
- Share URLs preserve renderer mode, prefix depth, histogram seed, sample count,
  first-level piece coloring, and layer opacity.
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
- Prefix-cylinder mode renders \(E(c,n)\) without color inversion or hidden
  dilation.
- Histogram mode is deterministic for a fixed seed.
- `Copy Certificate JSON` and `Download Certificate JSON` work.
- `Share View`, `Copy Embed`, `Save Image`, curated presets, undo/redo,
  panel focus, palette controls, and About/Cite and Support dialogs work.

## Optional runtime checks

The Wolfram Language, MATLAB, and Maple implementations should be opened in their native runtimes when available and compared against the JavaScript/Python sample values documented in `docs/VALIDATION.md`.
