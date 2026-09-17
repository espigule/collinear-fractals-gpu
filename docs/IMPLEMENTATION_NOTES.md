# Implementation Notes

## IFS convention

For an alphabet of size $m$,

$$
A_m=\{-m+1,-m+3,\ldots,m-1\},\qquad f_t(z)=t+z/c.
$$

The original attractor is
$E(c,m)=\{\sum_{j=0}^{\infty}t_jc^{-j}:t_j\in A_m\}$.
The first digit is unscaled. Prefix centers and histogram iterations use this
same convention, so the attractor and search overlays share coordinates.

For an original arity $n$, the difference alphabet has size $N=2n-1$ and
$E(c,n)-E(c,n)=E(c,N)$. Connectedness is encoded by
$2c\in E(c,N)$. The inverse branches are $g_t(z)=c(z-t)$.
The [finite-capture paper](https://arxiv.org/abs/2603.07397) develops this
marked-point criterion and the associated trap/enclosure construction.

## Input domain and coordinates

The canonical search requires a non-real expanding parameter $c$, with
$|c|>1$.

| Entry point | Interpretation |
|---|---|
| Browser parameter locator and share coordinates | Input $p$ with $0<|p|<1$ is replaced by $c=1/p$; input $|p|>1$ is used directly. |
| Browser ES-module search | Uses the same reciprocal normalization as the browser. |
| JavaScript, Python, Swift and symbolic reference packages | Take the expanding $c$ directly; no reciprocal conversion is performed. |
| Prefix/histogram renderers | Take an already normalized expanding $c$ directly. |

For example, browser input $p=0.4+0.3i$ uses $c=1.6-1.2i$.
Pass the latter value to a reference package to reproduce that search. Real
parameters, zero, and points on the unit circle are outside the canonical
search domain and produce `Undetermined` with `outside-domain` in the executable
searches. This does not assert anything about real-axis connectedness.

JavaScript and Python reject non-finite coordinates, nonintegral/invalid
arities or limits, and nonpositive tolerance with an exception. Swift's
nonthrowing search returns `Undetermined` with `invalid-input`; its throwing
geometry helpers reject invalid values. Check package READMEs for native-port
validation scope. The mathematical arity must be an integer at least 2, with
the difference alphabet representable exactly in the implementation.

For $c=x+iy$ and $\rho=|c|$, the canonical coordinates of $z=u+iv$ are

$$
s=\frac{xv+yu}{\rho},\qquad v=\operatorname{Im}z.
$$

The marked point $2c$ has coordinates $s_0=4xy/\rho$, $v_0=2y$.
An inverse digit $t$ updates them by
$v'=\rho s-yt$ and $s'=2xv'/\rho-\rho v$.
Digits of $A_m$ have the parity of $m-1$; clipping to the finite alphabet
must preserve that parity.

## Search limits and termination

| Setting | Default | Meaning |
|---|---:|---|
| `k_max` / `kMax` | 37 | Largest inverse depth; zero tests the initial point only. |
| `L_max` / `LMax` / Python `l_max` | 1000 | Retained frontier width at one depth. |
| `tol` | `1e-8` | Target for the unscaled enclosure-series tail. |

The search stops conservatively as soon as a frontier reaches its width cap.
The cumulative node count can exceed that cap. It is not a total work or
elapsed-time budget. Exported inverse words list digits in the order applied
to $2c$; a depth-zero hit has an empty word.

| Verdict | Stop reason | Meaning |
|---|---|---|
| `Interior` | `trap-hit` | Strict in-lens trap entry. |
| `Interior-offLens` | `trap-hit` | Strict entry using the separate off-lens rule. |
| `Exterior` | `enclosure-escape` | The initial point is outside the computed enclosure. |
| `Exterior` | `tree-exhausted` | Every retained branch was eliminated before any search limit. |
| `Undetermined` | `node-cap`, `depth-cap` | The finite computation stopped without a decision. |
| `Undetermined` | `outside-domain`, `numerical-range` | Unsupported geometry or a calculation outside finite numerical range. |

`Interior-offLens` is exploratory evidence unless its specific trap hypotheses
and arithmetic are independently justified. `Undetermined` does not classify
a parameter as a boundary point. Native search results use `stopReason`
(JavaScript/Swift) or `stop_reason` (Python); JSON exports use `stop_reason`.

## Enclosure truncation and arithmetic

For a truncation depth $M$, the geometric remainder is bounded by

$$
\frac{\rho^{-M}}{\rho-1}.
$$

The enclosure includes this complete remainder even if the requested tolerance
cannot be achieved before the truncation cap. Metadata records the depth,
remainder, whether it met the target (`tailCertifiedToTol` /
`tail_certified_to_tol`), and whether the depth cap was reached.

This bound concerns an omitted mathematical series. It does not control
rounding of the trigonometric sum or later coordinate comparisons. The
executable browser/JavaScript/Python/Swift routines use floating-point numbers,
not outward-rounded intervals. See [numerical interpretation](RESPONSIBLE_USE.md)
for the evidentiary meaning of a result.

## Visual renderers and computational cost

The prefix renderer draws complete levels up to its point budget, reducing the
actual depth when the requested level would exceed that budget. Metadata
records both depths and `truncated_by_work_cap`. After $d$ prefix digits, a
valid mathematical tail-radius estimate is

$$
R_d=(m-1)\frac{\rho^{1-d}}{\rho-1}.
$$

The on-screen circle size is clipped for legibility, so the drawn circles are
not guaranteed to display that entire enclosure. The image remains a finite
visual approximation.

The seeded histogram iterates $z\leftarrow t+z/c$, discards a burn-in, and
draws a bounded sample count. The renderer and worker share the sampler.
A seed reproduces the sequence in the same implementation; a finite burn-in
and finite sampling do not establish exact coverage or an invariant density.

The survival renderer retains points whose inverse search is still admissible
at the chosen depth or width cap, with trap entry disabled. It is a numerical
outer-approximation diagnostic. It does not reinterpret survival as a proven
membership result.

A verdict-only scalar kernel reuses typed-array frontiers for pixel rendering.
The detailed reference search retains the inverse tree and word for the
selected parameter. Cross-kernel tests compare numerical results; they do not
add interval guarantees. The browser remains a Canvas/CPU application.

## Search JSON and schemas

The certificate filename and `proof_status` field are retained for compatibility.
A `finite-search-certificate` is a floating-point search record. It records
arity, input/effective parameter, depth and width limits, tolerance, verdict,
stop reason, word, node count, and arithmetic provenance. Visual settings are
separate metadata and do not determine the selected-parameter verdict.

`c` stores the effective parameter for replay in the language packages;
`input_parameter` retains the original browser coordinates.
`parameter_convention` is `expanding-parameter` or `reciprocal-input`. If a
nonzero input is so small that its reciprocal cannot be represented, `c` is
`null`, the verdict is `Undetermined`, and the stop reason is `numerical-range`.
The raw input remains available, but there is no representable expanding
parameter to submit to a reference package.

Schemas describe the data contract. They cannot check whether a trap is
mathematically valid or a boundary comparison is rigorous. Reproduction should
retain the share URL and software commit alongside the record, because the
prerelease version alone does not identify later unreleased changes.
