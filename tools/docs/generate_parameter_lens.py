#!/usr/bin/env python3
"""Generate the README's open non-real parameter lens, using only the stdlib.

Run:   python tools/docs/generate_parameter_lens.py
Check: python tools/docs/generate_parameter_lens.py --check

The outline uses analytic SVG circular arcs, not polygonal sampling. The lens
is the intersection of the open disks centered at -1 and +1 of radius sqrt(6),
with the closed unit disk and real axis removed. SVG coordinates necessarily
round irrational lengths; the exact defining expressions are in the metadata.
"""

from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import json
from math import sqrt
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SVG_PATH = ROOT / "docs/figures/parameter-lens.svg"
JSON_PATH = ROOT / "docs/figures/parameter-lens.json"
WIDTH, HEIGHT = 880, 500
ORIGIN_X, ORIGIN_Y = 219, 288
SCALE = 71  # Identical horizontal and vertical pixels per coordinate unit.


def number(value: float) -> str:
    return f"{value:.9f}".rstrip("0").rstrip(".")


def screen(x: float, y: float) -> tuple[str, str]:
    return number(ORIGIN_X + SCALE * x), number(ORIGIN_Y - SCALE * y)


def build_svg() -> str:
    radius = number(SCALE * sqrt(6))
    top_x, top_y = screen(0, sqrt(5))
    bottom_x, bottom_y = screen(0, -sqrt(5))
    # Each arc is the shorter arc of its circle. The right arc is centered at
    # (-1, 0); the left arc is centered at (+1, 0).
    outer = (
        f"M {top_x} {top_y} A {radius} {radius} 0 0 1 {bottom_x} {bottom_y} "
        f"A {radius} {radius} 0 0 1 {top_x} {top_y} Z"
    )
    left_x, axis_y = screen(-1, 0)
    right_x, _ = screen(1, 0)
    hole = (
        f"M {left_x} {axis_y} A {SCALE} {SCALE} 0 1 0 {right_x} {axis_y} "
        f"A {SCALE} {SCALE} 0 1 0 {left_x} {axis_y} Z"
    )
    example_x, example_y = screen(0.5, 1.1)
    ticks = []
    for value in (-2, -1, 1, 2):
        x, y = screen(value, 0)
        ticks.append(
            f'<path d="M {x} 283 V 293" class="tick"/>'
            f'<text x="{x}" y="309" class="tick-label" text-anchor="middle">{str(value).replace("-", "−")}</text>'
        )
        x, y = screen(0, value)
        ticks.append(
            f'<path d="M 214 {y} H 224" class="tick"/>'
            f'<text x="207" y="{number(float(y) + 4)}" class="tick-label" text-anchor="end">{str(value).replace("-", "−")}</text>'
        )
    tick_markup = "\n    ".join(ticks)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="lens-title lens-description">
  <title id="lens-title">The open non-real parameter lens for n = 3</title>
  <desc id="lens-description">In equal-scale Cartesian coordinates c = x + iy, the blue region satisfies 1 &lt; x² + y² &lt; 5 − 2|x| and y ≠ 0. It is the intersection of the open disks centered at plus and minus one with radius square root of six, excluding the closed unit disk and real axis. All excluded boundaries are dashed. The marked example c = 0.5 + 1.1i lies strictly in the lens because 1 &lt; 1.46 &lt; 4. The shaded lens is a geometric parameter region, not a plot or membership test of the connectedness locus M₃.</desc>
  <style>
    text {{ font-family: Arial, Helvetica, sans-serif; fill: #183047; }}
    .math {{ font-family: Georgia, 'Times New Roman', serif; }}
    .body {{ font-size: 16px; fill: #385268; }}
    .small {{ font-size: 14px; fill: #52677b; }}
    .boundary {{ fill: none; stroke: #39759b; stroke-width: 1.8; stroke-dasharray: 5 4; }}
    .tick {{ fill: none; stroke: #8b9dad; stroke-width: 1; }}
    .tick-label {{ font-size: 13px; fill: #63778b; }}
  </style>
  <defs>
    <marker id="axis-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 6 3 L 0 6 Z" fill="#8b9dad"/>
    </marker>
  </defs>
  <rect width="880" height="500" rx="18" fill="#f5f8fc"/>
  <text x="24" y="38" font-size="26" font-weight="700">A geometric lens in parameter space</text>
  <text x="24" y="67" class="body">The n = 3 case, with equal scales on the real and imaginary axes.</text>
  <rect x="24" y="94" width="390" height="382" rx="13" fill="#fff" stroke="#dbe3ec"/>
  <g aria-label="Equal-scale parameter plane">
    <circle cx="219" cy="288" r="71" fill="#f5f8fc"/>
    <path d="{outer} {hole}" fill="#c9e3f2" fill-rule="evenodd"/>
    <path d="{outer}" class="boundary"/>
    <circle cx="219" cy="288" r="71" class="boundary"/>
    <path d="M 219 461 V 110" stroke="#a5b4c2" stroke-width="1" marker-end="url(#axis-arrow)"/>
    <!-- A white underlay makes the excluded real axis visible through the fill. -->
    <path d="M 60 288 H 384" stroke="#fff" stroke-width="4"/>
    <path d="M 60 288 H 384" stroke="#6f8598" stroke-width="1.3" stroke-dasharray="5 4" marker-end="url(#axis-arrow)"/>
    {tick_markup}
    <text x="228" y="123" font-size="16" class="math">Im c</text>
    <text x="366" y="278" font-size="16" class="math">Re c</text>
    <text x="207" y="309" class="tick-label" text-anchor="end">0</text>
    <rect x="181" y="326" width="76" height="21" rx="3" fill="#f5f8fc"/>
    <text x="219" y="342" class="math" font-size="17" text-anchor="middle">|c| ≤ 1</text>
    <circle cx="{example_x}" cy="{example_y}" r="5.5" fill="#b34b1e" stroke="#fff" stroke-width="1.8"/>
    <text x="{number(float(example_x) + 10)}" y="{number(float(example_y) - 9)}" class="math" font-size="21" style="fill:#923b19">c</text>
  </g>
  <g aria-label="Exact definition and exclusions">
    <text x="444" y="121" font-size="19" font-weight="700">Open non-real lens · n = 3</text>
    <text x="444" y="159" class="math" font-size="24">1 &lt; x² + y² &lt; 5 − 2|x|</text>
    <text x="444" y="188" class="math" font-size="20">y ≠ 0,   c = x + iy</text>
    <rect x="444" y="216" width="18" height="14" rx="2" fill="#c9e3f2" stroke="#a8cddd"/>
    <text x="472" y="229" class="body">Shaded region: parameter lens</text>
    <path d="M 444 252 H 463" class="boundary"/>
    <text x="472" y="257" class="body">Dashed boundaries are excluded</text>
    <text x="444" y="296" class="body">Intersect the two open disks</text>
    <text x="444" y="323" class="math" font-size="20">|c − 1| &lt; √6   and   |c + 1| &lt; √6,</text>
    <text x="444" y="350" class="body">then remove |c| ≤ 1 and the real axis.</text>
    <circle cx="451" cy="388" r="5" fill="#b34b1e"/>
    <text x="468" y="394" class="math" font-size="21">c = 0.5 + 1.1i</text>
    <text x="444" y="421" class="body">Inside the lens: 1 &lt; 1.46 &lt; 4.</text>
    <text x="444" y="463" class="small">This region is not a plot of the connectedness locus M₃.</text>
  </g>
</svg>
'''


def build_metadata(svg: str) -> dict:
    x, y = Fraction(1, 2), Fraction(11, 10)
    norm_squared = x * x + y * y
    upper = 5 - 2 * abs(x)
    assert y != 0 and 1 < norm_squared < upper
    assert (x - 1) ** 2 + y * y < 6 and (x + 1) ** 2 + y * y < 6
    return {
        "generator": "tools/docs/generate_parameter_lens.py",
        "generator_version": 1,
        "diagram": "open-non-real-parameter-lens",
        "n": 3,
        "definition": "c=x+iy; 1 < x^2+y^2 < 5-2*abs(x); y != 0",
        "equivalent_definition": "abs(c-1)<sqrt(6) and abs(c+1)<sqrt(6) and abs(c)>1 and Im(c)!=0",
        "outer_circle_centers": [{"re": -1, "im": 0}, {"re": 1, "im": 0}],
        "outer_circle_radius_exact": "sqrt(6)",
        "outer_arc_endpoints_exact": [{"re": "0", "im": "sqrt(5)"}, {"re": "0", "im": "-sqrt(5)"}],
        "real_intercepts_of_outer_boundary_exact": ["1-sqrt(6)", "sqrt(6)-1"],
        "excluded": ["abs(c)<=1", "Im(c)=0", "outer-circle boundaries"],
        "boundary_style": "dashed; the real axis has a white underlay for legibility",
        "geometry": "analytic circular arcs; no polygon sampling or search classification",
        "coordinate_rounding_decimal_places": 9,
        "viewport": {"width": WIDTH, "height": HEIGHT, "origin_x": ORIGIN_X, "origin_y": ORIGIN_Y, "x_pixels_per_unit": SCALE, "y_pixels_per_unit": SCALE},
        "example": {"c": {"re": 0.5, "im": 1.1}, "c_exact": {"re": "1/2", "im": "11/10"}, "norm_squared_exact": str(norm_squared), "upper_bound_exact": str(upper), "in_lens": True},
        "connectedness_locus_drawn": False,
        "connectedness_verdict": None,
        "svg_sha256": hashlib.sha256(svg.encode("utf-8")).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if checked-in outputs differ from regeneration")
    args = parser.parse_args()
    svg = build_svg()
    outputs = {
        SVG_PATH: svg,
        JSON_PATH: json.dumps(build_metadata(svg), ensure_ascii=False, indent=2) + "\n",
    }
    stale = []
    for path, content in outputs.items():
        if args.check:
            if not path.exists() or path.read_bytes() != content.encode("utf-8"):
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content.encode("utf-8"))
            print(f"Generated {path.relative_to(ROOT)}")
    if stale:
        print("Out-of-date or missing: " + ", ".join(stale), file=sys.stderr)
        print("Run: python tools/docs/generate_parameter_lens.py", file=sys.stderr)
        return 1
    if args.check:
        print("Parameter lens SVG and metadata are up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
