# Collinear Fractals GPU

**Companion software for collinear fractals, finite capture, and restricted polynomial roots.**

Version: **0.1.0-alpha**  
Author: **Bernat Espigulé-Pons**

This repository contains a browser-based research explorer and multi-language reference implementations for the canonical-coordinate inverse search associated with the collinear connectedness loci \(\mathcal M_n\). The current public release is a clean alpha intended for GitHub publication, reproducible exploration, and independent verification of finite inverse words.

## What is included

| Path | Contents |
|---|---|
| `index.html`, `index.css`, `explorer.js` | Single-page browser explorer. No build step required. |
| `javascript/` | Node.js reference package and tests. |
| `python/` | Pure-Python reference package and tests. |
| `swift/` | Swift Package Manager implementation and tests. |
| `mathematica/` | Wolfram Language package. |
| `matlab/` | MATLAB static-class implementation. |
| `maple/` | Maple module implementation. |
| `docs/` | Implementation, validation, and QA notes. |
| `qa/` | Browser-engine prefix smoke tests. |
| `tools/` | Dependency-free static bundle validator. |

The browser explorer is currently a **Canvas/CPU reference implementation**. The project keeps the historical `GPU` name because it is the companion repository for the broader GPU-assisted exploration programme; WebGL/WebGPU acceleration can be added without changing the mathematical API.

## Mathematical scope

For the collinear alphabet

\[
A_m = \{-m+1,-m+3,\ldots,m-1\},
\]

the explorer studies the marked-point condition

\[
2c \in E(c,2n-1),
\]

which encodes connectedness of the original \(n\)-ary collinear attractor \(E(c,n)\). The inverse search works in canonical coordinates, prunes by a canonical enclosure, and detects trap entry.

The repo deliberately distinguishes two trap-entry labels:

- `Interior`: trap hit inside the parameter lens \(X_n\setminus\mathbb R\), matching the theorem-level canonical trap framework.
- `Interior-offLens`: off-lens trap hit using the enabled off-lens rule. This is intentionally not merged with the in-lens label.

Other verdicts are:

- `Exterior`: enclosure escape or complete enclosure-admissible tree exhaustion.
- `Undetermined`: depth or node cap reached.

The default search depth is now

```text
k_max = 37
```

across the web explorer and the companion packages.

## Browser quick start

Open `index.html` directly in a modern browser, or serve the repository locally:

```bash
python3 -m http.server 8000
```

Then open the local server in your browser.

The left panel renders the parameter plane. The right panel renders the dynamical plane, the canonical trap, the canonical enclosure, and the inverse-search tree. The selected certificate can be copied or downloaded as JSON from the sidebar. The node cap `L_max` is a queue cap for the level-by-level inverse search. With the requested default `k_max = 37`, the Canvas preview uses an adaptive 2 px final resolution for responsiveness; the selected-parameter verdict and exported certificate still use the full selected search depth.

## Package tests

Run these from the repository root after cloning or downloading the bundle.

Browser engine smoke test:

```bash
node qa/explorer-prefix-smoke-test.js
```

JavaScript:

```bash
cd javascript
npm test
```

Python:

```bash
cd python
python3 -m unittest test_collinear.py
```

Swift:

```bash
cd swift
swift test
```

The Wolfram Language, MATLAB, and Maple packages are included as reference implementations with matching formulas and defaults. See `docs/QA_REPORT.md` for the exact validation scope and runtime limitations. Run `python3 tools/validate_bundle.py` before tagging a release.

## QA status

The release tree includes `docs/QA_REPORT.md`, `docs/VALIDATION.md`, and `RELEASE_CHECKLIST.md`. In this QA pass, JavaScript, Python, and Swift tests passed; browser automation, Wolfram Language, MATLAB, and Maple runtime tests are documented as manual/native-runtime checks for the next pass.

## Implementation upgrades in this alpha

This alpha applies the following publication-readiness fixes:

1. `Interior` and `Interior-offLens` are distinct verdicts.
2. Alphabet truncation now uses the parity of \(A_m\), not a hard-coded even digit assumption.
3. Enclosure truncation depth now targets
   \[
   \rho^{-M}/(\rho-1) \leq \varepsilon
   \]
   when the safety cap allows it, and exposes cap/tail metadata.
4. Local absolute filesystem links were removed.
5. Source code is marked Apache-2.0; documentation and non-code materials are CC BY 4.0 unless otherwise stated.
6. `CITATION.cff`, `NOTICE`, `.gitignore`, and validation notes were added.
7. Swift was added as a first-class companion package.
8. Certificate JSON copy/download was made available in the browser explorer.
9. A release checklist and QA report were added.

## Citing

Use the metadata in `CITATION.cff`. A compact text citation is:

> Bernat Espigulé-Pons, *Collinear Fractals GPU: companion software for collinear fractals, finite capture, and restricted polynomial roots*, version 0.1.0-alpha, 2026.

## License

Source code is distributed under the **Apache License 2.0**; see `LICENSE`.

Documentation, README files, examples, and non-code repository materials are distributed under **Creative Commons Attribution 4.0 International** unless otherwise stated; see `LICENSE-docs.md`.
