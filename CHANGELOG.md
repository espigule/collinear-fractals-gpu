# Changelog

## Unreleased

No unreleased changes yet.

## 0.2.0-alpha — 2026-05-28

Highlights:

- Added share URLs, embed-code copy, save-image export, undo/redo, panel focus,
  palette controls, guided tour, curated presets, and About/Cite and Support
  dialogs to the browser explorer.
- Added runnable example metadata for eight curated examples, gallery index
  metadata, figure-job metadata, and JSON Schemas for certificates, examples,
  and figure metadata.
- Split original-attractor visual rendering from finite-search certificate
  rendering. Prefix-cylinder rendering is now the default \(E(c,n)\) view,
  seeded histogram rendering is deterministic by seed, and inverse-survival
  status is an explicit non-default mode.
- Added build-free browser modules under `src/`, worker entry points under
  `workers/`, renderer smoke tests, reference-kernel equivalence tests, and a
  metadata-only benchmark script.
- Tightened staged Pages deployment so GitHub Pages publishes only the static
  explorer and safe gallery/example assets.
- Strengthened static validation for line-collapsed files, README heading
  structure, fake DOI placeholders, Pages root deployment, local paths,
  generated-image policy, and v0.1/v0.2 overclaiming language.
- Updated `.gitignore` so generated certificates remain local while curated
  examples and verified certificate JSON can be versioned.

## 0.1.0-alpha — 2026-05-27

Initial public alpha prepared for GitHub publication.

Highlights:

- Browser-based Canvas reference explorer with parameter and dynamical planes.
- Canonical-coordinate inverse search with enclosure pruning.
- Distinct `Interior` and `Interior-offLens` trap-entry verdicts.
- Correct alphabet parity for `A_m={-m+1,-m+3,...,m-1}`.
- Enclosure tail-depth selection targeting `rho^(-M)/(rho-1) <= tol` when the cap permits.
- Certificate JSON copy/download from the browser explorer.
- JavaScript, Python, Swift, Wolfram Language, MATLAB, and Maple companion implementations.
- Apache-2.0 source-code license and CC BY 4.0 documentation license.
