#!/usr/bin/env python3
"""Stage only public explorer assets for Pages or local deployment testing."""
from __future__ import annotations

import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site"
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


def main() -> None:
    files = public_files()
    if OUTPUT.is_symlink():
        raise ValueError("Refusing to replace a symlink at site/")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for source in files:
        target = OUTPUT / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    print(f"Staged {len(files)} public assets in site/.")


if __name__ == "__main__":
    main()
