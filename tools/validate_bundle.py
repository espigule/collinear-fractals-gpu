#!/usr/bin/env python3
"""Static QA checks for the Collinear Fractals GPU repository bundle.

The script is intentionally dependency-free so that it can be run on a fresh
checkout before publication.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys
import tomllib
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

ROOT = pathlib.Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "README.md",
    "VERSION",
    "CITATION.cff",
    ".github/FUNDING.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/quality.yml",
    "package.json",
    "package-lock.json",
    "requirements-qa.txt",
    "playwright.config.cjs",
    "qa/check.cjs",
    "qa/browser.spec.cjs",
    "tools/stage_site.py",
    "tools/validate_schemas.py",
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
    "docs/BROWSER_QA_CHECKLIST.md",
    "docs/VALIDATION.md",
    "docs/QA_REPORT.md",
    "docs/RELEASE_PROCESS.md",
    "examples/README.md",
    "examples/examples.json",
    "examples/e_c4_overlap/config.json",
    "examples/e_c4_overlap/metadata.json",
    "examples/e_c4_overlap/notes.md",
    "examples/e_c5_plane_filling/config.json",
    "examples/e_c5_plane_filling/metadata.json",
    "examples/e_c5_plane_filling/notes.md",
    "examples/theta0_base_capture/config.json",
    "examples/theta0_base_capture/metadata.json",
    "examples/theta0_base_capture/notes.md",
    "examples/trap_enclosure_n3/config.json",
    "examples/trap_enclosure_n3/metadata.json",
    "examples/trap_enclosure_n3/certificate_interior.json",
    "examples/trap_enclosure_n3/certificate_exterior.json",
    "examples/trap_enclosure_n3/notes.md",
    "examples/threshold_n20/config.json",
    "examples/threshold_n20/metadata.json",
    "examples/threshold_n20/notes.md",
    "examples/hole_zoom_n13/config.json",
    "examples/hole_zoom_n13/metadata.json",
    "examples/hole_zoom_n13/notes.md",
    "examples/off_lens_witnesses_n2_to_n19/config.json",
    "examples/off_lens_witnesses_n2_to_n19/metadata.json",
    "examples/off_lens_witnesses_n2_to_n19/notes.md",
    "examples/finite_capture_layers_n3/config.json",
    "examples/finite_capture_layers_n3/metadata.json",
    "examples/finite_capture_layers_n3/notes.md",
    "gallery/README.md",
    "gallery/index.json",
    "paper_figures/README.md",
    "paper_figures/make_all_figures.py",
    "paper_figures/figure_metadata.json",
    "paper_figures/output_hashes.sha256",
    "schemas/certificate.schema.json",
    "schemas/example-config.schema.json",
    "schemas/figure-metadata.schema.json",
    "schemas/pixel-certificate.schema.json",
    "schemas/active-piece.schema.json",
    "qa/explorer-prefix-smoke-test.js",
    "qa/render_smoke_tests.js",
    "qa/kernel_equivalence_tests.js",
    "src/math/alphabets.mjs",
    "src/math/complex.mjs",
    "src/state/explorer_state.mjs",
    "src/math/prefix_cylinders.mjs",
    "src/renderers/attractor_prefix.mjs",
    "src/renderers/attractor_histogram.mjs",
    "src/renderers/certificate_canvas.mjs",
    "src/renderers/overlay_compositor.mjs",
    "src/renderers/palettes.mjs",
    "src/compute/inverse_search_reference.mjs",
    "src/compute/inverse_search_kernel.mjs",
    "src/compute/certificate_builder.mjs",
    "workers/certificate-worker.js",
    "workers/histogram-worker.js",
    "tools/bench/render_metadata_bench.js",
    "examples/level2_boundary_atlas/config.json",
    "examples/level2_boundary_atlas/metadata.json",
    "examples/level2_boundary_atlas/notes.md",
    "tools/validate_bundle.py",
]

TEXT_EXTENSIONS = {
    ".cff",
    ".css",
    ".html",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".m",
    ".md",
    ".mpl",
    ".py",
    ".sha256",
    ".svg",
    ".swift",
    ".toml",
    ".txt",
    ".wl",
    ".yaml",
    ".yml",
    "",
}

YAML_LIKE_FILES = [
    "CITATION.cff",
    ".github/FUNDING.yml",
    ".github/workflows/ci.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/quality.yml",
]

TOP_LEVEL_KEYS = [
    "abstract",
    "authors",
    "cff-version",
    "concurrency",
    "date-released",
    "jobs",
    "keywords",
    "license",
    "message",
    "name",
    "on",
    "permissions",
    "references",
    "repository-code",
    "title",
    "type",
    "url",
    "version",
]

DYNAMIC_DOM_IDS = {
    "modal-copy-primary",
    "tour-next",
    "tour-prev",
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

OVERCLAIM_PATTERNS = [
    r"\b(is|as|becomes|serves as)\s+a\s+formal\s+proof\s+checker\b",
    r"\bv0\.[12][^\n.]{0,80}\bverification\s+package\b",
]

IMAGE_EXTENSIONS = {
    ".gif",
    ".jpg",
    ".jpeg",
    ".png",
    ".svg",
    ".webp",
}

CURATED_IMAGE_PREFIXES = (
    "gallery/",
    "examples/",
)

LOCAL_ONLY_DIRS = {
    ".git",
    ".build",
    "_reference",
    "codex_upgrade_handoff",
    "node_modules",
    ".venv",
    "__pycache__",
    "artifacts",
    "site",
    "coverage",
    "playwright-report",
    "test-results",
}

FORBIDDEN_TRACKED_PREFIXES = (
    "python/build/",
    "python/collinear_fractals.egg-info/",
    "_reference/",
    "codex_upgrade_handoff/",
)

FORBIDDEN_TRACKED_NAMES = {
    "codex_upgrade_handoff/reference/extras.zip",
    "extras.zip",
}

FORBIDDEN_PROTOTYPE_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"level_?2.*explorer.*\.html$",
        r"explorador_de_fractals_colineals.*\.html$",
        r"strata2step.*\.html$",
        r"capture2.*\.html$",
        r"Mn_algebraic.*\.html$",
        r"hogben_sequence.*\.html$",
        r"index_v9\.html$",
    ]
]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def validate_json(path: str) -> None:
    def parse_pairs(pairs: list[tuple[str, object]]) -> dict:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate key: {key}")
            result[key] = value
        return result

    def reject_constant(value: str) -> None:
        raise ValueError(f"non-finite JSON constant: {value}")

    try:
        json.loads(read(path), object_pairs_hook=parse_pairs, parse_constant=reject_constant)
    except (json.JSONDecodeError, ValueError) as exc:
        fail(f"{path} is not valid JSON: {exc}")


def strip_double_quoted_text(line: str) -> str:
    return re.sub(r'"(?:\\.|[^"\\])*"', '""', line)


def validate_yaml_like_multiline(path: str) -> None:
    for index, line in enumerate(read(path).splitlines(), start=1):
        if not line or line.lstrip().startswith("#"):
            continue
        if line[0].isspace():
            continue
        probe = strip_double_quoted_text(line)
        hits = []
        for key in TOP_LEVEL_KEYS:
            if re.search(rf"(^|\s){re.escape(key)}:\s", probe):
                hits.append(key)
        if len(hits) > 1:
            fail(
                f"{path}:{index} appears to contain multiple top-level keys "
                f"on one physical line: {', '.join(hits)}"
            )


def validate_markdown_heading_lines(path: str) -> None:
    for index, line in enumerate(read(path).splitlines(), start=1):
        if not line.startswith("#"):
            continue
        if re.search(r"\s#{1,6}\s+\S", line[1:]):
            fail(f"{path}:{index} appears to contain collapsed Markdown headings")
        if "## " in line[3:]:
            fail(f"{path}:{index} appears to contain multiple headings on one line")


def validate_large_image_policy() -> None:
    offenders = []
    for path in repository_files():
        suffix = path.suffix.lower()
        if suffix not in IMAGE_EXTENSIONS:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel.endswith(".svg"):
            max_bytes = 250_000
        else:
            max_bytes = 750_000
        if path.stat().st_size > max_bytes and not rel.startswith(CURATED_IMAGE_PREFIXES):
            offenders.append(f"{rel} ({path.stat().st_size} bytes)")
        if "generated" in path.parts or "output" in path.parts:
            offenders.append(f"{rel} is generated/output imagery")
    if offenders:
        fail("large or generated image assets found outside policy: " + ", ".join(offenders))


def validate_example_index() -> None:
    index = json.loads(read("examples/examples.json"))
    ids = set()
    for item in index.get("examples", []):
        example_id = item.get("id")
        ids.add(example_id)
        for key in ["config", "metadata"]:
            path = item.get(key)
            if not path or not (ROOT / path).is_file():
                fail(f"examples/examples.json entry {example_id} has missing {key}")
    required = {
        "e_c4_overlap",
        "e_c5_plane_filling",
        "theta0_base_capture",
        "trap_enclosure_n3",
        "threshold_n20",
        "hole_zoom_n13",
        "off_lens_witnesses_n2_to_n19",
        "finite_capture_layers_n3",
        "level2_boundary_atlas",
    }
    if not required.issubset(ids):
        fail("examples/examples.json missing required examples: " + ", ".join(sorted(required - ids)))


def validate_canonical_thesis_examples() -> None:
    examples = {
        "e_c4_overlap": {
            "n": 4,
            "N": 7,
            "re": 1.5,
            "im": 1.6583123951777,
            "exact": "(3 + i sqrt(11))/2",
            "figure": "Figure 3.1",
        },
        "e_c5_plane_filling": {
            "n": 5,
            "N": 9,
            "re": 1.0,
            "im": 2.0,
            "exact": "1 + 2i",
            "figure": "Figure 3.2",
        },
    }
    index = json.loads(read("examples/examples.json"))
    by_id = {item.get("id"): item for item in index.get("examples", [])}
    for example_id, expected in examples.items():
        config_path = f"examples/{example_id}/config.json"
        metadata_path = f"examples/{example_id}/metadata.json"
        config = json.loads(read(config_path))
        metadata = json.loads(read(metadata_path))
        for label, data in [(config_path, config), (metadata_path, metadata)]:
            if data.get("n") != expected["n"] or data.get("N") != expected["N"]:
                fail(f"{label} does not use the canonical thesis arity")
            parameter = data.get("parameter", {})
            if parameter.get("re") != expected["re"] or parameter.get("im") != expected["im"]:
                fail(f"{label} does not use the canonical thesis parameter")
            if parameter.get("exact") != expected["exact"]:
                fail(f"{label} missing exact canonical parameter string")
            if data.get("related_thesis_figure") != expected["figure"]:
                fail(f"{label} missing related thesis figure")
        item = by_id.get(example_id, {})
        share_hash = item.get("share_hash", "")
        if f"cx={expected['re']}" not in share_hash or f"cy={expected['im']}" not in share_hash:
            fail(f"examples/examples.json share hash for {example_id} is not canonical")

    old_canonical_markers = [
        "cx=1.6&cy=0.8",
        "cx=1.75&cy=0.95",
        '"re": 1.6',
        '"im": 0.8',
        '"re": 1.75',
        '"im": 0.95',
        "parameter: { re: 1.6, im: 0.8",
        "parameter: { re: 1.75, im: 0.95",
    ]
    checked_paths = [
        "explorer.js",
        "examples/examples.json",
        "examples/e_c4_overlap/config.json",
        "examples/e_c4_overlap/metadata.json",
        "examples/e_c4_overlap/notes.md",
        "examples/e_c5_plane_filling/config.json",
        "examples/e_c5_plane_filling/metadata.json",
        "examples/e_c5_plane_filling/notes.md",
        "qa/render_smoke_tests.js",
        "qa/kernel_equivalence_tests.js",
        "tools/bench/render_metadata_bench.js",
    ]
    offenders = []
    for path in checked_paths:
        text = read(path)
        for marker in old_canonical_markers:
            if marker in text:
                offenders.append(f"{path}: {marker}")
    if offenders:
        fail("old non-canonical E4/E5 parameters remain: " + ", ".join(offenders))


def should_skip_path(path: pathlib.Path) -> bool:
    return any(part in LOCAL_ONLY_DIRS for part in path.parts)


def repository_files() -> list[pathlib.Path]:
    """Prune local artifacts before traversal, including large dependency trees."""
    paths = []
    for directory, dirs, files in os.walk(ROOT):
        dirs[:] = [name for name in dirs if name not in LOCAL_ONLY_DIRS
                   and not (pathlib.Path(directory) / name).is_symlink()]
        paths.extend(pathlib.Path(directory) / name for name in files
                     if not (pathlib.Path(directory) / name).is_symlink())
    return paths


def tracked_files() -> list[str]:
    try:
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=ROOT,
            check=True,
            text=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        fail(f"could not inspect tracked files: {exc}")
    return [line for line in result.stdout.splitlines() if line]


def validate_no_reference_committed() -> None:
    offenders = []
    for rel in tracked_files():
        if rel in FORBIDDEN_TRACKED_NAMES:
            offenders.append(rel)
        if rel.startswith(FORBIDDEN_TRACKED_PREFIXES):
            offenders.append(rel)
        if any(pattern.search(rel) for pattern in FORBIDDEN_PROTOTYPE_PATTERNS):
            offenders.append(rel)
    if offenders:
        fail("local reference/prototype material is tracked: " + ", ".join(sorted(set(offenders))))


def validate_renderer_separation() -> None:
    js = read("explorer.js")
    if "state.rendererMode === 'survival'" not in js:
        fail("explorer.js does not expose inverse-survival rendering as an explicit mode")
    for marker in ["r = 255 - r", "dilatedGrid", "3x3"]:
        if marker in js:
            fail(f"explorer.js still contains legacy original-attractor overlay marker: {marker}")
    if "resn.verdict === 'Undetermined'" in js:
        fail("explorer.js treats Undetermined as original-attractor membership")


class HtmlAssets(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.local_assets: list[str] = []
        self.values: dict[str, str | None] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        element_id = values.get("id")
        if element_id:
            if element_id in self.ids:
                fail(f"Duplicate HTML id: {element_id}")
            self.ids.add(element_id)
            self.values[element_id] = values.get("value")
        target = values.get("src") if tag in {"script", "img"} else values.get("href") if tag == "link" else None
        if target and not urlsplit(target).scheme and not target.startswith("//"):
            self.local_assets.append(target)
        if tag == "script" and values.get("src") == "explorer.js" and values.get("type") != "module":
            fail("explorer.js must load as a browser ES module")


def validate_browser_assets() -> None:
    parsed = HtmlAssets()
    parsed.feed(read("index.html"))
    if parsed.values.get("param-kmax") != "37":
        fail("The initial HTML search depth must be 37")
    for asset in parsed.local_assets:
        path = (ROOT / unquote(urlsplit(asset).path)).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            fail(f"Missing or unsafe browser asset: {asset}")
    for path in repository_files():
        if path.suffix not in {".js", ".mjs"} or not (path.name == "explorer.js" or path.relative_to(ROOT).parts[0] in {"src", "workers"}):
            continue
        source = path.read_text(encoding="utf-8")
        for target in re.findall(r"(?:from\s*|import\s*\(\s*|import\s*)['\"](\.[^'\"]+)['\"]", source):
            resolved = (path.parent / target).resolve()
            if not resolved.is_relative_to(ROOT) or not resolved.is_file():
                fail(f"Missing browser module: {path.relative_to(ROOT)} -> {target}")


def main() -> int:
    missing = [p for p in REQUIRED_FILES if not (ROOT / p).is_file()]
    if missing:
        fail("missing required files: " + ", ".join(missing))
    validate_no_reference_committed()

    version = read("VERSION").strip()
    match = re.fullmatch(r"(\d+\.\d+\.\d+)(?:-(alpha|beta|rc)(?:\.(\d+))?)?", version)
    if not match:
        fail("VERSION is not a supported semantic release version")
    python_version = match[1] + ({"alpha": "a", "beta": "b", "rc": "rc"}[match[2]] + (match[3] or "0") if match[2] else "")

    for path in YAML_LIKE_FILES:
        validate_yaml_like_multiline(path)

    for path in repository_files():
        if path.suffix == ".md":
            validate_markdown_heading_lines(path.relative_to(ROOT).as_posix())

    pages = read(".github/workflows/pages.yml")
    if re.search(r"(?m)^\s+path:\s*\.\s*$", pages):
        fail("pages.yml deploys the repository root instead of a staged site directory")
    if not re.search(r"(?m)^\s+path:\s*site\s*$", pages):
        fail("pages.yml does not upload the staged static site directory")
    if not re.search(r"(?m)^\s+needs:\s*validate\s*$", pages):
        fail("Pages publication must depend on the validation job")
    for workflow in [".github/workflows/ci.yml", ".github/workflows/pages.yml"]:
        if "uses: ./.github/workflows/quality.yml" not in read(workflow):
            fail(f"{workflow} must use the shared quality gate")
    for workflow in [".github/workflows/quality.yml", ".github/workflows/pages.yml"]:
        for action in re.findall(r"uses:\s*([^\s#]+)", read(workflow)):
            if not action.startswith("./") and not re.fullmatch(r"[\w-]+/[\w-]+@[a-f0-9]{40}", action):
                fail(f"{workflow}: third-party action is not pinned to a full commit: {action}")

    cff = read("CITATION.cff")
    for required in [
        "cff-version: 1.2.0",
        "doi: \"10.3390/fractalfract8120725\"",
        "doi: \"10.48550/arXiv.2603.07397\"",
        "doi: \"10.57987/IHP.2026.T1.WS3.016\"",
    ]:
        if required not in cff:
            fail(f"CITATION.cff missing required metadata: {required}")

    for path in repository_files():
        if path.suffix == ".json":
            validate_json(path.relative_to(ROOT).as_posix())

    validate_example_index()
    validate_canonical_thesis_examples()
    validate_large_image_policy()
    validate_renderer_separation()
    validate_browser_assets()

    # No local absolute links or previous development paths.
    offenders = []
    fake_doi_offenders = []
    language_offenders = []
    for path in repository_files():
        if path.suffix.lower() in TEXT_EXTENSIONS:
            text = path.read_text(encoding="utf-8", errors="ignore")
            local_path_pattern = (
                r"(file:" + r"//|/"
                r"Users/[^\s)\"']+/|/"
                r"home/[^\s)\"']+/|/"
                r"private/tmp/)"
            )
            if re.search(local_path_pattern, text):
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
                for pattern in OVERCLAIM_PATTERNS:
                    if re.search(pattern, lowered):
                        language_offenders.append(f"{path.relative_to(ROOT)}: {pattern}")
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
    missing_refs = sorted(refs - ids - DYNAMIC_DOM_IDS)
    if missing_refs:
        fail("missing DOM ids referenced by explorer.js: " + ", ".join(missing_refs))

    # Version consistency in visible/release metadata.
    package = json.loads(read("javascript/package.json"))
    if package.get("version") != version:
        fail("javascript/package.json version mismatch")
    dev_package = json.loads(read("package.json"))
    lock = json.loads(read("package-lock.json"))
    if dev_package.get("version") != version or lock.get("version") != version:
        fail("root package or lockfile version mismatch")
    if lock.get("packages", {}).get("", {}).get("devDependencies") != dev_package.get("devDependencies"):
        fail("root package and lockfile dependencies differ")
    if any(not re.fullmatch(r"\d+\.\d+\.\d+", spec) for spec in dev_package.get("devDependencies", {}).values()):
        fail("QA dependencies must use exact versions")
    if tomllib.loads(read("python/pyproject.toml"))["project"]["version"] != python_version:
        fail("python/pyproject.toml version mismatch")
    for path in ["README.md", "index.html", "CITATION.cff"]:
        if version not in read(path):
            fail(f"{path} does not contain {version}")

    # Default depth should be 37 across the primary packages.
    required_depth_patterns = {
        "src/state/explorer_state.mjs": r'kMax:\s*37',
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
    print(f"Release version: {version}")
    print(f"DOM ids checked: {len(refs)} references")
    print("Formatting, DOI, and language hygiene checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
