# Implementation Notes

## IFS convention

For an alphabet of size $m$,

$$
A_m=\{-m+1,-m+3,\ldots,m-1\},\qquad f_t(z)=t+z/c.
$$

The original attractor is
$E(c,m)=\{\sum_{j=0}^{\infty}t_jc^{-j}:t_j\in A_m\}$.
The first digit is unscaled. Prefix centers and histogram iterations use this
same convention, so the attractor and search overlays share coordinates.

For an original arity $n$, the difference alphabet has size $N=2n-1$ and
$E(c,n)-E(c,n)=E(c,N)$. Connectedness is encoded by
$2c\in E(c,N)$. The inverse branches are $g_t(z)=c(z-t)$.
The [finite-capture paper](https://arxiv.org/abs/2603.07397) develops this
marked-point criterion and the associated trap/enclosure construction.

## Input domain and coordinates

The canonical search requires a non-real expanding parameter $c$, with
$|c|>1$.

| Entry point | Interpretation |
|---|---|
| Browser parameter locator and share coordinates | Reciprocal coordinates inside the unit disk; direct expanding coordinates outside it. |
| Browser ES-module search | Uses the same reciprocal normalization as the browser. |
| JavaScript, Python, Swift and symbolic reference packages | Take the expanding $c$ directly; no reciprocal conversion is performed. |
| Original-attractor boundary/prefix/histogram renderers | Take an already normalized expanding $c$ directly. |

For $0<|p|<1$, the browser uses $c=1/p$; for $|p|>1$, it uses $c=p$.
For example, browser input $p=0.4+0.3i$ uses $c=1.6-1.2i$.
Pass the latter value to a reference package to reproduce that search. Zero
and points on the unit circle have no expanding IFS parameter; their selected
search returns `Undetermined` with `outside-domain`. The current browser
handles the real $\mathcal M_n$ trace analytically, separately from the
non-real canonical search. Historical language-package searches retain their
documented real-axis exclusion.

JavaScript and Python reject non-finite coordinates, nonintegral/invalid
arities or limits, and nonpositive tolerance with an exception. Swift's
nonthrowing search returns `Undetermined` with `invalid-input`; its throwing
geometry helpers reject invalid values. Check package READMEs for native-port
validation scope. The mathematical arity must be an integer at least 2, with
the difference alphabet representable exactly in the implementation.

For $c=x+iy$ and $\rho=|c|$, write $z=u+iv$. Its canonical coordinates are
$(s,v)$ with

$$
s=\frac{xv+yu}{\rho}.
$$

The marked point $2c$ has coordinates $s_0=4xy/\rho$, $v_0=2y$.
An inverse digit $t$ updates them by
$v'=\rho s-yt$ and $s'=2xv'/\rho-\rho v$.
Digits of $A_m$ have the parity of $m-1$; clipping to the finite alphabet
must preserve that parity.

## Search limits and termination

| Setting | Default | Meaning |
|---|---:|---|
| `k_max` / `kMax` | 37 | Largest inverse depth; zero tests the initial point only. |
| `L_max` / `LMax` / Python `l_max` | 1000 | Retained frontier width at one depth. |
| `tol` | `1e-8` | Target for the unscaled enclosure-series tail. |

The search stops conservatively as soon as a frontier reaches its width cap.
The cumulative node count can exceed that cap. It is not a total work or
elapsed-time budget. Exported inverse words list digits in the order applied
to $2c$; a depth-zero hit has an empty word.

| Verdict | Stop reason | Meaning |
|---|---|---|
| `Interior` | `trap-hit` | Strict in-lens trap entry. |
| `Interior` | `analytic-membership` | Membership in the open region $1<\lvert c\rvert<\sqrt n$, with no capture word. |
| `Member` | `analytic-membership` | Membership on the real trace $1<\lvert c\rvert\leq n$, without a complex-interior claim. |
| `Interior-offLens` | `trap-hit` | Strict entry using the separate off-lens rule. |
| `Exterior` | `analytic-exterior` | A real expanding parameter with $\lvert c\rvert>n$. |
| `Exterior` | `enclosure-escape` | The initial point is outside the computed enclosure. |
| `Exterior` | `tree-exhausted` | Every retained branch was eliminated before any search limit. |
| `Undetermined` | `node-cap`, `depth-cap` | The finite computation stopped without a decision. |
| `Undetermined` | `outside-domain`, `numerical-range` | Unsupported geometry or a calculation outside finite numerical range. |

The `Interior-offLens` row applies to historical reference/replay behavior;
the current browser disables that acceptance rule. `Undetermined` does not
classify a parameter as a boundary point. Native search results use `stopReason`
(JavaScript/Swift) or `stop_reason` (Python); JSON exports use `stop_reason`.

## Analytic connectedness and the unit-circle seam

The full connectedness locus has an analytic inner region
$1<|c|<\sqrt n$. This is the interior inclusion of
[Proposition 2.5 of the 2024 paper](https://arxiv.org/html/2411.00160v2).
The real trace is exactly $1<|c|\leq n$: the real IFS fills its supporting
interval through $|c|=n$, including the touching first-level endpoints, and
has separated first-level intervals for $|c|>n$. The browser reports the
trace as `Member`, since these real antenna points need not be interior
points of the complex connectedness locus.

These decisions do not provide a canonical trap word. Their
`minimumCaptureDepth` is `null`; depth zero in an analytic search record
means that no inverse step was needed, not capture at depth zero. The selected
search preserves its canonical search inside the strict lens. Raster coverage
can use the analytic region before building an enclosure while its independent
center search retains any supported canonical minimum.

For that analytic raster path, a constant-cost support-disk probe first tests
whether the center already captures at depth zero or has no available trap.
Either result avoids the enclosure sum. A center requiring a positive capture
depth rebuilds the ordinary enclosure and uses the full ordered minimum
search, with its original candidate budget.

For an input disk centered at $p_0$ with radius $r$, put
$a=|p_0|-r$ and $b=|p_0|+r$. If $a>0$ and
$\max(b,1/a)<\sqrt n$, every supported point in the disk lies in the
analytic region after the browser's direct or reciprocal normalization.
The $\mathcal M_n$ raster can therefore cover a cell crossing $|p|=1$
without iterating a poorly contracting inverse tree. The points exactly
on the unit circle are still outside the expanding IFS domain. An exact
zero-radius unit-circle sample is not promoted to membership.

The annulus criterion applies to $\mathcal M_n$ only. It must not fill
$\mathcal M_n^0$, $\mathcal M_n^1$, or an individual digit subset by
association. A domain sample without an applicable criterion uses the neutral
domain color; a numerical or work limit remains visibly unresolved.

## Current capture policy and historical replay

Current browser selected searches use `canonicalOnly: true`: for an alphabet
of size $m$, trap entry is permitted only when
$|c|^2+2|\mathrm{Re}\,c|<m$ in the non-real expanding domain.
The $\mathcal M_n$ and difference-attractor searches use $m=2n-1$;
the original attractor and its first-digit subsets use $m=n$.
Enclosure escape and finite survival remain available outside those lenses.

The former off-lens rectangle is not a general self-covering trap. For
$m=3$, $c=3+3i$, and $z=1/4+i/20$, its old test returns immediate
`Interior-offLens`. But for every $t\in\{-2,0,2\}$,

$$
|\mathrm{Im}(c(z-t))|=|0.9-3t|\geq0.9.
$$

All points of $E(c,3)$ satisfy
$|\mathrm{Im}\,z|\leq2/(\sqrt{18}-1)<2/3$, since the first digit is
real and the remaining series has that absolute tail bound. Thus every
first inverse image is outside the attractor, and the original point is
exterior. In the half-difference display the same point is
$(1/8,1/40)$. This exact counterexample prevents treating the historical
off-lens rule as numerical evidence of membership.

Reference defaults and archived search records retain that old behavior to
allow reproduction; current browser calls explicitly select the canonical
policy. A historical `Interior-offLens` result must carry its original
provenance and must not silently become a current accepted capture. The
same distinction applies when loading an old preset: the current explorer
recomputes it under the current policy.

The current off-lens $\mathcal M_n$ raster nevertheless reuses the earlier
explorer's complex-tree parallelogram to guide its bounded-orbit search.
For the difference alphabet $m=2n-1$, the guide is

$$
P=\{a+b/c:a,b\in\mathbb R,\ |a|<m-1,\ |b|<2\kappa\},\qquad
\kappa=\begin{cases}
1,&n\leq7,\\
1+\lfloor n-2-2\sqrt n\rfloor,&n>7.
\end{cases}
$$

This matches the archived explorer's 100% complex-tree setting; its vertical
half-width is twice that of the legacy reference acceptance rectangle above.
The guide chooses an enclosure-admissible inverse digit whose child is closest
to these normalized strips. The score is convex and piecewise linear, so
only the two alphabet digits surrounding its continuous minimizer need
comparison. The preferred digit is tried first, followed by every remaining
admissible digit. Fixed first digits, enclosure tests, parameter-cell bounds,
and depth/work limits still apply.

Entry into $P$ is not an acceptance test. A branch must satisfy the ordinary
bounded-orbit checks through the requested escape depth, and its outcome
remains finite survival. The guide can change which finite survivor is found
within a work budget; it cannot create `Interior-offLens` or a minimum-capture
level. The canonical minimum search retains its independent ordering and
budget. [Section 5 of the 2024 paper](https://arxiv.org/html/2411.00160v2)
motivates these tree parallelograms, without providing a universal off-lens
self-covering theorem for their use as global acceptance tests.

## Enclosure truncation and arithmetic

For a truncation depth $M$, the geometric remainder is bounded by

$$
\frac{\rho^{-M}}{\rho-1}.
$$

The enclosure includes this complete remainder even if the requested tolerance
cannot be achieved before the truncation cap. Metadata records the depth,
remainder, whether it met the target (`tailCertifiedToTol` /
`tail_certified_to_tol`), and whether the depth cap was reached.

This bound concerns an omitted mathematical series. It does not control
rounding of the trigonometric sum or later coordinate comparisons. The
executable browser/JavaScript/Python/Swift routines use floating-point numbers,
not outward-rounded intervals. See [numerical interpretation](RESPONSIBLE_USE.md)
for the evidentiary meaning of a result.

Interactive membership contexts compute the powers of $1/c$ by a complex
recurrence, avoiding a power and a trigonometric evaluation for every term.
They retain the complete omitted tail and also use the directional estimate
$|\sin(k\theta)|\leq k|\sin\theta|$. For the unscaled vertical series,
this gives

$$
\sum_{k>M}|\mathrm{Im}(c^{-k})|
\leq\min\left(
\frac{\rho^{-M}}{\rho-1},
\frac{|y|\rho^{-M-1}\bigl(M(\rho-1)+\rho\bigr)}{(\rho-1)^2}
\right).
$$

The complete vertical support also satisfies
$V_E\leq(m-1)|y|/(\rho-1)^2$. This bound becomes sharp as the parameter
approaches the real axis and can be much smaller than an isotropic tail.
For a parameter disk, use the upper bound $|y|+r$ and lower modulus
$\rho-r$ in the same formula. Pruning intersects the vertical digit range
with the horizontal range implied by the attractor's support disk, so a small
imaginary part no longer destroys all digit selectivity. Floating-point
padding is applied separately; archived replay retains its original enclosure
routine. The interactive sum has the existing maximum of 2,000 terms.
`tailCapHit` reports that the effective directional/norm tail still exceeds
the requested tolerance at that cap; the directional estimate can meet the
target even when the isotropic estimate does not.

For a fixed real expanding parameter with $1<\rho\leq m$, the attractor is
exactly the interval $[-H,H]$, where $H=(m-1)\rho/(\rho-1)$.
The membership renderer can test a point or a dynamical pixel's intersection
with that interval directly, including a prescribed first piece
$t+c^{-1}[-H,H]$. This is analytic coverage with no canonical capture depth.
A parameter cell centered on the real axis still contains non-real parameters
and uses the varying-parameter bounds, rather than replacing that whole cell
with an interval.

## Visual renderers and computational cost

The default `boundary` renderer evaluates the original $E(c,n)$ by depth-first
inverse search. It permits canonical trap capture only when
$|c|^2+2|\mathrm{Re}\,c|<n$, in the non-real expanding domain. This
original-alphabet rule is valid for both alphabet parities; it does not reuse
the difference-alphabet trap or an off-lens acceptance rule.
It corresponds to strict containment in both disks
$|c\pm1|^2<n+1$, the interior of the original covering lens
$X_{(n+1)/2}$ after excluding the unit disk and real axis. Numerical capture
uses strict inequalities even when a mathematical covering statement
includes its lens boundary; finite escape coverage remains available there.

An exhausted inverse tree is escape. An admissible branch reaching the
requested depth is finite survival, while a work or stack cap is unresolved.
Outside the original-alphabet self-covering region, enclosure pruning and
finite survival contribute to the boundary image; the fixed-real interval
case above has its own analytic coverage test. First-level colors identify
the outermost original digit. These outcomes describe floating-point visual
coverage rather than an interval-certified boundary.

The dynamical raster uses a pixel footprint: its radius is
$\mathrm{spanX}/(\sqrt{2}\,\mathrm{rasterWidth})$ for square pixels.
Parameter pixels use a different construction: their radius describes a
disk of parameter values. Both the marked point and every inverse map vary
over that disk. The renderer propagates this dependence and adjusts its
enclosure and trap comparisons for the full cell. A cell surviving the finite
search is visual coverage; it is not a point-membership claim about its
center. Numerical error guards remain a separate concern. Selected point
records use zero geometric radius.

For a parameter disk $c=c_0+\delta$, the orbit representation
$z(c)=a+b\delta+R(\delta)$ retains the derivative $b$ and a bounded
second-order remainder. The inverse update is $a'=c_0(a-t)$,
$b'=a-t+c_0b$. An enlarged target enclosure covers the change in $E(c,m)$
over the disk, and capture requires containment in the varying traps across
the entire cell. This also handles the full $\mathcal M_n$ raster with
$z(c)=2c$ and $m=2n-1$, while its selected point record continues to use the
original reference search. Reciprocal-input cells are enclosed after
inversion. Cells crossing the unit circle use the analytic $\mathcal M_n$
criterion above when applicable; otherwise they remain outside the supported
parameter-cell search domain. See the
[cell propagation and bounds](RENDERING_ARCHITECTURE.md#parameter-cells-and-fine-structure)
for the radius formulas and numerical limitations.

Automatic boundary depth starts at 16 for two maps and 12 otherwise. A nonzero
`boundaryDepth` overrides that base. Adaptation adds
`ceil(log2(max(1, referenceSpan / spanX * rasterWidth / 768)))` and caps the
result at 100. With adaptation disabled, depth stays at the selected base.
The browser's boundary work budget is 20,000 digit evaluations per selected
parameter layer, digit subset, or first-level piece at a pixel; the base
original-attractor search has its own budget. The point-center minimum search
receives a separate bounded allowance in both capture display styles, so
coverage cannot spend its entire budget before capture is considered.
More visible layers therefore
increase total work. The GPU preview has smaller depth/work limits. None of
these visual controls changes the selected $\mathcal M_n$ search's `kMax`,
`LMax`, or tolerance.

The advanced prefix renderer draws complete levels up to its point budget, reducing the
actual depth when the requested level would exceed that budget. Metadata
records both depths and `truncated_by_work_cap`. After $d$ prefix digits, a
valid mathematical tail-radius estimate is

$$
R_d=(m-1)\frac{\rho^{1-d}}{\rho-1}.
$$

The on-screen circle size is clipped for legibility, so the drawn circles are
not guaranteed to display that entire enclosure. The image remains a finite
visual approximation.

The seeded histogram iterates $z\leftarrow t+z/c$, discards a burn-in, and
draws a bounded sample count. The renderer and worker share the sampler.
A seed reproduces the sequence in the same implementation; a finite burn-in
and finite sampling do not establish exact coverage or an invariant density.

The survival renderer retains points whose inverse search is still admissible
at the chosen depth or width cap, with trap entry disabled. It is a numerical
outer-approximation diagnostic. It does not reinterpret survival as a proven
membership result.

A verdict-only scalar kernel reuses typed-array frontiers for binary64 pixel
rendering. The default hybrid backend first uses a bounded WebGL 2 float32
preview when supported, then refines the raster in CPU workers at the requested
depth, frontier cap, tolerance, and image size. Explicit `gpu` mode finishes
with the bounded preview; `cpu` mode uses binary64 computation directly.
Unsupported GPU views fall back to CPU rendering, and unavailable or failed
workers fall back to the progressive main-thread renderer.

The GPU preview has separate depth, frontier, work, resolution, and precision
limits. Hitting one of these limits does not license branch dropping followed
by an escape verdict. The runtime records the actual backend and effective
preview settings separately from the portable requested backend. Its error
allowances are engineering guards, not interval certification. See
[rendering architecture](RENDERING_ARCHITECTURE.md) for the source-level limits
and fallback contract.

The visible canvases and direct prefix/histogram overlays use Canvas 2D.
Their full $E(c,n)$ coordinates do not change with backend selection. The
detailed reference search retains the inverse tree and word for the selected
parameter and always uses binary64 arithmetic with the full requested search
limits. Cross-kernel tests compare numerical results; they do not add interval
guarantees.

First-level outlines in sharp boundary mode use independent occupied and
unresolved masks for every piece. A black rim marks a covered piece sample
next to an explicitly absent neighbor for that same piece. Tile halos retain
neighbor information across worker boundaries. Rims are composited after
piece fills, so a boundary inside another piece remains visible. Overlapping
fills average the relevant piece colors. The first-level-pieces control
toggles this combined color-and-outline view; sampled prefix and histogram
renderers retain their separate visual interpretation.

## Finite-capture fields

The [finite-capture paper](https://arxiv.org/html/2603.07397v1) defines
capture time through entry into a canonical trap and the resulting
filtration. The current renderer keeps its geometric boundary approximation
and a sampled capture-time field as separate data.

For one eligible parameter and point, `classifyAttractorCapture` applies
depth-limited inverse searches at increasing limits. Every shallower search
finishes before the limit increases. A reported `minimumCaptureDepth` is
therefore the smallest depth accepted by this numerical search, rather than
the length of the first depth-first witness. The minimum search uses `min(kMax,100)` on the CPU, while geometric
coverage keeps its separate adaptive escape depth. The total work cap covers
all minimum-search passes. Precision or work exhaustion leaves the minimum unknown, without
discarding a capture already found by the independent coverage search.

| Result field | Meaning |
|---|---|
| `minimumCaptureDepth` | Integer numerical minimum, or `null` if not established. |
| `captureDepthSemantics` | `minimum-verified`, `witness-upper-bound`, or `not-captured`; “verified” here refers to search ordering, not directed-rounding certification. |
| `captureSearchStopReason` | `minimum-found`, `no-capture-through-depth`, `trap-unavailable`, or an explicit resource/numerical termination. |
| `captureSample` on a parameter cell | Separate zero-radius result at its marked center, with the marked point, scale, arithmetic, and trap availability. |

The center search uses $2c$ and $A_{2n-1}$ for $\mathcal M_n$; it uses
$c$ and $A_n$ for $\mathcal M_n^0$. The complementary aggregate and
individual digit subsets must apply their first digit before capture,
and all later steps use $A_n$. That first step contributes one to the
depth. Unrestricted whole-attractor capture begins at zero and is independent
of whether first-piece colors are enabled. The half-difference view applies
its original difference-attractor search to twice the displayed coordinate.

Throughout the strict original-alphabet lens, $c$ is already in the canonical
trap. Hence the $\mathcal M_n^0$ capture field is zero there. Individual
$F_{n,t}$ fields can have later levels because their prescribed first step
cannot be bypassed. The renderer must not introduce extra positive-depth
strata merely by decomposing the aggregate into first-level pieces.

The complementary aggregate has minimum one throughout the same strict
lens. Write $c=x+iy$, $\rho=|c|$, and choose a digit
$t\in A_{n-1}$ nearest to $2x$. The lens implies
$|2x|<n-1$, so $|2x-t|\leq1$. Its first inverse image satisfies

$$
v'=y(2x-t),\qquad
s'=\frac{y}{\rho}\bigl(2x(2x-t)-\rho^2\bigr).
$$

Thus $|v'|\leq|y|<V$ and
$|s'|\leq |y|(\rho^2+2|x|)/\rho<S$. This proves one-step entry
for the aggregate; a prescribed digit can still require a later level.
Numerical implementations retain padded strict comparisons at the lens
edge instead of turning this argument into unguarded floating-point equality.

Pixel-center capture does not assert capture across the geometric footprint.
Conversely, a surviving parameter cell can cover structure that does not
pass through its center. `captureDepths` and `layerCaptureDepths` encode
these sampled minima separately from the coverage codes; 255 is the packed
unknown sentinel. The compositor darkens known levels cyclically while
retaining set and piece hues, leaves a capture with unknown minimum solid,
and makes finite escape coverage pale. Black piece contours remain visible.

State `captureStyle` maps to `capture=depth` (default) or `capture=sets`;
`modulo` maps to `q`, from 1 to 12. Changing these controls cannot change
geometric pruning, numerical acceptance, or the selected-point search
record. Both display styles compute the same center minima; flat set colors
do not remove their contribution to occupancy or diagnostics. Prefix and
histogram displays retain their sampling colors.

## First-digit parameter subsets

Write $D_n=\{-n+1,-n+2,\ldots,n-1\}$. It contains $2n-1$ digits and
splits into the original alphabet $A_n$ and the complementary alphabet
$A_{n-1}$. Define

$$
F_{n,t}=\{c:c\in t+c^{-1}E(c,n)\},\qquad t\in D_n.
$$

The selected first digit is applied exactly once. Testing $F_{n,t}$ starts
at $z=c$, applies $g_t(z)=c(z-t)$, and then tests the resulting point in the
original $E(c,n)$ with digits from $A_n$. Changing the first digit does not
change the tail alphabet. The two aggregate marked-point sets are

$$
\mathcal M_n^0=\bigcup_{t\in A_n}F_{n,t}=\{c:c\in E(c,n)\},
$$

$$
\mathcal M_n^1=\bigcup_{t\in D_n\setminus A_n}F_{n,t}
=\{c:c\in A_{n-1}+c^{-1}E(c,n)\}.
$$

For example, at $n=4$ the controls represent these seven subsets:

| First digit $t$ | −3 | −2 | −1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| Aggregate | $\mathcal M_4^0$ | $\mathcal M_4^1$ | $\mathcal M_4^0$ | $\mathcal M_4^1$ | $\mathcal M_4^0$ | $\mathcal M_4^1$ | $\mathcal M_4^0$ |
| Subsequent digits | $A_4$ | $A_4$ | $A_4$ | $A_4$ | $A_4$ | $A_4$ | $A_4$ |

A depth-zero original trap hit cannot bypass a required first digit. At API
depth zero, an original aggregate can capture from its initial trap test,
and any search can reject through its initial enclosure test. A fixed-digit
or complementary-first search that remains admissible is inconclusive until
it applies that first digit. The interface's boundary depth zero means an
automatic positive depth. The original-alphabet membership engine supplies
both aggregate searches and individual subsets.

Every address in one of these subsets has all its digits in $D_n$. Because
$A_{2n-1}=2D_n$, doubling the address gives $2c\in E(c,2n-1)$, and hence

$$
\mathcal M_n^0\cup\mathcal M_n^1
=\bigcup_{t\in D_n}F_{n,t}\subseteq\mathcal M_n.
$$

No equality with the full connectedness locus is asserted. Its unrestricted
$D_n$ tail differs from the original $A_n$ tail used by the displayed digit
subsets. Several aggregate layers and individual subsets can be active at
once; each retains its own search result. The previous name $R_n$ survives
as the input alias `rn`, which normalizes to `mn0`.

The state codec stores aggregate selections in `parameterLayers` and selected
integers in `parameterDigits`. Their portable URL keys are `pl` and `pd`.
The layer order is `mn`, `mn0`, `mn1`; digits are unique and sorted. Empty
arrays are valid and remain empty through sharing and history. Changing $n$
removes digits outside the new $D_n$, without replacing the remaining
selection. The Compare control activates all three aggregate layers and
retains the selected digits. All digits and No digits affect only digit
subsets.

Explicit arrays take precedence over the historical `parameterMode` / `pm`
field. An old `pm=compare` link imports its original `mn` and `mn0` pair;
the newer Compare control can then add `mn1`. The compatibility mode projects
a single aggregate with no individual digits to that aggregate's name, and
other selections to `compare`. Exported arrays therefore carry the complete
selection when several layers are visible.

## Search JSON and schemas

The certificate filename and `proof_status` field are retained for compatibility.
A `finite-search-certificate` is a floating-point search record. It records
arity, input/effective parameter, depth and width limits, tolerance, verdict,
stop reason, word, node count, and arithmetic provenance. Visual settings are
separate metadata and do not determine the selected-parameter verdict.

The browser's `rendering` metadata records `requested_backend`, the visible
panels' actual rendering status, `selected_record_arithmetic: "binary64"`, and
`selected_record_uses_full_requested_limits: true`. GPU image metadata can
therefore describe a bounded float32 preview while the accompanying selected
record describes a different, full-budget binary64 computation. Hidden panels
have `null` rendering metadata rather than stale status from a previous view.
Boundary visual metadata also records the requested base depth, adaptation,
effective depth and work limit, pixel footprint, and self-covering condition.
Finite survival, numerical capture, and resource-cap outcomes remain distinct
from the selected connectedness record.

Current browser records include `trap_policy: "canonical-only"`, and the
trap geometry is `null` when no eligible canonical trap is available.
Analytic decisions use `proof_status: "analytic-classification"` and an
`analytic_evidence` object with the criterion, source, and
`capture_minimum_assigned: false`. Their word is empty, trap and enclosure
are `null`, and `minimum_capture_depth` is `null`. The export builder checks
the analytic claim against the effective parameter instead of accepting a
caller-supplied label alone.
Rendering metadata records center capture sampling, maximum depth,
arithmetic, packed unknown minimum, display style, and cycle independently
of boundary coverage. The half-difference raster uses point samples for
non-real parameters. At real parameters it uses a full pixel footprint to
retain the one-dimensional trace, with twice the displayed coordinate and
twice its footprint radius passed to the difference-attractor search.
Original sharp-boundary and parameter layers retain footprint/cell coverage.

`parameter_view.layers` and `parameter_view.digits` retain the complete
parameter selection. Its `mn`, `mn0`, `mn1`, and `digit_results` fields are
auxiliary selected-point searches; `selected_point_sampling: "point"`
distinguishes them from the image's `raster_sampling: "parameter-cell"`.
`raster_parameter_radius` describes the active raster's cell before any
reciprocal conversion, including a bounded GPU preview's effective resolution.
It is `null` when the parameter canvas has no visible dimensions, with
`raster_visible: false`. Backend metadata gives the corresponding
preview/refinement raster. Thus a colored cell does not silently turn
the separate point result into a capture. A `mode` value of `compare` alone
cannot encode the whole selection; consumers should read the arrays.

Analytic parameter-cell coverage records
`membershipScope: "all-valid-parameters"`. When the cell crosses the unit
circle, `coverage: "expanding-chart-domain-intersection"` and
`excludedParameterLocus: "unit-circle"` distinguish the valid portion from
the excluded seam. Fixed-real dynamical results distinguish
`membershipScope: "point"` from `"pixel-intersection"`.

`c` stores the effective parameter for replay in the language packages;
`input_parameter` retains the original browser coordinates.
`parameter_convention` is `expanding-parameter` or `reciprocal-input`. If a
nonzero input is so small that its reciprocal cannot be represented, `c` is
`null`, the verdict is `Undetermined`, and the stop reason is `numerical-range`.
The raw input remains available, but there is no representable expanding
parameter to submit to a reference package.

Schemas describe the data contract. They cannot check whether a trap is
mathematically valid or a boundary comparison is rigorous. Reproduction should
retain the share URL and software commit alongside the record, because the
prerelease version alone does not identify later unreleased changes.
