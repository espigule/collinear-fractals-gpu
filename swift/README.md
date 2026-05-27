# Collinear Fractals — Swift

Swift Package Manager reference implementation of canonical coordinates, parameter-lens testing, enclosure bounds, alphabet parity, trap half-widths, and the enclosure-pruned inverse-iteration search.

## Usage

```swift
import CollinearFractals

let c = Complex(0.5, 1.1)
let result = CollinearFractals.inverseIterationTest(c, n: 3) // kMax defaults to 37
print(result.verdict.rawValue)
```

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, and `Undetermined`.

## Tests

```bash
swift test
```

See `../docs/QA_REPORT.md` for the publication QA record.
