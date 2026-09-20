# Rendering architecture

**Source review:** 19 September 2026. This document describes the hybrid
renderer in the working source; deployed behavior is identified separately
by the site's `deployment.json` and the validation result for that commit.

The default `auto` mode combines a bounded WebGL 2 preview with binary64 CPU
refinement at the requested settings. The visible parameter and dynamical
canvases remain Canvas 2D surfaces, so overlays, labels, image export, and
fallback rendering share one composition path.
The default original-attractor renderer is `boundary`: a capture-and-escape
raster with adaptive depth and first-level piece colors. Its separate
pixel-center finite-capture field supplies minimum-depth shading by default.
Prefix and histogram
geometry remain explicit advanced renderers.

## Preferences, completion, and fallback

| Saved `backend` preference | First image | Completed raster |
|---|---|---|
| `auto` | WebGL 2 float32 preview when the view and context are supported; otherwise a coarse CPU pass when appropriate. | Binary64 CPU search at the requested image size and applicable search or boundary settings. |
| `gpu` | Bounded WebGL 2 float32 preview. | That preview is the chosen result. A refused or lost GPU context/view falls back to CPU rendering. |
| `cpu` | CPU raster, with a coarse initial pass for larger views. | Binary64 CPU search at the requested settings. |

The CPU path normally uses module Web Workers. A worker creation, execution,
message-validation, or timeout failure invokes the host's existing
progressive main-thread renderer. This preserves a working numerical route
without changing the saved preference. The interface can therefore report a
CPU fallback while the share URL still contains `backend=gpu`.

`gpu` is an explicit approximation choice. A completed GPU preview is not a
completed CPU refinement, even if its image has been scaled to the same
canvas dimensions. Numerical and image metadata must keep those meanings
separate. The selected parameter's search record always comes from the
binary64 detailed reference search with the requested limits.

## Code responsibilities

| Module | Responsibility |
|---|---|
| [`hybrid_renderer.mjs`](../src/renderers/hybrid_renderer.mjs) | Coordinates one auxiliary WebGL context and a shared pool of at most two raster workers. Maintains separate parameter/dynamical jobs, frame callbacks, cancellation, and backend status. |
| [`webgl_preview.mjs`](../src/renderers/webgl_preview.mjs) | Checks context capabilities, shader precision, view precision, and dimensions; draws classification and palette passes; releases and rebuilds resources across context loss. |
| [`gpu_search_shader.mjs`](../src/compute/gpu_search_shader.mjs) | Bounded float32 inverse search with explicit depth, frontier, work, domain, and precision outcomes. |
| [`attractor_membership.mjs`](../src/compute/attractor_membership.mjs) | Shared binary64 membership context, depth-first capture/escape coverage, a level-ordered minimum-capture search, fixed or complementary first digits, parameter-cell propagation, and adaptive depth calculation. |
| [`parameter_views.mjs`](../src/compute/parameter_views.mjs) | Keeps the full connectedness search, aggregate marked-point layers, and individually selected first-digit subsets separate. |
| [`raster_jobs.mjs`](../src/compute/raster_jobs.mjs) | Validates numerical raster jobs and evaluates pixel cells with the binary64 kernels. Uses full-frame coordinates independently of tile boundaries and records independent first-piece coverage for composition. |
| [`raster_worker_pool.mjs`](../src/compute/raster_worker_pool.mjs), [`raster-worker.mjs`](../workers/raster-worker.mjs) | Schedules bounded tiles, transfers classification bytes, validates replies, and rejects stale or malformed work. |
| [`attractor_prefix.mjs`](../src/renderers/attractor_prefix.mjs), [`attractor_histogram.mjs`](../src/renderers/attractor_histogram.mjs) | Draw original-attractor approximations on CPU Canvas; choosing a GPU pixel backend does not move these overlays into a shader. |
| [`inverse_search_reference.mjs`](../src/compute/inverse_search_reference.mjs), [`certificate_builder.mjs`](../src/compute/certificate_builder.mjs) | Produce the selected detailed numerical search and export record independently of raster preview results. |

The worker pool's default tiles are 64 × 16 pixels. Only a bounded number of
tiles are in flight; the scheduler does not queue a full image's worth of
pending buffers. Cancelling a busy job terminates its worker because a
synchronous numerical tile cannot process a cancellation message mid-search.
Job identities also prevent delayed results from repainting a newer view.

GPU rendering keeps classification, occupied-piece masks, and unresolved-piece
masks in separate RGBA8 attachments. Independently selected parameter layers
use separate slices of a classification texture array. A composition pass
combines the active layers or piece fills and boundaries. The host copies the
finished auxiliary canvas before yielding because `preserveDrawingBuffer` is
false. Explicit `readClassification()`, `readLayers()`, and `readPieceMasks()`
readbacks are diagnostics for QA, not per-frame production steps. The API used here is defined by the
[Khronos WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/).

## Sharp boundary and marked-point views

For the original alphabet $A_n$, the canonical trap is enabled only for
non-real expanding $c$ satisfying $|c|^2+2|\mathrm{Re}\,c|<n$. The same
condition and parity-correct digit handling apply to odd and even $n$.
This is separate from the larger difference-alphabet lens used by the
selected $\mathcal M_n$ search.
Equivalently, both $|c-1|^2$ and $|c+1|^2$ are less than $n+1$:
the strict interior of the covering lens $X_{(n+1)/2}$, outside the unit
disk and real axis. Lens-boundary cells remain on the finite escape path
unless the full-cell strict capture conditions are met.

The shared original-membership search follows inverse branches depth first.
A strict trap hit gives numerical capture; an exhausted admissible tree gives
escape. Finding an admissible branch at the requested depth gives finite
survival. Reaching a work, stack, precision, or domain limit leaves the pixel
unresolved. Outside the original-alphabet lens there is no trap acceptance:
the displayed shape comes from enclosure-pruned finite survival and escape.
Neither depth survival nor capped work becomes a membership proof.

### Parameter cells and fine structure

Pixel-center membership sampling can miss thin components between sample
locations. Every visible parameter layer now evaluates a disk containing its
pixel cell. For the marked-point layers it starts from $z(c)=c$; for the full
$\mathcal M_n$ layer it starts from $z(c)=2c$ with alphabet $A_{2n-1}$.
All use the adaptive boundary depth for the image. The selected full
connectedness record retains its independent breadth-first reference search
and requested `kMax`/`LMax`, with `canonicalOnly: true` for current browser
capture. Historical off-lens records use a separate replay policy.

For a disk $c=c_0+\delta$, $|\delta|\leq r$, each inverse word is represented
by

$$
z(c_0+\delta)=a+b\delta+R(\delta),\qquad |R(\delta)|\leq q.
$$

An inverse digit updates the center and derivative as
$a'=c_0(a-t)$ and $b'=a-t+c_0b$. Its remainder is bounded by
$(|c_0|+r)q+|b|r^2$, with separate numerical padding. Keeping the derivative
preserves cancellation in the parameter dependence; propagating only an
expanding disk around the current point would lose it.

The fixed-parameter enclosure of $E(c_0,m)$ is enlarged by the
parameter-variation bound

$$
H=(m-1)\frac{r}{(|c_0|-r-1)^2},\qquad |c_0|-r>1.
$$

Vertical digit pruning and disk/canonical enclosure tests include the cell's
orbit radius and this enlarged target. A branch is pruned only when those
bounds exclude it. Capture requires the full parameter disk to satisfy the
strict self-covering condition and the full orbit image to lie inside the
corresponding traps, including the change in canonical coordinates with $c$.
Finite survival still means that the bounds admit an orbit through the
requested depth; it does not establish an actual bounded orbit for every
parameter, or membership of the pixel center. A work or precision cap stays
unresolved.

Inside the reciprocal-input disk, an input cell of radius $r$ centered at
$p_0$ is covered after inversion by a disk centered at $1/p_0$ of radius
$r/(|p_0|(|p_0|-r))$. Cells crossing the unit circle do not share one valid
expanding enclosure and remain unresolved. The same applies to unsupported
domain or numerical ranges. Binary64 padding and the shader's float32
uncertainty guards are numerical engineering bounds, not outward-rounded
interval certificates.

The original dynamical image passes a geometric pixel radius to this search.
Its footprint allows a visible pixel to intersect finite attractor coverage,
while capture comparisons require the footprint to fit inside the trap.
For a parameter pixel, both the marked point and the maps vary with $c$.
The parameter raster therefore follows the whole parameter cell through each
inverse word. It does not substitute the fixed-$c$ dynamical footprint for
this variation. The selected parameter's numerical record still evaluates a
single point. Floating-point error guards remain separate from both kinds of
geometric coverage.

| Parameter layer | Definition | First inverse digit |
|---|---|---|
| `mn` | $\mathcal M_n=\{c:2c\in E(c,2n-1)\}$ | Difference alphabet $A_{2n-1}$ throughout. |
| `mn0` | $\mathcal M_n^0=\{c:c\in E(c,n)\}$ | Original alphabet $A_n$ throughout. |
| `mn1` | $\mathcal M_n^1=\{c:c\in A_{n-1}+c^{-1}E(c,n)\}$ | Complementary alphabet $A_{n-1}$ once, followed by $A_n$. |
| Digit $t\in D_n$ | $F_{n,t}=\{c:c\in t+c^{-1}E(c,n)\}$ | The chosen $t$ once, followed by $A_n$. |

The aggregate layers and individual digits are independently selectable.
For $D_n=\{-n+1,\ldots,n-1\}$, the original digits give
$\mathcal M_n^0=\bigcup_{t\in A_n}F_{n,t}$ and the complementary digits give
$\mathcal M_n^1=\bigcup_{t\in D_n\setminus A_n}F_{n,t}$.
The digit subsets have a common original-alphabet tail; the full connectedness
locus permits the larger difference alphabet at every step.

At API depth zero, an initial enclosure test can still reject a point or
cell. An original aggregate search can also capture immediately when no
first digit is required and the initial trap test succeeds. A fixed-digit
or complementary-first search cannot capture before applying that digit;
an admissible zero-depth search of that kind remains inconclusive. In the
interface, boundary depth zero means automatic depth (16 or 12), rather than
a zero-level search.

The historical URL/JSON mode `rn` normalizes to `mn0`. The archive's first
panel bit retains that meaning. Their combined marked-point set is a subset
of $\mathcal M_n$; equality with the full locus is not asserted.

`boundaryDepth=0` selects a base depth of 16 for $n=2$ and 12 otherwise.
An explicit value 1–100 replaces that base. With `adaptiveBoundary=true`,
the depth adds
`ceil(log2(max(1, referenceSpan / spanX * rasterWidth / 768)))`, then caps
the total at 100. Turning adaptation off uses the base directly. The reference
span comes from the fitted view; `spanX` is the current horizontal world width.
Thus magnification and raster resolution can increase detail without changing
the selected `kMax` or `LMax`.

The browser requests at most 20,000 digit evaluations for each selected
parameter layer or digit subset at a pixel. First-level attractor pieces
also have independent budgets, in addition to the base original-attractor
search. More active layers or pieces therefore mean more total work; the
number is not a cap for the entire composite pixel. GPU preview limits can
reduce both depth and work. JSON records the requested
base, adaptation setting, effective depth/work, pixel radius, first-level
coloring, and self-covering condition. The portable keys are `bdepth` and
`badapt`; the codec preserves zero as automatic instead of storing a
viewport-dependent effective depth.

### Finite capture and boundary coverage

The coverage search and the finite-capture field answer different questions.
Coverage asks whether a full parameter cell or dynamical footprint can be
discarded at the requested escape depth. The capture field asks for the
smallest inverse depth at which the **pixel center** enters the canonical
trap. A footprint may remain admissible when its center does not capture;
a captured center need not imply capture of the whole footprint. Both fields
are preserved in the raster result.

`classifyAttractorCapture` searches successive depth limits in increasing
order, visiting every admissible sibling at each shallower limit before
moving deeper. This establishes a minimum for the implemented numerical
trap test. An ordinary depth-first coverage search can stop on a long-lived
branch before reaching a capture in a sibling, or return a longer witness
before a shorter one. Its first witness depth must not be used as a minimum.
The capture search uses `min(kMax,100)` on the CPU, independently of the
adaptive escape depth (16 for two maps, 12 otherwise before zoom increments).
Its candidate budget covers all passes
and reuses an $O(k)$ stack. It does not materialize a full breadth-first tree.

| Field | Initial point | Tail alphabet | Earliest capture depth |
|---|---|---|---:|
| $\mathcal M_n$ | $2c$ | $A_{2n-1}$ | 0 |
| $\mathcal M_n^0$ | $c$ | $A_n$ | 0 |
| $\mathcal M_n^1$ | $c$, followed by one digit in $A_{n-1}$ | $A_n$ | 1 |
| $F_{n,t}$ | $c$, followed by the chosen $t$ | $A_n$ | 1 |
| $E(c,n)$ | Displayed point $z$ | $A_n$ | 0 |
| $\tfrac12 E(c,2n-1)$ | Twice the displayed point | $A_{2n-1}$ | 0 |

The unrestricted $E(c,n)$ field includes its initial trap test even when
first-level pieces are colored; toggling piece identity must not shift the
filtration by one. Likewise, $c$ already lies in the original trap throughout
the strict original-alphabet lens, so $\mathcal M_n^0$ has capture level zero
there. The fixed first digit in each $F_{n,t}$ is still compulsory and counts
as one step. The complementary aggregate also has a uniform level: choose
its first digit nearest to $2\mathrm{Re}\,c$; the resulting point lies in
the original trap, so $\mathcal M_n^1$ captures at one throughout that
strict lens. Higher levels remain meaningful for fixed-digit fields,
$\mathcal M_n$, and dynamical points. They are not fabricated for these
two uniform aggregate regions.

The difference-attractor point raster already uses a breadth-first search,
so a canonical trap hit has the required minimum ordering. Current browser
selected-point searches and difference rendering permit capture only in the
strict difference-alphabet lens. The historical off-lens rectangle can
produce false positives and is retained only for explicitly historical
reference/replay behavior; see the [policy and counterexample](IMPLEMENTATION_NOTES.md#current-capture-policy-and-historical-replay).

For CPU tiles, `captureDepths` stores two bytes per pixel for the primary and
secondary fields; `layerCaptureDepths` stores one byte per selected parameter
layer per pixel. Values 0–100 carry an established numerical minimum; 255
means that no center minimum was established. Coverage codes and their
depths remain in `data` and `layerData`. Worker replies validate and transfer
the additional arrays. A known capture witness stays available even if a
separate minimum search exhausts its budget.

The portable setting `capture=depth` is the default. It modulates each set or
piece hue by minimum depth modulo `q` (1–12). A capture without an established
minimum retains the base hue; finite escape coverage is paler. The flat
`capture=sets` view keeps the base hues. Original-attractor shading describes
the whole-attractor field and applies to the blend of covering piece colors;
every black piece contour is composed afterwards and remains unchanged. Both display styles compute the same
capture field and preserve its occupancy and diagnostics; `sets` only changes
the color encoding.
Prefix, histogram, and explicit capture-disabled survival views keep their
separate numerical or sampling meaning.

For `q>1`, a known minimum $k$ scales RGB channels by
$0.6+0.3(k\bmod q)/(q-1)$; `q=1` uses 0.75. A finite survivor without a
center minimum mixes 72% base color with 28% white. CPU and WebGL use the
same formula. Shade is a display encoding; it is not an interval-verified
classification of the full pixel or an assertion that an unresolved center
belongs to the set.

### First-level piece colors and boundaries

Sharp boundary rendering evaluates each $E_t=t+c^{-1}E(c,n)$ separately,
with the first digit fixed before any capture test. Coverage is stored in
piece bitmasks; a separate bitmask records unresolved work. This retains
overlap information that a single winning first-digit index cannot express.
At a sample covered by several pieces, the fill is the mean of their piece
colors.

The compositor then draws a near-black inward rim for every covered piece
whose four cardinal neighbors include an explicitly absent sample of that
same piece. An unresolved neighbor does not supply edge evidence. The rim
is one raster pixel wide; two touching inward rims can make an interface
two pixels wide. A one-pixel halo around worker tiles supplies neighboring
coverage, preventing tile seams and artificial outlines at the viewport edge.
Drawing these rims after the fills retains boundaries that lie inside another
piece's coverage.

The existing first-level-pieces control enables both colors and outlines in
the sharp boundary mode. Prefix and histogram modes remain finite sample
drawings. The shared palette starts with gold and periwinkle, followed by
teal, rose, and violet, and supplies colors for all 100 supported original
pieces. Original-digit parameter swatches use the same colors as their
corresponding dynamical pieces. Parameter-layer overlaps likewise average
the contributing colors; their independent search outcomes remain available.

CPU mask storage uses `ceil(n/32)` 32-bit words per sample, rather than one
32-bit value that would lose higher-index pieces. Masks include the tile halo.
Both the masks and their uncertainty counterparts are validated and transferred
with worker results. These are finite-raster contours of the displayed
approximations, not analytic or interval-certified boundary curves.

## Bounded GPU preview

The following constants are implemented limits, not benchmark results:

| Resource | Current preview limit |
|---|---|
| Arity | `2 ≤ n ≤ 32`; larger browser arities use CPU rendering. |
| Connectedness/survival search depth | `min(requested kMax, 64)`. |
| Retained breadth-first frontier | `min(requested LMax, 32)`. |
| Breadth-first candidate work | At most 2,048 digit evaluations per pixel search. |
| Capture/escape boundary depth | At most 64 for original pieces and parameter cells; a deeper request ending at the shader cap remains unresolved. |
| Capture/escape candidate work | At most 4,096 digit evaluations independently for each selected parameter layer or first-level piece. |
| Minimum-capture search | At most `min(kMax,64)` inverse steps and 4,096 candidate evaluations across all iterative-deepening passes, independently of the corresponding coverage budget. Required lower user limits remain effective. |
| Simultaneous parameter layers | Up to 66: three aggregates plus all 63 digits at the GPU arity limit $n=32$. Larger unsupported selections use CPU rendering. |
| Parameter-plane enclosure series | 48 terms plus a tail allowance. Fixed dynamical enclosures are prepared in binary64 using the requested tolerance. |
| Raster size | At most 120,000 pixels; neither dimension exceeds 768 or the device's smaller limit. |
| Total preview search samples | At most 480,000 across the active search passes. The raster pixel budget decreases with both the number of selected layers or pieces and alphabet size, including the halo area. |
| Piece-boundary neighborhood | One raster-pixel halo; occupied and unresolved masks retain all pieces up to the GPU arity limit. |
| Shader capability | Fragment `highp` must provide at least 23 precision bits and exponent range 127. |

The preview rejects a view when one displayed pixel is too small relative to
float32 coordinate uncertainty. Numerical guards also cover near-unit,
near-real, large-modulus, and unrepresentable parameters. A fixed dynamical
parameter can cause the entire preview to use CPU fallback; a parameter
raster can instead show unresolved pixels in guarded regions.

The shader retains admitted branches until a resource limit is reached.
It uses expanded enclosures, contracted trap tests, and propagated error
allowances to leave uncertain pixels unresolved. These measures are preview
guards, not a validated interval-arithmetic certificate. GPU and CPU images
can differ near boundaries or when their effective work budgets differ.

Before evaluating children in the capture/escape search, the shader bounds
the vertically admissible digit interval and preserves the alphabet's parity.
The bound includes parameter-cell variation, the current orbit footprint,
and float32 uncertainty, with one extra alphabet digit at each end of the
interval. Work counts evaluated candidates after this pruning, including the
safety-margin digits. A required fixed first digit is still evaluated before
the tail search. The GPU's wider interval can retain more candidates than the
CPU interval, so equal work limits need not reach the same depth or outcome.

The preview reports requested and effective limits, actual raster dimensions,
arithmetic, context information, and coordinate guard values. Hybrid status
also identifies the requested backend, active backend, rendering phase,
fallback reason, worker count, and timing where available.

Cell metadata records `parameter_sample_type`, `parameter_radius_world`,
`parameter_layer_ids`, and `parameter_cell_model: "complex-taylor-disk"`.
`boundary_work_scope` identifies the per-layer or per-piece budget.
`search_passes`, `capture_search_passes`, `preview_work_weight`,
`weighted_search_passes`, and
`preview_pixel_budget` record the resolution reduction used to keep a
many-layer preview bounded. The work weight is the larger of one and the
largest active alphabet size divided by eight. The weighted pass count
includes both coverage and separate center-capture searches. The pixel
budget is the smaller of 120,000 and 480,000 divided by that weighted count.
This limits preview cost as the alphabet and active selections grow. CPU
refinement retains full output resolution. This sample budget
is separate from the digit-evaluation work cap of each search.
Piece metadata names the occupied/uncertain attachments, bit encoding, and
`raster_halo`, so diagnostic readback can reconstruct the same outlines.
The GPU's propagated float32 uncertainty is distinct from the geometric
parameter radius and from the Taylor remainder. A shader fixture can request
zero parameter radius to compare selected-point behavior explicitly.

Capture metadata records `capture_sample_type: "pixel-center"`,
`capture_arithmetic: "padded-binary32"`, the minimum-depth convention,
`capture_search: "iterative-deepening-with-independent-work-budget"`,
`capture_style`, `capture_modulo`, `requested.capture_depth`,
`effective.capture_depth`, and `effective.capture_work`.
Independent piece masks do not repeat the whole-attractor minimum search.
The existing breadth-first half-difference search already supplies ordered
capture and adds no separate minimum-search pass. Parameter diagnostics and
each selected parameter layer account for their own center searches in both
display styles. `readLayers().captureDepths` exposes the sampled field
separately from coverage bytes for GPU/CPU QA.

To measure the added CPU search work separately from coverage, run
`node tools/bench/finite_capture_bench.mjs` (optionally `--width=96`). The
benchmark reuses the same prepared geometry, performs warmups, and reports
candidate-map counts and median times for the parameter aggregates, a fixed
digit, and a larger alphabet. Its capture limit is 37 and escape depth is
12. Context preparation is excluded from both timed paths. Operation counts
describe the recorded grid and search settings; timings are local CPU
measurements, not browser-frame or physical-GPU guarantees.

## Attractor coordinates and numerical records

All rendering paths use the existing convention
$f_t(z)=t+z/c$, so the first prefix digit is unscaled. Prefix sums and histogram
iterations and boundary rendering depict the full original $E(c,n)$.
The advanced survival diagnostic starts from the displayed original coordinate
and uses enclosure pruning without trap acceptance. The difference layer shows
$\tfrac12E(c,2n-1)$ and tests twice the displayed point.

GPU selection does not change those coordinates or turn marked-point finite survival
into membership. It also does not change the selected $\mathcal M_n$ search's
word, requested resource limits, or arithmetic. Binary64 remains floating
point; the tolerance bounds the series-tail target rather than every rounding
error. See [implementation conventions](IMPLEMENTATION_NOTES.md) and
[numerical interpretation](RESPONSIBLE_USE.md).

## Why WebGPU is deferred

As checked on 17 September 2026, WGSL's concrete floating-point types are
`f32` and optional `f16`; there is no runtime `f64` type. Its binary64
`AbstractFloat` supports shader-creation evaluation and type checking, not
double-precision runtime search. A direct shader-language port would therefore
leave the binary64 refinement requirement in place. See the W3C's dated
[floating-point types](https://www.w3.org/TR/2026/CRD-WGSL-20260915/#floating-point-types)
and [abstract numeric types](https://www.w3.org/TR/2026/CRD-WGSL-20260915/#abstract-numeric-types).

WebGPU is available in major browser families, but browser, operating system,
and hardware conditions still determine availability. Google's
[platform summary](https://web.dev/blog/webgpu-supported-major-browsers#browser_and_os_availability)
documents those distinctions. WebGL 2 is the current compatibility choice for
one bounded preview path with CPU fallback; this is a project decision, not
a claim that WebGPU is generally unavailable.

A future WebGPU compute implementation could justify its additional code and
validation through measured improvements in scheduling, workload size, or
interaction latency. It would still need an explicit arithmetic contract,
resource-limit semantics, context/device-loss recovery, and reference checks.

## Validation and performance interpretation

The repository contains raster/worker regressions and browser GPU fixtures.
Run the [documented validation commands](VALIDATION.md) for the final source
commit; historical UI counts do not establish coverage of a later shader.
Useful acceptance cases include budget exhaustion, refused precision ranges,
context loss, worker failure, cancellation during navigation, palette parity,
and the full-coordinate fixture $E(2i,4)$ with support
$[-4,4]\times[-2,2]$.

No physical-device speedup is claimed here. Shader submission duration is
host-side timing and possible driver backpressure, not GPU execution time.
Browser tests using a software GL implementation establish behavior in that
environment, not hardware throughput. A performance comparison must record
device/driver, browser, viewport, arithmetic, requested and effective budgets,
time to first preview, and time to full refinement separately.
