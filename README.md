# Collinear Fractals GPU

**Research explorer and companion software for collinear fractals, finite
capture, and restricted polynomial roots.**

Version: **0.2.0-alpha**

Release line: **v0.2.0-alpha** GitHub-only prerelease.
Author: **Bernat Espigule**

This repository contains a browser-based research explorer and multi-language
reference implementations for canonical-coordinate inverse search associated
with the collinear connectedness loci \(\mathcal M_n\).

The current public release is an alpha intended for reproducible exploration,
finite inverse-word export, figure preparation, and independent inspection. It
is not a formal proof checker; theorem-level proofs remain in the papers and
thesis.

## Quick visual summary

The browser explorer renders the parameter plane, dynamical plane, canonical
traps, canonical enclosures, finite inverse-search data, and selected
certificate JSON. The default original-attractor view now uses a
prefix-cylinder visual renderer for \(E(c,n)\), with a seeded histogram preview
available as an explicit alternative. Finite inverse-search status remains a
separate certificate/status renderer, not the default visual overlay.

The explorer also includes curated example presets, share URLs, embed code,
save-image export, undo/redo, comparison modes, palette controls, panel focus,
and About/Cite and Support dialogs.

Curated example metadata lives in `examples/`, gallery metadata lives in
`gallery/`, and reproducible figure job metadata lives in `paper_figures/`.
Large generated images are intentionally kept out of git until they are
curated, compressed, and tied to reproducible metadata.

## Browser quick start

For the best experience, serve the repository locally:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in a modern browser. Opening `index.html`
directly also works for core rendering, but browser security rules may block
loading example metadata from local JSON files.

The left panel renders the parameter plane. The right panel renders the
dynamical plane, the canonical trap, the canonical enclosure, and the
inverse-search tree. The selected certificate can be copied or downloaded as
JSON from the sidebar.

The Canvas renderer refines progressively to single-pixel sampling. Visual
controls such as prefix depth, histogram seed, histogram sample count, and layer
opacity affect the drawing only. The selected-parameter verdict and exported
certificate JSON always use the full selected search depth and node cap.

## What is included

| Path | Contents |
|---|---|
| `index.html`, `index.css`, `explorer.js` | Single-page Canvas/CPU browser explorer. |
| `src/` | Build-free browser ES modules for visual renderers and finite-search kernels. |
| `workers/` | Worker entry points for future certificate and histogram jobs. |
| `javascript/` | Node.js reference package and tests. |
| `python/` | Pure-Python reference package and tests. |
| `swift/` | Swift Package Manager implementation and tests. |
| `mathematica/` | Wolfram Language package. |
| `matlab/` | MATLAB static-class implementation. |
| `maple/` | Maple module implementation. |
| `examples/` | Curated example configurations, metadata, certificates, and notes. |
| `gallery/` | Gallery index and placeholder documentation for curated figures. |
| `paper_figures/` | Metadata and scripts for reproducible figure generation. |
| `schemas/` | JSON Schemas for certificates, examples, and figure metadata. |
| `docs/` | Implementation, validation, release, and QA notes. |
| `qa/` | Browser-engine, renderer, and kernel smoke tests. |
| `tools/` | Dependency-free static bundle validator and metadata-only benchmark scripts. |

The browser explorer is currently a **Canvas/CPU reference implementation**.
The project keeps the historical `GPU` name because it is the companion
repository for the broader GPU-assisted exploration programme; WebGL/WebGPU
acceleration can be added later without changing the mathematical API.

Feature status for `v0.2.0-alpha`:

| Feature | v0.2 status |
|---|---|
| Prefix renderer for \(E(c,n)\) | Implemented |
| Seeded histogram renderer | Implemented / smoke-tested |
| Certificate/status renderer | Implemented |
| Worker scaffold | Present |
| Typed-array optimized kernel | Experimental scaffold/wrapper only; reference kernel remains default |
| Active certificate inspector UI | Planned / not implemented |
| Level 0/1/2 atlas | Metadata scaffold |
| Curated thumbnails | Planned |

## Mathematical scope

For the collinear alphabet

```text
A_m = {-m+1, -m+3, ..., m-1},
```

the explorer studies the marked-point condition

```text
2c in E(c, 2n - 1),
```

which encodes connectedness of the original \(n\)-ary collinear attractor
\(E(c,n)\). The inverse search works in canonical coordinates, prunes by a
canonical enclosure, and detects canonical trap entry.

The repository uses the following theorem spine:

- marked point `2c`;
- difference attractor `E(c, 2n - 1)`;
- canonical coordinates, trap, and enclosure;
- finite inverse search and finite inverse-word export;
- finite-capture filtration `Theta_k(n)`;
- bounded `+2` boundary repair;
- lens-containment threshold `n >= 20`;
- off-lens witnesses for `2 <= n <= 19`.

The software supports exploration, figure generation, finite inverse-word
export, and independent inspection. The theorem-level proofs remain in the
papers and thesis, using explicit inequalities and finite certificates.

## Verdicts: Interior, Interior-offLens, Exterior, Undetermined

The repository deliberately keeps these labels separate:

- `Interior`: trap hit inside the parameter lens \(X_n\setminus\mathbb R\),
  matching the canonical trap framework.
- `Interior-offLens`: off-lens trap hit using the enabled off-lens rule. This
  is intentionally not merged with the in-lens label.
- `Exterior`: enclosure escape or complete enclosure-admissible tree
  exhaustion.
- `Undetermined`: selected depth or node cap reached.

The default search depth is:

```text
k_max = 37
```

That default is shared by the web explorer and the companion packages.

## Examples and gallery

The `examples/` directory contains curated starting points for reproducible
exploration:

| Example | Purpose | Status |
|---|---|---|
| `e_c4_overlap` | Thesis Figure 3.1 example \(c=(3+i\sqrt{11})/2\). | Illustrative thesis example |
| `e_c5_plane_filling` | Thesis Figure 3.2 example \(c=1+2i\). | Illustrative thesis example |
| `theta0_base_capture` | Base-capture geometry for `Theta_0(n)`. | Illustrative |
| `trap_enclosure_n3` | Interior and Exterior trap/enclosure certificates. | Finite-search certified |
| `threshold_n20` | Threshold/lens example linked to the finite-capture theorem. | Exploratory |
| `hole_zoom_n13` | Finite-capture zoom near an \(n=13\) hole. | Exploratory |
| `off_lens_witnesses_n2_to_n19` | Off-lens witness scaffold preserving `Interior-offLens`. | Exploratory |
| `finite_capture_layers_n3` | Early finite-capture layer visualization for \(n=3\). | Illustrative |
| `level2_boundary_atlas` | Level-2 boundary-atlas metadata and share-state scaffold. | Exploratory |

Each example records parameters, expected status, reproducibility notes,
metadata, and whether the case is illustrative, finite-search certified,
theorem-certified, or exploratory. Certificate JSON is included only for
curated cases where a compact finite-search export is already known.

## Share URLs and reproducible states

The browser explorer can create share URLs and iframe embed code from the
current state. The hash records the selected parameter, search limits,
viewports, palette, comparison mode, visible layers, original-attractor renderer
mode, prefix depth, histogram seed, histogram sample count, first-level piece
coloring, and layer opacity.

Curated presets are loaded from `examples/examples.json` when the explorer is
served over HTTP. If metadata loading is blocked, the explorer falls back to a
built-in copy of the same public preset list.

## Package tests

Run these from the repository root after cloning or downloading the bundle.

Browser engine smoke test:

```bash
node qa/explorer-prefix-smoke-test.js
node qa/render_smoke_tests.js
node qa/kernel_equivalence_tests.js
```

JavaScript:

```bash
cd javascript
npm test
```

Python:

```bash
cd python
python3 -m unittest -v test_collinear.py
```

Swift:

```bash
cd swift
swift test
```

Static bundle validation:

```bash
python3 tools/validate_bundle.py
```

The Wolfram Language, MATLAB, and Maple packages are included as reference
implementations with matching formulas and defaults. See `docs/QA_REPORT.md`
for the exact validation scope and runtime limitations.

## QA status and limitations

The release tree includes `docs/QA_REPORT.md`, `docs/VALIDATION.md`, and
`RELEASE_CHECKLIST.md`. The automated checks cover JavaScript, Python, Swift,
browser-engine smoke tests, renderer smoke tests, kernel equivalence tests,
formatting hygiene, staged Pages deployment, and static bundle validation.

The Wolfram Language, MATLAB, and Maple ports are reference implementations
that should be checked in their native runtimes before stronger release claims
are made.

The browser renderer is a research explorer. Original-attractor visual metadata
is recorded separately from finite-search certificate fields. Certificate JSON
exports are reproducibility artifacts; theorem-level proof relies on the
mathematical text, finite certificates, and explicit inequalities rather than
visual inspection.

See `docs/RESPONSIBLE_USE.md` for certification boundaries and responsible-use
guidance.

## Related mathematical work

This software accompanies and supports the following mathematical work.

1. Bernat Espigule, David Juher, and Joan Saldaña,
   "Collinear Fractals and Bandt's Conjecture",
   *Fractal and Fractional* 8(12), 725, 2024.
   DOI: `10.3390/fractalfract8120725`.

2. Bernat Espigule and David Juher,
   "Finite Capture and the Closure of Roots of Restricted Polynomials",
   arXiv:2603.07397, 2026.
   DOI: `10.48550/arXiv.2603.07397`.

3. Bernat Espigule,
   "Finite capture and the closure of roots of restricted polynomials",
   IHP audiovisual resource, 2026.
   DOI: `10.57987/IHP.2026.T1.WS3.016`.

The 2024 paper gives the rectangle-covering/lens-local route and a global
large-\(n\) result. The 2026 finite-capture work uses canonical traps,
canonical enclosures, finite inverse search, and bounded-lag repair to obtain
the sharp `n >= 20` lens-containment threshold.

## Citing

Use the metadata in `CITATION.cff`. A compact text citation is:

> Bernat Espigule, *Collinear Fractals GPU: companion software for
> collinear fractals, finite capture, and restricted polynomial roots*,
> version 0.2.0-alpha, 2026.

No Zenodo DOI has been assigned yet. Add an archival DOI only after a future
release is archived through Zenodo or an equivalent service.

## Funding and acknowledgements

Parts of the mathematical framework, validation materials, examples, and
companion software in this repository were developed during Bernat
Espigule's doctoral research at the Universitat de Girona, supervised by
Dr. Joan Saldaña Meca and Dr. David Juher Barrot.

This work was supported by the Spanish Ministerio de Ciencia, Innovación y
Universidades through project PID2023-146424NB-I00, by the Generalitat de
Catalunya through grant 2021 SGR 00113, and by the Universitat de Girona and
Banco Santander Grant Programme for Researchers in Training, IFUdG 2022-2024.

The repository is maintained by Bernat Espigule. The funders,
supervisors, and affiliated institutions do not necessarily endorse the
software, the public explorer, or any results obtained with it.

## Support

This repository is open-access research software accompanying my work on
collinear fractals, finite capture, and restricted polynomial roots.

I am maintaining it while preparing my PhD defence and developing the next
generation of reproducible figures, examples, and validation tools. Small
sponsorships help support continued maintenance, documentation, public
visualization, and research-software development.

Support is optional and does not affect access to the code, examples,
documentation, issues, or citation materials.

## License

Source code is distributed under the **Apache License 2.0**; see `LICENSE`.

Documentation, README files, examples, non-code figures generated by this
repository, and non-code repository materials are distributed under **Creative
Commons Attribution 4.0 International** unless otherwise stated; see
`LICENSE-docs.md` and `LICENSES/CC-BY-4.0.txt`.
