# Browser QA Checklist

Use this checklist before internal review or release-candidate review. Results
are pending until a real browser session is completed.

## Environment

- Local server: pending.
- Browser and version: pending.
- Commit: pending.

## Manual Checks

| Check | Result |
|---|---|
| Initial load has no console errors. | Pending |
| E4 thesis example loads and renders cleanly. | Pending |
| E5 thesis example loads and renders cleanly. | Pending |
| Prefix mode renders cleanly. | Pending |
| Histogram mode is deterministic for a fixed seed. | Pending |
| Certificate/status rendering still works. | Pending |
| Share URL preserves renderer, depth, seed, layers, opacities, and `c`. | Pending |
| Save image works. | Pending |
| Copy certificate JSON works. | Pending |
| Download certificate JSON works. | Pending |
| No prototype or talk UI leaked into the public explorer. | Pending |

## Notes

- Keep screenshots untracked unless they are explicitly approved as curated
  review evidence.
- Browser QA passing is required before this branch can move beyond internal
  review status.
