# Rendering architecture

**Source review:** 18 September 2026. This document describes the hybrid
renderer in the working source; deployed behavior is identified separately
by the site's `deployment.json` and the validation result for that commit.

The default `auto` mode combines a bounded WebGL 2 preview with binary64 CPU
refinement at the requested settings. The visible parameter and dynamical
canvases remain Canvas 2D surfaces, so overlays, labels, image export, and
fallback rendering share one composition path.
The default original-attractor renderer is `boundary`: a capture-and-escape
raster with adaptive depth and first-level piece colors. Prefix and histogram
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
| [`attractor_membership.mjs`](../src/compute/attractor_membership.mjs) | Shared binary64 original-alphabet membership context, depth-first capture/escape search, complementary first digit, and adaptive depth calculation. |
| [`parameter_views.mjs`](../src/compute/parameter_views.mjs) | Keeps the full connectedness search separate from the marked-point views $\mathcal M_n^0$ and $\mathcal M_n^1$. |
| [`raster_jobs.mjs`](../src/compute/raster_jobs.mjs) | Validates numerical raster jobs and evaluates pixel positions with the binary64 kernels, adding a geometric footprint only for dynamical boundaries. Uses full-frame coordinates independently of tile boundaries. |
| [`raster_worker_pool.mjs`](../src/compute/raster_worker_pool.mjs), [`raster-worker.mjs`](../workers/raster-worker.mjs) | Schedules bounded tiles, transfers classification bytes, validates replies, and rejects stale or malformed work. |
| [`attractor_prefix.mjs`](../src/renderers/attractor_prefix.mjs), [`attractor_histogram.mjs`](../src/renderers/attractor_histogram.mjs) | Draw original-attractor approximations on CPU Canvas; choosing a GPU pixel backend does not move these overlays into a shader. |
| [`inverse_search_reference.mjs`](../src/compute/inverse_search_reference.mjs), [`certificate_builder.mjs`](../src/compute/certificate_builder.mjs) | Produce the selected detailed numerical search and export record independently of raster preview results. |

The worker pool's default tiles are 64 × 16 pixels. Only a bounded number of
tiles are in flight; the scheduler does not queue a full image's worth of
pending buffers. Cancelling a busy job terminates its worker because a
synchronous numerical tile cannot process a cancellation message mid-search.
Job identities also prevent delayed results from repainting a newer view.

Normal GPU rendering keeps classification and first-piece indices in separate
RGBA8 textures, then applies the palette in a second shader pass. The host copies the finished auxiliary
canvas before yielding because `preserveDrawingBuffer` is false. The explicit
`readClassification()` readback is a diagnostic for QA, not a per-frame
production step. The API used here is defined by the
[Khronos WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/).

## Sharp boundary and marked-point views

For the original alphabet $A_n$, the canonical trap is enabled only for
non-real expanding $c$ satisfying $|c|^2+2|\mathrm{Re}\,c|<n$. The same
condition and parity-correct digit handling apply to odd and even $n$.
This is separate from the larger difference-alphabet lens used by the
selected $\mathcal M_n$ search.

The shared original-membership search follows inverse branches depth first.
A strict trap hit gives numerical capture; an exhausted admissible tree gives
escape. Finding an admissible branch at the requested depth gives finite
survival. Reaching a work, stack, precision, or domain limit leaves the pixel
unresolved. Outside the original-alphabet lens there is no trap acceptance:
the displayed shape comes from enclosure-pruned finite survival and escape.
Neither depth survival nor capped work becomes a membership proof.

The original dynamical image passes a geometric pixel radius to this search.
Its footprint allows a visible pixel to intersect finite attractor coverage,
while capture comparisons require the footprint to fit inside the trap.
The parameter-plane views use zero geometric pixel radius: a pixel's screen
size does not expand the marked-point membership test. Floating-point error
guards remain separate from this geometric footprint.

| Parameter mode | Definition | First inverse digit |
|---|---|---|
| `mn` | $\mathcal M_n=\{c:2c\in E(c,2n-1)\}$ | Difference alphabet $A_{2n-1}$ throughout. |
| `mn0` | $\mathcal M_n^0=\{c:c\in E(c,n)\}$ | Original alphabet $A_n$ throughout. |
| `mn1` | $\mathcal M_n^1=\{c:c\in A_{n-1}+c^{-1}E(c,n)\}$ | Complementary alphabet $A_{n-1}$ once, followed by $A_n$. |
| `compare` | Compare $\mathcal M_n$ and $\mathcal M_n^0$. | Each search retains its own alphabet and limits. |

An explicit zero-depth API search returns an inconclusive zeroth outer
approximation. It has not tested a complementary digit and cannot capture
before that digit. In the interface, boundary depth zero means automatic
depth (16 or 12), rather than a zero-level search.

The historical URL/JSON mode `rn` normalizes to `mn0`; new state uses the
canonical name. The archive's first panel bit retains that meaning. No claim
that $\mathcal M_n^0\cup\mathcal M_n^1=\mathcal M_n$ is made.

`boundaryDepth=0` selects a base depth of 16 for $n=2$ and 12 otherwise.
An explicit value 1–100 replaces that base. With `adaptiveBoundary=true`,
the depth adds
`ceil(log2(max(1, referenceSpan / spanX * rasterWidth / 768)))`, then caps
the total at 100. Turning adaptation off uses the base directly. The reference
span comes from the fitted view; `spanX` is the current horizontal world width.
Thus magnification and raster resolution can increase detail without changing
the selected `kMax` or `LMax`.

The browser requests at most 20,000 digit evaluations per boundary point.
GPU preview limits can reduce both depth and work. JSON records the requested
base, adaptation setting, effective depth/work, pixel radius, first-level
coloring, and self-covering condition. The portable keys are `bdepth` and
`badapt`; the codec preserves zero as automatic instead of storing a
viewport-dependent effective depth.

## Bounded GPU preview

The following constants are implemented limits, not benchmark results:

| Resource | Current preview limit |
|---|---|
| Arity | `2 ≤ n ≤ 32`; larger browser arities use CPU rendering. |
| Connectedness/survival search depth | `min(requested kMax, 64)`. |
| Retained breadth-first frontier | `min(requested LMax, 32)`. |
| Breadth-first candidate work | At most 2,048 digit evaluations per pixel search. |
| Original boundary depth | At most 64; a deeper request ending at the shader cap remains unresolved. |
| Original boundary candidate work | At most 4,096 digit evaluations per point, bounded independently of the breadth-first frontier. |
| Parameter-plane enclosure series | 48 terms plus a tail allowance. Fixed dynamical enclosures are prepared in binary64 using the requested tolerance. |
| Raster size | At most 120,000 pixels; neither dimension exceeds 768 or the device's smaller limit. |
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

The preview reports requested and effective limits, actual raster dimensions,
arithmetic, context information, and coordinate guard values. Hybrid status
also identifies the requested backend, active backend, rendering phase,
fallback reason, worker count, and timing where available.

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
