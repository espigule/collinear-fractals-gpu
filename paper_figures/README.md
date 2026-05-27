# Paper Figures

This directory records reproducible figure metadata without committing large
render dumps. The alpha workflow is metadata-first:

1. Add or update an example in `examples/`.
2. Add figure metadata to `figure_metadata.json`.
3. Run `python3 paper_figures/make_all_figures.py` to list planned jobs.
4. Write generated assets to `paper_figures/output/`, which is ignored.
5. Promote only small curated assets to `gallery/` with matching metadata.

Figure metadata should record the visual renderer (`prefix-cylinder`,
`seeded-histogram`, or explicit status renderer), visual depth or sample count,
seed when applicable, pixel radius, software version, and proof status.

Figures are illustrative and reproducibility artifacts. The theorem-level
proofs remain in the papers and thesis.
