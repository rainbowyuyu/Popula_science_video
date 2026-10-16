"""Offline workboard/evidence tests. No model or media generation API calls."""
import copy
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest

from app.creative_work import (ensure_work, public_work, update_plan, report_artifact,
                               record_check, observe_tool)
from app.harness import RunManager, safe_path
from app.providers import ProviderError
from tests.test_run_continuation import Library, Providers, call, reply, tool_names


class CreativeWorkTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.run = {"id": "run", "projectId": "project", "prompt": "改善镜头与声音",
                    "status": "running", "phase": "execute", "createdAt": "2026-10-16",
                    "phases": [{"id": "execute", "title": "创作执行", "status": "running"}],
                    "events": [], "changedFiles": []}

    def tearDown(self):
        self.tmp.cleanup()

    def artifact(self, name="preview.mp4", **args):
        (self.project / name).write_bytes(b"example real file")
        return report_artifact(self.run, self.project,
                               {"path": name, "title": "片段预览", "kind": "video", **args}, safe_path)

    def evidence(self, name="run_process", args=None, value=None):
        return observe_tool(self.run, name, args or {"program": "node", "args": ["check.mjs"]},
                            value or {"exitCode": 0, "log": "runs/run/check.log"})["evidenceId"]

    def check(self, **args):
        return record_check(self.run, {"title": "画面验证", "kind": "automatic", "status": "passed", **args})["check"]

    def test_legacy_snapshot_derives_phase_workboard_without_mutation(self):
        before = copy.deepcopy(self.run)
        work = public_work(self.run)
        self.assertEqual(work["currentStep"], "execute")
        self.assertEqual(work["steps"][0]["status"], "in_progress")
        self.assertEqual(work["steps"][0]["verificationStatus"], "unverified")
        self.assertEqual(self.run, before)

    def test_plan_merges_steps_preserves_verification_and_validates_phase(self):
        update_plan(self.run, {"steps": [{"id": "shot", "title": "镜头布局", "status": "in_progress"}], "currentStep": "shot"})
        check = self.check(evidenceIds=[self.evidence()], stepId="shot")
        update_plan(self.run, {"steps": [{"id": "shot", "title": "镜头布局", "status": "completed"}, {"id": "audio", "title": "声音"}]})
        work = public_work(self.run)
        self.assertEqual(work["steps"][0]["verification"], [check["id"]])
        self.assertEqual(work["steps"][0]["verificationStatus"], "verified")
        self.assertEqual(len(work["steps"]), 2)
        with self.assertRaises(ValueError):
            update_plan(self.run, {"steps": [{"id": "foreign", "title": "错误阶段", "phaseId": "other-run"}]})
        with self.assertRaises(ValueError):
            update_plan(self.run, {"currentStep": "not-in-plan"})

    def test_written_files_and_model_claims_are_not_executed_validation(self):
        written = self.evidence("write_file", {"path": "scene.ts"}, {"written": "scene.ts", "sha256": "abc"})
        check = self.check(evidenceIds=[written])
        self.assertEqual(check["status"], "unverified")
        self.assertEqual(self.check()["status"], "unverified")
        self.assertEqual(self.check(kind="manual", evidenceIds=[self.evidence()])["status"], "unverified")
        with self.assertRaises(ValueError):
            self.check(evidenceIds=["forged-evidence"])

    def test_failed_process_cannot_be_reported_as_passed(self):
        fact = self.evidence(value={"exitCode": 2, "log": "runs/run/error.log"})
        self.assertEqual(self.check(evidenceIds=[fact])["status"], "unverified")
        self.assertEqual(self.check(evidenceIds=[fact], status="failed")["status"], "failed")

    def test_frame_evidence_distinguishes_sampling_from_listening_and_history(self):
        fact = self.evidence("inspect_frame", {"path": "video.mp4"}, {"path": "video.mp4", "timeSec": 12.5, "imageAttached": True})
        check = self.check(kind="sampled_frames", evidenceIds=[fact])
        self.assertEqual(check["status"], "passed")
        self.assertEqual(check["source"], "model_review")
        self.assertIn("不代表全片", check["reviewLimit"])
        self.assertEqual(self.check(kind="listening", evidenceIds=[fact])["status"], "unverified")
        historic = self.evidence("project_memory_image", {}, {"recordId": "old", "imageAttached": True})
        self.assertEqual(self.check(kind="sampled_frames", evidenceIds=[historic])["status"], "unverified")

    def test_media_job_queued_not_evidence_completed_is_automatic_only(self):
        queued = observe_tool(self.run, "project_job", {"id": "job"}, {"id": "job", "status": "running"})
        self.assertNotIn("evidenceId", queued)
        fact = self.evidence("project_job", {"id": "job"}, {"id": "job", "status": "completed", "output": {"relativePath": "clip.mp4"}})
        self.assertEqual(self.check(evidenceIds=[fact])["status"], "passed")
        self.assertEqual(self.check(kind="sampled_frames", evidenceIds=[fact])["status"], "unverified")

    def test_real_nonempty_artifact_has_fingerprint_not_automatic_acceptance(self):
        artifact = self.artifact(stage="final")["artifact"]
        self.assertEqual(artifact["bytes"], 17)
        self.assertEqual(len(artifact["sha256"]), 64)
        self.assertEqual(artifact["verificationStatus"], "unverified")
        self.assertEqual(artifact["projectId"], "project")
        same = self.artifact()["artifact"]
        self.assertEqual(same["id"], artifact["id"])
        self.assertEqual(len(self.run["creativeWork"]["artifacts"]), 1)

    def test_artifact_rejects_missing_empty_wrong_kind_bad_stage_and_paths(self):
        for path in ("missing.mp4", "../outside.mp4", str(self.root / "outside.mp4")):
            with self.assertRaises(ValueError):
                report_artifact(self.run, self.project, {"path": path, "title": "无效", "kind": "video"}, safe_path)
        (self.project / "empty.mp4").touch()
        with self.assertRaises(ValueError):
            report_artifact(self.run, self.project, {"path": "empty.mp4", "title": "空文件", "kind": "video"}, safe_path)
        with self.assertRaises(ValueError):
            self.artifact(kind="audio")
        with self.assertRaises(ValueError):
            self.artifact(stage="approved-by-user")

    def test_symlink_artifact_rejected(self):
        target = self.root / "outside.mp4"
        target.write_bytes(b"outside")
        try:
            (self.project / "linked.mp4").symlink_to(target)
        except OSError:
            self.skipTest("Windows symlink privilege unavailable")
        with self.assertRaises(ValueError):
            report_artifact(self.run, self.project, {"path": "linked.mp4", "title": "链接", "kind": "video"}, safe_path)

    def test_isolated_version_has_canonical_project_path(self):
        version = self.project / "output" / "versions" / "run"
        version.mkdir(parents=True)
        (version / "scene.png").write_bytes(b"version frame")
        self.run["versionWorkspace"] = str(version)
        result = report_artifact(self.run, self.project, {"path": "scene.png", "title": "新版", "kind": "image"}, safe_path)["artifact"]
        self.assertEqual(result["path"], "output/versions/run/scene.png")
        self.assertEqual(result["workspace"], "version")
        self.assertFalse((self.project / "scene.png").exists())

    def test_checks_bind_to_same_artifact_and_version_not_arbitrary_success(self):
        artifact = self.artifact()["artifact"]
        frame = self.evidence("inspect_frame", {}, {"path": "preview.mp4", "timeSec": 1,
            "imageAttached": True, "sourceFingerprint": artifact["fingerprint"]})
        check = self.check(kind="sampled_frames", evidenceIds=[frame], artifactId=artifact["id"])
        self.assertEqual(check["status"], "passed")
        self.assertEqual(public_work(self.run)["artifacts"][0]["verificationStatus"], "verified")
        (self.project / "preview.mp4").write_bytes(b"a different complete file version")
        updated = report_artifact(self.run, self.project, {"path": "preview.mp4", "title": "新版本", "kind": "video", "checkIds": [check["id"]]}, safe_path)["artifact"]
        self.assertEqual(updated["verificationStatus"], "unverified")
        stale = self.check(kind="sampled_frames", evidenceIds=[frame], artifactId=artifact["id"])
        self.assertEqual(stale["status"], "unverified")
        unrelated = self.check(evidenceIds=[self.evidence()], artifactId=artifact["id"])
        self.assertEqual(unrelated["status"], "unverified")

    def test_changed_files_migrate_as_write_evidence_without_verifying_render(self):
        self.run["changedFiles"] = [{"path": "model.py", "sha256": "server-hash"}]
        self.check()
        self.assertEqual(self.run["_creativeEvidence"][0]["kind"], "file_write")
        self.assertEqual(self.check(evidenceIds=["evidence-1"])["status"], "unverified")

    def test_legacy_successful_tool_events_migrate_once(self):
        self.run["events"] = [{"type": "tool_result", "tool": "run_process", "message": json.dumps({"exitCode": 0, "log": "old.log"})}]
        first = self.check()
        self.assertEqual(first["status"], "unverified")
        second = self.check(evidenceIds=["evidence-1"])
        self.assertEqual(second["status"], "passed")
        self.assertEqual(len(self.run["_creativeEvidence"]), 1)

    def test_compact_projection_keeps_full_saved_checks(self):
        for i in range(55):
            self.check(title="检查" + str(i), status="not_run")
        work = public_work(self.run)
        self.assertEqual(len(work["checks"]), 40)
        self.assertEqual(work["counts"]["checks"], 55)
        self.assertEqual(len(self.run["creativeWork"]["checks"]), 55)

    def test_review_mode_tools_persist_and_restore_shared_workboard(self):
        resources = self.root / "resources"
        resources.mkdir()
        providers = Providers([
            reply("", [call("update_work_plan", {"goal": "只读核对", "steps": [{"id": "read", "title": "检查素材", "status": "in_progress"}], "currentStep": "read"})]),
            reply("", [call("record_check", {"title": "试听尚未执行", "kind": "listening", "status": "not_run", "stepId": "read"})]),
            reply("已记录只读检查范围。")])
        manager = RunManager(Library(self.project), providers, self.root / "state", resources)
        ident = manager.start({"projectId": "project", "provider": "openai", "mode": "review", "prompt": "核对素材"})["id"]
        self.assertTrue(manager.semaphore.acquire(timeout=10))
        result = manager.get(ident)
        self.assertEqual(result["status"], "completed", result["response"])
        self.assertEqual(result["creativeWork"]["goal"], "只读核对")
        self.assertEqual(result["creativeWork"]["checks"][0]["status"], "not_run")
        self.assertTrue(all("update_work_plan" in tool_names(c) and "run_process" not in tool_names(c) for c in providers.calls))
        restored = RunManager(Library(self.project), Providers([]), self.root / "state", resources)
        self.assertEqual(restored.get(ident)["creativeWork"], result["creativeWork"])
        self.assertEqual(list(self.project.iterdir()), [])

    def test_harness_captures_actual_tool_result_and_not_fake_references(self):
        resources = self.root / "resources"
        resources.mkdir()
        providers = Providers([
            reply("", [call("write_file", {"path": "scene.ts", "content": "export const a = 1;"})]),
            reply("", [call("report_artifact", {"path": "scene.ts", "title": "场景源码", "kind": "source"})]),
            reply("", [call("record_check", {"title": "假称已渲染", "kind": "automatic", "status": "passed", "evidenceIds": ["evidence-1"]})]),
            reply("仅已生成源码，未渲染。")])
        manager = RunManager(Library(self.project), providers, self.root / "state", resources)
        ident = manager.start({"projectId": "project", "provider": "openai", "prompt": "生成源码"})["id"]
        self.assertTrue(manager.semaphore.acquire(timeout=10))
        result = manager.get(ident)
        self.assertEqual(result["status"], "completed", result["response"])
        self.assertNotIn("_creativeEvidence", result)
        self.assertEqual(result["creativeWork"]["evidence"][0]["kind"], "file_write")
        self.assertEqual(result["creativeWork"]["checks"][0]["status"], "unverified")
        self.assertEqual(result["creativeWork"]["artifacts"][0]["path"], "scene.ts")

    def test_dual_model_resume_preserves_plan_artifact_and_evidence_without_replay(self):
        resources = self.root / "resources"
        resources.mkdir()
        initial = Providers([
            reply("", [call("update_work_plan", {"goal": "有证据的镜头迭代", "steps": [{"id": "render", "title": "修改与预览"}], "currentStep": "render"})]),
            reply("计划完成"),
            reply("", [call("write_file", {"path": "scene.ts", "content": "export const scene=1;"})]),
            ProviderError("timeout", kind="timeout", retryable=True)])
        manager = RunManager(Library(self.project), initial, self.root / "state", resources)
        ident = manager.start({"projectId": "project", "provider": "dual", "prompt": "改善镜头"})["id"]
        self.assertTrue(manager.semaphore.acquire(timeout=10))
        self.assertEqual(manager.get(ident)["status"], "paused")
        next_provider = Providers([
            reply("", [call("report_artifact", {"path": "scene.ts", "title": "镜头源码", "kind": "source"})]),
            reply("源码已核对"),
            reply("", [call("record_check", {"title": "尚未生成预览", "kind": "sampled_frames", "status": "not_run", "stepId": "render"})]),
            reply("待渲染后检查"), reply("保留源码与未验收项")])
        restored = RunManager(Library(self.project), next_provider, self.root / "state", resources)
        restored.resume(ident)
        self.assertTrue(restored.semaphore.acquire(timeout=10))
        result = restored.get(ident)
        self.assertEqual(result["status"], "completed", result["response"])
        self.assertEqual(result["creativeWork"]["goal"], "有证据的镜头迭代")
        self.assertEqual(result["creativeWork"]["artifacts"][0]["path"], "scene.ts")
        self.assertEqual(result["creativeWork"]["checks"][0]["phaseId"], "motion")
        self.assertEqual(len(result["creativeWork"]["evidence"]), 1)
        self.assertEqual(len(result["changedFiles"]), 1)

    def test_real_media_registration_returns_preview_id_without_scanning_history(self):
        resources = self.root / "resources"
        resources.mkdir()
        self.artifact()
        class RegisterLibrary(Library):
            def register_media(this, path, project_id):
                self.assertEqual(path, self.project / "preview.mp4")
                self.assertEqual(project_id, "project")
                return {"id": "media_" + "a" * 24}
            def media(this, ident):
                raise AssertionError("workboard must not scan media history")
        manager = RunManager(RegisterLibrary(self.project), Providers([]), self.root / "state", resources)
        manager.runs["run"] = self.run
        result = manager.tool("run", manager.library.project("project"), "report_artifact",
                              {"path": "preview.mp4", "title": "可预览片段", "kind": "video"}, threading.Event())
        stat = (self.project / "preview.mp4").stat()
        self.assertEqual(result["artifact"]["url"], "/api/media/media_" + "a" * 24 + f"?v={stat.st_mtime_ns}-{stat.st_size}")
        self.assertEqual(result["artifact"]["media"]["modified"], stat.st_mtime)
        self.assertEqual(result["artifact"]["projectId"], "project")


if __name__ == "__main__":
    unittest.main()
