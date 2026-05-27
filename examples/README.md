# Examples

This directory collects curated example metadata for the browser explorer and
companion implementations. The examples are designed to be reproducible
starting points, not standalone theorem proofs.

Each example includes:

- `config.json`: parameter, visual-renderer, and search settings.
- `metadata.json`: citable/reproducibility metadata for the example.
- `notes.md`: mathematical meaning, expected status, and reproduction notes.
- optional `certificate*.json`: compact finite-search output only when the
  certificate is actually known for the curated example.

Visual-renderer settings are separate from certificate settings. Prefix depth,
histogram seed, histogram sample count, and opacity describe how an image is
drawn; `k_max` and `l_max` describe the finite-search status and certificate
export.

The current example set is:

| Example | Status |
|---|---|
| `e_c4_overlap` | Illustrative |
| `e_c5_plane_filling` | Illustrative |
| `theta0_base_capture` | Illustrative |
| `trap_enclosure_n3` | Finite-search certified |
| `threshold_n20` | Exploratory |
| `hole_zoom_n13` | Exploratory |
| `off_lens_witnesses_n2_to_n19` | Exploratory |
| `finite_capture_layers_n3` | Illustrative |
| `level2_boundary_atlas` | Exploratory |

Figure captions should use this pattern:

```markdown
Generated with Collinear Fractals GPU. The image illustrates the
finite-capture structure; the theorem-level proof relies on the
trap-enclosure inequalities and finite certificates, not on visual inspection.
```
