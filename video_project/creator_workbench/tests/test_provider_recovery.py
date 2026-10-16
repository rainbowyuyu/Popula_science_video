"""Offline recovery from transient API failures without replaying side effects."""
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from app.harness import RunManager
from app.providers import ProviderError
from tests.test_run_continuation import Library, Providers, call, reply


class RecordingProviders(Providers):
    def complete(self, provider, messages, **kwargs):
        try:
            return super().complete(provider, messages, **kwargs)
        finally:
            self.calls[-1]["requestedModel"] = kwargs.get("model")


class ProviderRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.state = self.root / "state"
        self.resources = self.root / "resources"
        self.resources.mkdir()
        self.library = Library(self.project)

    def tearDown(self):
        self.tmp.cleanup()

    def manager(self, responses):
        provider = RecordingProviders(responses)
        return RunManager(self.library, provider, self.state, self.resources), provider

    def start(self, manager, **body):
        return manager.start({"projectId": "project", "prompt": "继续已保存工程并检查", "provider": "dual", **body})["id"]

    def wait(self, manager, ident, status):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            row = manager.get(ident)
            if row["status"] not in {"queued", "running", "cancelling"}:
                self.assertTrue(manager.semaphore.acquire(timeout=2), "worker did not finish")
                manager.semaphore.release()
                row = manager.get(ident)
                self.assertEqual(row["status"], status, row.get("response"))
                return row
            time.sleep(.01)
        self.fail("offline provider recovery timeout")

    def transient(self):
        return ProviderError("API 请求失败：HTTP 524。", kind="timeout", status_code=524, retryable=True)

    def test_transient_after_write_and_process_pauses_exactly_and_skips_plan_on_resume(self):
        write = call("write_file", {"path": "scene.py", "content": "print('saved')"}, "write-scene")
        process = call("run_process", {"program": "python", "args": ["scene.py"]}, "checked-scene")
        manager, provider = self.manager([reply("计划已确认"), reply("", [write, process]), self.transient()])
        effects = []
        def execute_process(*_args):
            effects.append("executed")
            return {"exitCode": 0, "output": "saved", "log": "successful-process.log"}
        with patch.object(manager, "process", side_effect=execute_process):
            ident = self.start(manager, modelEfforts={"openai": "high", "claude": "max"})
            paused = self.wait(manager, ident, "paused")
        self.assertTrue(paused["canResume"])
        self.assertEqual(paused["pauseReason"], "provider_timeout")
        failure = paused["providerFailure"]
        self.assertEqual((failure["kind"], failure["httpStatus"], failure["provider"], failure["retryable"]),
                         ("timeout", 524, "openai", True))
        self.assertTrue(failure["occurredAt"])
        self.assertEqual(len(provider.calls), 3, "a failed request must not automatically retry")
        self.assertEqual(effects, ["executed"])
        checkpoint = manager.read_checkpoint(paused)
        self.assertTrue(checkpoint["safe"])
        self.assertEqual(checkpoint["phaseId"], "model")
        self.assertEqual(checkpoint["phases"][0]["status"], "completed")
        results = {m["tool_call_id"]: json.loads(m["content"]) for m in checkpoint["messages"] if m["role"] == "tool"}
        self.assertEqual(results["write-scene"]["written"], "scene.py")
        self.assertEqual(results["checked-scene"]["exitCode"], 0)
        fresh, resumed = self.manager([reply("实施完成"), reply("协作完成"), reply("验收完成")])
        with patch.object(fresh, "process") as repeated_process:
            fresh.resume(ident)
            final = self.wait(fresh, ident, "completed")
            repeated_process.assert_not_called()
        self.assertEqual(final["resumeMode"], "exact")
        self.assertEqual([c["provider"] for c in resumed.calls], ["openai", "claude", "openai"])
        self.assertEqual([c["effort"] for c in resumed.calls], ["high", "max", "high"])
        self.assertIn("successful-process.log", json.dumps(resumed.calls[0]["messages"]))
        self.assertEqual((self.project / "scene.py").read_text(), "print('saved')")
        self.assertEqual(len(final["changedFiles"]), 1)
        self.assertEqual(final["phases"][0]["steps"], 1)

    def test_single_model_override_and_effort_survive_transient_resume(self):
        manager, provider = self.manager([self.transient()])
        ident = self.start(manager, provider="openai", model="chosen-model-alias",
                           modelEfforts={"openai": "high", "claude": "low"})
        paused = self.wait(manager, ident, "paused")
        self.assertEqual(paused["model"], "chosen-model-alias")
        self.assertEqual(paused["providerFailure"]["model"], "chosen-model-alias")
        fresh, resumed = self.manager([reply("完成")])
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual(resumed.calls[0]["requestedModel"], "chosen-model-alias")
        self.assertEqual(resumed.calls[0]["effort"], "high")
        self.assertEqual(final["modelEfforts"], {"openai": "high", "claude": "low"})
        self.assertEqual(len(provider.calls), 1)

    def test_authentication_error_stays_failed_and_cannot_resume(self):
        error = ProviderError("API 请求失败：HTTP 401。", kind="auth", status_code=401, retryable=False)
        manager, provider = self.manager([error])
        ident = self.start(manager, provider="openai")
        failed = self.wait(manager, ident, "failed")
        self.assertFalse(failed["canResume"])
        self.assertEqual(len(provider.calls), 1)
        with self.assertRaises(ValueError):
            manager.resume(ident)
        fresh, _ = self.manager([])
        self.assertEqual(fresh.get(ident)["status"], "failed")
        self.assertFalse(fresh.get(ident)["canResume"])

    def test_cancel_takes_precedence_over_inflight_transient_failure(self):
        entered, release = threading.Event(), threading.Event()
        def fail_after_cancel(_kwargs):
            entered.set()
            release.wait(3)
            raise self.transient()
        manager, provider = self.manager([fail_after_cancel])
        ident = self.start(manager)
        try:
            self.assertTrue(entered.wait(2))
            manager.stop(ident)
        finally:
            release.set()
        cancelled = self.wait(manager, ident, "cancelled")
        self.assertTrue(cancelled["canResume"])
        self.assertEqual(len(provider.calls), 1)
        provider.replies = iter([reply(), reply(), reply(), reply()])
        manager.resume(ident)
        self.wait(manager, ident, "completed")

    def test_old_http524_disk_failure_migrates_without_generation_then_resumes_model(self):
        write = call("write_file", {"path": "retained.py", "content": "saved before old gateway error"})
        manager, provider = self.manager([])
        provider.replies = iter([reply("旧任务计划完成"), reply("", [write]), self.transient()])
        ident = self.start(manager, modelEfforts={"openai": "high", "claude": "max"})
        self.wait(manager, ident, "paused")
        row = manager.runs[ident]
        row.update(status="failed", response="API 请求失败：HTTP 524。请检查接口配置、模型和额度。", canResume=False)
        row.pop("providerFailure", None)
        row.pop("pauseReason", None)
        row["phases"][1]["status"] = "failed"
        manager.persist(ident)
        fresh, resumed = self.manager([reply("实现续跑完成"), reply("动效完成"), reply("检查完成")])
        migrated = fresh.get(ident)
        self.assertEqual(migrated["status"], "paused")
        self.assertTrue(migrated["canResume"])
        self.assertEqual(migrated["providerFailure"]["httpStatus"], 524)
        self.assertTrue(migrated["providerFailure"]["retryable"])
        self.assertEqual(resumed.calls, [], "loading an old failed record must not launch paid work")
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual(final["resumeMode"], "exact")
        self.assertEqual([c["provider"] for c in resumed.calls], ["openai", "claude", "openai"])
        self.assertEqual(len(final["changedFiles"]), 1)
        self.assertEqual((self.project / "retained.py").read_text(), "saved before old gateway error")
        self.assertIn("retained.py", json.dumps(resumed.calls[0]["messages"]))
        self.assertEqual(final["phases"][0]["steps"], 1)


if __name__ == "__main__":
    unittest.main()
