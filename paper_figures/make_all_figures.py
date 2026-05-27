#!/usr/bin/env python3
"""List reproducible figure jobs for the curated example set.

This alpha script intentionally does not render large binary figures. It keeps
the figure pipeline metadata-first until the rendering outputs are curated and
hash-checked.
"""
from __future__ import annotations

import json
import pathlib


ROOT = pathlib.Path(__file__).resolve().parents[1]
METADATA = ROOT / "paper_figures" / "figure_metadata.json"


def main() -> int:
    figures = json.loads(METADATA.read_text(encoding="utf-8"))
    for item in figures["figures"]:
        print(f"{item['id']}: {item['title']} [{item['status']}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
