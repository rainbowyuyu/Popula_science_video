"""Offline Anthropic signed-thinking and cross-provider transport fixtures."""
import base64
import copy
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from app.providers import ProviderError, ProviderManager, _anthropic_messages, _chat_messages, _responses_input
from app.harness import RunManager


TOOLS = [{"type": "function", "function": {"name": "read_file", "description": "Read local source",
          "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}}]


def payload():
    return {"model": "claude-opus-5-5", "stop_reason": "tool_use", "usage": {"output_tokens": 12}, "content": [
        {"type": "thinking", "thinking": "PRIVATE_THINKING_FIXTURE\n保留空格  ", "signature": "SIGNED_FIXTURE+/=="},
        {"type": "redacted_thinking", "data": "PRIVATE_REDACTED_FIXTURE+/=="},
        {"type": "text", "text": "读取实际文件。"},
        {"type": "tool_use", "id": "toolu_example", "name": "read_file", "input": {"path": "source/scene.ts"}},
    ]}


def assistant(normalized):
    return {"role": "assistant", "content": normalized["text"], "tool_calls": normalized["tool_calls"],
            "_provider": "claude", "assistant_blocks": normalized["assistant_blocks"]}


class ClaudeThinkingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        (self.home / ".claude").mkdir()
        (self.home / ".claude/settings.json").write_text(json.dumps({"env": {
            "ANTHROPIC_BASE_URL": "https://fixture.example", "ANTHROPIC_API_KEY": "fixture-key",
            "ANTHROPIC_MODEL": "claude-opus-5-5"}}), encoding="utf8")
        self.manager = ProviderManager(self.home)

    def tearDown(self):
        self.tmp.cleanup()

    def normalized(self):
        return self.manager._normalize(payload(), "claude", "messages")

    def test_strict_adaptive_tool_roundtrip_replays_exact_original_blocks(self):
        first = payload()
        requests = []
        def gateway(url, headers, encoded, timeout, cancel):
            body = json.loads(encoded)
            requests.append(body)
            self.assertEqual(body["thinking"], {"type": "adaptive"})
            self.assertNotIn("temperature", body)
            self.assertEqual(body["output_config"], {"effort": "high"})
            if len(requests) == 1:
                return copy.deepcopy(first)
            self.assertEqual(body["messages"][1], {"role": "assistant", "content": first["content"]})
            self.assertEqual(body["messages"][2], {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "toolu_example", "content": '{"content":"verified source"}'}]})
            return {"model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [{"type": "text", "text": "检查完成。"}]}
        messages = [{"role": "user", "content": "核对当前文件。"}]
        with patch.object(self.manager, "_request", side_effect=gateway):
            result = self.manager.complete("claude", messages, tools=TOOLS, effort="high")
            messages += [assistant(result), {"role": "tool", "tool_call_id": "toolu_example", "content": '{"content":"verified source"}'}]
            final = self.manager.complete("claude", messages, tools=TOOLS, effort="high")
        self.assertEqual(len(requests), 2)
        self.assertEqual(final["text"], "检查完成。")
        self.assertEqual(result["text"], "读取实际文件。")

    def test_metadata_deep_copy_does_not_mix_thinking_into_public_text_or_usage(self):
        original = payload()
        result = self.manager._normalize(original, "claude", "messages")
        self.assertEqual(result["assistant_blocks"], original["content"])
        public = {k: result[k] for k in ("text", "tool_calls", "usage", "stop_reason", "model")}
        self.assertNotIn("PRIVATE_", json.dumps(public))
        result["assistant_blocks"][0]["thinking"] = "changed copy"
        self.assertEqual(original["content"][0]["thinking"], "PRIVATE_THINKING_FIXTURE\n保留空格  ")

    def test_harness_roundtrip_keeps_signed_blocks_in_checkpoint_only(self):
        project = self.home / "project"
        (project / "source").mkdir(parents=True)
        (project / "source/scene.ts").write_text("verified-local-source", encoding="utf8")
        row = {"id": "fixture", "name": "Claude roundtrip", "path": str(project)}
        class Library:
            def project(self, ident):
                if ident != "fixture":
                    raise KeyError(ident)
                return dict(row)
            def snapshot(self, **kwargs):
                return {"projects": [row], "skills": [], "plugins": [], "tools": []}
            def media(self, ident):
                return []
        runs = RunManager(Library(), self.manager, self.home / "state", self.home / "resources")
        original = payload()
        requests = []
        completed_requests = []
        actual_complete = self.manager.complete
        def complete(provider, messages, **kwargs):
            completed_requests.append(copy.deepcopy(messages))
            if len(completed_requests) == 2:
                _, converted = _anthropic_messages(messages)
                preserved = next(m for m in converted if m["role"] == "assistant")
                self.assertEqual(preserved["content"], original["content"])
                results = [b for m in converted for b in m["content"] if b.get("type") == "tool_result"]
                self.assertEqual(len(results), 1)
                self.assertEqual(results[0]["tool_use_id"], "toolu_example")
                self.assertIn("verified-local-source", results[0]["content"])
            return actual_complete(provider, messages, **kwargs)
        def gateway(url, headers, encoded, timeout, cancel):
            requests.append(json.loads(encoded))
            if len(requests) == 1:
                return copy.deepcopy(original)
            return {"model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [{"type": "text", "text": "实际文件核对完成。"}]}
        with patch.object(self.manager, "complete", side_effect=complete), patch.object(self.manager, "_request", side_effect=gateway):
            ident = runs.start({"projectId": "fixture", "provider": "claude", "prompt": "读取并核对实际源码。",
                                "modelEfforts": {"claude": "high"}})["id"]
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if runs.get(ident)["status"] not in {"queued", "running", "cancelling"}:
                    break
                time.sleep(.01)
            self.assertTrue(runs.semaphore.acquire(timeout=2), "fixture worker did not finish")
            runs.semaphore.release()
        final = runs.get(ident)
        self.assertEqual(final["status"], "completed", final["response"])
        self.assertEqual(len(requests), 2)
        self.assertEqual(len(completed_requests), 2)
        public = json.dumps({"get": final, "summary": runs.summary(), "events": final["events"]}, ensure_ascii=False)
        saved_run = (self.home / "state/runs" / ident / "run.json").read_text(encoding="utf8")
        for private in ("PRIVATE_THINKING_FIXTURE", "PRIVATE_REDACTED_FIXTURE", "SIGNED_FIXTURE", "assistant_blocks"):
            self.assertNotIn(private, public)
            self.assertNotIn(private, saved_run)
        checkpoint = runs.read_checkpoint(final)
        preserved = [m for m in checkpoint["messages"] if m.get("assistant_blocks") and m.get("tool_calls")]
        self.assertEqual(len(preserved), 1)
        self.assertEqual(preserved[0]["_provider"], "claude")
        self.assertEqual(preserved[0]["assistant_blocks"], original["content"])

    def test_openai_adapters_never_forward_claude_private_metadata(self):
        message = assistant(self.normalized())
        turns = [{"role": "user", "content": "request"}, message,
                 {"role": "tool", "tool_call_id": "toolu_example", "content": "result"}]
        for converted in (_chat_messages(turns), _responses_input(turns)):
            encoded = json.dumps(converted, ensure_ascii=False)
            for private in ("PRIVATE_THINKING", "PRIVATE_REDACTED", "SIGNED_FIXTURE", "assistant_blocks", "_provider"):
                self.assertNotIn(private, encoded)
            self.assertIn("source/scene.ts", encoded)
            self.assertIn("读取实际文件。", encoded)

    def test_foreign_or_unmarked_metadata_is_ignored_by_anthropic(self):
        for source in (None, "openai"):
            with self.subTest(source=source):
                message = assistant(self.normalized())
                if source is None:
                    message.pop("_provider")
                else:
                    message["_provider"] = source
                # Foreign metadata is not interpreted, even if malformed.
                message["assistant_blocks"] = "untrusted foreign metadata"
                _, turns = _anthropic_messages([message])
                self.assertEqual([b["type"] for b in turns[0]["content"]], ["text", "tool_use"])
                self.assertNotIn("metadata", json.dumps(turns))

    def test_mismatched_tool_or_visible_text_rejected_before_http(self):
        for mutation in ("id", "name", "input", "text", "missing_call"):
            with self.subTest(mutation=mutation):
                message = assistant(self.normalized())
                if mutation == "id":
                    message["tool_calls"][0]["id"] = "another_call"
                elif mutation == "name":
                    message["tool_calls"][0]["name"] = "write_file"
                elif mutation == "input":
                    message["tool_calls"][0]["arguments"]["path"] = "wrong.ts"
                elif mutation == "text":
                    message["content"] = "different visible text"
                else:
                    message["tool_calls"] = []
                with patch.object(self.manager, "_request") as request:
                    with self.assertRaises(ProviderError) as error:
                        self.manager.complete("claude", [{"role": "user", "content": "request"}, message], tools=TOOLS, effort="high")
                    request.assert_not_called()
                self.assertNotIn("PRIVATE_", str(error.exception))

    def test_incomplete_signatures_and_unsupported_blocks_fail_without_exposing_contents(self):
        for broken in ({"type": "thinking", "thinking": "PRIVATE_MISSING_SIGNATURE"},
                       {"type": "thinking", "thinking": [], "signature": "SIGNED_FIXTURE"},
                       {"type": "redacted_thinking", "data": ""},
                       {"type": "server_tool_use", "name": "unexpected"}):
            with self.subTest(kind=broken["type"]):
                value = payload()
                value["content"][0] = broken
                with self.assertRaises(ProviderError) as error:
                    self.manager._normalize(value, "claude", "messages")
                self.assertNotIn("PRIVATE_", str(error.exception))
                self.assertNotIn("SIGNED_FIXTURE", str(error.exception))

    def test_tool_results_remain_before_actual_frame_image_with_signed_assistant(self):
        normalized = self.normalized()
        png = base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode("ascii")
        turns = [assistant(normalized), {"role": "tool", "tool_call_id": "toolu_example", "content": "actual image result"},
                 {"role": "user", "content": [{"type": "text", "text": "刚提取的实际画面"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64," + png}}]}]
        _, converted = _anthropic_messages(turns)
        self.assertEqual(converted[0]["content"], payload()["content"])
        self.assertEqual([b["type"] for b in converted[1]["content"]], ["tool_result", "text", "image"])
        self.assertEqual(converted[1]["content"][2]["source"], {"type": "base64", "media_type": "image/png", "data": png})
        converted[0]["content"][0]["thinking"] = "changed transport copy"
        self.assertEqual(normalized["assistant_blocks"][0]["thinking"], payload()["content"][0]["thinking"])

    def test_legacy_claude_messages_and_other_provider_results_remain_standard(self):
        _, turns = _anthropic_messages([{"role": "assistant", "content": "旧正文", "tool_calls": [
            {"id": "old", "name": "read_file", "arguments": {"path": "old.ts"}}]}])
        self.assertEqual([b["type"] for b in turns[0]["content"]], ["text", "tool_use"])
        openai = self.manager._normalize({"output_text": "OpenAI result"}, "openai", "responses")
        self.assertNotIn("assistant_blocks", openai)


if __name__ == "__main__":
    unittest.main()
