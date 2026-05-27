# Collinear Fractals — Maple

Reference Maple implementation of canonical coordinates, parameter-lens testing, enclosure bounds, trap half-widths, alphabet parity, and the enclosure-pruned inverse-iteration search.

```maple
read "CollinearFractals.mpl";

c := 0.5 + 1.2*I;
CollinearFractals:-in_lens(c, 3);
CollinearFractals:-compute_enclosure(0.7 + 1.4*I, 3);
result := CollinearFractals:-inverse_iteration_test(0.5 + 1.1*I, 3); # k_max defaults to 37
result["verdict"];
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, and `Undetermined`.

See `../docs/QA_REPORT.md` for the publication QA record.
