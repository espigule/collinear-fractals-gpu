# Changelog

## Unreleased

### Correctness

- Share an original-alphabet membership search across the sharp boundary and
  marked-point views. Canonical capture is restricted to
  `|c|² + 2|Re c| < n`, including even alphabets. Exhaustive escape, finite
  survival, and work-cap termination keep distinct meanings.
- Name the original marked-point view `M_n^0` and add `M_n^1`, whose first
  digit comes from `A_(n-1)` and later digits from `A_n`. Preserve `rn` as an
  input alias for `mn0`; new URLs and imported state use the canonical name.
- Render parameter cells with their variation in both the marked point and
  the maps. Propagate an inverse word's parameter derivative and remainder,
  enlarge the pruning enclosure for the whole cell, and require strict trap
  containment across the cell for capture. Selected point records keep zero
  geometric radius. This replaces pixel-center sampling in the marked-point
  raster, which could miss fine structure between samples.
- Expose all `2n-1` first-digit subsets `F_(n,t)` for `t` in `D_n`, each with
  the original `A_n` tail. Keep `M_n^0` and `M_n^1` as the original- and
  complementary-digit unions, contained in `M_n` without claiming equality.
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

- Make **Sharp boundary** the default original-attractor renderer, using
  bounded GPU previews followed by binary64 worker refinement. Automatic
  boundary depth starts at 16 for two maps and 12 otherwise, adapts to zoom and
  raster resolution, and is shared through `bdepth` and `badapt`. First-level
  coloring remains enabled; prefix, histogram, and survival are advanced choices.
- Allow several aggregate parameter layers and individual digit subsets to
  remain visible together. Preserve their independent selections in share
  links and history, while importing the earlier exclusive modes.
- Trace the displayed boundary of each first-level attractor piece from its
  own coverage mask. Preserve black outlines inside overlaps and use a
  coordinated piece palette; unresolved searches do not become invented edges.
- Added a hybrid rendering pipeline: bounded WebGL 2 previews for parameter
  and dynamical inverse-search images, followed by double-precision refinement
  in background workers. Direct prefix and histogram attractor drawing remains
  a separate visual renderer.
- Added Automatic, GPU preview, and CPU precision preferences to Controls,
  history, and shared views. Actual backend and arithmetic metadata are recorded
  separately from the requested preference; selected-parameter search records
  continue to use the full numerical settings.
- Added bounded worker scheduling and cancellation of superseded panel jobs.
  Unavailable WebGL, preview precision guards, and context loss fall back to CPU
  refinement; worker failure retains a progressive main-thread fallback.
- Label GPU-only images as previews, prevent PNG export until the visible panels
  finish rendering, and include backend, preview-limit, and refinement metadata
  in JSON exports.
- Restored a canvas-first workspace with a collapsible controls drawer,
  Cartesian and polar parameter input, direct set comparisons, quick view and
  zoom controls, fullscreen, and a persistent selected-search readout.
  Marked-point rendering reports capture, finite survival, and unresolved work
  separately from the selected Mₙ search record.
- Reuse typed-array frontiers for verdict-only pixel searches while retaining
  the detailed reference search for selected-parameter trees and inverse words.
- Share validated numerical helpers and histogram sampling across entry points.
- Hardened URL-state parsing and clarified the distinction between numerical
  search results, finite visual approximations, and unresolved search limits.
- Preserve unfinished numeric edits when background rendering or resizing
  refreshes the search status.

### Maintenance and documentation

- Rewrote the README lens inequality without the unsupported named-operator
  macro, and added reproducible attractor examples, a parameter-lens diagram,
  and a diagram of hybrid rendering and the independent reference search.
- Added a consistent local/CI validation workflow, real Chromium checks,
  JSON Schema validation, and a gated static Pages artifact.
- Documented direct versus reciprocal parameter input, the per-depth width
  cap, the IFS convention, and floating-point certification limits.
- Aligned example metadata with actual search outcomes and distinguished
  implemented features from planned gallery and atlas work.
- Updated curated presets and README interactive links to sharp boundary
  rendering. Regenerated the README figures with the actual binary64
  capture-and-escape raster and per-piece contour compositor, replacing their
  former depth-eight prefix illustrations. Metadata records the rendering
  settings and source/image fingerprints.
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
