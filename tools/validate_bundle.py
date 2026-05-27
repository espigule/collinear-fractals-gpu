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
    ".github/FUNDING.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/pages.yml",
    "LICENSE",
    "LICENSE-docs.md",
    "LICENSES/CC-BY-4.0.txt",
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
    "docs/RELEASE_PROCESS.md",
    "examples/README.md",
    "examples/examples.json",
    "examples/e_c4_overlap/config.json",
    "examples/e_c4_overlap/notes.md",
    "examples/e_c5_plane_filling/config.json",
    "examples/e_c5_plane_filling/notes.md",
    "examples/theta0_base_capture/config.json",
    "examples/theta0_base_capture/notes.md",
    "examples/trap_enclosure_n3/config.json",
    "examples/trap_enclosure_n3/certificate_interior.json",
    "examples/trap_enclosure_n3/certificate_exterior.json",
    "examples/trap_enclosure_n3/notes.md",
    "examples/threshold_n20/config.json",
    "examples/threshold_n20/notes.md",
    "examples/hole_zoom_n13/config.json",
    "examples/hole_zoom_n13/certificate.json",
    "examples/hole_zoom_n13/notes.md",
    "gallery/README.md",
    "paper_figures/make_all_figures.py",
    "paper_figures/figure_metadata.json",
    "paper_figures/output_hashes.sha256",
    "qa/explorer-prefix-smoke-test.js",
    "tools/validate_bundle.py",
]

TEXT_EXTENSIONS = {
    ".cff",
    ".css",
    ".html",
    ".js",
    ".json",
    ".m",
    ".md",
    ".mpl",
    ".py",
    ".sha256",
    ".swift",
    ".toml",
    ".txt",
    ".wl",
    ".yaml",
    ".yml",
    "",
}

MULTILINE_MIN_LINES = {
    ".gitignore": 20,
    "CITATION.cff": 30,
    ".github/workflows/ci.yml": 25,
    ".github/workflows/pages.yml": 25,
    "README.md": 80,
    "docs/QA_REPORT.md": 40,
    "docs/VALIDATION.md": 30,
    "RELEASE_CHECKLIST.md": 30,
    "NOTICE": 8,
}

BANNED_PHRASES = [
    "verification " + "package",
    "full " + "verification",
    "formal " + "verification " + "package",
    "theorem-level " + "verification " + "package",
    "currently " + "unemployed",
    "fund " + "me",
    "requested " + "default",
    "2 " + "px " + "final",
    "adaptive " + "final " + "resolution",
]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def line_count(text: str) -> int:
    return len(text.splitlines())


def validate_json(path: str) -> None:
    try:
        json.loads(read(path))
    except json.JSONDecodeError as exc:
        fail(f"{path} is not valid JSON: {exc}")


def main() -> int:
    missing = [p for p in REQUIRED_FILES if not (ROOT / p).is_file()]
    if missing:
        fail("missing required files: " + ", ".join(missing))

    if read("VERSION").strip() != VERSION:
        fail("VERSION file does not match expected release version")

    for path, min_lines in MULTILINE_MIN_LINES.items():
        text = read(path)
        if line_count(text) < min_lines:
            fail(f"{path} appears line-collapsed or too short")
        if "\r" in text:
            fail(f"{path} contains carriage-return line endings")

    readme_lines = read("README.md").splitlines()
    required_headings = [
        "# Collinear Fractals GPU",
        "## Quick visual summary",
        "## What is included",
        "## Mathematical scope",
        "## Browser quick start",
        "## Examples and gallery",
        "## Package tests",
        "## QA status and limitations",
        "## Related mathematical work",
        "## Citing",
        "## Funding and acknowledgements",
        "## Support",
        "## License",
    ]
    missing_headings = [heading for heading in required_headings if heading not in readme_lines]
    if missing_headings:
        fail("README.md missing required headings: " + ", ".join(missing_headings))

    cff = read("CITATION.cff")
    for required in [
        "cff-version: 1.2.0",
        "doi: \"10.3390/fractalfract8120725\"",
        "doi: \"10.48550/arXiv.2603.07397\"",
        "doi: \"10.57987/IHP.2026.T1.WS3.016\"",
    ]:
        if required not in cff:
            fail(f"CITATION.cff missing required metadata: {required}")

    for path in [
        "examples/examples.json",
        "examples/e_c4_overlap/config.json",
        "examples/e_c5_plane_filling/config.json",
        "examples/theta0_base_capture/config.json",
        "examples/trap_enclosure_n3/config.json",
        "examples/trap_enclosure_n3/certificate_interior.json",
        "examples/trap_enclosure_n3/certificate_exterior.json",
        "examples/threshold_n20/config.json",
        "examples/hole_zoom_n13/config.json",
        "examples/hole_zoom_n13/certificate.json",
        "paper_figures/figure_metadata.json",
        "javascript/package.json",
    ]:
        validate_json(path)

    # No local absolute links or previous development paths.
    offenders = []
    fake_doi_offenders = []
    language_offenders = []
    for path in ROOT.rglob("*"):
        if (
            not path.is_file()
            or ".build" in path.parts
            or ".git" in path.parts
            or "node_modules" in path.parts
        ):
            continue
        if path.suffix.lower() in TEXT_EXTENSIONS:
            text = path.read_text(encoding="utf-8", errors="ignore")
            if ("file:" + "/" + "/" + "/") in text or ("/" + "Users/" + "bernat/") in text:
                offenders.append(str(path.relative_to(ROOT)))
            fake_zenodo_pattern = r"10\.5281/zenodo\." + r"(x+|X+|0+|_+)"
            fake_zenodo_marker = "zenodo." + ("X" * 4)
            if re.search(fake_zenodo_pattern, text) or fake_zenodo_marker in text:
                fake_doi_offenders.append(str(path.relative_to(ROOT)))
            if str(path.relative_to(ROOT)) != "tools/validate_bundle.py":
                lowered = text.lower()
                for phrase in BANNED_PHRASES:
                    if phrase in lowered:
                        language_offenders.append(f"{path.relative_to(ROOT)}: {phrase}")
    if offenders:
        fail("local-path leakage found in: " + ", ".join(offenders))
    if fake_doi_offenders:
        fail("fake DOI placeholder found in: " + ", ".join(fake_doi_offenders))
    if language_offenders:
        fail("banned or overclaiming language found in: " + ", ".join(language_offenders))

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
    print("Formatting, DOI, and language hygiene checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
