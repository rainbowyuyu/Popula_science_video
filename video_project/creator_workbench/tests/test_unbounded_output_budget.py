"""Local output budgets follow context capacity, without a fixed 65k cap."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from app.context_budget import compact_context
from app.output_budget import effort_allowance, prepare_output_context
from app.providers import ProviderError, ProviderManager


class UnboundedOutputBudgetTests(unittest.TestCase):
    def test_large_context_can_request_more_than_65k_without_truncating_source(self):
        messages = [{"role": "system", "content": "按事实完成"}, {"role": "user", "content": "完整输出", "_context_keep": True}]
        original = copy.deepcopy(messages)
        bounded, stats, output = prepare_output_context(messages, [], budget=1_000_000, desired=262144)
        self.assertEqual(output, 262144)
        self.assertEqual(stats["outputReserveTokens"], output)
        self.assertLessEqual(stats["estimatedInputTokens"] + output + stats["headroomTokens"], 1_000_000)
        self.assertEqual(messages, original)
        self.assertEqual(bounded[-1]["content"], "完整输出")
        self.assertEqual(effort_allowance("max"), 32768)
        self.assertEqual(effort_allowance("xhigh"), 32768)

    def test_sixteen_k_context_uses_actual_remaining_space_not_fixed_input_reserve(self):
        messages = [{"role": "system", "content": "核对文件"}, {"role": "user", "content": "输出完整内容", "_context_keep": True}]
        _, stats, output = prepare_output_context(messages, [], budget=16000, desired=262144)
        self.assertGreater(output, 12000)
        self.assertEqual(stats["estimatedInputTokens"] + output + stats["headroomTokens"], 16000)
        with self.assertRaises(ValueError):
            compact_context(messages, [], budget=16000, output_reserve=output + 1)

    def test_pinned_input_and_signed_blocks_are_counted_inside_context(self):
        messages = [{"role": "system", "content": "主规则"},
                    {"role": "assistant", "content": "已核对", "_provider": "claude", "assistant_blocks": [
                        {"type": "thinking", "thinking": "x" * 15000, "signature": "SIGNED=="},
                        {"type": "text", "text": "已核对"}]},
                    {"role": "user", "content": "接着完成", "_context_keep": True}]
        bounded, stats, output = prepare_output_context(messages, [], budget=16000, desired=200000)
        self.assertGreater(output, 0)
        self.assertLess(output, 12000)
        self.assertLessEqual(stats["estimatedInputTokens"] + output + stats["headroomTokens"], 16000)
        self.assertEqual(bounded[1]["assistant_blocks"], messages[1]["assistant_blocks"])

    def test_impossible_pinned_input_still_reports_real_context_failure(self):
        messages = [{"role": "system", "content": "x" * 90000}, {"role": "user", "content": "继续"}]
        with self.assertRaisesRegex(ValueError, "上下文预算"):
            prepare_output_context(messages, [], budget=16000, desired=262144)
        for desired in (0, -1, True, 1.5, "10000"):
            with self.subTest(desired=desired), self.assertRaises(ValueError):
                prepare_output_context([], [], budget=16000, desired=desired)

    def test_all_provider_wires_pass_large_output_budget_and_long_idle_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / ".codex").mkdir()
            (home / ".claude").mkdir()
            (home / ".claude/settings.json").write_text(json.dumps({"env": {
                "ANTHROPIC_MODEL": "claude-opus-5-5", "ANTHROPIC_API_KEY": "fixture-key", "ANTHROPIC_BASE_URL": "https://fixture.example"}}))
            for provider, wire, field in (("openai", "responses", "max_output_tokens"),
                                          ("openai", "chat", "max_completion_tokens"), ("claude", "messages", "max_tokens")):
                (home / ".codex/config.toml").write_text('model="gpt-6-astra"\nmodel_provider="fixture"\n[model_providers.fixture]\n'
                    'base_url="https://fixture.example/v1"\nexperimental_bearer_token="fixture-key"\n'
                    f'wire_api="{wire if provider == "openai" else "responses"}"\n')
                manager = ProviderManager(home)
                captured = []
                def receiving(url, headers, encoded, timeout, cancel):
                    captured.append((json.loads(encoded), timeout))
                    if provider == "claude":
                        return {"content": [{"type": "text", "text": "ok"}], "stop_reason": "end_turn"}
                    if wire == "responses":
                        return {"output_text": "ok", "status": "completed"}
                    return {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]}
                with self.subTest(wire=wire), mock.patch.object(manager, "_request", side_effect=receiving):
                    result = manager.complete(provider, [{"role": "user", "content": "完整输出"}], max_tokens=262144, timeout=1800)
                self.assertEqual(result["text"], "ok")
                self.assertEqual(captured[0][0][field], 262144)
                self.assertEqual(captured[0][1], 1800)
                self.assertEqual(len(captured), 1)

    def test_invalid_output_and_idle_parameters_are_rejected_before_request(self):
        config = {"configured": True, "model": "gpt-6-astra", "effortDefault": "default", "auth": "bearer", "key": "fixture", "wireApi": "responses", "endpoint": "https://fixture.invalid"}
        manager = ProviderManager()
        cases = [{"max_tokens": n} for n in (0, -1, True, 1.5)] + [{"timeout": n} for n in (0, -1, float("inf"), float("nan"))]
        with mock.patch.object(manager, "_config", return_value=config), mock.patch.object(manager, "_request") as request:
            for options in cases:
                with self.subTest(options=options), self.assertRaises(ProviderError):
                    manager.complete("openai", [{"role": "user", "content": "task"}], **options)
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
