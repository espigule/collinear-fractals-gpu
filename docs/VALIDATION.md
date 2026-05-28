# Validation Notes

Run the core validation suite from the repository root:

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
node qa/render_smoke_tests.js
node qa/kernel_equivalence_tests.js
node tools/bench/render_metadata_bench.js
cd javascript && npm test
cd ../python && python3 -m unittest test_collinear.py
cd ../swift && swift test
cd .. && python3 tools/validate_bundle.py
```

The automated tests cover:

- canonical coordinates;
- lens membership;
- corrected enclosure truncation and tail metadata;
- alphabet parity for both even and odd alphabets;
- in-lens `Interior`;
- `Exterior`;
- off-lens `Interior-offLens`;
- deterministic prefix-cylinder and seeded-histogram visual-renderer metadata;
- reference-equivalent finite-search kernel behavior for representative
  small and larger arities;
- default `k_max = 37` consistency;
- absence of local filesystem links;
- browser DOM-reference consistency;
- formatting hygiene for key Markdown, YAML, CFF, and gitignore files;
- absence of fake archival DOI placeholders and overclaiming release language.
- Pages staging policy, including rejection of root deployment;
- representative generated artifact ignore rules;
- metadata-only benchmark output without generated render dumps;
- curated example index and metadata presence;
- JSON validity for schemas, examples, gallery, and figure metadata;
- large generated image policy outside curated example/gallery paths.

The Wolfram Language, MATLAB, and Maple implementations are included as reference ports with matching formulas and defaults. They were not executed in this environment.


Additional static checks used in the QA pass:

```bash
# DOM-id consistency and local asset existence were checked with a small Python script.
# JavaScript package publish contents were inspected with:
cd javascript && npm pack --dry-run
```

Manual checks still recommended before tagging:

- open `index.html` in Chrome, Safari, or Firefox;
- verify that the default state renders and reports `Interior`;
- verify that original-attractor prefix and histogram modes render cleanly;
- verify that survival/status rendering is available only as an explicit
  renderer mode;
- drag the parameter locator and exercise copy/download of certificate JSON;
- exercise Share View, Copy Embed, Save Image, presets, undo/redo, panel focus,
  palette controls, and About/Cite and Support dialogs;
- run the Wolfram Language, MATLAB, and Maple reference files in their native runtimes if those runtimes are available.
