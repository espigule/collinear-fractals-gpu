# Reproducible Examples

Choose a preset in the browser or use its parameter with a reference package.
`config.json` records settings, `metadata.json` records purpose and provenance,
and `notes.md` explains the case. The compact `certificate*.json` files are
floating-point search records conforming to the certificate schema.

Replay the stored records with `node examples/verify_search_records.mjs`
from the repository root. This compares verdict, depth, stop reason, and inverse
word; it does not supply interval verification.

All listed results below use `k_max = 37`, `L_max = 1000`, and `tol = 1e-8`.
The width cap is per depth. An `Undetermined` result is expected for several
useful attractor pictures.

| Preset | $n$ | Parameter $c$ | Expected search result |
|---|---:|---|---|
| `theta0_base_capture` | 3 | $0.5+1.1i$ | `Interior`, depth 0 |
| `trap_enclosure_n3` | 3 | $0.5+1.1i$, $3+3i$, and $0.7+1.4i$ | Two depth-zero cases; `[2]` captures the third at depth 1 |
| `e_c4_overlap` | 4 | $(3+i\sqrt{11})/2$ | `Undetermined` at the depth limit |
| `e_c5_plane_filling` | 5 | $1+2i$ | `Undetermined` at the frontier limit |
| `off_lens_witnesses_n2_to_n19` | 3 | $1.419643377607+0.606290729207i$ | `Interior-offLens`, depth 2, word `[4, 0]` |
| `hole_zoom_n13` | 13 | $2.0719+3.0537i$ | `Exterior`, depth 5 |
| `threshold_n20` | 20 | $2+4i$ | `Undetermined` at the frontier limit |
| `finite_capture_layers_n3` | 3 | $0.5+1.1i$ | `Interior`, depth 0 |
| `level2_boundary_atlas` | 3 | $0.5+1.1i$ | `Interior`, depth 0; atlas metadata only |

The off-lens directory has a legacy name; it supplies one case, not a full
arity-by-arity witness table. The hole preset records an exterior sample, not
a proof that its complementary component is bounded. The atlas and gallery
entries are starting-point metadata, not completed atlas products.

Visual settings are independent of search settings. Prefix depth, histogram
seed/sample count, first-level coloring, and opacity describe a finite image.
The IFS convention is $f_t(z)=t+z/c$: prefix sums start with an unscaled digit.
A fixed seed reproduces a histogram sequence in the same implementation.

For a figure, record the example, software commit, share URL, image dimensions,
and renderer metadata. Record search JSON separately when making a claim about
the selected parameter. Suitable caption text is:

> Generated with Collinear Fractals GPU. Finite visual approximation; the
> associated search record uses floating-point arithmetic. Mathematical
> conclusions require the stated trap/enclosure hypotheses and error bounds.
