# Responsible Use and Certification Boundaries

This document describes what the explorer can report, what it cannot certify,
and what information should accompany issue reports.

## What the explorer can do

- Render visual approximations of \(E(c,n)\).
- Render finite-search and certificate-status layers.
- Export finite inverse-word and certificate metadata.
- Reproduce curated examples and figure metadata.

## What the explorer does not do

- It is not a formal proof checker.
- It does not make visual inspection into proof.
- It does not certify every displayed pixel.
- It does not replace the theorem-level inequalities in the papers or thesis.

## Meaning of verdicts

- `Interior`: in-lens canonical trap hit.
- `Interior-offLens`: off-lens trap hit under the enabled off-lens rule.
- `Exterior`: enclosure escape or complete admissible-tree exhaustion.
- `Undetermined`: depth or node cap reached.

## Visual versus certificate metadata

Visual renderers have `visual-approximation` status. Certificate exports have
finite-search status. These fields must not be merged or treated as equivalent.

## Reporting issues

When filing an issue, include the parameter, share URL, renderer mode, `n`,
`k_max`, `L_max`, seed, and certificate JSON when available.
