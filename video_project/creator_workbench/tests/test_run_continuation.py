"""Offline regressions for resumable execution and flexible serial collaboration."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from app.harness import RunManager
from app.providers import ProviderError


def reply(text="阶段完成", calls=None):
    return {"text": text, "tool_calls": calls or [], "model": "mock-model",
            "usage": {"output_tokens": 12}, "stop_reason": "completed"}


def call(name, arguments=None, ident=None):
    return {"id": ident or name, "name": name, "arguments": arguments or {}}


def tool_names(request):
    return {item["function"]["name"] for item in request["tools"]}


class Library:
    def __init__(self, path):
        self.row = {"id": "project", "name": "续跑测试", "path": str(path)}

    def project(self, ident):
        if ident != "project":
            raise KeyError(ident)
        return dict(self.row)

    def snapshot(self, **kwargs):
        return {"projects": [self.row], "skills": [], "tools": [], "plugins": []}

    def media(self, ident):
        return []


class Providers:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.calls = []

    def public_status(self):
        return [{"id": who, "configured": True, "model": who + "-mock"}
                for who in ("openai", "claude")]

    def complete(self, provider, messages, **kwargs):
        self.calls.append({"provider": provider, "messages": copy.deepcopy(messages),
                           "tools": copy.deepcopy(kwargs["tools"]), "effort": kwargs["effort"]})
        response = next(self.replies)
        if isinstance(response, Exception):
            raise response
        return response(kwargs) if callable(response) else response


class RunContinuationTests(unittest.TestCase):
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

    def manager(self, replies):
        provider = Providers(replies)
        return RunManager(self.library, provider, self.state, self.resources), provider

    def start(self, manager, **body):
        return manager.start({"projectId": "project", "prompt": "接续实际工程，核对后完成。",
                              "provider": "dual", **body})["id"]

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
        self.fail("offline run timed out")

    def interruption(self):
        return ProviderError("API timed out", kind="timeout", retryable=True)

    def test_plan_crosses_both_old_four_and_new_eight_round_windows(self):
        reads = [reply("", [call("list_files", ident=f"read-{n}")]) for n in range(9)]
        manager, provider = self.manager(reads + [reply("计划核对完毕"), reply(), reply(), reply()])
        row = self.wait(manager, self.start(manager), "completed")
        self.assertEqual(row["phases"][0]["steps"], 10)
        self.assertEqual([p["status"] for p in row["phases"]], ["completed"] * 4)
        self.assertEqual(len(provider.calls), 13)
        self.assertTrue(any(e["type"] == "continuation" for e in row["events"]))
        self.assertTrue(all("write_file" not in tool_names(r) for r in provider.calls[:10]))

    def test_provider_checkpoint_restart_skips_done_phase_and_never_replays_write(self):
        write = call("write_file", {"path": "scene.ts", "content": "export const verified = 71;"})
        manager, first = self.manager([])
        first.replies = iter([reply("计划已确定入口"), reply("", [write]), self.interruption()])
        ident = self.start(manager)
        paused = self.wait(manager, ident, "paused")
        self.assertEqual(paused["pauseReason"], "provider_timeout")
        self.assertTrue(paused["canResume"])
        checkpoint = manager.read_checkpoint(paused)
        self.assertTrue(checkpoint["safe"])
        self.assertEqual(checkpoint["phaseId"], "model")
        self.assertEqual(checkpoint["phases"][0]["status"], "completed")
        self.assertTrue(any(m.get("role") == "tool" and "scene.ts" in m["content"]
                            for m in checkpoint["messages"]))
        fresh, second = self.manager([reply("实现已核对"), reply("画面已核对"), reply("完成")])
        fresh.resume(ident)
        row = self.wait(fresh, ident, "completed")
        self.assertEqual(row["resumeMode"], "exact")
        self.assertEqual(row["resumeCount"], 1)
        self.assertEqual([c["provider"] for c in second.calls], ["openai", "claude", "openai"])
        self.assertIn("scene.ts", json.dumps(second.calls[0]["messages"]))
        self.assertEqual(len(row["changedFiles"]), 1)
        self.assertEqual((self.project / "scene.ts").read_text(), "export const verified = 71;")
        self.assertEqual(len([e for e in row["events"] if e["type"] == "handoff" and e.get("phase") == "plan"]), 1)
        with self.assertRaises(ValueError):
            fresh.resume(ident)

    def test_old_failed_run_without_checkpoint_reconciles_files_before_continuing(self):
        manager, provider = self.manager([])
        provider.replies = iter([reply("已完成联合计划"),
                                reply("", [call("write_file", {"path": "retained.ts", "content": "old-fact"})]), self.interruption()])
        ident = self.start(manager)
        self.wait(manager, ident, "paused")
        row = manager.runs[ident]
        row["status"] = "failed"
        row["response"] = "阶段达到调用上限，已保存进度；后续阶段未执行。"
        row["phases"][1]["status"] = "failed"
        manager.persist(ident)
        (self.state / "runs" / ident / "checkpoint.json").unlink()
        fresh, second = self.manager([reply("", [call("read_file", {"path": "retained.ts"})]),
                                      reply("确认文件后继续"), reply(), reply()])
        self.assertTrue(fresh.get(ident)["canResume"])
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual(final["resumeMode"], "reconcile")
        first_messages = json.dumps(second.calls[0]["messages"], ensure_ascii=False)
        self.assertIn("旧记录只有节选", first_messages)
        self.assertIn("retained.ts", first_messages)
        self.assertIn("old-fact", json.dumps(second.calls[1]["messages"], ensure_ascii=False))
        self.assertEqual(len(final["changedFiles"]), 1)
        self.assertEqual(final["phases"][0]["steps"], 1)

    def test_unsafe_partial_tool_batch_reconciles_without_replaying_writes(self):
        written = call("write_file", {"path": "done.ts", "content": "actual saved work"}, "completed-write")
        not_written = call("write_file", {"path": "must-not-replay.ts", "content": "pending"}, "unfinished-write")
        manager, provider = self.manager([])
        provider.replies = iter([reply("", [written]), self.interruption()])
        ident = self.start(manager, provider="openai")
        self.wait(manager, ident, "paused")
        row = manager.runs[ident]
        row["status"] = "interrupted"
        manager.persist(ident)
        # Model a crash after the first side effect of a two-call batch: the
        # checkpoint contains an assistant request and only one tool response.
        messages = manager.context(row, self.library.project("project")) + [
            {"role": "assistant", "content": "UNSAFE_BATCH_ONLY_MARKER", "tool_calls": [written, not_written]},
            {"role": "tool", "tool_call_id": written["id"], "content": json.dumps({"written": "done.ts"})},
        ]
        manager.checkpoint(row, messages, "execute", safe=False)
        self.assertFalse(manager.read_checkpoint(row)["safe"])
        self.assertTrue(any(e["type"] == "tool_result" and "done.ts" in e["message"] for e in row["events"]))
        fresh, second = self.manager([reply("", [call("read_file", {"path": "done.ts"})]), reply("实际文件核对完成")])
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual(final["resumeMode"], "reconcile")
        initial_messages = second.calls[0]["messages"]
        self.assertFalse(any(m.get("tool_calls") or m.get("role") == "tool" for m in initial_messages))
        initial_text = json.dumps(initial_messages, ensure_ascii=False)
        self.assertNotIn("UNSAFE_BATCH_ONLY_MARKER", initial_text)
        self.assertIn("done.ts", initial_text)
        self.assertIn("旧记录只有节选", initial_text)
        self.assertIn("actual saved work", json.dumps(second.calls[1]["messages"], ensure_ascii=False))
        self.assertEqual((self.project / "done.ts").read_text(), "actual saved work")
        self.assertFalse((self.project / "must-not-replay.ts").exists())
        self.assertEqual(len(final["changedFiles"]), 1)

    def test_selected_candidate_restart_does_not_restore_old_planning_checkpoint(self):
        candidate_json = json.dumps({"candidates": [
            {"id": name, "title": "方案" + name, "approach": "实施路线" + name,
             "tradeoffs": "效果与成本" + name} for name in "ABC"]}, ensure_ascii=False)
        manager, _ = self.manager([reply(candidate_json), reply(candidate_json)])
        ident = self.start(manager, candidates=True)
        planned = self.wait(manager, ident, "awaiting_selection")
        old_checkpoint = manager.read_checkpoint(planned)
        self.assertTrue(old_checkpoint["safe"])
        self.assertEqual([p["id"] for p in old_checkpoint["phases"]],
                         ["candidate_plan", "candidate_compare"])
        # Persist the user's selection but simulate shutdown before the new
        # worker has written its first checkpoint. The disk checkpoint is
        # still the completed read-only plan and must not replace execution.
        with patch("app.harness.threading.Thread") as thread:
            manager.select_candidate(ident, "A")
            thread.return_value.start.assert_called_once()
        write = call("write_file", {"path": "chosen-a.ts", "content": "implemented A"})
        fresh, provider = self.manager([
            reply("确认方案A"), reply("", [write]), reply("实施完成"),
            reply("画面已核对"), reply("最终完成")])
        self.assertEqual(fresh.get(ident)["status"], "interrupted")
        fresh.resume(ident)
        result = self.wait(fresh, ident, "completed")
        self.assertEqual(result["resumeMode"], "reconcile")
        self.assertEqual(result["selectedCandidateId"], "A")
        self.assertEqual([p["id"] for p in result["phases"]],
                         ["candidate_plan", "candidate_compare", "plan", "model", "motion", "integrate"])
        self.assertTrue(all(p["status"] == "completed" for p in result["phases"]))
        self.assertEqual(len(provider.calls), 5)
        self.assertIn("方案A", json.dumps(provider.calls[0]["messages"], ensure_ascii=False))
        self.assertEqual((self.project / "chosen-a.ts").read_text(), "implemented A")
        self.assertEqual(len(result["changedFiles"]), 1)

    def test_network_pause_keeps_results_and_resume_keeps_continuous_policy(self):
        write = call("write_file", {"path": "timed.ts", "content": "saved before timeout"})
        manager, provider = self.manager([reply("", [write]), self.interruption()])
        ident = self.start(manager, provider="openai")
        paused = self.wait(manager, ident, "paused")
        self.assertEqual(paused["pauseReason"], "provider_timeout")
        self.assertTrue(paused["canResume"])
        self.assertTrue(manager.read_checkpoint(paused)["safe"])
        fresh, second = self.manager([reply("剩余检查完成")])
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual(final["resumeMode"], "exact")
        self.assertEqual(len(second.calls), 1)
        self.assertIn("timed.ts", json.dumps(second.calls[0]["messages"]))
        self.assertEqual(len(final["changedFiles"]), 1)
        self.assertEqual(final["executionPolicy"], "continuous")
        self.assertIsNone(final["limits"]["maxRunSeconds"])
        self.assertIsNone(final["limits"]["maxSteps"])

    def test_collaborator_reads_writes_returns_to_lead_with_own_effort(self):
        (self.project / "scene.ts").write_text("existing scene")
        request = call("request_collaboration", {"provider": "claude", "task": "核对并改善scene.ts的运镜", "reason": "需要代码复核"})
        write = call("write_file", {"path": "camera.ts", "content": "smooth camera"})
        manager, provider = self.manager([
            reply("计划完成"), reply("", [request]),
            reply("", [call("read_file", {"path": "scene.ts"}), write]), reply("运镜写入camera.ts，待主导验收"),
            reply("主导已核对实际产物"), reply("协作完善完成"), reply("交叉验证完成")])
        row = self.wait(manager, self.start(manager, modelEfforts={"openai": "high", "claude": "max"}), "completed")
        self.assertEqual([c["provider"] for c in provider.calls], ["openai", "openai", "claude", "claude", "openai", "claude", "openai"])
        self.assertEqual([c["effort"] for c in provider.calls], ["high", "high", "max", "max", "high", "max", "high"])
        self.assertIn("write_file", tool_names(provider.calls[2]))
        self.assertNotIn("request_collaboration", tool_names(provider.calls[2]))
        lead_messages = json.dumps(provider.calls[4]["messages"], ensure_ascii=False)
        self.assertIn("existing scene", lead_messages)
        self.assertIn("camera.ts", lead_messages)
        self.assertIn("原主导继续当前阶段", lead_messages)
        self.assertEqual((self.project / "camera.ts").read_text(), "smooth camera")
        self.assertEqual(row["collaborationCount"], 1)
        self.assertEqual([u["collaborating"] for u in row["usage"]], [False, False, True, True, False, False, False])

    def test_plan_and_review_collaboration_cannot_escalate_write_permissions(self):
        for mode, in_plan in (("creative", True), ("review", True), ("review", False)):
            with self.subTest(mode=mode, in_plan=in_plan):
                request = call("request_collaboration", {"provider": "claude", "task": "只读复核"})
                forbidden = call("write_file", {"path": "forbidden.txt", "content": "not allowed"})
                prefix = [] if in_plan else [reply("计划完成")]
                suffix = [reply(), reply(), reply()] if in_plan else [reply(), reply()]
                manager, provider = self.manager(prefix + [reply("", [request]), reply("", [forbidden]), reply("只读反馈"), reply("主导核对完成")] + suffix)
                row = self.wait(manager, self.start(manager, mode=mode), "completed")
                self.assertFalse((self.project / "forbidden.txt").exists())
                self.assertNotIn("write_file", tool_names(provider.calls[1 if in_plan else 2]))
                self.assertTrue(any(e["type"] == "tool_error" and e.get("tool") == "write_file" for e in row["events"]))
                if mode == "review":
                    self.assertTrue(all("write_file" not in tool_names(c) and "run_process" not in tool_names(c) for c in provider.calls))

    def test_nested_collaboration_is_rejected_then_original_lead_continues(self):
        request = call("request_collaboration", {"provider": "claude", "task": "复核结构"}, "first")
        nested = call("request_collaboration", {"provider": "openai", "task": "再委托"}, "nested")
        manager, provider = self.manager([reply(), reply("", [request]), reply("", [nested]), reply("已完成复核"), reply(), reply(), reply()])
        row = self.wait(manager, self.start(manager), "completed")
        self.assertEqual(row["collaborationCount"], 1)
        self.assertNotIn("request_collaboration", tool_names(provider.calls[2]))
        self.assertEqual([c["provider"] for c in provider.calls[2:5]], ["claude", "claude", "openai"])
        self.assertTrue(any(e["type"] == "tool_error" and e.get("tool") == "request_collaboration" for e in row["events"]))

    def test_checkpoint_inside_collaboration_restores_collaborator_then_lead(self):
        request = call("request_collaboration", {"provider": "claude", "task": "补完当前模型"})
        manager, provider = self.manager([])
        provider.replies = iter([reply(), reply("", [request]), self.interruption()])
        ident = self.start(manager)
        row = self.wait(manager, ident, "paused")
        self.assertEqual(manager.read_checkpoint(row)["collaborator"]["provider"], "claude")
        fresh, second = self.manager([reply("限定问题已解决"), reply("原主导核对完成"), reply(), reply()])
        fresh.resume(ident)
        final = self.wait(fresh, ident, "completed")
        self.assertEqual([c["provider"] for c in second.calls], ["claude", "openai", "claude", "openai"])
        self.assertNotIn("request_collaboration", tool_names(second.calls[0]))
        self.assertEqual(final["collaborationCount"], 1)

    def test_cancellation_during_collaboration_prevents_later_stages(self):
        entered, release = threading.Event(), threading.Event()
        def blocking(kwargs):
            entered.set()
            release.wait(3)
            if kwargs["cancel_event"].is_set():
                raise ProviderError("已取消")
            return reply("限定问题完成")
        request = call("request_collaboration", {"provider": "claude", "task": "复核"})
        manager, provider = self.manager([reply(), reply("", [request]), blocking])
        ident = self.start(manager)
        try:
            self.assertTrue(entered.wait(2))
            manager.stop(ident)
        finally:
            release.set()
        row = self.wait(manager, ident, "cancelled")
        self.assertEqual([c["provider"] for c in provider.calls], ["openai", "openai", "claude"])
        self.assertEqual(row["phases"][2]["status"], "pending")
        self.assertTrue(row["canResume"])
        provider.replies = iter([reply("协作完成"), reply(), reply(), reply()])
        manager.resume(ident)
        self.wait(manager, ident, "completed")

    def test_duplicate_resume_while_active_does_not_start_second_worker(self):
        manager, provider = self.manager([])
        provider.replies = iter([reply("", [call("list_files")]), self.interruption()])
        ident = self.start(manager, provider="openai")
        self.wait(manager, ident, "paused")
        entered, release = threading.Event(), threading.Event()
        def blocking(_kwargs):
            entered.set()
            release.wait(3)
            return reply("恢复完成")
        fresh, second = self.manager([blocking])
        fresh.resume(ident)
        try:
            self.assertTrue(entered.wait(2))
            with self.assertRaises(ValueError):
                fresh.resume(ident)
        finally:
            release.set()
        self.wait(fresh, ident, "completed")
        self.assertEqual(len(second.calls), 1)


if __name__ == "__main__":
    unittest.main()
