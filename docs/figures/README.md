# README figures

These figures are committed documentation assets. They can be reproduced from
the repository with Node.js 22 or later and Python 3.10 or later, using only
their standard libraries. No plotting package or browser is needed.

From the repository root:

```bash
node tools/docs/generate_attractor_examples.mjs
python tools/docs/generate_parameter_lens.py
```

To verify the committed files without changing them:

```bash
node tools/docs/generate_attractor_examples.mjs --check
python tools/docs/generate_parameter_lens.py --check
```

Both checks are also included in `npm test` and continuous integration. The
companion JSON files record the parameters and construction details. SVG text
and descriptions remain available to assistive tools, and the main README
includes alternative text and nearby explanations.

## Original attractor examples

![Three original collinear attractors, colored by first-level piece.](attractor-examples.svg)

[Generator](../../tools/docs/generate_attractor_examples.mjs) ·
[Parameters and provenance](attractor-examples.json)

| Panel | Expanding parameter | Arity | Prefix depth | Prefix count |
|---|---|---:|---:|---:|
| Four-piece overlap preset | $(3+i\sqrt{11})/2$ | 4 | 8 | 65,536 |
| Five-piece plane-filling preset | $1+2i$ | 5 | 8 | 390,625 |
| Sparse three-piece example | $3+3i$ | 3 | 8 | 6,561 |

The generator uses the explorer's shared prefix, tail, support-bound, and
palette modules. Every panel enumerates the complete prefix level

$$
\sum_{j=0}^{7}t_j c^{-j},\qquad t_j\in A_n.
$$

The first digit is unscaled. An independent constant-digit fixed-point check
guards this coordinate convention. Colors identify the outermost digit, and
the axes have equal units within each panel. Each panel is fitted separately,
so the three images do not share a common magnification.

The plotted disks use the geometric tail radius or a minimum display size,
whichever is larger. This makes the sparse example visible at README size;
both radii are recorded in the metadata. Antialiasing, finite prefixes, and
color compositing affect the picture. The figures do not establish overlap,
connectedness, interior, or a search verdict. The first two panel labels use
the names of the existing presets.

The metadata includes a fully encoded `interactive_url` for each panel. Those
links restore the corresponding parameter, original-attractor scene, colors,
and horizontal coordinate span using the default sharp boundary renderer.
The linked view requests automatic base depth and zoom adaptation; its
effective depth depends on the viewport and raster resolution. GPU previews
have separate depth/work caps before automatic binary64 CPU refinement.
The static illustrations retain their complete depth-eight prefix construction.
Use the generators to reproduce the committed figures exactly.

The SVG embeds its three raster plots as PNG data, with vector titles, axes,
and legends. It has no external image or font dependencies. The JSON records
source-module and image hashes so a figure can be traced to its inputs.

## Parameter lens

![The n=3 canonical parameter lens, with strict boundaries and an in-lens example.](parameter-lens.svg)

[Generator](../../tools/docs/generate_parameter_lens.py) ·
[Parameters and provenance](parameter-lens.json)

Writing $c=x+iy$, the diagram shows

$$
1 < x^2+y^2 < 5-2|x|,\qquad y\ne0.
$$

The upper inequality is the intersection of the open disks centered at
$(-1,0)$ and $(1,0)$, both with radius $\sqrt{6}$. The closed unit disk and
the real axis are excluded. The marker $c=0.5+1.1i$ satisfies all three strict
conditions. Circular arcs describe the boundaries directly in the SVG;
the region is not estimated from a search raster.

This illustrates the canonical parameter lens for $n=3$. It is not a diagram
of the connectedness locus or the finite-capture layers. The coordinates use
the expanding parameter $c$, as in the reference packages.

## Rendering diagram

The hybrid rendering diagram is maintained directly in the root
[README](../../README.md#rendering-engines) as Mermaid source. It shows the
separate image and selected-reference-search paths, GPU-to-CPU refinement,
and the progressive CPU fallback. It does not require a generated asset.
