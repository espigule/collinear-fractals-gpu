# September 2026 upgrade review

This review covers the changes developed on `upgrade/professional-stability-2026-09`
from main commit `cba0e094870f1a2690d73761d86a0b790a5a453a`.
The release identifier remains `0.2.0-alpha`; these changes are an unreleased
candidate and do not establish a new stable release or a mathematical proof system.

## Scientific corrections

The prefix and histogram renderers now apply `f_t(z) = t + z/c`. Previously they
applied the translation before division, drawing `E(c,n)/c` instead of `E(c,n)`.
Finite prefixes begin at `c^0`; the corresponding tail bound is
`(n-1) * |c|^(1-depth) / (|c|-1)`. First-level colors identify the outer map.
The dynamical difference set remains explicitly displayed at half scale.

Invalid numeric input can no longer fall through to `Exterior`. Search outputs
separate domain errors, arithmetic range failures, enclosure escape, trap entry,
tree exhaustion, depth exhaustion, and frontier-cap exhaustion. Near-real digit
bounds are clipped before integer conversion, zero-depth searches are supported,
and tail-depth selection avoids an underflow-prone product.

The original-attractor survival diagnostic now draws points not eliminated by
the finite search. It does not treat such survival as proof of membership or of
boundary membership. Off-lens records preserve the separate exploratory rule.
The mislabeled off-lens preset now uses the tested n=3 case with word `[4, 0]`.

## Interaction and implementation

The browser imports the shared numerical reference, search-record builder, and
validated state codec. A scalar typed-array kernel computes pixel verdicts with
reusable queues; the selected parameter retains the detailed tree and word.
Dynamical bounds, selected searches, and visual overlays are reused where their
inputs remain unchanged. Progressive rendering yields within rows, and hidden
panels do not render at zero dimensions.

Share links retain full numeric precision, custom colors, all layer flags,
viewports, panel focus, tolerance, and rendering settings. Missing or invalid
fields preserve defaults, and browser workloads are bounded. Preset requests
cannot overwrite newer user interactions. Restoring plot guides during refinement
no longer erases already-refined rows.

The interface provides exact parameter fields, keyboard/pointer/touch controls,
collapsible control groups, stacked mobile plots, unobstructed legends, visible
rendering status, and dialogs with contained/restored focus. It uses local assets
and system fonts. PNG export waits for completed plots and includes parameter,
search, and plane captions; JSON records retain replay and viewport metadata.

## Executed local validation

Environment: Linux x64, Node.js 24.19.0, Chromium 153.0.8010.0 through
Playwright 1.62.1. Chromium was supplied locally for this run; CI installs the
browser pinned by Playwright. The same staged public assets are used by browser
checks and Pages deployment.

| Check | Result |
| --- | --- |
| `npm run test:all` | Passed |
| Chromium desktop/mobile scenarios | 16/16 passed |
| Core regression groups | 16/16 passed |
| State-codec regression groups | 9/9 passed |
| Fast versus detailed search | 1,000 seeded cases agree |
| Browser core versus JavaScript package | 469 expanding-parameter cases agree |
| Fixed-context search versus independent Cartesian oracle | 100 cases agree |
| Python discovery | 17 tests pass, including 136 JavaScript/Python comparisons |
| Curated record and preset replay | 15 checks pass |
| JSON Schemas, syntax, local assets, bundle and formatting | Passed |
| Python wheel build/import and JavaScript package contents | Passed |
| Desktop, original-attractor example, and mobile visual inspection | Passed |
| Dependency audit | No reported npm vulnerabilities in this run |

These comparisons test implementation consistency and selected mathematical
invariants; they do not supply outward-rounded error bounds for arbitrary inputs.

The reproducible benchmark is `node tools/bench/search_bench.mjs`. In a
10,000-search run, both kernels admitted 9,075,000 nodes with result checksum
405771085. Detailed search took 209.7 ms and the fast path 138.0 ms, approximately
1.52 times faster in that run. Timing is informational, depends on hardware and
runtime, and is not a pass/fail threshold or a whole-browser speed guarantee.

## Release controls and remaining limits

GitHub Actions shares one validation workflow between PRs and Pages. A main-branch
Pages deployment requires the complete core, browser, schema, and Swift gate to
pass first. Public staging includes only selected assets and excludes development
artifacts. Action revisions and QA dependencies are pinned.

The local environment has no Swift, Wolfram Language, MATLAB/Octave, or Maple
runtime. Swift has a GitHub Actions job; its result must be checked on the actual
candidate commit. The three CAS regression files require their native runtimes.
Two Swift helpers now throw on invalid arguments; their documented callers must
use `try`.

The application remains a Canvas/CPU explorer. A GPU backend, interval-verified
proof checker, completed boundary atlas, and batch figure renderer are not part of
this upgrade. Search JSON is binary64 numerical evidence, with explicit provenance
and limitations. Review `CHANGELOG.md` before reproducing images from older code:
the corrected attractor coordinates intentionally change their geometry.
