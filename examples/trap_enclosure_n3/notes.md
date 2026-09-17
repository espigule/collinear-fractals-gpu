# Trap/enclosure Search Records for n=3

This example records three floating-point searches for $n=3$, with difference
alphabet $A_5=\{-4,-2,0,2,4\}$.

| Parameter | Result | Depth | Inverse word | Record |
|---|---|---:|---|---|
| $0.5+1.1i$ | `Interior` | 0 | `[]` | `certificate_interior.json` |
| $3+3i$ | `Exterior` | 0 | `[]` | `certificate_exterior.json` |
| $0.7+1.4i$ | `Interior` | 1 | `[2]` | `certificate_interior_word.json` |

All use `k_max = 37`, `L_max = 1000`, and `tol = 1e-8`. The first two
illustrate the initial trap and enclosure tests. The third applies one inverse
branch $g_2(z)=c(z-2)$ to the marked point $2c$ before entering the trap.

The default preset selects the first case; enter the other listed parameters
to reproduce them. From the repository root, run
`node examples/verify_search_records.mjs` to replay every curated search record.

The JSON uses the shared browser certificate builder and the declared schema.
It records finite floating-point calculations, not interval-verified proofs.
The historical `certificate` filename is preserved for compatibility.
