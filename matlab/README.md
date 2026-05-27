# Collinear Fractals — MATLAB

MATLAB static-class implementation of canonical coordinates, enclosure bounds, alphabet truncation, and inverse iteration.

```matlab
c = 0.5 + 1.1i;
result = collinear_fractals.inverse_iteration_test(c, 3); % default k_max = 37
disp(result.verdict)
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, or `Undetermined`.

See `../docs/QA_REPORT.md` for the publication QA record.
