# Validation Notes

Run the core validation suite from the repository root:

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
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
- default `k_max = 37` consistency;
- absence of local filesystem links;
- browser DOM-reference consistency.

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
- drag the parameter locator and exercise copy/download of certificate JSON;
- run the Wolfram Language, MATLAB, and Maple reference files in their native runtimes if those runtimes are available.
