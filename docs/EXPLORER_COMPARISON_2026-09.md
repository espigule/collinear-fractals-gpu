# Collinear explorer comparison and combined public experience

**Review date:** 17 September 2026. **Decision scope:** the maintained community
explorer, its scientific presentation, and compatibility with `/collinear/`.

The community recommendation is the combined implementation: the corrected
numerical foundation of PR #8, with spacious plots, immediate controls, and
well-defined comparisons recovered from the legacy explorer. The project
Pages build at `/collinear-fractals-gpu/` owns deployment. The short
`/collinear/` address is retained as a compatibility redirect, and the original
HTML is preserved at `/collinear/legacy-2026-09/`.

The legacy's strengths are visual exploration and comparative breadth; the
upgraded foundation's strengths are its numerical contract, provenance, and
maintainability. Combining these strengths is preferable to maintaining two
divergent scientific engines. The maintained implementation now combines
bounded WebGL 2 previews with binary64 CPU-worker refinement. Neither version
is an interval-verified proof system. The dated update below supersedes the
earlier implementation's CPU-only rendering description; the historical
baseline comparison remains intact.

## Review basis and publication state

| Item | Version inspected | What this review establishes |
|---|---|---|
| [Legacy public explorer](https://complextrees.com/collinear/) | Retrieved HTML snapshot; SHA-256 `78baa7a8ec42196df9c915354f6ff78b80c97b81ca4f84f477b06fe97a96b15d` | Source-level controls, defaults, algorithms, documentation, and a replay of its embedded status worker. |
| [PR #8 comparison baseline](https://github.com/espigule/collinear-fractals-gpu/pull/8) | Commit `630c3f236424febd4387d73814d40a224496a658` | The candidate column in the historical comparison table below. PR #8 subsequently merged into `main` as `54f38b8`. |
| Combined implementation | Work prepared after merge `54f38b8` | The implemented-combination section below, including the new interface, marked-point comparison, link importer, and geometry validation. This review does not assert that the combined changes are already publicly deployed. |

When the baseline comparison began, PR #8 was unmerged and the existing GPU
repository deployment still lacked its coordinate correction. Those older
deployed assets are not evidence of the candidate's behavior. The new staged
`deployment.json` identifies the source commit, tracked-change status, and
SHA-256 fingerprints of public assets so future comparisons can identify the
actual build.

The [Pages run for merged PR #8](https://github.com/espigule/collinear-fractals-gpu/actions/runs/35220265848)
completed successfully. That deployment contains the corrected baseline;
publication of the combined interface is a separate subsequent step.

The legacy page could not render in the available cloud browser because
WebGL was unsupported there. This review therefore makes no live legacy-pixel
or relative-performance claim. Its legacy numerical findings come from
source inspection and replay of the exact embedded status worker. Local
Chromium exercised the combined application on desktop and mobile viewports;
that does not establish behavior on every browser or physical device.
The earlier candidate validation remains recorded in
[the upgrade review](UPGRADE_REVIEW_2026-09.md).

The mathematical convention throughout is

$$
A_n=\{-n+1,-n+3,\ldots,n-1\},\qquad f_t(z)=t+z/c,
$$

with $|c|>1$. For $N=2n-1$,

$$
E(c,n)-E(c,n)=E(c,N),\qquad
c\in\mathcal M_n\Longleftrightarrow 2c\in E(c,N).
$$

The conventions follow the [finite-capture paper](https://arxiv.org/abs/2603.07397).
These identities explain the half-scale difference display: the corresponding
visible membership question is $c\in\tfrac12E(c,N)$. The visual scale must
remain explicit when comparing the applications.

## Hybrid rendering update — 17 September 2026

The rendering extension adds an actual WebGL 2 fragment-shader preview and a
bounded CPU-worker raster pool to the combined interface. It retains the
corrected full coordinates of $E(c,n)$ and the distinct half-scale difference
display. Forward prefix and histogram drawings remain CPU Canvas overlays;
the selected binary64 search record remains independent of preview pixels.

| Requested mode | Rendering behavior | Interpretation |
|---|---|---|
| `auto` — default | Bounded float32 GPU preview, followed by full-raster binary64 worker refinement at the requested search settings. | The first picture is provisional; the CPU pass supplies the completed numerical raster. |
| `gpu` — explicit preview mode | Finish with the supported bounded GPU preview, or fall back to CPU if the view/device is unsupported. | Completion here does not mean binary64 refinement or use of every requested search resource. |
| `cpu` | Binary64 worker rendering; progressive main-thread fallback if workers cannot run. | Retain the numerical search contract while broadening execution support. |

The GPU preview currently limits arity to 2–32, depth to 64, retained frontier
to 32, and per-search candidate work to 2,048; requested lower limits remain
effective. Its raster is capped at 120,000 pixels and 768 pixels on either
side. Coordinate precision and numerical-domain guards can request CPU
fallback or leave individual pixels unresolved. A cap or uncertainty does
not become an escape verdict by discarding branches. These engineering
guards do not establish interval certification.

Backend preference is stored in share links, while active-backend and fallback
status describe the actual execution. No physical-device GPU speedup or
matched-budget performance comparison with the archive has been established.
Earlier local browser counts below describe the pre-hybrid checkpoint; the
new rendering paths require their own final-commit validation.

WebGPU remains deferred. WGSL currently supplies concrete `f32` and optional
`f16`, without runtime `f64`; switching APIs alone would not replace the
binary64 numerical path. WebGPU also has browser/OS/device conditions despite
availability in all major browser families. The present WebGL 2 choice keeps
one GPU preview implementation alongside the existing CPU fallback.
See the [W3C floating-point type specification](https://www.w3.org/TR/2026/CRD-WGSL-20260915/#floating-point-types),
[browser-platform availability](https://web.dev/blog/webgpu-supported-major-browsers#browser_and_os_availability),
and the source-level [rendering architecture](RENDERING_ARCHITECTURE.md).

## Implemented combination after PR #8

These changes describe the combined working implementation following
`54f38b8`, rather than the earlier `630c3f2` baseline. Source and local browser
checks support the interface claims; publication status is separate.

| Area | Implemented behavior | Scientific or practical consequence |
|---|---|---|
| First visit | A window-filling plot workspace opens in **Split** view at $n=4$, $c=(3+i\sqrt{11})/2$. The original $E(c,4)$ is visible with first-level piece colors; difference, trap, enclosure, tree, and path overlays start off. | Visitors first see the fractal and its parameter. An `Undetermined` selected search remains a legitimate outcome for this example. |
| Immediate navigation | Compact toolbar, quick arity controls, single-plane focus, fullscreen, per-plane zoom/fit, and $E$/half-difference/overlay scene controls. Detailed settings move into a drawer. | More room for geometry, with parameter and dynamical coordinates still distinguished. |
| Automatic fit | The dynamical Fit action uses Cartesian bounds for the full original attractor, with an explicit geometric tail and extra numerical padding. Unsupported or excessive ranges produce a visible fallback notice. | The camera fits the stated $E(c,n)$ coordinates and avoids presenting an unavailable automatic fit as successful. |
| Parameter comparisons | $\mathcal M_n$, the legacy-style marked-point set $R_n=\{c:|c|>1,\ c\in E(c,n)\}$, and a comparison view are available. | The original comparison vocabulary returns with explicit definitions, rather than treating every colored pixel as a membership result. |
| $R_n$ result semantics | Its inverse search starts at $c$ in alphabet $A_n$, uses enclosure pruning, and has no trap. Teal means survival through the chosen finite depth; amber covers unfinished searches. The actual stop reason is retained. | Neither survival nor a node cap proves membership. The display does not claim to enumerate the restricted-polynomial roots denoted $\mathcal R_n$ in the current paper. |
| Parameter entry | Synchronized Cartesian and polar numeric fields; the existing reciprocal-input convention and effective-parameter disclosure remain. | Polar exploration returns without the legacy setter's silent minimum-modulus adjustment. |
| Search provenance | The detailed selected record remains the $\mathcal M_n$ computation. When relevant, exported `parameter_view` metadata includes a separately labeled $R_n$ result. Scene, viewports, renderer metadata, and deployment identity accompany the export. | A comparison preview cannot silently replace the meaning of the main search record. |
| About and citation | References include copyable software citation and software BibTeX, incorporating the full source commit when a deployment manifest is available. About links the archive, shows legacy-import warnings, and exposes build provenance. Tour and copy feedback use finite-search terminology. | Convenient citation returns without confusing a software version with a mathematical paper or a numerical record with a proof. |
| Mobile and keyboard use | The drawer becomes modal on narrow screens, with background interaction disabled and focus contained/restored. Toolbar, scene controls, dialogs, and canvases remain keyboard operable. A rejected fullscreen request leaves the interface usable. | The plot-first layout retains accessible ways to reach detailed settings and recover from unavailable browser features. |
| Legacy links | The importer recognizes old parameter/panel/view keys and explicit `legacy=1` provenance, translates the old vertical view span to the new canvas aspect ratios, and reports unsupported settings. | Old scientific views can be resumed while obsolete shader, thickness, and beam-search settings remain associated with the archive. |
| Rendering and packaging | The hybrid update adds bounded WebGL 2 pixel previews and binary64 worker raster refinement. Prefix and histogram overlays remain CPU Canvas drawings. Staging uses an allowlisted asset inventory and deployment manifest. | Requested and actual rendering backends have distinct provenance. Source capability does not imply a measured hardware speedup. |

Fresh first-visit presentation and URL defaults are deliberately separate.
Unparameterized startup selects the $E(c,4)$ example, while existing partial
modern links retain the earlier state codec's defaults. A complete new share
link records the selected state explicitly.

The marked-point comparison has an exact set-theoretic basis:
$2A_n\subset A_{2n-1}$ implies $2E(c,n)\subset E(c,2n-1)$ and therefore
$R_n\subset\mathcal M_n$. That inclusion does not turn finite surviving
branches into confirmed members of either set.

Before the hybrid extension, the local validation gate for the combined interface passed **44 Chromium
browser checks** across desktop and mobile projects in 2.2 minutes, with no
retries or script, console, or local-asset errors, and **10 geometry test
groups**. The browser checks exercise rendered support, navigation, drawer
modality, state sharing/import, and recovery from a rejected fullscreen
request. The geometry fixture $n=4$, $c=2i$ has the independently derived
original-attractor support $[-4,4]\times[-2,2]$. Mutation checks deliberately
reintroduced the old $E(c,n)/c$ error in each of the three rendering paths;
all three mutations were detected. These checks establish regression
sensitivity to the coordinate error, rather than merely agreement between
two implementations of the same formula. The same gate passed 16 core groups,
10 parameter-view groups, 10 state-codec groups, 11 legacy-import groups,
7 redirect groups, 17 Python tests, 5 deployment-integrity tests, and the
curated record and schema checks. The staged manifest fingerprints 68 public
assets. Hosted quality results and the public manifest identify the final
published commit separately from this local validation checkpoint.

## Grounded baseline feature comparison

This table preserves the original comparison between the legacy source and
candidate `630c3f2`, including limitations. Its final column records the design
implications that informed the combined implementation. Features added after
that baseline are described above, rather than retroactively attributed to it.

| Area | Legacy `/collinear/` | Candidate `630c3f2` | Implication for the public explorer |
|---|---|---|---|
| Overall layout | A single WebGL canvas fills the main area. Floating controls and a settings overlay surround it. Up to four mathematical views are separated within a shared coordinate view. | Two independently navigable Canvas panels, a sidebar, panel captions, legends, and a persistent selected-search footer. Either panel can be focused. | Preserve the legacy sense of space, but keep the candidate's explicit distinction between parameter and dynamical planes. |
| Initial state | $n=4$, $c=(3+i\sqrt{11})/2$, only the $\mathcal M_n$ view active, centered on the selected parameter. | $n=3$, $c=0.5+1.1i$, both panels visible; difference, trap, enclosure, tree, and path layers on. The original attractor is initially off. | Neither default immediately shows a newcomer the original fractal and its relation to the locus. The public entry should expose that relationship first. |
| Mathematical views | Toggles for $\mathcal R_n$, $E(c,n)$, $\mathcal M_n$, and $\tfrac12E(c,2n-1)$; paired comparison and difference modes. | Locus plus original-attractor/difference overlays, an escape-strata view, trap/enclosure geometry, and inverse-search tree/path. No $\mathcal R_n$ view. | The legacy has broader comparative scope. Recover well-defined comparisons selectively after clarifying the meaning of its $\mathcal R_n$. |
| Attractor construction | Pixelwise inverse-search/trap rendering through $g_t(z)=c(z-t)$; appearance depends on search depth and target thickness. | Corrected forward prefix sums and seeded histogram use $t+z/c$. An explicit survival diagnostic uses inverse search with trap entry disabled. | Keep the candidate's separation of the fractal picture from a particular successful-trap search. |
| GPU status | Actual Three.js/WebGL fragment shader; the shader declares `mediump` arithmetic. | Canvas/CPU, with reusable typed-array frontiers for pixel verdicts and binary64 JavaScript arithmetic. The UI still carries the historical “GPU Explorer” name. | Public naming should describe the object: “Collinear Fractals Explorer.” Keep the repository name and backend details in source/technical information. |
| Work budget | Despite adaptive-capability code, initialization fixes the primary queue at 8. Initial render scale is capped at 0.5× per canvas dimension; the user can adjust it. | Default `k_max=37`, frontier cap `L_max=1000`, explicit browser limits, progressive pixel refinement, and bounded visual point/sample budgets. | A speed comparison needs matched resolution, arity, search domain, and stopping criteria. GPU use alone does not establish a better scientific result. |
| Queue exhaustion | Shader and status worker retain better-scored nodes by replacing/discarding other branches. They can later report escape after that pruning. | Reaching the retained-frontier cap returns `Undetermined`; it is not treated as exhaustive branch elimination. | Use the candidate for numerical status. Legacy rendering can inspire a fast preview, with approximation semantics made explicit. |
| Enclosure bounds | Finite Cartesian sums, a hard near-unit fallback, and a large-modulus shortcut; the truncated series has no computed tail bound. The worker adds heuristic padding. | Oblique and Cartesian bounds include an analytic remainder estimate; all arithmetic remains binary64. Unrepresentable ranges return `Undetermined`. | Base exclusion on an enclosure with a justified remainder and retain the arithmetic limitation in the record. |
| Selected-point evidence | A separate worker displays membership/escape text and an inverse or closest-point sequence. No search-JSON export was found in the snapshot. | A shared detailed search supplies verdict, stop reason, word, depth, node count, trap/enclosure information, and replayable JSON. | Keep one selected result and its provenance synchronized with the parameter and view. |
| Exact parameter entry | Cartesian and polar fields/sliders. Displayed editable Cartesian values are rounded to four decimals by UI refresh. Changes below the permitted modulus are radially moved to about 1.001. | Cartesian fields retain numeric precision. Nonzero inputs inside the unit disk use the reciprocal coordinate, and the effective expanding parameter is shown and exported. | Restore useful polar controls, but make direct $c$ versus reciprocal $\lambda=1/c$ an explicit choice. Avoid silently changing an entered parameter. |
| Fitting the picture | Separate “Fit E” computes Cartesian bounds for the original attractor; “Center c” repositions the shared view. | “Reset dynamical” fits the half-scale difference enclosure, which can leave extra space around the original attractor. Both canvases have independent reset/navigation. | Add a fit action appropriate to the visible layer, keeping the scale evident. This is a refinement of existing candidate fitting. |
| Depth exploration | Separate minimum/maximum depth ranges for the original/marked-point views; thickness sliders alter trap acceptance. | Maximum search depth and frontier cap; visual prefix depth, histogram sampling, and depth-color cycle are separate. No general minimum-capture-depth filter. | Recover depth-range filtering as a display filter on recorded depth results. Do not make an appearance slider change the meaning of membership. |
| Color | Eight customizable inside colors, palette/grayscale cycles, black-and-white/inverted modes, optional orbit-hash mixing, and boundary-hit darkening. Some appearance modes also change the computation. | Research/print/high-contrast/custom palettes, distinct outcome categories, capture-depth cycles, and first-level piece colors. | Retain visual expressiveness with a documented legend. Orbit hashes and near-trap-edge shading must not be labeled as proved topological invariants. |
| Tours | A seven-step Shepherd interface tour, auto-start on an unvisited browser, plus a sampled analytic-envelope path advertised as an $\Omega_1$ boundary tour. | A short four-step modal tour explaining controls; it does not animate a mathematical example. | The legacy offers richer guided exploration. Rebuild a short opt-in mathematical sequence on the tested core; audit the envelope before restoring its boundary claim. |
| Presets | Eleven entries mixing layout configurations, named attractors, a default, and a boundary view. Some parameters are rounded, such as the “H-Tree” entry. | Nine externally documented presets with configurations, expected numerical status, references/notes, and replay checks. Several remain atlas/figure scaffolds. | Present a small curated gallery of purposeful examples, with exact expressions and complete views. Keep scaffolds out of the main public menu. |
| Sharing | URL/embed controls allow omission of view, limits, thickness, and appearance; these checkboxes start unchecked. Noninteger values in generated hashes are rounded to six decimals. | The validated codec records complete supported state with roundtrip numeric precision, viewports, limits, layers, palette, and renderer settings. | Default to a reproducible view. A shorter “share just this parameter” option can be additional and explicitly named. |
| Export and citation | Canvas PNG, paper BibTeX copy, and web-citation copy. The web citation is dated 2025. | Completed-panel PNG with captions and search metadata; JSON export; linked references and repository CFF metadata. No in-app one-click BibTeX/software-citation copy is present. | Keep the candidate's provenance exports and recover the legacy's convenient citation buttons using current metadata. |
| Returning visits | Local storage persists settings and tour completion. | URLs/undo history preserve state; no local-storage session persistence is implemented. | An explicit “Resume last session” is useful. A published link must take precedence over remembered settings. |
| Accessibility and small screens | Pointer/touch pan/zoom and compact responsive controls; labels and dialog roles exist, but many controls are positioned over the plot. Source keyboard handling retains undo/redo and Escape rather than plot navigation. | Focusable keyboard-operated canvases, skip link, numeric alternatives, contained/restored modal focus, reduced-motion CSS, and stacked mobile panels with collapsible controls. | Keep candidate accessibility behavior while evaluating actual canvas area and control density on phones. |
| Dependencies and maintenance | One 4,056-line HTML snapshot includes shader, worker string, styles, and UI logic. Three.js, Shepherd, and MathJax load from CDNs; the MathJax URL pins only the major version. | Separate numerical/render/state modules, local browser assets, reference packages, schemas, regression tests, and a quality-gated Pages artifact. | Use the candidate repository as the source of truth. Keep legacy archival provenance rather than maintaining a second divergent numerical engine. |

## Scientific findings requiring care

### Legacy status is not an exhaustive-search certificate

`init()` sets `adaptiveMaxQueue`, `queueControlMax`, and `recommendedQueue` to
8. Both the fragment shader and worker `insertNode()` retain nodes according
to a score after the queue fills. The worker can subsequently return `iter=-1`
when the retained nodes escape, which the UI renders as `c ∉ Mn`.
The branches previously discarded for budget reasons have not all been
excluded. Consequently, that message lacks the justification supplied by
complete enclosure-admissible tree exhaustion.

The legacy UI contains a special `iter=-3` overflow message, but the inspected
worker does not emit that code. The shader also declares a `queueOverflow`
variable without using it to preserve uncertainty through these exits. This
establishes a source-level completeness defect; the replay below does not
isolate a false exclusion specifically caused by beam pruning.

The candidate instead makes a reached frontier cap explicit. It still uses
floating point, so this is an improvement in the algorithmic contract rather
than a claim of interval verification.

### A reproduced false exclusion near the unit circle

The exact embedded legacy status worker was replayed at
$n=2$, $c=1.00009+0.00002i$, minimum depth 0, maximum depth 30, and queue
caps of both 8 and 192. Both calls returned
`{iter:-1, exitD:0, sequence:[]}`, the result rendered by the UI as
`c ∉ Mn`.

Here $|c|\approx1.0000900002$. The worker's bounding-box function substitutes
$[-2,2]^2$ when $|c|\leq1.0001$, immediately discarding the marked point
$2c=2.00018+0.00004i$. This is an invalid exclusion: the entire annulus
$1<|c|<\sqrt2$ lies in $\mathcal M_2$, by
[Proposition 2.5(i) of the collinear-fractals paper](https://arxiv.org/html/2411.00160v2).
The candidate returns `Interior-offLens` at depth 2 with word `[2,2]`;
the cited annulus inclusion establishes membership independently of that
exploratory numerical result.

This reproduction establishes a defect in the shipped worker, not an observed
hardware-rendered pixel. The legacy's ordinary parameter setter clamps inputs
below modulus 1.001; reachability through particular public interactions or
URL loading needs separate browser verification. The fragment shader contains
the same near-unit bounding-box fallback, but its precision and other branch
conditions require their own rendering checks.

### The old mathematical labels cannot be copied verbatim

The legacy About panel defines its $\mathcal R_n$ by $c\in E(c,n)$. That is a
marked-point locus with the original alphabet. It is not the definition of the
countable set of roots of monic restricted polynomials used in the current
finite-capture paper. Its prose also identifies a connectedness locus with a
root set without making the closure distinction explicit.

Before recovering an algebraic panel, state the alphabet, polynomial class,
leading-coefficient convention, degree bound, and whether the display represents
finite roots, a closure, or a different marked-point locus. The paper's
$\mathcal R_n$ and the legacy panel's label must not silently become synonyms.

The legacy documentation states a closed lens, and its implementation also
adds epsilon extensions. The strict canonical trap used by the candidate
requires the open non-real lens; these conditions must be distinguished from
the earlier paper's closed covering region. The old About panel also contains
an unverified historical preprint title/date and a boundary-envelope claim.
Retain useful explanatory ideas, but rebuild the claims from the cited
mathematical sources and the chosen implementation.

### Limited worker replay

The embedded legacy worker was executed in an isolated Node VM at its source
default queue 8 and maximum depth 30. The candidate detailed search used depth
30 and frontier cap 1000. This is a behavior comparison, not a speed benchmark
or an equal-budget contest.

| Parameter | Legacy worker | Candidate detailed search |
|---|---|---|
| $n=3$, $c=0.5+1.1i$ | Hit at depth 0 | `Interior`, depth 0 |
| $n=3$, $c=0.7+1.4i$ | Hit at depth 1, word `[2]` | `Interior`, depth 1, word `[2]` |
| $n=4$, $c=(3+i\sqrt{11})/2$ | Unresolved at depth 30 | `Undetermined`, `depth-cap` |
| $n=5$, $c=1+2i$ | Unresolved at depth 30 | `Undetermined`, `node-cap` at depth 15 |
| $n=13$, $c=2.0719+3.0537i$ | Escape at depth 6 | `Exterior`, `tree-exhausted` at depth 5 |
| $n=3$, $c=1.419643377607+0.606290729207i$ | Unresolved at depth 30 | `Interior-offLens`, depth 2, word `[4,0]`; exploratory |
| $n=2$, $c=1.00009+0.00002i$ | Incorrect escape at depth 0, also with queue 192 | `Interior-offLens`, depth 2, word `[2,2]`; membership independently follows from the annulus inclusion above |

The different exterior depths are compatible with different pruning
constructions. The off-lens result uses an additional candidate trap rule and
must retain its exploratory status. A coarse grid at arities 2 through 5 did
not expose an additional legacy exterior/candidate in-lens capture
contradiction. The separate near-unit counterexample shows why passing such
a coarse comparison cannot validate all of the legacy's exclusion rules.

## Community scientific flow and remaining work

The combined interface is the recommended community application. The flow
below explains how its existing views should be presented and identifies
educational work still to complete; it is not a claim that every guided step
is already implemented.

### Default experience

Use the public **Collinear Fractals** identity, with **Explore** describing the
application. The historical repository name remains useful for source links
and software citation; it does not advertise the current rendering backend.
Project Pages owns the maintained build, while the short `/collinear/` route
keeps existing community links useful.

Retain the implemented Split startup at $n=4$,
$c=(3+i\sqrt{11})/2$, with the original attractor visible and diagnostic
overlays hidden. It provides a direct connection between a parameter and an
actual fractal. Keep the $n=5$, $c=1+2i$ example prominent as well. Their
`Undetermined` selected-search results should remain visible in context;
an informative attractor image does not depend on a successful finite trap hit.

For a guided mathematical explanation, use $n=3$, $c=0.7+1.4i$: the stored
one-step word `[2]` is easier to follow than a deep tree or an immediate
depth-zero capture. Introduce $R_n$ comparison only after the original
attractor, connectedness criterion, and limits of finite survival are clear.

### Scientific progression

| Visitor's action | What appears | Meaning to communicate |
|---|---|---|
| Explore a parameter | Locus and original $E(c,n)$; first-level pieces can be colored. | One parameter changes every contraction map together. |
| Choose “Why connected?” | The normalized difference $\tfrac12E(c,2n-1)$ and marked point $c$, with a concise identity. | Neighbor overlap is encoded by $c\in\tfrac12E(c,2n-1)$, equivalently $2c\in E(c,2n-1)$. |
| Choose “Show this search” | Trap, enclosure, inverse word, and a step-through path. | A specific finite computation found capture, exhaustion, or a limit. |
| Inspect details | Full parameter convention, depth/frontier limits, termination reason, arithmetic, and JSON. | The record states precisely what was computed and how to reproduce it. |
| Share or cite | Permalink, captioned PNG, search JSON, software citation, and the relevant paper citation. | Someone else can recover the view and identify the implementation. |

A single opt-in tour should perform that progression on a concrete example,
with pause/back/next controls and respect for reduced-motion preferences.
The legacy's boundary-tour idea can become a later guided layer, after its
mathematical locus and sampled path have been checked. The current interface
instruction tours alone do not provide this scientific explanation.

In the half-scale view, scale the trap, enclosure, and path consistently. If
$w=z/2$ is the displayed coordinate, a digit $t$ acts as
$w\mapsto c(w-t/2)$, while the stored original inverse word still uses
$g_t(z)=c(z-t)$. Show one convention at a time; do not place a $2c$ marker on a
half-scale drawing without explanation.

### What to retain, recover, and defer

| Priority | Action | Completion condition |
|---|---|---|
| Delivered in combined source | Original-attractor startup, compact toolbar/drawer, scene and parameter comparisons, polar controls, automatic fit, software citation copy, and consistent finite-search language. | Source behavior and the local validation checkpoint are recorded above; final deployment must identify the same tested assets. |
| Final publication gate | Run the full suite for the final commit, publish the project Pages artifact, preserve exact legacy HTML, and enable the compatibility redirect. | The manifest identifies the deployed commit and assets; representative old query/hash links and the archive resolve as intended. |
| Next focused increment | Curate the public preset menu, exact-expression captions, and optional paper-BibTeX copy. Keep atlas/figure scaffolds distinct from finished examples. | Each public example has a clear purpose, complete reproducible state, and an accurate reference. |
| Next focused increment | Build the concrete one-step guided explanation, then audit a depth-layer tour. | Tour values, path, scale, and selected JSON agree at every step. |
| Next focused increment | Add minimum-depth display filters and opt-in session resume if visitor use supports them. | Display filters leave numerical acceptance unchanged; published links take precedence over remembered state. |
| Delivered rendering extension | Bounded WebGL 2 previews, automatic binary64 worker refinement, explicit backend preference, and CPU fallback. | The dated hybrid section records the contract; final validation must cover shader results, cancellation, unsupported contexts, and precision fallback. |
| Later, with separate justification | WebGPU, finite polynomial-root plots, and a richer atlas. | A WebGPU backend needs measured value and its own arithmetic contract; mathematical views need definitions and matched reference checks. |

Color choices should remain flexible, but mathematical meaning should remain
stable: first-level map identity, capture depth, or search outcome. A palette
change must not alter search acceptance. An orbit hash is an orbit identifier
or visual encoding, not a topological classification by itself.

## Public URL and archive decision

The selected arrangement is:

| Role | Location and responsibility |
|---|---|
| Maintained public explorer | [Project Pages at `/collinear-fractals-gpu/`](https://complextrees.com/collinear-fractals-gpu/), built and deployed by the project repository. |
| Short community address | [`/collinear/`](https://complextrees.com/collinear/), forwarding to project Pages while preserving query/hash and adding `legacy=1` provenance. |
| Preserved legacy HTML | [`/collinear/legacy-2026-09/`](https://complextrees.com/collinear/legacy-2026-09/), with the exact reviewed HTML bytes and existing fragments retained. |
| Source, issues, validation, releases | [`espigule/collinear-fractals-gpu`](https://github.com/espigule/collinear-fractals-gpu). |

The importer is implemented in the project source. The redirect and archive
are publication actions in the hosting route; this report records the
decision rather than claiming to have deployed them.

| Legacy input or setting | Current handling |
|---|---|
| `n`, `cx`, `cy` | Preserve supported finite values. An explicitly legacy link fills omitted values from the archived defaults; malformed or out-of-range values produce disclosed fallback/limit behavior. |
| `panels` | Interpret the archived bit order $R_n$, $E(c,n)$, $\mathcal M_n$, half-difference and select corresponding current views. A link hiding every set receives a disclosed fallback. |
| `centerX`, `centerY`, `zoom` | Preserve center and translate the old vertical span $2/\mathrm{zoom}$ to each target canvas's horizontal width using its actual aspect ratio. |
| Old depth windows, queue, trap thickness, shader/color modes, resolution, and interface flags | Do not map them to numerically different current search controls. The import message lists unsupported settings; the exact old experience remains in the archive. |
| A modern hash, including a hash reached through the compatibility redirect | Modern-only keys identify the current codec and take precedence over the legacy marker. |
| A recognized hash plus query state | The hash is authoritative as a whole; stale query fields do not supplement it. A legacy query is used when no recognized hash state exists. |
| A new Share action after import | Emit a complete current hash and remove the old query state, so the next visit replays the translated state directly. |

The `legacy=1` marker matters because abbreviated old links omit default-valued
fields and may contain only `n`, `cx`, and `cy`. Without provenance, such a link
cannot always be distinguished from a partial modern link. Preserving the
query and fragment is therefore part of the redirect contract; preserving
every old rendering behavior in the new engine is not its promise.

Archive preservation means the saved HTML bytes match the recorded SHA-256.
It does not freeze browser hardware or third-party CDN availability. The
archive path supplies its date without modifying the preserved HTML, and
the current About panel explains its historical role. Current numerical
status, documentation, issues, and releases belong to the maintained project.

## Sharp boundary extension — 18 September 2026

This section records the subsequent working-source extension. The comparison,
publication decisions, terminology, and QA counts above retain their original
dates; their counts do not validate the new boundary shader or membership path.

The default original-attractor image now uses adaptive capture-and-escape
boundary rendering through the hybrid GPU-preview/CPU-worker pipeline. It
evaluates full $E(c,n)$ coordinates, colors first-level pieces, and permits
canonical capture only when $|c|^2+2|\mathrm{Re}\,c|<n$, including even
alphabets. Outside that region it uses enclosure-pruned escape and finite
survival. Work limits remain unresolved. Prefix and seeded-histogram drawings
remain available as advanced visual modes.

The maintained marked-point name is $\mathcal M_n^0=\{c:c\in E(c,n)\}$.
The old $R_n$ spelling remains an input alias, and the archive's first panel
bit maps to this same set. A new $\mathcal M_n^1$ view tests
$c\in A_{n-1}+c^{-1}E(c,n)$: the first inverse digit is complementary and
later digits are original. These views are separate from the full selected
$\mathcal M_n$ connectedness record, with no claim that their union exhausts it.

Boundary depth is independent of the selected search's `kMax` and `LMax`.
Automatic base depth is 16 for two maps and 12 otherwise, with zoom/resolution
adaptation capped at 100. The settings, requested/effective work limits, and
geometric pixel footprint are reproducible state or rendering metadata.
The footprint is used for dynamical coverage; parameter membership has zero
geometric footprint. See the current [rendering architecture](RENDERING_ARCHITECTURE.md)
and [validation requirements](VALIDATION.md) for the final-commit contract.

The README's rendered illustrations retain their depth-eight prefix
construction. Their interactive links and curated presets now open the sharp
boundary view. This extension makes no physical-device performance claim;
native shader, worker, and browser gates must pass on its final revision.
