# Validation

Run checks on the exact revision that will be reviewed or deployed. Historical
QA reports describe their recorded commits only.

## Setup

Use Node.js 22 or later and Python 3.11 or later. Browser rendering has no
application build or runtime-package installation step. The following
dependencies are development tools for automated QA:

```bash
npm ci
python3 -m pip install -r requirements-qa.txt
npx playwright install chromium
```

On a fresh Linux CI image, `npx playwright install --with-deps chromium`
installs the browser's operating-system dependencies as well.

## Standard commands

From the repository root:

```bash
npm test
npm run test:browser
npm run test:gpu
npm run site:stage
```

`npm run test:all` runs the first three commands together. If Python is available
only as `python3`, select it with `PYTHON=python3 npm test`.

| Command | Coverage |
|---|---|
| `npm test` | JavaScript syntax, static publication checks, JSON Schemas and data invariants, JavaScript/Python packages, numerical/rendering regressions, raster-tile and worker-protocol tests, share/legacy migration, benchmark metadata, and staging integrity. |
| `npm run test:browser` | Desktop and mobile-viewport Chromium interactions through Playwright, including state, geometry, navigation, and exports. |
| `npm run test:gpu` | Production WebGL 2 shaders and hybrid integration in software-rendered Chromium, native module workers, context loss, numerical guards, and explicit WebGL-disabled CPU fallback. |
| `npm run site:stage` | Builds the allowlisted static Pages artifact in `site/`. |
| `swift test --package-path swift --jobs 2` | Swift package tests, when Swift is installed. |

The Wolfram Language, MATLAB, and Maple ports need native runtime execution
before runtime-validation claims can be made for them. Inspect their package
READMEs for examples. Record a missing runtime as “not run”.

## Numerical coverage

The regression suite targets meaningful failure modes:

- consistent $f_t(z)=t+z/c$ coordinates in boundary, prefix, and histogram rendering;
- finite-value, domain, arity, and search-limit validation;
- parity-preserving digit intervals for both alphabet parities;
- enclosure truncation, complete tails at the cap, and overflow handling;
- all four verdicts and explicit termination reasons;
- depth-zero searches and conservative frontier-cap handling;
- reference/fast-kernel consistency and executable package comparisons;
- separate geometric coverage and pixel-center minimum-capture fields,
  including finite-survivor siblings preceding shorter capture witnesses;
- strict canonical-only capture in current browser searches, with historical
  off-lens replay explicitly distinguished;
- deterministic sampling and bounded renderer workloads;
- share-state parsing, backend preference, canonical `mn0`/`mn1` modes, `rn` compatibility, and legacy-link precedence;
- tiled raster agreement at full-frame pixel centers and correct full/half attractor scales;
- worker cancellation, independent panels, malformed/stale replies, startup/runtime failure, and timeout recovery.

Schema validation checks configured arity, difference-alphabet size, matching
parameters and share links, certificate shape, and valid inverse digits. It
verifies data structure and consistency, not the proof behind a search result.
Performance measurements are environment-dependent; a benchmark does not
establish a universal speed guarantee.

## Hybrid rendering coverage

`npm run test:gpu` uses `playwright.gpu.config.cjs` and a separate staged site
on port 4174. It loads production rendering modules, shaders, and worker entry
points from that artifact. Its WebGL projects use ANGLE/SwiftShader on desktop
and mobile viewports; its fallback project disables native WebGL. These runs
exercise browser graphics APIs without claiming physical GPU performance.

The GPU suite checks known numerical fixtures and independent CPU pixel grids,
full original-attractor orientation, palette compositing, resource/precision
guards, context loss and restoration, backend-state preservation, export
metadata, actual worker refinement, and main-thread recovery after worker
failure. A GPU preview remains approximate: checks compare declared outcomes
and effective budgets rather than assuming every GPU pixel equals a
full-budget binary64 result.

For a focused investigation, select a project while retaining the same staged
production assets:

```bash
npm run test:gpu -- --project=webgl-swiftshader
npm run test:gpu -- --project=webgl-swiftshader-mobile
npm run test:gpu -- --project=webgl-disabled-fallback
```

The normal publication gate still runs the complete suite. General browser
reports are written to `artifacts/qa/report/`; GPU reports are written to
`artifacts/qa/gpu/report/`. Failure screenshots and traces are retained in the
corresponding `results/` directories, and CI preserves browser failure
evidence. These generated files remain outside source history.

Backend status separates the requested preference from the actual executor.
Validate `auto` through completed binary64 refinement, `gpu` through its
explicit bounded-preview completion, and `cpu` through worker completion or
disclosed main-thread fallback. The selected search JSON must retain its
binary64 arithmetic and full requested limits in every case. See
[rendering architecture](RENDERING_ARCHITECTURE.md) for the contract.

## Historical hybrid QA checkpoint — 17 September 2026

The frozen hybrid working tree based on
`210547081a9621470817177ad209f831e719511f` passed the following local gates.
The extension was still awaiting its publication commit at this checkpoint;
the final CI run and deployment manifest identify the published revision.

| Gate | Confirmed result |
|---|---|
| `npm test` | Passed, including the new 18 raster/worker regression groups: 7 numerical tile/worker-wire groups and 11 worker-pool lifecycle/failure groups. State/backend, legacy migration, schema, reference-package, and staging checks also passed. |
| `npm run test:browser` | 44 desktop/mobile Chromium checks passed in 2.1 minutes. |
| `npm run test:gpu` | 20 checks passed in 52.0 seconds: 9 WebGL cases on each of desktop/mobile SwiftShader projects, plus 2 forced-WebGL-disabled fallback cases. |

The GPU run compiled the actual production GLSL and read classifications
through Chromium's native WebGL APIs using software graphics. Each WebGL
profile checked 20 static fixtures alongside 13 pixel grids. The grids covered
2,180 pixels and 3,054 compared numerical channels, with no opposed decisive
CPU/GPU outcomes.
Classification-code checks were exact; palette/display comparisons allowed
one byte of quantization difference. Native module workers matched CPU tile
bytes and respected panel cancellation. Context-loss recovery, worker failure
to main-thread fallback, disabled-WebGL fallback, requested/effective GPU
limits, and independent selected-record metadata were exercised.

This checkpoint establishes behavior in the tested Chromium environments,
not physical GPU throughput, cross-browser coverage, or interval correctness.
Swift and the other native-language runtime gates remain separate; their
results are not implied by these browser counts. The earlier
[release QA report](QA_REPORT.md) and [upgrade review](UPGRADE_REVIEW_2026-09.md)
remain historical records of their own revisions.

## Parameter-cell and piece-boundary validation — 19 September 2026

The current extension changes numerical raster paths and multi-layer
composition. The earlier hybrid counts and the 18 September sharp-boundary
checks do not validate this later source. In particular, the prior parameter
raster tested pixel centers; its zero-radius fixtures could not establish
coverage of thin components between centers. Run all three current gates
against the final commit. Acceptance checks should cover:

- original-alphabet capture only in $|c|^2+2|\mathrm{Re}\,c|<n$, including
  even alphabets, and no off-lens trap acceptance;
- exhaustive escape, finite-depth survival, and work/stack exhaustion as
  distinct outcomes;
- full $E(c,n)$ coordinates, independent first-level piece coverage, and black
  boundaries that remain visible within overlaps and across worker tile seams;
- every $t\in D_n$ fixed first-digit subset with an $A_n$ tail, and the
  original/complementary unions for $\mathcal M_n^0$ and $\mathcal M_n^1$,
  with no depth-zero capture bypassing a required first step;
- a geometric pixel footprint for dynamical coverage and a varying-$c$
  parameter cell for each parameter layer, with derivative/remainder
  propagation and pruning bounds checked against explicit orbit samples;
- reciprocal cell coverage and unresolved cells crossing the unit circle;
- whole-cell capture within the original-alphabet lens, including even
  alphabets, and retained finite escape coverage outside it;
- multiple aggregate and individual-digit selections, deterministic overlap
  composition, empty selections, and digit pruning when $n$ changes;
- automatic depth, explicit base depth, zoom/resolution adaptation, and
  requested versus effective GPU work/depth limits;
- `pl`/`pd` and `bdepth`/`badapt` sharing and history, canonical `mn0`/`mn1`
  links, old `pm=rn` and two-layer `pm=compare` migration, and forced-legacy
  query precedence;
- unchanged binary64 selected $\mathcal M_n$ records when visual depth,
  renderer, or backend changes.

The pure codec and legacy-import tests can be run separately with
`node --test qa/state-regression-tests.mjs qa/legacy-state-regression-tests.mjs`.
They validate state behavior; they do not substitute for native shader,
worker, and final browser integration checks.

## Manual review

Automation complements a visual review of the final Pages artifact:

1. Open the served explorer on desktop and a narrow viewport. Check labels,
   focus visibility, dialogs, and both canvases.
2. Compare the $E(c,4)$ and $E(c,5)$ presets in sharp boundary, prefix,
   histogram, and survival modes. Zoom into boundary detail, toggle adaptation,
   and inspect effective depth. Confirm every visible first-level piece has
   its own black boundary, including interfaces inside an overlap. A picture
   can be useful while its selected search is `Undetermined`.
3. Move the parameter locator and confirm the displayed parameter, search
   result, and exported JSON agree. Check a reciprocal input and a real input.
4. Reload a shared URL, exercise undo/redo, and confirm layers and limits return.
5. Export an image and search JSON. Reproduce a simple interior and exterior
   case in a reference package with the same capture policy. A historical
   off-lens record must be identified as historical replay; it is not a
   current accepted capture.
6. Change rendering backends on the same saved view. Inspect the active backend,
   preview limits, refinement completion, and exported rendering metadata.
   Check a precision-guarded deep zoom and CPU fallback with WebGL disabled.
7. Check Safari and Firefox when available; Chromium automation does not
   establish cross-browser compatibility.
8. Show $\mathcal M_n$, $\mathcal M_n^0$, and $\mathcal M_n^1$ together, then
   toggle individual digits. Inspect fine structure at several zoom levels;
   coverage should follow the cells rather than a dust of center samples.
   Confirm the set definitions, retained selections, and exported auxiliary
   results, while the selected connectedness record keeps its own limits.
9. Disable all parameter layers, restore a subset through history, and change
   $n$ while some digits are selected. Check that Compare and the digit-group
   controls affect exactly the groups described by their labels.
10. In **Colors & finite capture**, compare **Finite-capture layers** with
    **Set colors** and vary the depth cycle. Capture bands should preserve
    set/piece hue and every black piece contour. Check both dynamical scenes,
    all three parameter aggregates, and a fixed-digit subset. Confirm the
    legend distinguishes a known minimum, a witness without an established
    minimum, and finite escape coverage.
11. At $E(2i,5)$, inspect depth-zero capture in the central trap and later
    capture in its edge strips. Toggle first-level pieces: the whole-set
    capture field must not shift by one. In $\mathcal M_n^0$, confirm the
    strict original-lens region remains depth zero.

Record the revision, runtime/browser versions, commands and exit statuses,
material observations, and remaining limitations. Keep generated screenshots,
traces, and local runtime output outside the source history unless selected as
curated review evidence.

## Minimum-capture correction — 19 September 2026

The prior cell-coverage implementation stopped at the first depth-first
survivor or capture witness. Such a witness need not have minimum depth, and
an earlier finite-survivor branch can hide a capture in another branch.
First-piece geometry also cannot supply the whole-attractor depth-zero
field. The minimum-capture correction therefore has its own regression
scope; the earlier 62 browser / 34 GPU checks do not validate this revision.

Final-commit checks must establish:

- capture-only search completes every shallower depth before assigning a
  minimum, and one work budget covers all iterative-deepening passes;
- `captureDepths` and `layerCaptureDepths` are separate from coverage bytes,
  preserve the 255 unknown sentinel, survive real worker transfer, and are
  rejected when malformed;
- a known witness is preserved when minimum search exhausts its budget,
  without assigning that witness's depth as a minimum;
- every aggregate and first-digit subset has a sampled capture field using
  its correct first/tail alphabets, while finite cell coverage remains intact;
- the $E(2i,5)$ points $0$, $5.1$, and $2.55i$ have numerical minima 0, 1,
  and 2 respectively; the latter two are independently checked with words
  $[4]$ and $[0,-4]$ and exclusion of shallower capture;
- unrestricted $E(c,n)$ depth zero does not depend on piece-color visibility,
  and $\mathcal M_n^0$ does not invent positive strata inside its strict lens;
- the old false-positive off-lens fixture at $m=3$, $c=3+3i$,
  $z=1/4+i/20$ is rejected by current canonical-only rendering, including
  its half-difference display coordinate;
- production CPU/GPU palettes agree on minimum levels, unknown-witness
  solid color, finite-survivor pale color, cycle $q=1$, and overlapping
  pieces with black contours;
- `capture` and `q` roundtrip through URLs/history and exports disclose
  sampled-center capture independently of cell/footprint geometry;
- multi-layer GPU preview budgets include the added capture searches and
  still complete within their recorded work and resolution limits;
- committed capture diagrams regenerate byte for byte from production
  modules, with coordinate, digit-tail, and capture-depth fixture checks.

These checks establish the behavior of the implemented floating-point
searches and UI. They do not prove interval correctness or physical GPU
performance. Record actual commands and counts for the final commit rather
than carrying earlier results forward.
