#!/usr/bin/env python3
"""Static QA checks for the Collinear Fractals GPU repository bundle.

The script is intentionally dependency-free so that it can be run on a fresh
checkout before publication.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = "0.1.0-alpha"

REQUIRED_FILES = [
    "README.md",
    "VERSION",
    "CITATION.cff",
    "LICENSE",
    "LICENSE-docs.md",
    "NOTICE",
    "index.html",
    "index.css",
    "explorer.js",
    "javascript/package.json",
    "javascript/index.js",
    "javascript/test.js",
    "python/pyproject.toml",
    "python/collinear_fractals.py",
    "python/test_collinear.py",
    "swift/Package.swift",
    "swift/Sources/CollinearFractals/CollinearFractals.swift",
    "swift/Tests/CollinearFractalsTests/CollinearFractalsTests.swift",
    "mathematica/CollinearFractals.wl",
    "matlab/collinear_fractals.m",
    "maple/CollinearFractals.mpl",
    "docs/IMPLEMENTATION_NOTES.md",
    "docs/VALIDATION.md",
    "docs/QA_REPORT.md",
    "qa/explorer-prefix-smoke-test.js",
    "tools/validate_bundle.py",
]

TEXT_EXTENSIONS = {".md", ".html", ".css", ".js", ".py", ".toml", ".swift", ".wl", ".m", ".mpl", ".cff", ".txt", ""}


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def main() -> int:
    missing = [p for p in REQUIRED_FILES if not (ROOT / p).is_file()]
    if missing:
        fail("missing required files: " + ", ".join(missing))

    if read("VERSION").strip() != VERSION:
        fail("VERSION file does not match expected release version")

    # No local absolute links or previous development paths.
    offenders = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or ".build" in path.parts or "node_modules" in path.parts:
            continue
        if path.suffix.lower() in TEXT_EXTENSIONS:
            text = path.read_text(encoding="utf-8", errors="ignore")
            if ("file:" + "/" + "/" + "/") in text or ("/" + "Users/" + "bernat/") in text:
                offenders.append(str(path.relative_to(ROOT)))
    if offenders:
        fail("local-path leakage found in: " + ", ".join(offenders))

    # DOM references used by the browser engine must exist in the HTML.
    html = read("index.html")
    js = read("explorer.js")
    ids = set(re.findall(r'id="([^"]+)"', html))
    refs = set(re.findall(r"document\.getElementById\('([^']+)'\)", js))
    missing_refs = sorted(refs - ids)
    if missing_refs:
        fail("missing DOM ids referenced by explorer.js: " + ", ".join(missing_refs))

    # Version consistency in visible/release metadata.
    package = json.loads(read("javascript/package.json"))
    if package.get("version") != VERSION:
        fail("javascript/package.json version mismatch")
    for path in ["README.md", "index.html", "CITATION.cff"]:
        if VERSION not in read(path):
            fail(f"{path} does not contain {VERSION}")

    # Default depth should be 37 across the primary packages.
    required_depth_patterns = {
        "index.html": r'id="param-kmax" value="37"',
        "explorer.js": r'kMax:\s*37',
        "javascript/index.js": r'DEFAULT_K_MAX\s*=\s*37',
        "python/collinear_fractals.py": r'DEFAULT_K_MAX\s*=\s*37',
        "swift/Sources/CollinearFractals/CollinearFractals.swift": r'defaultKMax\s*=\s*37',
        "mathematica/CollinearFractals.wl": r'kmax_:37',
        "matlab/collinear_fractals.m": r'k_max\s*=\s*37',
        "maple/CollinearFractals.mpl": r'k_max::integer\s*:=\s*37',
    }
    for path, pattern in required_depth_patterns.items():
        if not re.search(pattern, read(path)):
            fail(f"default k_max=37 not detected in {path}")

    print("Static bundle validation passed.")
    print(f"Release version: {VERSION}")
    print(f"DOM ids checked: {len(refs)} references")
    print("No local file paths detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
