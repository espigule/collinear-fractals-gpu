# Changelog

## Unreleased

### Correctness

- Corrected prefix and histogram rendering to use the documented IFS
  `z -> t + z/c`, including the unscaled first digit and matching tail radius.
  Previously those visual renderers showed a scaled/rotated attractor.
- Made input validation, depth-zero searches, frontier limits, and termination
  reasons explicit. Search arithmetic and reciprocal-coordinate provenance are
  recorded separately from visual settings.
- Corrected the off-lens preset to a tested `n=3` case. The earlier `n=13`
  parameter was inside the lens. The legacy preset ID remains usable.
- Replaced incompatible legacy certificate examples with schema-conforming
  numerical search records; added inverse-word cases and a replay command.

### Browser and performance

- Reuse typed-array frontiers for verdict-only pixel searches while retaining
  the detailed reference search for selected-parameter trees and inverse words.
- Share validated numerical helpers and histogram sampling across entry points.
- Hardened URL-state parsing and clarified the distinction between numerical
  search results, finite visual approximations, and unresolved search limits.

### Maintenance and documentation

- Added a consistent local/CI validation workflow, real Chromium checks,
  JSON Schema validation, and a gated static Pages artifact.
- Documented direct versus reciprocal parameter input, the per-depth width
  cap, the IFS convention, and floating-point certification limits.
- Aligned example metadata with actual search outcomes and distinguished
  implemented features from planned gallery and atlas work.
- Marked prior QA reports as historical and kept the released `0.2.0-alpha`
  version unchanged while these changes are under review.

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
