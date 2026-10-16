import json
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

from app.library import Library, _link


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.videos = self.root / "video_project"
        self.videos.mkdir()
        self.skills = self.root / "skills"
        self.skills.mkdir()

    def write(self, path, text=""):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def library(self, **kw):
        return Library(self.videos, [self.skills], **kw)

    def test_project_versions_and_delivery_media(self):
        project = self.videos / "episode"
        self.write(project / "v1/package.json", json.dumps({"dependencies": {"remotion": "4", "three": "0.180"}}))
        self.write(project / "v2/package.json", "{}")
        self.write(project / "v2/output/中文 成片.mp4", "video")
        self.write(project / "v2/output/covers/封面.jpg", "image")
        self.write(project / "work/noise.mp4", "cache")
        self.write(project / "node_modules/noise/package.json", "{}")
        lib = self.library()
        snap = lib.snapshot()
        self.assertEqual(snap["totals"]["projects"], 1)
        p = snap["projects"][0]
        self.assertEqual(len(p["sourceRoots"]), 2)
        self.assertEqual(p["videoCount"], 1)
        self.assertEqual(p["latestVideo"]["name"], "中文 成片.mp4")
        self.assertEqual({m["kind"] for m in lib.media(p["id"])}, {"image", "video"})
        self.assertEqual(p["id"], lib.snapshot(refresh=True)["projects"][0]["id"])

    def test_empty_new_project_manifest_is_indexed(self):
        project = self.videos / "新知识"
        self.write(project / "README.md", "# 新知识")
        self.write(project / "project.json", json.dumps({"name": "新知识", "createdBy": "rainbow-workbench", "version": 1}))
        (project / "output").mkdir()
        (project / "work").mkdir()
        lib = self.library()
        indexed = lib.snapshot()["projects"]
        self.assertEqual(len(indexed), 1)
        self.assertEqual(indexed[0]["name"], "新知识")
        self.assertEqual(indexed[0]["videoCount"], 0)
        self.assertEqual(lib.project(indexed[0]["id"])["path"], str(project))

    def test_defaults_include_workbench_and_shared_skill_roots(self):
        for path, name in [(self.videos / "creator_workbench/skills/video-creative/SKILL.md", "video-creative"),
                           (self.videos / "shared/skills/cover/SKILL.md", "shared-cover")]:
            self.write(path, f"---\nname: {name}\ndescription: Local video skill\n---\nBody")
        with mock.patch.object(Path, "home", return_value=self.root / "empty-home"):
            lib = Library(self.videos)
            skills = lib.snapshot()["skills"]
            self.assertEqual({s["name"] for s in skills}, {"video-creative", "shared-cover"})

    def test_skill_dedup_and_different_implementations(self):
        body = "---\nname: video\ndescription: >\n  video creation\n  with preview\n---\nDo work."
        self.write(self.skills / "a/SKILL.md", body)
        self.write(self.skills / "b/SKILL.md", body)
        self.write(self.skills / "c/SKILL.md", body + " Different implementation.")
        lib = self.library()
        skills = lib.snapshot()["skills"]
        self.assertEqual(len(skills), 2)
        self.assertEqual(sum(len(s["aliases"]) for s in skills), 1)
        self.assertEqual(skills[0]["description"], "video creation with preview")
        self.assertTrue(lib.skill(skills[0]["id"])["content"].startswith("---"))
        with self.assertRaises(KeyError):
            lib.skill("../../secret")

    def test_plugin_only_registered_not_connected(self):
        self.write(self.skills / "plugin/.claude-plugin/plugin.json", json.dumps({"name": "test-mcp", "version": "1", "description": "Test"}))
        plugin = self.library().snapshot()["plugins"][0]
        self.assertEqual(plugin["status"], "unverified")

    def test_scope_prefix_does_not_leak_sibling(self):
        self.write(self.videos / "episode/package.json", "{}")
        self.write(self.videos / "episode_evil/output/secret.mp4", "secret")
        lib = self.library()
        p = next(p for p in lib.snapshot()["projects"] if p["name"] == "episode")
        lib.media(p["id"])
        lib._media[p["id"]].append({"id": "forged", "path": str(self.videos / "episode_evil/output/secret.mp4"), "kind": "video"})
        self.assertEqual(lib.media(p["id"]), [])
        with self.assertRaises(KeyError):
            lib.project(str(self.videos / "episode"))

    def test_symlink_directory_and_file_not_followed(self):
        self.write(self.videos / "episode/package.json", "{}")
        outside = self.root / "private"
        self.write(outside / "secret.mp4", "secret")
        try:
            (self.videos / "episode/output").symlink_to(outside, target_is_directory=True)
            (self.videos / "episode/leak.mp4").symlink_to(outside / "secret.mp4")
        except OSError:
            self.skipTest("OS policy disallows creating symlinks")
        lib = self.library()
        p = lib.snapshot()["projects"][0]
        self.assertEqual(lib.media(p["id"]), [])

    def test_windows_junction_reparse_attribute_rejected(self):
        with mock.patch.object(Path, "lstat", return_value=mock.Mock(st_mode=0o040755, st_file_attributes=0x400)):
            self.assertTrue(_link(Path("junction")))

    @unittest.skipUnless(os.name == "nt", "Windows junction test")
    def test_real_windows_junction_not_followed(self):
        self.write(self.videos / "episode/package.json", "{}")
        target = self.root / "private-junction-target"
        self.write(target / "secret.mp4", "secret")
        junction = self.videos / "episode/output"
        result = subprocess.run(["cmd", "/c", "mklink", "/J", str(junction), str(target)], capture_output=True)
        if result.returncode:
            self.skipTest("OS policy disallows junction creation")
        self.addCleanup(lambda: os.rmdir(junction) if junction.exists() else None)
        lib = self.library()
        project = lib.snapshot()["projects"][0]
        self.assertEqual(lib.media(project["id"]), [])
        self.assertTrue((target / "secret.mp4").is_file())

    def test_cached_data_cannot_be_mutated_by_caller(self):
        self.write(self.videos / "episode/package.json", "{}")
        lib = self.library()
        snap = lib.snapshot()
        pid = snap["projects"][0]["id"]
        snap["projects"][0]["path"] = str(self.root)
        self.assertEqual(lib.project(pid)["path"], str(self.videos / "episode"))

    def test_media_cap_and_truncation_exposed(self):
        self.write(self.videos / "episode/package.json", "{}")
        for n in range(4):
            self.write(self.videos / f"episode/output/{n}.mp4", "video")
        snap = self.library(max_media=2).snapshot()
        self.assertEqual(snap["totals"]["videos"], 2)
        self.assertTrue(snap["scan"]["truncated"])

    def test_first_paint_never_walks_sources_or_resources(self):
        project = self.videos / "episode"
        self.write(project / "package.json", "{}")
        self.write(project / "output/成片_v2.mp4", "video")
        self.write(project / "public/assets/nested/raw.mp4", "video")
        self.write(self.skills / "big/SKILL.md", "body")
        lib = self.library()
        with mock.patch.object(lib, "_walk", side_effect=AssertionError("full scan")), mock.patch.object(lib, "_scan_skills", side_effect=AssertionError("skills")), mock.patch.object(lib, "_scan_tools", side_effect=AssertionError("tools")):
            snap = lib.snapshot(lightweight=True)
            self.assertEqual(snap["totals"]["projects"], 1)
            self.assertEqual(snap["totals"]["videos"], 1)
            self.assertEqual(snap["skills"], [])
            self.assertFalse(snap["resourcesLoaded"])
            self.assertEqual(lib.media_page(snap["projects"][0]["id"])["total"], 1)
        self.assertFalse(lib._media)

    def test_latest_version_precedes_mtime_but_excludes_intermediates(self):
        project = self.videos / "episode"
        self.write(project / "package.json", "{}")
        old = project / "v9/delivery/master.mp4"
        newer = project / "v12/delivery/master.mp4"
        self.write(old, "old"); self.write(newer, "new")
        os.utime(newer, (100, 100)); os.utime(old, (200, 200))
        for name in ["preview", "chunk-0-900", "opening", "片头60秒", "路线推理10秒", "picture", "benchmark-shell"]:
            self.write(project / ("v99/output/" + name + ".mp4"), "temporary")
        p = self.library().snapshot(lightweight=True)["projects"][0]
        self.assertEqual(p["latestVideo"]["path"], str(newer))

    def test_delivery_budget_prioritizes_newest_version(self):
        for n in (1, 2, 19):
            self.write(self.videos / f"episode/v{n}/output/final.mp4", "video")
        snap = self.library(max_media=1).snapshot(lightweight=True)
        self.assertIn("v19", snap["projects"][0]["latestVideo"]["relativePath"])

    def test_approved_current_release_wins_until_changed(self):
        project = self.videos / "episode"
        chosen = project / "v1/output/final.mp4"
        self.write(chosen, "approved")
        self.write(project / "v20/output/final.mp4", "newer")
        st = chosen.stat()
        self.write(project / ".studio/current-release.json", json.dumps({"path": chosen.relative_to(project).as_posix(), "probe": {"fullDecodeChecked": True}, "fingerprint": {"size": st.st_size, "mtimeNs": st.st_mtime_ns, "sha256": hashlib.sha256(chosen.read_bytes()).hexdigest()}}))
        lib = self.library()
        p = lib.snapshot(lightweight=True)["projects"][0]
        self.assertTrue(p["latestVideo"]["approved"])
        self.assertEqual(p["latestVideo"]["path"], str(chosen))
        self.write(chosen, "modified bytes")
        page = lib.media_page(p["id"], refresh=True)
        self.assertIn("v20", page["items"][0]["relativePath"])

    def test_latest_covers_one_per_ratio_and_not_thumbs_or_scene_assets(self):
        project = self.videos / "episode"
        self.write(project / "package.json", "{}")
        for version in [1, 4]:
            for ratio in ["16x9", "3x4", "4x3", "9x16"]:
                self.write(project / f"v{version}/covers/封面_{ratio}.jpg", "image")
                self.write(project / f"v{version}/covers/{ratio}_thumb160.jpg", "thumb")
                self.write(project / f"v{version}/covers/review/封面_{ratio}_160.png", "review")
        self.write(project / "v99/output/arbitrary_16x9.jpg", "unrelated")
        self.write(project / "v99/cover_artwork/anatomy-clean.jpg", "scene")
        lib = self.library()
        p = lib.snapshot(lightweight=True)["projects"][0]
        self.assertEqual([c["ratio"] for c in p["latestCovers"]], ["16:9", "3:4", "4:3", "9:16"])
        self.assertTrue(all("v4/covers/封面_" in c["relativePath"] for c in p["latestCovers"]))
        self.assertEqual(lib.media_page(p["id"])["total"], 4)

    def test_declared_cover_outside_delivery_is_read_without_asset_scan(self):
        project = self.videos / "episode"
        self.write(project / "package.json", "{}")
        self.write(project / "assets/artwork/hero.jpg", "cover")
        self.write(project / "v99/covers/old_1x1.jpg", "old cover")
        self.write(project / ".studio/project.json", json.dumps({"covers": [{"path": "assets/artwork/hero.jpg", "ratio": "1:1"}, {"path": "../../private.jpg", "ratio": "4:3"}]}))
        p = self.library().snapshot(lightweight=True)["projects"][0]
        self.assertEqual(len(p["latestCovers"]), 1)
        self.assertEqual(p["latestCovers"][0]["ratio"], "1:1")
        self.assertEqual(p["latestCovers"][0]["relativePath"], "assets/artwork/hero.jpg")

    def test_history_is_lazy_paged_and_never_scans_other_projects(self):
        for name in ["one", "two"]:
            self.write(self.videos / name / "package.json", "{}")
            for version in range(1, 6):
                self.write(self.videos / name / f"v{version}/output/final.mp4", "video")
        lib = self.library()
        projects = lib.snapshot(lightweight=True)["projects"]
        pid = projects[0]["id"]
        with mock.patch.object(lib, "_scan_project_media", wraps=lib._scan_project_media) as scan:
            latest = lib.media_page(pid)
            scan.assert_not_called()
            first = lib.media_page(pid, "history", 0, 2)
            second = lib.media_page(pid, "history", first["nextOffset"], 2)
            self.assertEqual(scan.call_count, 1)
            self.assertEqual(scan.call_args.args[0]["id"], pid)
            self.assertEqual(first["total"], 4)
            self.assertTrue(first["hasMore"])
            self.assertFalse(second["hasMore"])
            ids = {r["id"] for r in first["items"] + second["items"]}
            self.assertEqual(len(ids), 4)
            self.assertNotIn(latest["items"][0]["id"], ids)
        self.assertNotIn(projects[1]["id"], lib._media)

    def test_refresh_one_gallery_does_not_refresh_other_projects(self):
        for name in ["one", "two"]:
            self.write(self.videos / name / "output/final.mp4", "video")
        lib = self.library()
        projects = lib.snapshot(lightweight=True)["projects"]
        with mock.patch.object(lib, "_scan_project_light", wraps=lib._scan_project_light) as scan:
            lib.media_page(projects[0]["id"], refresh=True)
            self.assertEqual(scan.call_count, 1)
            self.assertEqual(scan.call_args.args[0], Path(projects[0]["path"]))
            scan.reset_mock()
            lib.snapshot(refresh=True, lightweight=True)
            scan.assert_not_called()

    def test_warm_persistent_index_skips_delivery_and_resource_scans(self):
        self.write(self.videos / "episode/output/final.mp4", "video")
        first = self.library().snapshot(lightweight=True)
        lib = self.library()
        with mock.patch.object(lib, "_scan_project_light", side_effect=AssertionError("delivery rescan")), mock.patch.object(lib, "_walk", side_effect=AssertionError("full scan")):
            second = lib.snapshot(lightweight=True)
        self.assertEqual(first["projects"], second["projects"])

    def test_lookup_is_durable_for_paged_history_and_registered_frame(self):
        project = self.videos / "episode"
        self.write(project / "output/final_v1.mp4", "old")
        self.write(project / "output/final_v2.mp4", "new")
        lib = self.library()
        pid = lib.snapshot(lightweight=True)["projects"][0]["id"]
        old = lib.media_page(pid, "history")["items"][0]
        frame = project / "references/frames/generated.jpg"
        self.write(frame, "capture")
        registered = lib.register_media(frame, pid)
        other = self.library()
        with mock.patch.object(other, "_walk", side_effect=AssertionError("full scan")), mock.patch.object(other, "_scan_project_media", side_effect=AssertionError("history scan")):
            self.assertEqual(other.media_lookup(old["id"])["path"], old["path"])
            self.assertEqual(other.media_lookup(registered["id"])["path"], str(frame))
        self.assertNotIn(registered["id"], {r["id"] for r in other.media_page(pid)["items"]})
        with self.assertRaises(ValueError):
            lib.register_media(self.skills / "external.jpg", pid)
        with self.assertRaises(KeyError):
            lib.media_lookup("../../private")

    def test_persisted_lookup_revalidates_project_ownership(self):
        self.write(self.videos / "one/output/final.mp4", "one")
        self.write(self.videos / "two/output/final.mp4", "two")
        lib = self.library(); projects = lib.snapshot(lightweight=True)["projects"]
        row = lib.media_page(projects[0]["id"])["items"][0]
        cache = lib._cache_root / "lookup" / (row["id"] + ".json")
        forged = {**row, "projectId": projects[1]["id"]}
        self.write(cache, json.dumps(forged))
        lib._lookup.clear()
        with self.assertRaises(KeyError):
            lib.media_lookup(row["id"])

    def test_modified_old_video_invalidates_delivery_selection(self):
        project = self.videos / "episode"
        first, second = project / "output/one.mp4", project / "output/two.mp4"
        self.write(first, "one"); self.write(second, "two")
        os.utime(first, (100, 100)); os.utime(second, (200, 200))
        lib = self.library(); p = lib.snapshot(lightweight=True)["projects"][0]
        self.assertEqual(p["latestVideo"]["path"], str(second))
        os.utime(first, (300, 300))
        self.assertEqual(lib.media_page(p["id"])["items"][0]["path"], str(first))


if __name__ == "__main__":
    unittest.main()
