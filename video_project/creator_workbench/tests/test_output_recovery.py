"""Continuous output recovery uses saved facts and never runs partial tools."""
import json
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.harness import RunManager
from app.providers import ProviderError
from tests.test_run_continuation import Library, Providers, call, reply


def limited(calls=None, marker="UNEXECUTED_PARTIAL_CONTENT"):
    return {**reply(marker, calls), "stop_reason": "max_tokens", "usage": {
        "output_tokens": 6000, "output_tokens_details": {"thinking_tokens": 5824}},
        "output_truncated": True}


class Recorder(Providers):
    def __init__(self, replies, defaults=None):
        super().__init__(replies)
        self.defaults = defaults or {}

    def public_status(self):
        return [{**r, "effortDefault": self.defaults.get(r["id"], "default")} for r in super().public_status()]

    def complete(self, provider, messages, **kwargs):
        try:
            return super().complete(provider, messages, **kwargs)
        finally:
            self.calls[-1].update(max_tokens=kwargs["max_tokens"], model=kwargs.get("model"))


class OutputRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.state, self.resources = self.root / "state", self.root / "resources"
        self.resources.mkdir()
        self.library = Library(self.project)

    def tearDown(self):
        self.tmp.cleanup()

    def manager(self, replies, defaults=None):
        provider = Recorder(replies, defaults)
        return RunManager(self.library, provider, self.state, self.resources), provider

    def start(self, manager, **body):
        return manager.start({"projectId": "project", "prompt": "继续现有工程并核验", "provider": "claude", **body})["id"]

    def wait(self, manager, ident, expected):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            row = manager.get(ident)
            if row["status"] not in {"queued", "running", "cancelling"}:
                self.assertTrue(manager.semaphore.acquire(timeout=2))
                manager.semaphore.release()
                row = manager.get(ident)
                self.assertEqual(row["status"], expected, row.get("response"))
                return row
            time.sleep(.01)
        self.fail("output recovery timed out")

    def test_auto_recovery_raises_budget_preserves_model_effort_and_discards_partial_tools(self):
        partial = call("write_file", {"path": "partial.ts", "content": "must never execute"}, "partial")
        valid = call("write_file", {"path": "actual.ts", "content": "complete file"}, "actual")
        manager, provider = self.manager([limited([partial]), reply("", [valid]), reply("完成")])
        ident = self.start(manager, model="claude-opus-5-5", modelEfforts={"claude": "max"}, contextBudgetTokens=1_000_000)
        row = self.wait(manager, ident, "completed")
        self.assertEqual([c["provider"] for c in provider.calls], ["claude"] * 3)
        self.assertEqual([c["effort"] for c in provider.calls], ["max"] * 3)
        self.assertEqual([c["model"] for c in provider.calls], ["claude-opus-5-5"] * 3)
        self.assertGreaterEqual(provider.calls[0]["max_tokens"], 32768)
        self.assertGreater(provider.calls[1]["max_tokens"], provider.calls[0]["max_tokens"])
        self.assertLessEqual(provider.calls[1]["max_tokens"], 65536)
        self.assertFalse((self.project / "partial.ts").exists())
        self.assertEqual((self.project / "actual.ts").read_text(), "complete file")
        self.assertEqual(len(row["changedFiles"]), 1)
        self.assertEqual(len(row["usage"]), 3)
        self.assertEqual(row["usage"][0]["usage"]["output_tokens_details"]["thinking_tokens"], 5824)
        self.assertNotIn("UNEXECUTED_PARTIAL_CONTENT", json.dumps(provider.calls[1]["messages"]))
        self.assertFalse(any(m.get("tool_calls") for m in provider.calls[1]["messages"]))
        self.assertNotIn("outputLimit", row)

    def test_repeated_length_results_continue_beyond_two_without_running_partial_tools(self):
        partial = call("write_file", {"path": "partial.py", "content": "unsafe"})
        manager, provider = self.manager([limited([partial])] * 5 + [reply("完整结果")])
        ident = self.start(manager, contextBudgetTokens=1_000_000)
        completed = self.wait(manager, ident, "completed")
        self.assertEqual(len(provider.calls), 6)
        self.assertEqual(len(completed["usage"]), 6)
        self.assertTrue(all(0 < c["max_tokens"] < 1_000_000 for c in provider.calls))
        self.assertGreater(provider.calls[-1]["max_tokens"], 65536)
        self.assertFalse((self.project / "partial.py").exists())
        self.assertTrue(manager.read_checkpoint(completed)["safe"])
        for request in provider.calls[1:]:
            self.assertFalse(any(m.get("tool_calls") for m in request["messages"]))
            self.assertFalse(any(m.get("role") == "tool" for m in request["messages"]))

    def test_tool_work_between_recoveries_does_not_reinstate_old_two_recovery_limit(self):
        read1 = call("list_files", ident="read-after-first")
        read2 = call("list_files", ident="read-after-second")
        manager, provider = self.manager([limited(), reply("", [read1]), limited(), reply("", [read2]), limited(), reply("完整完成")])
        ident = self.start(manager, contextBudgetTokens=1_000_000)
        completed = self.wait(manager, ident, "completed")
        self.assertEqual(len(provider.calls), 6)
        self.assertEqual(len(completed["usage"]), 6)
        results = [m.get("tool_call_id") for m in manager.read_checkpoint(completed)["messages"] if m["role"] == "tool"]
        self.assertEqual(results, ["read-after-first", "read-after-second"])

    def test_16k_context_caps_high_effort_output_and_accounts_for_actual_reserve(self):
        manager, provider = self.manager([limited(), reply("完成")])
        ident = self.start(manager, contextBudgetTokens=16000, modelEfforts={"claude": "max"})
        row = self.wait(manager, ident, "completed")
        self.assertEqual(len(provider.calls), 2)
        for request, usage in zip(provider.calls, row["usage"]):
            self.assertGreaterEqual(request["max_tokens"], 4096)
            self.assertLess(request["max_tokens"], 16000)
            stats = usage["contextStats"]
            self.assertEqual(stats["outputReserveTokens"], request["max_tokens"])
            self.assertLessEqual(stats["estimatedInputTokens"] + stats["outputReserveTokens"] + stats["headroomTokens"], 16000)

    def test_cc_switch_default_max_effort_receives_large_base_output(self):
        manager, provider = self.manager([reply("完成")], defaults={"claude": "max"})
        self.wait(manager, self.start(manager, contextBudgetTokens=1_000_000, modelEfforts={"claude": "default"}), "completed")
        self.assertEqual(provider.calls[0]["effort"], "default", "do not replace user's effort selection")
        self.assertGreaterEqual(provider.calls[0]["max_tokens"], 32768)

    def test_old_length_failure_loads_paused_and_resumes_unfinished_phase_only(self):
        write = call("write_file", {"path": "saved.ts", "content": "prior work"})
        manager, provider = self.manager([])
        provider.replies = iter([reply("plan complete"), reply("", [write]), reply("model complete"),
                                ProviderError("API timed out", kind="timeout", retryable=True)])
        ident = self.start(manager, provider="dual", modelEfforts={"openai": "xhigh", "claude": "max"}, contextBudgetTokens=1_000_000)
        self.wait(manager, ident, "paused")
        old = manager.runs[ident]
        old.update(status="failed", response="回复达到长度上限；已保留输出，未把截断当成完成。", canResume=False)
        old.pop("pauseReason", None)
        old["limits"]["modelTokensPerStep"] = 6000
        old["phases"][2]["status"] = "failed"
        manager.persist(ident)
        fresh, resumed = self.manager([reply("motion complete"), reply("integrate complete")])
        migrated = fresh.get(ident)
        self.assertEqual(migrated["status"], "paused")
        self.assertEqual(migrated["pauseReason"], "output_limit")
        self.assertTrue(migrated["canResume"])
        self.assertEqual(resumed.calls, [])
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual([c["provider"] for c in resumed.calls], ["claude", "openai"])
        self.assertGreaterEqual(resumed.calls[0]["max_tokens"], 32768)
        self.assertEqual(final["resumeMode"], "exact")
        self.assertEqual(len(final["changedFiles"]), 1)
        self.assertEqual((self.project / "saved.ts").read_text(), "prior work")
        self.assertEqual([p["steps"] for p in final["phases"][:2]], [1, 2])

    def test_cancel_after_limited_response_does_not_start_another_call(self):
        entered, release = threading.Event(), threading.Event()
        def held(_kwargs):
            entered.set()
            release.wait(3)
            return limited([call("write_file", {"path": "cancelled.ts", "content": "unsafe"})])
        manager, provider = self.manager([held, reply("must not run")])
        ident = self.start(manager)
        try:
            self.assertTrue(entered.wait(2))
            manager.stop(ident)
        finally:
            release.set()
        row = self.wait(manager, ident, "cancelled")
        self.assertEqual(len(provider.calls), 1)
        self.assertFalse((self.project / "cancelled.ts").exists())
        self.assertTrue(row["canResume"])

    def test_output_recovery_ignores_legacy_run_call_budget(self):
        manager, provider = self.manager([])
        def legacy_limit(_kwargs):
            next(iter(manager.runs.values()))["limits"]["maxSteps"] = 1
            return limited()
        provider.replies = iter([legacy_limit, reply("完整完成")])
        ident = self.start(manager)
        row = self.wait(manager, ident, "completed")
        self.assertEqual(len(provider.calls), 2)
        self.assertTrue(manager.read_checkpoint(row)["safe"])

    def test_output_recovery_can_continue_beyond_old_run_time_limit(self):
        clock = [1000.0]
        def consume_time(_kwargs):
            clock[0] += 1900
            return limited()
        manager, provider = self.manager([consume_time, reply("完整完成")])
        with patch("app.harness.time", SimpleNamespace(monotonic=lambda: clock[0])):
            ident = self.start(manager)
            row = self.wait(manager, ident, "completed")
        self.assertEqual(len(provider.calls), 2)
        self.assertTrue(manager.read_checkpoint(row)["safe"])

    def test_unknown_incomplete_pauses_without_output_expansion(self):
        manager, provider = self.manager([{**reply("untrusted partial text"), "stop_reason": "incomplete"}, reply("must not run")])
        ident = self.start(manager)
        row = self.wait(manager, ident, "paused")
        self.assertEqual(row["pauseReason"], "provider_stream")
        self.assertEqual(len(provider.calls), 1)
        self.assertNotIn("untrusted partial text", json.dumps(manager.read_checkpoint(row)["messages"]))

    def test_content_filter_is_not_automatically_retried_as_incomplete(self):
        manager, provider = self.manager([{**reply("filtered partial"), "stop_reason": "content_filter", "output_incomplete": True}])
        ident = self.start(manager)
        row = self.wait(manager, ident, "failed")
        self.assertEqual(row["providerFailure"]["kind"], "content_filter")
        self.assertFalse(row["canResume"])
        self.assertEqual(len(provider.calls), 1)


if __name__ == "__main__":
    unittest.main()
