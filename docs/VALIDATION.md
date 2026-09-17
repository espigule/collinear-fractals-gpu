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
npm run site:stage
```

`npm run test:all` runs the first two commands together. If Python is available
only as `python3`, select it with `PYTHON=python3 npm test`.

| Command | Coverage |
|---|---|
| `npm test` | JavaScript syntax, static publication checks, JSON Schemas and data invariants, JavaScript/Python packages, browser-engine and renderer/kernel regressions, benchmark metadata. |
| `npm run test:browser` | Real Chromium interactions through Playwright. |
| `npm run site:stage` | Builds the allowlisted static Pages artifact in `site/`. |
| `swift test --package-path swift --jobs 2` | Swift package tests, when Swift is installed. |

The Wolfram Language, MATLAB, and Maple ports need native runtime execution
before runtime-validation claims can be made for them. Inspect their package
READMEs for examples. Record a missing runtime as “not run”.

## Numerical coverage

The regression suite targets meaningful failure modes:

- consistent $f_t(z)=t+z/c$ coordinates in prefix and histogram rendering;
- finite-value, domain, arity, and search-limit validation;
- parity-preserving digit intervals for both alphabet parities;
- enclosure truncation, complete tails at the cap, and overflow handling;
- all four verdicts and explicit termination reasons;
- depth-zero searches and conservative frontier-cap handling;
- reference/fast-kernel consistency and executable package comparisons;
- deterministic sampling and bounded renderer workloads;
- share-state parsing and reproducible settings.

Schema validation checks configured arity, difference-alphabet size, matching
parameters and share links, certificate shape, and valid inverse digits. It
verifies data structure and consistency, not the proof behind a search result.
Performance measurements are environment-dependent; a benchmark does not
establish a universal speed guarantee.

## Manual review

Automation complements a visual review of the final Pages artifact:

1. Open the served explorer on desktop and a narrow viewport. Check labels,
   focus visibility, dialogs, and both canvases.
2. Compare the $E(c,4)$ and $E(c,5)$ presets in prefix, histogram, and survival
   modes. A picture can be useful while its selected search is `Undetermined`.
3. Move the parameter locator and confirm the displayed parameter, search
   result, and exported JSON agree. Check a reciprocal input and a real input.
4. Reload a shared URL, exercise undo/redo, and confirm layers and limits return.
5. Export an image and search JSON. Reproduce a simple interior, exterior, and
   off-lens case in a reference package.
6. Check Safari and Firefox when available; Chromium automation does not
   establish cross-browser compatibility.

Record the revision, runtime/browser versions, commands and exit statuses,
material observations, and remaining limitations. Keep generated screenshots,
traces, and local runtime output outside the source history unless selected as
curated review evidence.
