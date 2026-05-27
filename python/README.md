# Collinear Fractals — Python

Pure-Python reference implementation of canonical coordinates, enclosure bounds, alphabet truncation, and the inverse-iteration search.

```python
from collinear_fractals import inverse_iteration_test

result = inverse_iteration_test(complex(0.5, 1.1), n=3)  # default k_max = 37
print(result["verdict"])
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, or `Undetermined`. The off-lens label is intentionally distinct from the theorem-level in-lens label.

Run tests with:

```bash
python3 -m unittest test_collinear.py
```

See `../docs/QA_REPORT.md` for the publication QA record.
