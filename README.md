# Collinear Fractals Explorer

**Explore collinear self-similar sets, connectedness loci, and finite capture.**

[Open the explorer](https://complextrees.com/collinear-fractals-gpu/) ·
[Examples](examples/README.md) · [Mathematical conventions](docs/IMPLEMENTATION_NOTES.md) ·
[Validation](docs/VALIDATION.md) · [Citation metadata](CITATION.cff)

Author: **Bernat Espigule**. Release line: **0.2.0-alpha**.
Changes after that release are listed under [Unreleased](CHANGELOG.md).

This repository contains a build-free browser explorer and reference packages
for inverse search in the collinear connectedness loci $\mathcal M_n$.
The browser uses **Canvas and CPU computation**. The historical GPU name does
not imply that WebGL or WebGPU acceleration is implemented.

Search results use floating-point arithmetic. They are reproducible numerical
evidence, with finite inverse words when capture succeeds. Turning such a
result into a mathematical certificate requires justified error bounds and the
hypotheses of the corresponding theorem.

## Quick visual summary

The workspace opens in **Split** view at $n=4$,
$c=(3+i\sqrt{11})/2$: the parameter plane is linked to the original
attractor $E(c,4)$, colored by its first-level pieces. Focus either plane or
use fullscreen; quick arity, zoom, fit, and scene controls stay beside the plots.
The **Controls** drawer contains examples, Cartesian and polar parameter
entry, search limits, renderers, layers, palettes, and exports.

Switch the dynamical scene between $E(c,n)$, the half-scale difference
$\tfrac12E(c,2n-1)$, and their overlay. The parameter plane offers
$\mathcal M_n$, the marked-point set $R_n=\{c:c\in E(c,n)\}$, and a comparison.
The $R_n$ preview distinguishes finite survival from unfinished searches;
neither asserts membership. Search details identify which set each result concerns.

The default prefix renderer draws finite approximations of the original
attractor. A seeded histogram offers a second visual preview; the survival
renderer shows points still admissible after a finite inverse search. The
selected-parameter search uses its own depth and frontier-width limits,
independently of visual rendering depth.

Share links, captioned image export, search JSON, and undo/redo retain the
reproducible research workflow. The drawer becomes a modal on narrow screens;
canvas navigation, dialogs, and controls support keyboard operation.

## Browser quick start

Clone the repository and serve its root:

```bash
git clone https://github.com/espigule/collinear-fractals-gpu.git
cd collinear-fractals-gpu
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/) in a modern browser. An HTTP server
is required for reliable ES-module and preset loading; opening `index.html`
as a local file is not the supported workflow.

A useful first example is `n = 3`, `c = 0.5 + 1.1i`. Its marked point is already
inside the trap and the search returns `Interior` at depth zero. Compare with
`c = 3 + 3i`, which returns `Exterior` from the initial enclosure test.
For a one-step capture word, use `n = 3`, `c = 0.7 + 1.4i` and inspect `[2]`.

**Parameter convention:** the browser interprets a nonzero input $p$ inside
the unit disk as the reciprocal coordinate, using $c=1/p$. Outside the unit
disk it uses $c=p$. The language packages take the expanding parameter $c$
directly. Non-real $c$ with $|c|>1$ is the domain of this canonical search;
real-axis and unit-circle inputs are not classified by it. See
[the input and output contract](docs/IMPLEMENTATION_NOTES.md#input-domain-and-coordinates).

## What is included

| Path | Contents and current status |
|---|---|
| `index.html`, `index.css`, `explorer.js` | Canvas/CPU browser explorer. |
| `src/` | Browser ES modules, finite-search reference kernel, and visual renderers. |
| `workers/` | Standalone worker entry points; the explorer does not schedule its rendering through them. |
| `javascript/`, `python/` | Executable reference packages and regression tests. |
| `swift/` | Swift Package Manager reference implementation and tests. |
| `mathematica/`, `matlab/`, `maple/` | Reference ports requiring validation in their native runtimes. |
| `examples/` | Presets, parameters, search records, and reproduction notes. |
| `gallery/` | Metadata for planned curated assets; no rendered gallery yet. |
| `paper_figures/` | Figure-job manifest and listing script; no batch figure renderer yet. |
| `schemas/` | JSON Schemas for search exports, examples, and figure metadata. |
| `qa/`, `tools/`, `docs/` | Regression checks, validation tools, and maintenance documentation. |

Pixel rendering uses a scalar kernel with reusable typed-array frontiers. The
selected-parameter search retains the detailed reference tree and inverse
word. A GPU backend, per-pixel certificate inspector, and completed boundary
atlas remain future work.

## Mathematical scope

The conventions are

$$
A_m=\{-m+1,-m+3,\ldots,m-1\},\qquad
f_t(z)=t+\frac{z}{c},\quad |c|>1.
$$

Thus $E(c,m)$ consists of sums $\sum_{j=0}^{\infty}t_j c^{-j}$ with
$t_j\in A_m$. In particular, the first digit is **unscaled**. For
$N=2n-1$, the difference set is $E(c,n)-E(c,n)=E(c,N)$ and

$$
c\in\mathcal M_n\quad\Longleftrightarrow\quad 2c\in E(c,N).
$$

The search follows the marked point $2c$ under inverse branches
$g_t(z)=c(z-t)$, prunes against an enclosure, and tests for entry into a trap.
The non-real parameter lens is characterized by
$|c|>1$ and $|c|^2+2|\operatorname{Re}c|<2n-1$.
These conventions and the finite-capture filtration are developed in the
[finite-capture paper](https://arxiv.org/abs/2603.07397).

That paper establishes the two-step closure inclusion for the finite-capture
layers and the sharp $n\geq20$ lens-containment threshold. The explorer
implements numerical searches associated with this framework; running it
does not independently verify those theorems or their full certificate corpus.

## Verdicts: Interior, Interior-offLens, Exterior, Undetermined

These are the selected $\mathcal M_n$ search labels. The optional $R_n$
marked-point search uses enclosure pruning without a trap; surviving its full
depth budget remains `Undetermined`. Its label is distinct from the countable
restricted-polynomial root set denoted $\mathcal R_n$ in the finite-capture paper.

| Verdict | Meaning of the numerical search result |
|---|---|
| `Interior` | Strict trap entry for an in-lens parameter. |
| `Interior-offLens` | Strict trap entry using the separate off-lens rule. |
| `Exterior` | Initial enclosure escape or exhaustion of the enclosure-admissible inverse tree. |
| `Undetermined` | A depth/width limit, unsupported input domain, or numerical-range limit prevented a conclusion. |

`Undetermined` does not assert boundary membership, connectedness, or
disconnectedness. `Interior-offLens` records a different trap rule and must
retain that provenance. All four labels describe the computation performed in
floating point, including the enclosure comparisons.

The defaults are `k_max = 37`, `L_max = 1000`, and `tol = 1e-8`.
`L_max` caps the retained nodes **at one depth**, not the total nodes explored.
The search stops conservatively when that cap is reached; `k_max = 0` performs
only the initial trap/enclosure test. The tolerance controls the truncated
geometric tail, not a bound on all floating-point rounding errors.

## Examples and gallery

| Example | Reproducible role |
|---|---|
| `theta0_base_capture`, `trap_enclosure_n3` | Initial trap/enclosure cases plus a one-step inverse word, with compact search JSON. |
| `e_c4_overlap` | Original attractor at $c=(3+i\sqrt{11})/2$, $n=4$; the default search is `Undetermined`. |
| `e_c5_plane_filling` | Original attractor at $c=1+2i$, $n=5$; the default search is `Undetermined`. |
| `off_lens_witnesses_n2_to_n19` | One numerical off-lens example for $n=3$; the directory name is retained for existing links. |
| `hole_zoom_n13` | An `Exterior` sample near an $n=13$ hole; one sample does not establish the topology of a hole. |
| `finite_capture_layers_n3` | View for comparing finite-search depth layers. |
| `threshold_n20` | Exploratory starting point at $n=20$. |
| `level2_boundary_atlas` | A preset for future atlas work; no completed atlas is supplied. |

See [the example guide](examples/README.md) for exact parameters, limits, and
status. Gallery and figure metadata are manifests for future assets. Save
Image exports the completed browser view with parameter and search captions; `paper_figures/make_all_figures.py`
only lists planned jobs.

## Share URLs and reproducible states

Share records the selected parameter, viewports, search limits, palette,
parameter-set and scene modes, layers, renderer, visual depth, histogram seed/sample count,
piece coloring, and opacity in the URL fragment. A share link restores the
view; a search JSON export records the numerical result.

For a reproducible issue or figure, retain both, together with the git commit
or release used. Floating-point behavior near decision boundaries can depend
on the runtime. A fixed histogram seed reproduces a sample sequence within the
same implementation; it does not make the sampled picture exact.

Presets load from `examples/examples.json`, with a built-in fallback for the
same public list.

Legacy links can import the original parameter, selected sets, center, and
vertical view span. An explicit `legacy=1` query flag distinguishes abbreviated
old links from current links; a recognized hash takes precedence over query
state. Old shader, thickness, and queue settings retain their meaning only in
the archived explorer and are not silently applied to the current search.

The maintained deployment belongs to this project's Pages build at
`/collinear-fractals-gpu/`. The public routing plan keeps `/collinear/` as a
compatibility redirect that preserves query and hash while identifying legacy
state, and preserves the original HTML at `/collinear/legacy-2026-09/`.
See [the comparison and public-explorer decision](docs/EXPLORER_COMPARISON_2026-09.md)
for the implementation and archive boundaries.

## Package tests

From the repository root, install the development dependencies and run:

```bash
npm ci
python3 -m pip install -r requirements-qa.txt
npx playwright install chromium
npm run test:all
```

Use Node.js 22 or later and Python 3.11 or later. `npm test` runs the
non-browser suite, while `npm run test:browser` runs real Chromium checks.
If needed, use `PYTHON=python3 npm test` to select the Python executable.

With Swift installed:

```bash
swift test --package-path swift --jobs 2
```

[Validation notes](docs/VALIDATION.md) describe the complete browser and CI
workflow, dependencies, and manual checks. Package READMEs contain language
API examples.

## QA status and limitations

Numerical regression tests compare known search cases, input validation,
enclosure calculations, digit parity, renderer coordinates, and deterministic
sampling. Agreement between ports checks consistency, not mathematical rigor.
The browser and schema checks exercise separate concerns: user interactions
and reproducibility data.

[The original release report](docs/QA_REPORT.md) is a historical record for
`0.2.0-alpha`; it is not a test result for a newer checkout. Run the validation
suite and consult the CI result for the commit you use. Native Wolfram
Language, MATLAB, Maple, and Swift checks require their respective runtimes;
absence of a runtime is not a passing test.

Rendering and search costs rise with arity, depth, and viewport resolution.
Prefix drawings use bounded point counts; histogram drawings are sampled.
Neither a rendered pixel nor an exported floating-point search record is an
interval-arithmetic proof. See [numerical interpretation](docs/RESPONSIBLE_USE.md).

## Related mathematical work

1. Bernat Espigule, David Juher, and Joan Saldaña,
   [“Collinear Fractals and Bandt's Conjecture”](https://doi.org/10.3390/fractalfract8120725),
   *Fractal and Fractional* 8(12), article 725, 2024.
   The original covering framework gives the global non-real result for
   $n\geq21$; an [author version is on arXiv](https://arxiv.org/abs/2411.00160).
2. Bernat Espigule and David Juher,
   [“Finite capture and the closure of roots of restricted polynomials”](https://arxiv.org/abs/2603.07397),
   arXiv:2603.07397, 2026. The canonical trap/enclosure framework, finite-capture
   layers, two-step closure theorem, and sharp $n\geq20$ threshold.
3. Bernat Espigule,
   [“Finite capture and the closure of roots of restricted polynomials”](https://www.carmin.tv/en/video/finite-capture-and-the-closure-of-roots-of-restricted-polynomials),
   IHP audiovisual resource, recorded 27 March 2026.
   DOI: [10.57987/IHP.2026.T1.WS3.016](https://doi.org/10.57987/IHP.2026.T1.WS3.016).

## Citing

Use [CITATION.cff](CITATION.cff) for software metadata and cite the relevant
mathematical paper separately. Include the exact version or commit used.

**About & cite → References** copies a software citation or BibTeX entry,
including the full source commit when the deployed build manifest is available.
The original release citation is:

> Bernat Espigule, *Collinear Fractals GPU: companion software for collinear
> fractals, finite capture, and restricted polynomial roots*, version
> 0.2.0-alpha, 2026.

The release metadata currently records no archival software DOI. Do not use a
paper DOI as though it identified a software release.

## Funding and acknowledgements

Parts of the mathematical framework, validation materials, examples, and
companion software were developed during Bernat Espigule's doctoral research
at the Universitat de Girona, supervised by Dr. Joan Saldaña Meca and
Dr. David Juher Barrot.

This work was supported by the Spanish Ministerio de Ciencia, Innovación y
Universidades through project PID2023-146424NB-I00, by the Generalitat de
Catalunya through grant 2021 SGR 00113, and by the Universitat de Girona and
Banco Santander Grant Programme for Researchers in Training, IFUdG 2022-2024.

The repository is maintained by Bernat Espigule. The funders, supervisors, and
affiliated institutions do not necessarily endorse the software or results
obtained with it.

## Support

Optional sponsorship supports maintenance, documentation, public
visualization, and research-software development. The code, examples,
documentation, issues, and citation materials remain openly accessible.

## License

Source code is distributed under the **Apache License 2.0**; see [LICENSE](LICENSE).
Documentation and non-code repository materials use **Creative Commons
Attribution 4.0 International** unless otherwise stated; see
[LICENSE-docs.md](LICENSE-docs.md) and [the full license](LICENSES/CC-BY-4.0.txt).
