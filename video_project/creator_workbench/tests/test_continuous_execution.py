"""Continuous local execution crosses former quotas while keeping cancellation."""
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from app.harness import RunManager
from app.providers import ProviderError
from tests.test_run_continuation import Library, Providers, call, reply, tool_names


def partial_text(text):
    return {**reply(text), "stop_reason": "max_tokens", "output_truncated": True}


class ContinuousExecutionTests(unittest.TestCase):
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

    def manager(self, responses):
        provider = Providers(responses)
        return RunManager(self.library, provider, self.state, self.resources), provider

    def start(self, manager, **kwargs):
        return manager.start({"projectId": "project", "prompt": "完成当前任务并保存完整结果", "provider": "openai", **kwargs})["id"]

    def wait(self, manager, ident, expected, timeout=60):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            row = manager.get(ident)
            if row["status"] not in {"queued", "running", "cancelling"}:
                self.assertTrue(manager.semaphore.acquire(timeout=2))
                manager.semaphore.release()
                row = manager.get(ident)
                self.assertEqual(row["status"], expected, row.get("response"))
                return row
            time.sleep(.01)
        manager.stop(ident)
        manager.semaphore.acquire(timeout=5)
        self.fail("continuous mock run did not finish")

    def test_more_than_ninety_six_calls_complete_and_preserve_stop_control(self):
        responses = [reply("", [call("list_files", ident=f"read-{i}")]) for i in range(100)] + [reply("完整完成")]
        manager, provider = self.manager(responses)
        ident = self.start(manager)
        row = self.wait(manager, ident, "completed")
        self.assertEqual(len(provider.calls), 101)
        self.assertEqual(len(row["usage"]), 101)
        self.assertEqual(row["executionPolicy"], "continuous")
        self.assertIsNone(row["limits"]["maxSteps"])
        self.assertIsNone(row["limits"]["maxRunSeconds"])
        self.assertTrue(all(e["type"] != "paused" for e in row["events"]))

    def test_more_than_six_collaboration_requests_remain_available(self):
        responses = [reply("计划完成")]
        for i in range(8):
            responses.extend([reply("", [call("request_collaboration", {"provider": "claude", "task": f"检查第{i}项"}, f"assist-{i}")]),
                              reply(f"第{i}项检查完成")])
        responses.extend([reply("主导完成"), reply("动效完成"), reply("验收完成")])
        manager, provider = self.manager(responses)
        row = self.wait(manager, self.start(manager, provider="dual"), "completed")
        self.assertEqual(row["collaborationCount"], 8)
        lead_requests = provider.calls[1:17:2]
        self.assertEqual(len(lead_requests), 8)
        self.assertTrue(all("request_collaboration" in tool_names(c) for c in lead_requests))
        self.assertEqual([c["provider"] for c in provider.calls[1:17]], ["openai", "claude"] * 8)

    def test_collaborator_keeps_control_past_six_tool_rounds_until_own_completion(self):
        request = call("request_collaboration", {"provider": "claude", "task": "逐项核查并实现"})
        responses = [reply("计划完成"), reply("", [request])]
        responses += [reply("", [call("list_files", ident=f"detail-{i}")]) for i in range(8)]
        responses += [reply("协作者已完成"), reply("主导确认"), reply("动效完成"), reply("验收完成")]
        manager, provider = self.manager(responses)
        row = self.wait(manager, self.start(manager, provider="dual"), "completed")
        self.assertEqual([c["provider"] for c in provider.calls[2:11]], ["claude"] * 9)
        self.assertEqual(provider.calls[11]["provider"], "openai")
        self.assertEqual(row["collaborationCount"], 1)

    def test_seventeen_complete_tool_calls_execute_once_without_batch_quota(self):
        writes = [call("write_file", {"path": f"part-{i}.ts", "content": f"export const n = {i};"}, f"part-{i}") for i in range(17)]
        manager, provider = self.manager([reply("", writes), reply("完整实现")])
        row = self.wait(manager, self.start(manager), "completed")
        self.assertEqual(len(row["changedFiles"]), 17)
        self.assertEqual(len(provider.calls), 2)
        for i in range(17):
            self.assertEqual((self.project / f"part-{i}.ts").read_text(), f"export const n = {i};")

    def test_long_complete_text_survives_summary_response_and_disk_without_truncation(self):
        text = "SECTION-BEGIN\n" + "完整讲解内容与实际结论。" * 2400 + "\nSECTION-END"
        manager, _ = self.manager([reply(text)])
        ident = self.start(manager, contextBudgetTokens=1_000_000)
        row = self.wait(manager, ident, "completed")
        self.assertGreater(len(text), 16000)
        self.assertEqual(row["response"], text)
        self.assertEqual(row["phases"][0]["summary"], text)
        disk = json.loads((self.state / "runs" / ident / "run.json").read_text(encoding="utf8"))
        self.assertEqual(disk["response"], text)
        handoff = next(e for e in row["events"] if e["type"] == "handoff")
        self.assertEqual(handoff["summary"], text)

    def test_text_continuation_preserves_every_part_and_tail(self):
        parts = ["FIRST-PART\n", "SECOND-PART\n", "THIRD-PART\n", "FINAL-TAIL"]
        manager, provider = self.manager([partial_text(p) for p in parts[:-1]] + [reply(parts[-1])])
        row = self.wait(manager, self.start(manager), "completed")
        self.assertEqual(len(provider.calls), 4)
        for part in parts:
            self.assertIn(part.strip(), row["response"])
        positions = [row["response"].index(p.strip()) for p in parts]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(row["phases"][0]["summary"], row["response"])

    def test_partial_text_persists_through_network_pause_and_exact_restart(self):
        interruption = ProviderError("Temporary timeout", kind="timeout", retryable=True)
        manager, _ = self.manager([partial_text("PERSISTED-BEGIN\n"), interruption])
        ident = self.start(manager)
        paused = self.wait(manager, ident, "paused")
        self.assertTrue(manager.read_checkpoint(paused)["safe"])
        fresh, resumed = self.manager([reply("COMPLETE-END")])
        fresh.resume(ident)
        row = self.wait(fresh, ident, "completed")
        self.assertEqual(row["resumeMode"], "exact")
        self.assertEqual(len(resumed.calls), 1)
        self.assertIn("PERSISTED-BEGIN", row["response"])
        self.assertIn("COMPLETE-END", row["response"])

    def test_partial_prose_is_not_lost_when_a_complete_tool_call_precedes_final_tail(self):
        read = call("list_files", ident="verify-before-concluding")
        manager, provider = self.manager([
            partial_text("PRESERVE-THIS-FIRST-PART\n"), reply("", [read]), reply("AFTER-VERIFICATION-END")])
        row = self.wait(manager, self.start(manager), "completed")
        self.assertEqual(len(provider.calls), 3)
        self.assertIn("PRESERVE-THIS-FIRST-PART", row["response"])
        self.assertIn("AFTER-VERIFICATION-END", row["response"])
        checkpoint = manager.read_checkpoint(row)
        self.assertTrue(any(m.get("tool_call_id") == read["id"] for m in checkpoint["messages"]))

    def test_lead_draft_survives_collaborator_response_without_mixing_their_text(self):
        assist = call("request_collaboration", {"provider": "claude", "task": "核查一项事实"})
        responses = [reply("plan complete"), partial_text("LEAD-BEGIN\n"), reply("", [assist]),
                     partial_text("COLLABORATOR-BEGIN\n"), reply("COLLABORATOR-REPORT"),
                     reply("LEAD-END"), reply("motion done"), reply("integrate done")]
        manager, _ = self.manager(responses)
        row = self.wait(manager, self.start(manager, provider="dual"), "completed")
        lead_summary = next(p["summary"] for p in row["phases"] if p["id"] == "model")
        self.assertIn("LEAD-BEGIN", lead_summary)
        self.assertIn("LEAD-END", lead_summary)
        self.assertNotIn("COLLABORATOR-REPORT", lead_summary)
        collaborator_message = next(e["message"] for e in row["events"]
                                    if e["type"] == "assistant" and "COLLABORATOR-REPORT" in e["message"])
        self.assertIn("COLLABORATOR-BEGIN", collaborator_message)
        self.assertNotIn("LEAD-BEGIN", collaborator_message)

    def test_legacy_hard_limits_migrate_on_load_and_resume_without_automatic_requests(self):
        manager, _ = self.manager([ProviderError("Temporary timeout", kind="timeout", retryable=True)])
        ident = self.start(manager)
        self.wait(manager, ident, "paused")
        legacy = manager.runs[ident]
        legacy.pop("executionPolicy", None)
        legacy["limits"].update(maxSteps=1, maxRunSeconds=1)
        manager.persist(ident)
        fresh, provider = self.manager([reply("", [call("list_files")]), reply("完成")])
        loaded = fresh.get(ident)
        self.assertEqual(loaded["executionPolicy"], "continuous")
        self.assertIsNone(loaded["limits"]["maxSteps"])
        self.assertIsNone(loaded["limits"]["maxRunSeconds"])
        self.assertEqual(provider.calls, [])
        fresh.resume(ident)
        row = self.wait(fresh, ident, "completed")
        self.assertEqual(len(provider.calls), 2)
        self.assertIsNone(row["limits"]["maxSteps"])
        self.assertIsNone(row["limits"]["maxRunSeconds"])

    def test_user_stop_still_ends_continuous_loop_before_next_response_tools(self):
        entered, release = threading.Event(), threading.Event()
        def block(_kwargs):
            entered.set()
            release.wait(3)
            return reply("", [call("write_file", {"path": "never.ts", "content": "not authorized after stop"})])
        manager, provider = self.manager([reply("", [call("list_files")]), block])
        ident = self.start(manager)
        try:
            self.assertTrue(entered.wait(2))
            manager.stop(ident)
        finally:
            release.set()
        row = self.wait(manager, ident, "cancelled")
        self.assertEqual(len(provider.calls), 2)
        self.assertFalse((self.project / "never.ts").exists())
        self.assertTrue(row["canResume"])


if __name__ == "__main__":
    unittest.main()
