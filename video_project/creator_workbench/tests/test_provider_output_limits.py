"""Authoritative output-limit stops must never replay partial tool requests."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from app.providers import ProviderError, ProviderManager, _StreamAssembly, _read_sse


TOOLS = [{"type": "function", "function": {"name": "read_file", "description": "Read",
    "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}}]


def event(value):
    return "data: " + (value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)) + "\n\n"


class Response(io.BytesIO):
    def __init__(self, body, mime="application/json"):
        super().__init__(body.encode("utf8"))
        self.headers = {"Content-Type": mime}
    def __enter__(self):
        return self
    def __exit__(self, *_):
        self.close()


class ProviderOutputLimitTests(unittest.TestCase):
    def setUp(self):
        self.manager = ProviderManager()

    def limited(self, provider, wire, reason=None, *, text="已核对的正文"):
        usage = {"output_tokens": 6000, "thinking_tokens": 5824}
        if provider == "claude":
            return {"model": "claude-opus-5-5", "usage": usage, "stop_reason": reason or "max_tokens", "content": [
                {"type": "thinking", "thinking": "PRIVATE_PARTIAL_THINKING"},
                {"type": "text", "text": text},
                {"type": "tool_use", "id": "partial", "name": "read_file", "input": '{"path":"unclosed'}]}
        if wire == "responses":
            return {"model": "gpt-6-astra", "usage": usage, "status": "incomplete",
                    "incomplete_details": {"reason": reason or "max_output_tokens"}, "output": [
                        {"type": "message", "content": [{"type": "output_text", "text": text}]},
                        {"type": "function_call", "call_id": "partial", "name": "read_file", "arguments": '{"path":"unclosed'}]}
        return {"model": "gpt-6-astra", "usage": usage, "choices": [{"finish_reason": reason or "length", "message": {
            "content": text, "tool_calls": [{"id": "partial", "type": "function", "function": {
                "name": "read_file", "arguments": '{"path":"unclosed'}}]}}]}

    def assert_limited(self, result, reason):
        self.assertTrue(result["output_truncated"])
        self.assertTrue(result["output_incomplete"])
        self.assertEqual(result["stop_reason"], reason)
        self.assertEqual(result["tool_calls"], [])
        self.assertNotIn("assistant_blocks", result)
        self.assertEqual(result["usage"], {"output_tokens": 6000, "thinking_tokens": 5824})
        self.assertNotIn("PRIVATE_PARTIAL_THINKING", json.dumps(result))

    def test_json_normalization_checks_limit_before_parsing_any_tool_json(self):
        for provider, wire, reason in (("claude", "messages", "max_tokens"),
                                       ("openai", "responses", "max_output_tokens"),
                                       ("openai", "chat", "length")):
            with self.subTest(wire=wire), mock.patch("app.providers._arguments", side_effect=AssertionError("partial tool JSON must not be parsed")):
                result = self.manager._normalize(self.limited(provider, wire), provider, wire)
            self.assert_limited(result, reason)
            self.assertEqual(result["text"], "已核对的正文")
            self.assertTrue(result["partial_has_tools"])

    def test_thinking_only_limit_is_reported_without_missing_content_error(self):
        value = self.limited("claude", "messages")
        value["content"] = value["content"][:1]
        result = self.manager._normalize(value, "claude", "messages")
        self.assert_limited(result, "max_tokens")
        self.assertEqual(result["text"], "")
        self.assertFalse(result["partial_has_tools"])

    def test_all_tools_are_discarded_even_valid_call_before_truncated_call(self):
        for provider, wire in (("claude", "messages"), ("openai", "responses"), ("openai", "chat")):
            value = self.limited(provider, wire)
            if provider == "claude":
                value["content"].insert(0, {"type": "tool_use", "id": "valid", "name": "read_file", "input": {"path": "valid.ts"}})
            elif wire == "responses":
                value["output"].insert(0, {"type": "function_call", "call_id": "valid", "name": "read_file", "arguments": '{"path":"valid.ts"}'})
            else:
                value["choices"][0]["message"]["tool_calls"].insert(0, {"id": "valid", "type": "function", "function": {"name": "read_file", "arguments": '{"path":"valid.ts"}'}})
            with self.subTest(wire=wire):
                result = self.manager._normalize(value, provider, wire)
                self.assertEqual(result["tool_calls"], [])

    def test_unknown_and_filtered_responses_incomplete_are_not_length_recovery(self):
        for details in (None, {}, {"reason": None}, {"reason": "content_filter"}, {"reason": "unknown_reason"}):
            value = self.limited("openai", "responses")
            value["incomplete_details"] = details
            with self.subTest(details=details):
                result = self.manager._normalize(value, "openai", "responses")
                self.assertTrue(result["output_incomplete"])
                self.assertFalse(result["output_truncated"])
                self.assertEqual(result["tool_calls"], [])
                self.assertNotIn("assistant_blocks", result)
                self.assertEqual(result["stop_reason"], (details or {}).get("reason") or "incomplete")
        for provider, wire in (("claude", "messages"), ("openai", "chat")):
            result = self.manager._normalize(self.limited(provider, wire, "content_filter"), provider, wire)
            self.assertTrue(result["output_incomplete"])
            self.assertFalse(result["output_truncated"])
            self.assertEqual(result["tool_calls"], [])

    def anthropic_prefix(self):
        return [
            {"type": "message_start", "message": {"model": "claude-opus-5-5", "content": [], "usage": {}}},
            {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_1", "name": "read_file", "input": {}}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": '{"path":"unclosed'}},
            {"type": "content_block_stop", "index": 0},
        ]

    def test_anthropic_partial_json_waits_for_terminal_limit_before_normalizing(self):
        assembly = _StreamAssembly("messages")
        with mock.patch("app.providers._arguments", side_effect=AssertionError("must wait for final stop")):
            for frame in self.anthropic_prefix():
                self.assertIsNone(assembly.event("", json.dumps(frame)))
            self.assertIsNone(assembly.event("", json.dumps({"type": "message_delta", "delta": {"stop_reason": "max_tokens"},
                "usage": {"output_tokens": 6000, "thinking_tokens": 5824}})))
            value = assembly.event("", json.dumps({"type": "message_stop"}))
            result = self.manager._normalize(value, "claude", "messages")
        self.assert_limited(result, "max_tokens")
        self.assertEqual(result["text"], "")

    def test_anthropic_success_with_malformed_json_remains_rejected(self):
        frames = self.anthropic_prefix() + [
            {"type": "message_delta", "delta": {"stop_reason": "tool_use"}}, {"type": "message_stop"}]
        with self.assertRaises(ProviderError):
            _read_sse(Response("".join(event(f) for f in frames)), "messages")

    def test_responses_and_chat_sse_limits_discard_partial_tool_arguments(self):
        value = self.limited("openai", "responses")
        source = event({"type": "response.incomplete", "response": value})
        raw = _read_sse(Response(source), "responses")
        self.assert_limited(self.manager._normalize(raw, "openai", "responses"), "max_output_tokens")
        frames = [
            {"model": "gpt-6-astra", "choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "id": "partial", "function": {"name": "read_file", "arguments": '{"path":"unclosed'}}]}}]},
            {"choices": [{"index": 0, "delta": {}, "finish_reason": "length"}]},
            {"choices": [], "usage": {"output_tokens": 6000, "thinking_tokens": 5824}},
        ]
        raw = _read_sse(Response("".join(event(f) for f in frames) + event("[DONE]")), "chat")
        self.assert_limited(self.manager._normalize(raw, "openai", "chat"), "length")

    def test_missing_stream_terminal_is_transport_failure_not_output_limit(self):
        frames = self.anthropic_prefix() + [{"type": "message_delta", "delta": {"stop_reason": "max_tokens"}}]
        with self.assertRaises(ProviderError) as caught:
            _read_sse(Response("".join(event(f) for f in frames)), "messages")
        self.assertEqual(caught.exception.kind, "stream_incomplete")

    def test_complete_json_fallback_retains_request_effort_and_never_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / ".claude").mkdir()
            (home / ".claude/settings.json").write_text(json.dumps({"env": {
                "ANTHROPIC_MODEL": "claude-opus-5-5", "ANTHROPIC_API_KEY": "fixture-key", "ANTHROPIC_BASE_URL": "https://fixture.example"}}))
            manager = ProviderManager(home)
            requests = []
            def opening(req, timeout):
                requests.append(json.loads(req.data))
                return Response(json.dumps(self.limited("claude", "messages")))
            opener = mock.Mock()
            opener.open.side_effect = opening
            with mock.patch("app.providers.request.build_opener", return_value=opener):
                result = manager.complete("claude", [{"role": "user", "content": "读当前源码"}], tools=TOOLS,
                                          max_tokens=6000, effort="max")
            self.assert_limited(result, "max_tokens")
            self.assertEqual(opener.open.call_count, 1)
            self.assertEqual(requests[0]["model"], "claude-opus-5-5")
            self.assertEqual(requests[0]["output_config"], {"effort": "max"})
            self.assertEqual(requests[0]["max_tokens"], 6000)
            self.assertEqual(result["effectiveEffort"], "max")

    def test_complete_signed_success_still_preserves_original_blocks(self):
        blocks = [{"type": "thinking", "thinking": "PRIVATE_SUCCESS", "signature": "SIGNATURE=="},
                  {"type": "text", "text": "读取源码"},
                  {"type": "tool_use", "id": "valid", "name": "read_file", "input": {"path": "valid.ts"}}]
        value = {"model": "claude-opus-5-5", "stop_reason": "tool_use", "content": copy.deepcopy(blocks)}
        result = self.manager._normalize(value, "claude", "messages")
        self.assertFalse(result["output_truncated"])
        self.assertFalse(result["output_incomplete"])
        self.assertFalse(result["partial_has_tools"])
        self.assertEqual(result["assistant_blocks"], blocks)
        self.assertEqual(result["tool_calls"][0]["arguments"], {"path": "valid.ts"})


if __name__ == "__main__":
    unittest.main()
