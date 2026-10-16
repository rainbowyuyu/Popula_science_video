"""Offline tests for manifest confinement, integrity, and safe recovery."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("assets", Path(__file__).resolve().parents[1] / "tools/assets.py")
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class AssetsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "new"
        self.old = self.root / "old"
        self.dest = self.repo / "video_project/demo"
        self.source = self.old / "video_project/demo"
        self.dest.mkdir(parents=True)
        self.source.mkdir(parents=True)
        self.payload = b"verified video bytes"
        self.asset = {"path": "public/video.mp4", "bytes": len(self.payload), "availability": "local-only",
                      "reason": "large-media", "sha256": hashlib.sha256(self.payload).hexdigest()}

    def manifest(self, entries=None):
        (self.dest / "assets.manifest.json").write_text(json.dumps({"schemaVersion": 1, "project": "demo", "assets": entries or [self.asset]}), encoding="utf-8")

    def source_file(self, payload=None):
        p = self.source / self.asset["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(self.payload if payload is None else payload)
        return p

    def symlink(self, link, target, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
        except (OSError, NotImplementedError):
            if os.name == "nt" and directory:
                result = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], capture_output=True)
                if result.returncode == 0:
                    return
            self.skipTest("Host does not allow creating symbolic links")

    def test_reject_traversal_and_cross_platform_absolute_paths(self):
        for value in ["../escape", "a/../escape", "a\\..\\escape", "/etc/passwd", "C:/outside",
                      "C:\\outside", "C:relative", "\\\\server\\share\\x", "a//b", "a/./b", "a:stream", "NUL.txt", "a./b"]:
            with self.subTest(path=value), self.assertRaises(assets.AssetError):
                assets.relative_path(value)

    def test_hash_verified_restore_and_idempotent_no_overwrite(self):
        self.source_file()
        self.assertIn("SHA-256 verified", assets.restore_asset(self.dest, self.source, self.asset))
        destination = self.dest / self.asset["path"]
        stamp = destination.stat().st_mtime_ns
        self.assertIn("already present", assets.restore_asset(self.dest, self.source, self.asset))
        self.assertEqual(destination.read_bytes(), self.payload)
        self.assertEqual(destination.stat().st_mtime_ns, stamp)

    def test_bad_hash_leaves_destination_absent(self):
        self.source_file(b"x" * len(self.payload))
        with self.assertRaisesRegex(assets.AssetError, "SHA-256"):
            assets.restore_asset(self.dest, self.source, self.asset)
        self.assertFalse((self.dest / self.asset["path"]).exists())

    def test_existing_conflicting_file_is_not_overwritten(self):
        self.source_file()
        target = self.dest / self.asset["path"]
        target.parent.mkdir()
        target.write_bytes(b"original")
        with self.assertRaises(assets.AssetError):
            assets.restore_asset(self.dest, self.source, self.asset)
        self.assertEqual(target.read_bytes(), b"original")

    def test_size_only_verification_is_explicit(self):
        p = self.source_file()
        entry = dict(self.asset, sha256=None)
        self.assertIn("WARNING: size-only", assets.verify(p, entry))
        p.write_bytes(b"wrong length")
        with self.assertRaisesRegex(assets.AssetError, "size"):
            assets.verify(p, entry)

    def test_destination_symlink_escape_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        self.symlink(self.dest / "public", outside, True)
        self.source_file()
        with self.assertRaises(assets.AssetError):
            assets.restore_asset(self.dest, self.source, self.asset)
        self.assertFalse((outside / "video.mp4").exists())

    def test_source_symlink_escape_is_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "video.mp4").write_bytes(self.payload)
        self.symlink(self.source / "public", outside, True)
        with self.assertRaises(assets.AssetError):
            assets.restore_asset(self.dest, self.source, self.asset)

    def test_staging_symlink_escape_is_rejected(self):
        outside = self.source_file()
        stage = self.dest / ".stage"
        stage.mkdir()
        self.symlink(stage / "download.mp4", outside)
        with self.assertRaises(assets.AssetError):
            assets.commit_staged(stage / "download.mp4", stage, self.dest, self.asset)
        self.assertFalse((self.dest / self.asset["path"]).exists())

    def test_staging_parent_junction_escape_is_rejected(self):
        outside = self.source_file()
        stage = self.dest / ".stage"
        stage.mkdir()
        self.symlink(stage / "redirect", outside.parent, True)
        with self.assertRaises(assets.AssetError):
            assets.commit_staged(stage / "redirect/video.mp4", stage, self.dest, self.asset)
        self.assertFalse((self.dest / self.asset["path"]).exists())

    def test_video_project_root_junction_escape_is_rejected(self):
        alternate = self.root / "alternate"
        alternate.mkdir()
        self.symlink(alternate / "video_project", self.repo / "video_project", True)
        with self.assertRaises(assets.AssetError):
            assets.project_directory(alternate, "demo")

    def test_atomic_commit_does_not_overwrite_file_created_after_check(self):
        stage = self.dest / ".stage"
        stage.mkdir()
        downloaded = stage / "download.mp4"
        downloaded.write_bytes(self.payload)
        original_link = assets.os.link
        def raced_link(source, destination):
            Path(destination).write_bytes(b"concurrent edit")
            return original_link(source, destination)
        with patch.object(assets.os, "link", side_effect=raced_link), self.assertRaises(assets.AssetError):
            assets.commit_staged(downloaded, stage, self.dest, self.asset)
        self.assertEqual((self.dest / self.asset["path"]).read_bytes(), b"concurrent edit")

    def test_manifest_identity_and_duplicate_paths_are_checked(self):
        self.manifest([self.asset, dict(self.asset, path="PUBLIC/VIDEO.MP4")])
        with self.assertRaisesRegex(assets.AssetError, "Duplicate"):
            assets.load_manifest(self.repo, "demo")
        (self.dest / "assets.manifest.json").write_text('{"schemaVersion":1,"project":"other","assets":[]}', encoding="utf-8")
        with self.assertRaisesRegex(assets.AssetError, "project"):
            assets.load_manifest(self.repo, "demo")

    def test_release_pattern_cannot_escape_or_expand(self):
        for name in ["../x", "*.mp4", "folder/file.mp4", "C:/file.mp4", "foo[12].mp4"]:
            entry = dict(self.asset, availability="release", release={"repo": "owner/repo", "tag": "v1", "name": name})
            with self.subTest(name=name), self.assertRaises(assets.AssetError):
                assets.validate_asset(entry)

    def test_licensed_dependency_is_skipped_unless_explicit(self):
        self.asset["reason"] = assets.LICENSED_REASON
        self.manifest()
        self.source_file()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(assets.main(["restore", "--project", "demo", "--source-root", str(self.old)], repo_root=self.repo), 0)
            self.assertFalse((self.dest / self.asset["path"]).exists())
            self.assertEqual(assets.main(["restore", "--project", "demo", "--source-root", str(self.old), "--include-licensed"], repo_root=self.repo), 0)
        self.assertTrue((self.dest / self.asset["path"]).exists())
        with self.assertRaisesRegex(assets.AssetError, "Commercial"):
            assets.download_asset(self.dest, self.asset)

    def test_default_command_only_lists_without_recovery(self):
        self.manifest()
        self.source_file()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(assets.main(["--project", "demo"], repo_root=self.repo), 0)
        self.assertIn("missing", out.getvalue())
        self.assertFalse((self.dest / self.asset["path"]).exists())

    def test_check_reports_missing_without_network(self):
        self.manifest()
        with patch.object(assets.subprocess, "run", side_effect=AssertionError("No network allowed")), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(assets.main(["check", "--project", "demo"], repo_root=self.repo), 1)


if __name__ == "__main__":
    unittest.main()
