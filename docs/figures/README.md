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

![Three original collinear attractors with first-level piece colors and black contours.](attractor-examples.svg)

[Generator](../../tools/docs/generate_attractor_examples.mjs) ·
[Parameters and provenance](attractor-examples.json)

| Panel | Expanding parameter | Arity | Escape depth |
|---|---|---:|---:|
| Four-piece overlap preset | $(3+i\sqrt{11})/2$ | 4 | 12 |
| Five-piece plane-filling preset | $1+2i$ | 5 | 12 |
| Overlapping rectangular pieces | $2i$ | 5 | 12 |

The generator uses the explorer's binary64 capture-and-escape raster,
support-bound, palette, and per-piece contour modules. It evaluates a
dynamical pixel footprint against $E(c,n)$ in the original convention
$f_t(z)=t+z/c$. The first digit is unscaled. Every first-level piece is
searched separately with that digit fixed, so the compositor retains
overlap information and can draw boundaries inside another piece.

Colors identify the outermost digit; overlapping fills average their colors.
Black contours mark a covered piece sample next to an explicitly absent
neighbor of the same piece. Unresolved work does not count as absence.
The axes have equal units within each panel. Each panel is fitted separately,
so the three images do not share a common magnification.

Finite-depth survival and pixel coverage determine the displayed
approximation; they do not establish connectedness, interior, or a selected
search verdict. The first two panel labels use the names of the existing
presets. The third panel has the independently derived support
$E(2i,5)=[-16/3,16/3]\times[-8/3,8/3]$ and overlapping rectangular
first-level pieces. It makes boundaries lying inside another piece visible
and exercises the original-alphabet self-covering trap. The figure's finite
raster remains an approximation to those exact rectangles.

Each 332 × 220 plot embeds a 664 × 440 raster, using depth 12 and a work
limit of 20,000 digit evaluations per piece. Original-piece opacity is one;
each piece's inward contour is one raster pixel wide. Coverage statistics,
exact viewports, source hashes, and image hashes are recorded in the metadata.

The metadata includes a fully encoded `interactive_url` for each panel. Those
links restore the corresponding parameter, original-attractor scene, colors,
and horizontal coordinate span using the sharp boundary renderer. The figure's
escape depth becomes the starting depth, with adaptation enabled so detail
increases during exploration. The live depth and pixel footprint depend on
zoom and canvas dimensions; GPU previews also have separate depth/work caps.
Use the generator's recorded fixed depth and raster dimensions to reproduce
the committed figures exactly.

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
