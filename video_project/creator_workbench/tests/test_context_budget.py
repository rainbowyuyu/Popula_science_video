import copy
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

from app.context_budget import (DEFAULT_BUDGET, compact_context, estimate_content,
                                estimate_messages, validate_budget)
from app.harness import RunManager, TOOLS
from tests.test_harness import LibraryStub, ProviderStub, reply


def tool_group(ident, text, *, image=False):
    group = [{"role": "assistant", "content": "读取实际文件", "tool_calls": [
        {"id": ident, "name": "read_file", "arguments": {"path": ident + ".md"}}]},
        {"role": "tool", "tool_call_id": ident, "content": json.dumps({"path": ident + ".md", "content": text}, ensure_ascii=False)}]
    if image:
        group.append({"role": "user", "content": [{"type": "text", "text": "实际抽帧"},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + "A" * 200_000}}]})
    return group


class ContextBudgetTests(unittest.TestCase):
    def setUp(self):
        self.system = {"role": "system", "content": "禁止访问凭据；遵循当前用户要求。"}
        self.request = {"role": "user", "content": "当前用户要求：优化机理演示，不修改原片。", "_context_keep": True}

    def test_validation_does_not_coerce_invalid_values(self):
        self.assertEqual(validate_budget(None), DEFAULT_BUDGET)
        for value in (16000, 64000, 113000, 256000, 512000, 1000000):
            self.assertEqual(validate_budget(value), value)
        for value in (True, False, 15999, 1000001, "64000", 64000.0, [], {}, float("inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_budget(value)

    def test_old_tools_are_removed_in_complete_protocol_groups(self):
        messages = [self.system, self.request]
        for i in range(8):
            messages.extend(tool_group(str(i), "历史观察资料" * 1000))
        original = copy.deepcopy(messages)
        result, stats = compact_context(messages, TOOLS, budget=16000)
        self.assertEqual(messages, original)
        self.assertGreater(stats["trimmedToolGroups"], 0)
        self.assertIn(self.request["content"], [m["content"] for m in result])
        pending = set()
        for message in result:
            if message.get("tool_calls"):
                self.assertFalse(pending)
                pending.update(c["id"] for c in message["tool_calls"])
            if message["role"] == "tool":
                self.assertIn(message["tool_call_id"], pending)
                pending.remove(message["tool_call_id"])
        self.assertFalse(pending)
        self.assertEqual(result[-1]["tool_call_id"], "7")
        self.assertLessEqual(stats["estimatedInputTokens"], stats["inputLimitTokens"])
        self.assertEqual(stats["outputReserveTokens"], 6000)

    def test_large_budget_retains_more_history_and_reports_estimates(self):
        messages = [self.system]
        for i in range(8):
            messages.extend([{"role": "user", "content": "较早任务" * 800,
                              "_context_history": True, "_context_group": str(i)},
                             {"role": "assistant", "content": "实际完成的结果" * 800,
                              "_context_history": True, "_context_group": str(i)}])
        messages.append(self.request)
        low, low_stats = compact_context(messages, TOOLS, budget=16000)
        high, high_stats = compact_context(messages, TOOLS, budget=256000)
        self.assertGreater(len(high), len(low))
        self.assertGreater(high_stats["estimatedInputTokens"], low_stats["estimatedInputTokens"])
        self.assertTrue(high_stats["isEstimate"])
        self.assertNotIn("_context_keep", high[-1])
        self.assertEqual(high_stats["trimmedMessages"], 0)

    def test_recent_large_result_keeps_status_and_is_explicitly_compacted(self):
        messages = [self.system, self.request, *tool_group("recent", "实际日志" * 30_000)]
        result, stats = compact_context(messages, TOOLS, budget=16000)
        self.assertEqual(stats["compactedToolResults"], 1)
        data = json.loads(result[-1]["content"])
        self.assertEqual(data["path"], "recent.md")
        self.assertTrue(data["contextCompacted"])
        self.assertIn("完整工具结果", data["note"])
        self.assertEqual(result[-2]["tool_calls"][0]["id"], "recent")

    def test_images_count_visual_input_not_base64_text(self):
        small = {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,AAAA"}}
        large = copy.deepcopy(small)
        large["image_url"]["url"] += "A" * 1_000_000
        self.assertEqual(estimate_content([small]), 4096)
        self.assertEqual(estimate_content([large]), 4096)
        result, stats = compact_context([self.system, self.request, *tool_group("image", "已抽帧", image=True)], budget=16000)
        self.assertTrue(any(isinstance(m.get("content"), list) for m in result))
        self.assertGreater(stats["estimatedInputTokens"], 4096)

    def test_mandatory_instructions_are_never_silently_truncated(self):
        huge = {**self.request, "content": "当前用户要求" * 5000}
        with self.assertRaisesRegex(ValueError, "提高上下文滑块"):
            compact_context([self.system, huge], TOOLS, budget=16000)
        result, stats = compact_context([self.system, huge], TOOLS, budget=256000)
        self.assertEqual(result[-1]["content"], huge["content"])

    def test_rejects_missing_duplicate_or_orphan_tool_results(self):
        cases = [[{"role": "tool", "tool_call_id": "orphan", "content": "output"}],
                 tool_group("missing", "output")[:1],
                 tool_group("duplicate", "output") + tool_group("duplicate", "output")[1:]]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                compact_context([self.system, self.request, *value])

    def test_latest_images_and_current_phase_survive_old_log_trimming(self):
        phase = {"role": "user", "content": "当前串行阶段：检查实际画面。", "_context_keep": True}
        messages = [self.system, self.request, *tool_group("old", "旧日志" * 6000), phase,
                    *tool_group("latest", "实际工具输出", image=True)]
        result, stats = compact_context(messages, budget=16000)
        texts = [m.get("content") for m in result]
        self.assertIn(phase["content"], texts)
        self.assertIn(self.request["content"], texts)
        self.assertEqual(result[-2]["tool_call_id"], "latest")
        self.assertEqual(result[-1]["content"][0]["text"], "实际抽帧")
        self.assertGreater(stats["trimmedMessages"], 0)


class HarnessBudgetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.library = LibraryStub(self.project)
        self.resources = self.root / "resources"
        self.resources.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def manager(self):
        provider = ProviderStub([reply("完成测试")])
        return RunManager(self.library, provider, self.root / "state", self.resources), provider

    def test_run_persists_selected_budget_and_per_call_usage(self):
        manager, provider = self.manager()
        ident = manager.start({"projectId": "episode", "prompt": "只检查README", "contextBudgetTokens": 128000})["id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and manager.get(ident).get("finishedAt") is None:
            time.sleep(.02)
        result = manager.get(ident)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["contextBudgetTokens"], 128000)
        self.assertEqual(result["limits"]["contextBudgetTokens"], 128000)
        self.assertEqual(result["contextStats"]["budgetTokens"], 128000)
        self.assertEqual(result["usage"][0]["contextStats"], result["contextStats"])
        self.assertFalse(any(any(k.startswith("_context_") for k in m) for m in provider.requests[0]["messages"]))
        self.assertEqual(provider.requests[0]["kwargs"]["max_tokens"], 32768)
        self.assertEqual(provider.requests[0]["kwargs"]["effort"], "xhigh")
        self.assertEqual(result["contextStats"]["outputReserveTokens"],
                         provider.requests[0]["kwargs"]["max_tokens"])
        manager.persist(ident)
        stored = json.loads((self.root / "state" / "runs" / ident / "run.json").read_text(encoding="utf8"))
        self.assertEqual(stored["contextBudgetTokens"], 128000)

    def test_representative_skills_catalog_can_run_at_16k(self):
        creative = self.resources / "skills" / "video-creative" / "SKILL.md"
        creative.parent.mkdir(parents=True)
        creative.write_text("创作工作流参考与验证原则。" * 2000, encoding="utf8")
        catalog = {"projects": [self.library.record], "skills": [
            {"id": f"skill_{i}", "name": f"rainbow skill {i}", "description": "运镜与材质的创作知识" * 50}
            for i in range(100)], "tools": [{"name": "blender", "description": "本地建模工具" * 200}]}
        self.library.snapshot = lambda **_: copy.deepcopy(catalog)
        self.library.skill = lambda ident: {"name": ident, "content": "选定技能完整参考" * 10000}
        manager, _ = self.manager()
        run = {"id": "test", "mode": "creative", "projectId": "episode", "contextBudgetTokens": 16000,
               "skillIds": ["skill_1", "skill_2", "skill_3"], "prompt": "优化10秒片段的运镜，先读取实际工程。"}
        messages = manager.context(run, self.library.record)
        bounded, stats = compact_context(messages, TOOLS, budget=16000)
        self.assertLessEqual(stats["estimatedInputTokens"], 9488)
        self.assertIn("用户选定技能", bounded[0]["content"])
        self.assertEqual(bounded[-1]["content"], run["prompt"])
        self.assertGreater(stats["trimmedMessages"], 0)

    def test_larger_budget_does_not_bypass_curated_project_memory(self):
        manager, _ = self.manager()
        for index in range(15):
            manager.runs[str(index)] = {"id": str(index), "projectId": "episode", "status": "completed",
                                       "createdAt": f"2026-10-{index+1:02}", "prompt": "先前任务" * 2000,
                                       "response": "先前工作结果" * 4000}
        base = {"id": "new", "mode": "review", "projectId": "episode", "skillIds": [], "prompt": "当前任务",
                "context": {"creativeMemory": {"evidence": [{"id": "chosen", "excerpt": "已筛选的历史纠错"}]}}}
        with mock.patch.object(self.library, "snapshot", wraps=self.library.snapshot) as snapshot:
            low = manager.context({**base, "contextBudgetTokens": 16000}, self.library.record)
            high = manager.context({**base, "contextBudgetTokens": 256000}, self.library.record)
            self.assertEqual(snapshot.call_count, 2)
        for messages in (low, high):
            content = json.dumps(messages, ensure_ascii=False)
            self.assertNotIn("先前任务", content)
            self.assertNotIn("先前工作结果", content)
            self.assertIn("已筛选的历史纠错", content)
            self.assertEqual(messages[-1]["content"], "当前任务")

    def test_invalid_budget_fails_before_starting_thread(self):
        manager, _ = self.manager()
        with mock.patch("app.harness.threading.Thread") as thread:
            with self.assertRaises(ValueError):
                manager.start({"projectId": "episode", "prompt": "测试", "contextBudgetTokens": "256000"})
            thread.assert_not_called()


if __name__ == "__main__":
    unittest.main()
