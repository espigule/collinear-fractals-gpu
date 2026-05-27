# Examples

This directory collects curated example metadata for the browser explorer and
companion implementations. The examples are designed to be reproducible
starting points, not standalone theorem proofs.

Each example includes:

- `config.json`: parameter, rendering, and search settings.
- `notes.md`: mathematical meaning, expected status, and reproduction notes.
- optional `certificate*.json`: compact finite-search output or a clearly
  marked placeholder when the case is still exploratory.

Figure captions should use this pattern:

```markdown
Generated with Collinear Fractals GPU. The image illustrates the
finite-capture structure; the theorem-level proof relies on the
trap-enclosure inequalities and finite certificates, not on visual inspection.
```
