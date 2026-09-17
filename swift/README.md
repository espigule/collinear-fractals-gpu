# Collinear Fractals — Swift

Swift Package Manager reference implementation of canonical coordinates, analytic enclosure bounds, trap half-widths, alphabet parity and the inverse search.

```swift
import CollinearFractals

let c = Complex(1.419643377607, 0.606290729207)
let result = CollinearFractals.inverseIterationTest(c, n: 3)
print(result.verdict.rawValue) // Interior-offLens
print(result.word)             // [4, 0]
print(result.stopReason ?? "") // trap-hit
```

The parameter is the expanding `c` in `z → t + z/c`. Real parameters and `|c| ≤ 1` return `Undetermined` with `outside-domain`; the standalone port does not reciprocally normalize them.

`n` must be in `2...4_503_599_627_370_495`, preserving the exact difference alphabet across the reference ports. `kMax` defaults to 37 and may be zero; the initial point is still checked. `lMax` defaults to 1000 and must be positive; reaching that many admitted nodes at one level conservatively stops the search. `tol` defaults to `1e-8` and must be finite and positive. Very large valid integers are representation limits, not practical workload recommendations.

The search remains nonthrowing. Malformed input returns `Undetermined` with `stopReason == "invalid-input"`. Finite input that exceeds the arithmetic range returns `numerical-range`. Other reasons are `outside-domain`, `enclosure-escape`, `trap-hit`, `tree-exhausted`, `node-cap`, and `depth-cap`. `nodesExplored` counts admitted nodes including the initial point, not every rejected candidate.

`canonicalCoordinates`, `chooseTailDepth`, `computeEnclosure`, `trapHalfWidths`, and `firstAlphabetDigitAtOrAbove` throw `CollinearFractalsError.invalidParameter` for invalid arguments. **Migration:** calls to the last two helpers now require `try`; they no longer risk a nonfinite integer conversion or invalid division. `inLens` returns false for invalid input. The alphabet helper is a parity-compatible ceiling and does not clip to the finite alphabet.

Verdicts are `Interior`, `Interior-offLens`, `Exterior`, and `Undetermined`. They report **floating-point evidence**: the first is an in-lens trap hit, and the second uses the exploratory off-lens rule. Neither is an exact or outward-rounded certificate. Enclosures retain the entire analytic tail even when its requested tolerance is capped; `tailCertifiedToTolerance` describes only the computed tail estimate.

## Tests

```bash
swift test
```

Tests cover original examples, malformed inputs, zero-depth ranges, capped tails, bounded integer conversions near the real axis, conjugation and independent Cartesian witness replay. A native Swift toolchain is required; see [the QA report](../docs/QA_REPORT.md) for the recorded verification scope.
