"""Integrity regressions for the public deployment manifest."""
from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import stage_site


class DeploymentIntegrityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = TemporaryDirectory(prefix="collinear-stage-")
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.assets = ["VERSION", "index.html"]
        (self.root / "VERSION").write_text("0.2.0-alpha\n", encoding="utf-8")
        (self.root / "index.html").write_text("<!doctype html><title>Fixture</title>", encoding="utf-8")
        self.manifest = stage_site.create_manifest(self.root, self.assets)
        self.write_manifest()

    def write_manifest(self) -> None:
        (self.root / stage_site.MANIFEST_NAME).write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_fingerprints_match_known_bytes_in_a_stable_order(self) -> None:
        self.assertEqual(stage_site.validate_manifest(self.root, self.assets), self.manifest)
        self.assertEqual(list(self.manifest["asset_sha256"]), self.assets)
        # Independent SHA-256 oracle for the literal fixture, not a call back to
        # the staging implementation or an expected value regenerated at runtime.
        self.assertEqual(
            self.manifest["asset_sha256"]["index.html"],
            "cf90016b72b4f38a7fcc072ba1cc0deb28c6a5032cc5ee3f483d618d32920429",
        )
        self.assertNotIn(stage_site.MANIFEST_NAME, self.manifest["asset_sha256"])

    def test_altered_asset_is_rejected(self) -> None:
        (self.root / "index.html").write_text("An older explorer", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "fingerprint mismatch"):
            stage_site.validate_manifest(self.root, self.assets)

    def test_missing_or_unexpected_assets_are_rejected(self) -> None:
        extra = self.root / "private.txt"
        extra.write_text("This must not be published", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "missing or unexpected"):
            stage_site.validate_manifest(self.root, self.assets)
        extra.unlink()
        (self.root / "index.html").unlink()
        with self.assertRaisesRegex(ValueError, "missing or unexpected"):
            stage_site.validate_manifest(self.root, self.assets)

    def test_revision_and_version_cannot_misidentify_the_staged_release(self) -> None:
        self.manifest["version"] = "a different version"
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "VERSION differ"):
            stage_site.validate_manifest(self.root, self.assets)
        self.manifest["version"] = "0.2.0-alpha"
        self.manifest["source_commit"] = "1234567"
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "source revision"):
            stage_site.validate_manifest(self.root, self.assets)

    def test_unpacked_sources_report_unknown_revision_instead_of_inheriting_one(self) -> None:
        with patch.object(stage_site, "ROOT", self.root):
            self.assertEqual(stage_site.source_revision(), (None, None))
            self.manifest = stage_site.create_manifest(self.root, self.assets)
        self.write_manifest()
        self.assertIsNone(stage_site.validate_manifest(self.root, self.assets)["source_commit"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
