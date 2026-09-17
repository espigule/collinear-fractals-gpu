#!/usr/bin/env python3
"""Stage only public explorer assets for Pages or local deployment testing."""
from __future__ import annotations

import pathlib
import shutil
import argparse
import hashlib
import json
import os
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site"
CANONICAL_URL = "https://complextrees.com/collinear-fractals-gpu/"
MANIFEST_NAME = "deployment.json"
ROOT_FILES = (
    "index.html", "index.css", "explorer.js", ".nojekyll", "LICENSE", "LICENSE-docs.md",
    "LICENSES/CC-BY-4.0.txt", "NOTICE", "VERSION",
)
PUBLIC_TREES = {
    "src": {".js", ".mjs"},
    "workers": {".js", ".mjs"},
    "schemas": {".json"},
    "assets": {".svg", ".png", ".webp", ".jpg", ".jpeg", ".ico", ".woff2"},
    "gallery": {".json", ".md", ".svg", ".png", ".webp"},
    "examples": {".json", ".md", ".svg", ".png", ".webp"},
}


def public_files() -> list[pathlib.Path]:
    files = [ROOT / name for name in ROOT_FILES]
    for tree, extensions in PUBLIC_TREES.items():
        for path in (ROOT / tree).rglob("*"):
            rel = path.relative_to(ROOT / tree)
            if any(part.startswith(".") or part in {"generated", "rendered", "output"} for part in rel.parts):
                continue
            if path.is_file() and path.suffix.lower() in extensions:
                files.append(path)
    for path in files:
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f"Invalid public asset: {path.relative_to(ROOT)}")
    return sorted(files)


def source_revision() -> tuple[str | None, bool | None]:
    """Identify the checkout and tracked changes without local path disclosures.

    Asset fingerprints cover every copied file, including untracked public files;
    the dirty flag deliberately ignores untracked files and generated output.
    """
    def git(*args: str) -> str:
        return subprocess.check_output(
            ["git", "-C", str(ROOT), *args], text=True, stderr=subprocess.DEVNULL
        ).strip()

    try:
        # An unpacked release inside another checkout must not inherit its SHA.
        if pathlib.Path(git("rev-parse", "--show-toplevel")).resolve() != ROOT:
            return None, None
        commit = git("rev-parse", "HEAD")
        dirty = bool(git("status", "--porcelain=v1", "--untracked-files=no"))
    except (OSError, subprocess.CalledProcessError):
        return None, None
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Git did not return a full source commit")
    return commit, dirty


def create_manifest(directory: pathlib.Path, assets: list[str]) -> dict:
    commit, dirty = source_revision()
    manifest = {
        "schema_version": 1,
        "version": (directory / "VERSION").read_text(encoding="utf-8").strip(),
        "source_commit": commit,
        "source_dirty": dirty,
        "canonical_url": CANONICAL_URL,
        "asset_sha256": {
            name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
            for name in sorted(assets)
        },
    }
    # Keep the manifest reproducible locally. CI provenance is added only when
    # GitHub supplies a well-formed public run identifier, without other env data.
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) and re.fullmatch(r"[0-9]+", run_id):
        manifest["workflow_run_url"] = f"https://github.com/{repository}/actions/runs/{run_id}"
    return manifest


def validate_manifest(directory: pathlib.Path, assets: list[str]) -> dict:
    """Check manifest self-consistency against exact staged bytes and inventory.

    This verifies an existing artifact, not whether its bytes still equal a
    checkout that may have changed since staging. Re-stage to capture changes.
    """
    if directory.is_symlink():
        raise ValueError("Refusing to verify a symlink at site/")
    manifest = json.loads((directory / MANIFEST_NAME).read_text(encoding="utf-8"))
    if type(manifest.get("schema_version")) is not int or manifest["schema_version"] != 1 or manifest.get("canonical_url") != CANONICAL_URL:
        raise ValueError("Invalid deployment manifest identity")
    if manifest.get("version") != (directory / "VERSION").read_text(encoding="utf-8").strip():
        raise ValueError("Deployment manifest and staged VERSION differ")
    commit, dirty = manifest.get("source_commit"), manifest.get("source_dirty")
    if (commit is None and dirty is not None) or (commit is not None and (
        not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit) or type(dirty) is not bool
    )):
        raise ValueError("Invalid source revision in deployment manifest")
    fingerprints = manifest.get("asset_sha256")
    if not isinstance(fingerprints, dict) or list(fingerprints) != sorted(assets):
        raise ValueError("Deployment manifest must fingerprint every public asset in sorted order")
    actual = []
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise ValueError("Symlinks are not allowed in the staged site")
        if path.is_file():
            actual.append(path.relative_to(directory).as_posix())
    if sorted(actual) != sorted([*assets, MANIFEST_NAME]):
        raise ValueError("Staged site has missing or unexpected files")
    for name, fingerprint in fingerprints.items():
        if fingerprint != hashlib.sha256((directory / name).read_bytes()).hexdigest():
            raise ValueError(f"Deployment fingerprint mismatch: {name}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify an existing staged site's manifest without changing files")
    args = parser.parse_args()
    files = public_files()
    assets = [source.relative_to(ROOT).as_posix() for source in files]
    if args.check:
        validate_manifest(OUTPUT, assets)
        print(f"Verified {len(assets)} staged asset fingerprints.")
        return
    if OUTPUT.is_symlink():
        raise ValueError("Refusing to replace a symlink at site/")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for source in files:
        target = OUTPUT / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    manifest = create_manifest(OUTPUT, assets)
    (OUTPUT / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    validate_manifest(OUTPUT, assets)
    print(f"Staged {len(files)} public assets and {MANIFEST_NAME} in site/.")
    print(f"Source commit: {manifest['source_commit'] or 'unavailable'}; tracked changes: {manifest['source_dirty']}")


if __name__ == "__main__":
    main()
