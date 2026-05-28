# Browser QA Checklist

Use this checklist before internal review or release-candidate review. Results
are recorded after a real browser session is completed.

## Environment

- Local server: `python3 -m http.server 8765`.
- Browser: Google Chrome via Chrome DevTools Protocol / normal browser session.
- Commit: `eb1fe5b393060e2873101631e0aa6a04d64e7271`.
- Branch: `upgrade/v0.2-renderers-and-certificates`.

## Manual Checks

| Check | Result |
|---|---|
| Initial load has no console errors. | Passed |
| E4 thesis example loads and renders cleanly. | Passed |
| E5 thesis example loads and renders cleanly. | Passed |
| Prefix mode renders cleanly. | Passed |
| Histogram mode is deterministic for a fixed seed. | Passed |
| Certificate/status rendering still works. | Passed |
| Share URL preserves renderer, depth, seed, layers, opacities, and `c`. | Passed |
| Save image works. | Passed |
| Copy certificate JSON works. | Passed |
| Download certificate JSON works. | Passed |
| No prototype or talk UI leaked into the public explorer. | Passed |

## Notes

- QA was performed against the feature branch before merge to `main`.
- Screenshots were not committed; keep screenshots untracked unless they are
  explicitly approved as curated review evidence.
- Browser QA passing supports release-candidate review. Pages must still be
  verified from `main` before publishing a release.
