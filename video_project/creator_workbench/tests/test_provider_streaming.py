"""SSE wire protocol tests. Every request is intercepted; no external calls."""
import copy
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock
from urllib.error import HTTPError, URLError

from app.providers import ProviderError, ProviderManager, _read_sse


TOOLS = [{"type": "function", "function": {"name": "read_file", "description": "Read",
    "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}}]


def event(value, name=None):
    data = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return (("event: " + name + "\n") if name else "") + "data: " + data + "\n\n"


class Response(io.BytesIO):
    def __init__(self, data, mime="text/event-stream"):
        super().__init__(data.encode("utf8") if isinstance(data, str) else data)
        self.headers = {"Content-Type": mime}
    def __enter__(self):
        return self
    def __exit__(self, *_):
        self.close()


class ProviderStreamingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        (self.home / ".codex").mkdir()
        (self.home / ".claude").mkdir()
        self.config_openai()
        (self.home / ".claude/settings.json").write_text(json.dumps({"env": {
            "ANTHROPIC_BASE_URL": "https://claude.fixture", "ANTHROPIC_API_KEY": "fixture-key",
            "ANTHROPIC_MODEL": "claude-opus-5-5"}}), encoding="utf8")
        self.manager = ProviderManager(self.home)

    def tearDown(self):
        self.tmp.cleanup()

    def config_openai(self, wire="responses"):
        (self.home / ".codex/config.toml").write_text(
            'model="gpt-6-astra"\nmodel_provider="fixture"\n[model_providers.fixture]\n'
            'base_url="https://openai.fixture/v1"\nexperimental_bearer_token="fixture-key"\n'
            f'wire_api="{wire}"\n', encoding="utf8")

    def invoke(self, source, *, provider="openai", mime="text/event-stream", **kwargs):
        requests = []
        def opening(req, timeout):
            requests.append({"body": json.loads(req.data), "headers": dict(req.header_items())})
            return source if isinstance(source, Response) else Response(source, mime)
        opener = mock.Mock()
        opener.open.side_effect = opening
        with mock.patch("app.providers.request.build_opener", return_value=opener):
            result = self.manager.complete(provider, [{"role": "user", "content": "核对源码"}], tools=TOOLS, **kwargs)
        self.assertEqual(opener.open.call_count, 1)
        return result, requests[0]

    def test_responses_final_payload_stream_request_and_usage(self):
        final = {"model": "gpt-6-astra", "status": "completed", "usage": {"output_tokens": 27}, "output": [
            {"type": "message", "content": [{"type": "output_text", "text": "完整结果"}]},
            {"type": "function_call", "call_id": "call_one", "name": "read_file", "arguments": '{"path":"scene.ts"}'}]}
        source = ": keepalive\n\n" + event({"type": "response.created", "response": {"id": "r1", "model": "gpt-6-astra"}})
        source += event({"type": "response.output_text.delta", "output_index": 0, "content_index": 0, "delta": "partial"})
        source += event({"type": "response.completed", "response": final})
        result, req = self.invoke(source, effort="xhigh")
        self.assertTrue(req["body"]["stream"])
        self.assertIn("text/event-stream", req["headers"]["Accept"])
        self.assertEqual(req["body"]["reasoning"], {"effort": "xhigh"})
        self.assertEqual(result["text"], "完整结果")
        self.assertEqual(result["tool_calls"][0]["arguments"], {"path": "scene.ts"})
        self.assertEqual(result["usage"], {"output_tokens": 27})

    def test_responses_buffers_text_and_tool_delta_when_terminal_omits_output(self):
        frames = [
            {"type": "response.created", "response": {"model": "gpt-6-astra"}},
            {"type": "response.output_item.added", "output_index": 0, "item": {"type": "message", "role": "assistant", "content": []}},
            {"type": "response.content_part.added", "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": ""}},
            {"type": "response.output_text.delta", "output_index": 0, "content_index": 0, "delta": "核对"},
            {"type": "response.output_text.delta", "output_index": 0, "content_index": 0, "delta": "结果"},
            {"type": "response.output_item.added", "output_index": 1, "item": {"type": "function_call", "call_id": "call_two", "name": "read_file", "arguments": ""}},
            {"type": "response.function_call_arguments.delta", "output_index": 1, "delta": '{"path":'},
            {"type": "response.function_call_arguments.delta", "output_index": 1, "delta": '"scene.ts"}'},
            {"type": "response.completed", "response": {"model": "gpt-6-astra", "usage": {"output_tokens": 15}}},
        ]
        result, _ = self.invoke("".join(event(f) for f in frames))
        self.assertEqual(result["text"], "核对结果")
        self.assertEqual(result["tool_calls"], [{"id": "call_two", "name": "read_file", "arguments": {"path": "scene.ts"}}])

    def test_responses_incomplete_retains_stop_reason_for_executor_guard(self):
        source = event({"type": "response.incomplete", "response": {"model": "gpt-6-astra", "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"}, "output": [
                {"type": "message", "content": [{"type": "output_text", "text": "未完整输出"}]}]}})
        result, _ = self.invoke(source)
        self.assertEqual(result["stop_reason"], "max_output_tokens")

    def test_chat_assembles_fragmented_tool_text_and_terminal_usage(self):
        self.config_openai("chat")
        frames = [
            {"model": "gpt-6-astra", "choices": [{"index": 0, "delta": {"role": "assistant", "content": "正在"}}]},
            {"choices": [{"index": 0, "delta": {"content": "核对", "tool_calls": [{"index": 0, "id": "call_c", "type": "function", "function": {"name": "read_file", "arguments": '{"path":'}}]}}]},
            {"choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "function": {"arguments": '"scene.ts"}'}}]}}]},
            {"choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]},
            {"choices": [], "usage": {"prompt_tokens": 10, "completion_tokens": 8}},
        ]
        result, req = self.invoke("".join(event(f) for f in frames) + event("[DONE]"))
        self.assertTrue(req["body"]["stream"])
        self.assertEqual(req["body"]["stream_options"], {"include_usage": True})
        self.assertEqual(result["text"], "正在核对")
        self.assertEqual(result["tool_calls"][0]["arguments"], {"path": "scene.ts"})
        self.assertEqual(result["stop_reason"], "tool_calls")
        self.assertEqual(result["usage"]["completion_tokens"], 8)

    def anthropic_frames(self):
        return [
            {"type": "message_start", "message": {"model": "claude-opus-5-5", "content": [], "usage": {"input_tokens": 12}}},
            {"type": "content_block_start", "index": 0, "content_block": {"type": "thinking", "thinking": ""}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "PRIVATE_THINKING"}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "signature_delta", "signature": "SIGNED+"}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "signature_delta", "signature": "FIXTURE=="}},
            {"type": "content_block_stop", "index": 0},
            {"type": "content_block_start", "index": 1, "content_block": {"type": "redacted_thinking", "data": "REDACTED=="}},
            {"type": "content_block_stop", "index": 1},
            {"type": "content_block_start", "index": 2, "content_block": {"type": "text", "text": ""}},
            {"type": "content_block_delta", "index": 2, "delta": {"type": "text_delta", "text": "实际核对"}},
            {"type": "content_block_stop", "index": 2},
            {"type": "content_block_start", "index": 3, "content_block": {"type": "tool_use", "id": "toolu_1", "name": "read_file", "input": {}}},
            {"type": "content_block_delta", "index": 3, "delta": {"type": "input_json_delta", "partial_json": '{"path":'}},
            {"type": "content_block_delta", "index": 3, "delta": {"type": "input_json_delta", "partial_json": '"scene.ts"}'}},
            {"type": "content_block_stop", "index": 3},
            {"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 34}},
            {"type": "message_stop"},
        ]

    def test_anthropic_signed_thinking_redacted_and_tool_arguments_roundtrip(self):
        result, req = self.invoke("".join(event(f, f["type"]) for f in self.anthropic_frames()), provider="claude", effort="high")
        self.assertTrue(req["body"]["stream"])
        self.assertEqual(req["body"]["thinking"], {"type": "adaptive"})
        self.assertEqual(result["text"], "实际核对")
        self.assertEqual(result["assistant_blocks"][0], {"type": "thinking", "thinking": "PRIVATE_THINKING", "signature": "SIGNED+FIXTURE=="})
        self.assertEqual(result["assistant_blocks"][1], {"type": "redacted_thinking", "data": "REDACTED=="})
        self.assertEqual(result["tool_calls"][0]["arguments"], {"path": "scene.ts"})
        self.assertEqual(result["usage"], {"input_tokens": 12, "output_tokens": 34})
        self.assertNotIn("PRIVATE", result["text"])

    def test_missing_terminal_markers_never_return_partial_tools(self):
        sources = [
            ("responses", event({"type": "response.output_item.added", "output_index": 0,
                "item": {"type": "function_call", "call_id": "c1", "name": "read_file", "arguments": "{}"}})),
            ("chat", event({"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "c1", "function": {"name": "read_file", "arguments": "{}"}}]}, "finish_reason": "tool_calls"}]})),
            ("chat", event({"choices": [{"delta": {"content": "unfinished"}}]}) + event("[DONE]")),
            ("messages", "".join(event(f) for f in self.anthropic_frames()[:-1])),
        ]
        for wire, source in sources:
            with self.subTest(wire=wire), self.assertRaises(ProviderError) as caught:
                _read_sse(Response(source), wire)
            self.assertEqual(caught.exception.kind, "stream_incomplete")
            self.assertTrue(caught.exception.retryable)

    def test_anthropic_terminal_with_unclosed_block_or_json_is_rejected(self):
        frames = self.anthropic_frames()
        for source in (frames[:14] + frames[15:], frames[:13] + frames[14:]):
            with self.subTest(source=len(source)), self.assertRaises(ProviderError):
                _read_sse(Response("".join(event(f) for f in source)), "messages")

    def test_stream_error_is_safe_and_no_partial_tools_are_returned(self):
        partial = event({"type": "response.output_item.added", "output_index": 0,
                         "item": {"type": "function_call", "call_id": "c1", "name": "read_file", "arguments": "{}"}})
        source = partial + event({"type": "error", "error": {"type": "overloaded_error", "message": "PRIVATE_URL_KEY"}})
        with self.assertRaises(ProviderError) as caught:
            self.invoke(source)
        self.assertEqual(caught.exception.kind, "upstream")
        self.assertTrue(caught.exception.retryable)
        self.assertNotIn("PRIVATE", str(caught.exception))

    def test_json_fallback_does_not_retry_and_missing_mime_sse_is_detected(self):
        result, req = self.invoke(json.dumps({"output_text": "JSON fallback", "status": "completed"}), mime="application/json")
        self.assertEqual(result["text"], "JSON fallback")
        self.assertTrue(req["body"]["stream"])
        source = Response(event({"type": "response.completed", "response": {"output_text": "sniffed", "status": "completed"}}))
        del source.headers
        result, _ = self.invoke(source)
        self.assertEqual(result["text"], "sniffed")

    def test_multiline_sse_crlf_and_bounded_response(self):
        source = ': heartbeat\r\n\r\nevent: response.completed\r\ndata: {"type":"response.completed",\r\ndata: "response":{"output_text":"ok","status":"completed"}}\r\n\r\n'
        result, _ = self.invoke(source)
        self.assertEqual(result["text"], "ok")
        with mock.patch("app.providers.MAX_BODY_BYTES", 128):
            with self.assertRaises(ProviderError) as caught:
                _read_sse(Response(": " + "x" * 129 + "\n\n"), "responses")
        self.assertEqual(caught.exception.kind, "response_size")

    def test_missing_or_wrong_mime_detects_sse_without_waiting_for_eof(self):
        class KeptOpen(Response):
            def read(self, size=-1):
                raise AssertionError("must not wait for entire response or EOF")
            def readline(self, size=-1):
                line = super().readline(size)
                if not line:
                    raise AssertionError("completed stream must return before socket EOF")
                return line
        for mime in (None, "application/json"):
            with self.subTest(mime=mime):
                source = KeptOpen("\n" + event({"type": "response.completed", "response": {"status": "completed", "output_text": "without EOF"}}))
                if mime is None:
                    del source.headers
                else:
                    source.headers["Content-Type"] = mime
                result, _ = self.invoke(source)
                self.assertEqual(result["text"], "without EOF")

    def test_cancel_during_stream_read_returns_without_retry(self):
        cancel, release = threading.Event(), threading.Event()
        class Blocking(Response):
            def readline(self, size=-1):
                cancel.set()
                release.wait(2)
                return b""
        opener = mock.Mock()
        opener.open.return_value = Blocking("")
        started = time.monotonic()
        try:
            with mock.patch("app.providers.request.build_opener", return_value=opener):
                with self.assertRaises(ProviderError) as caught:
                    self.manager.complete("openai", [{"role": "user", "content": "test"}], cancel_event=cancel)
            self.assertEqual(caught.exception.kind, "cancelled")
            self.assertFalse(caught.exception.retryable)
            self.assertLess(time.monotonic() - started, .8)
            self.assertEqual(opener.open.call_count, 1)
        finally:
            release.set()

    def test_http_failure_metadata_is_classified_without_upstream_details(self):
        for status, kind, retryable in [(408, "timeout", True), (429, "rate_limit", True), (500, "upstream", True),
                                        (502, "upstream", True), (504, "timeout", True), (524, "timeout", True),
                                        (401, "auth", False), (403, "auth", False), (400, "config", False)]:
            opener = mock.Mock()
            opener.open.side_effect = HTTPError("https://PRIVATE_KEY.example", status, "PRIVATE_REASON", {}, io.BytesIO(b"PRIVATE_BODY"))
            with self.subTest(status=status), mock.patch("app.providers.request.build_opener", return_value=opener):
                with self.assertRaises(ProviderError) as caught:
                    self.manager.complete("openai", [{"role": "user", "content": "test"}])
                self.assertEqual((caught.exception.kind, caught.exception.status_code, caught.exception.retryable), (kind, status, retryable))
                self.assertNotIn("PRIVATE", str(caught.exception))
                if status == 524:
                    self.assertNotIn("配置", str(caught.exception))
                self.assertEqual(opener.open.call_count, 1)

    def test_continuous_heartbeat_progress_can_exceed_idle_timeout_and_complete(self):
        started = time.monotonic()
        class Heartbeats(Response):
            def __init__(self):
                super().__init__(event({"type": "response.completed", "response": {"status": "completed", "output_text": "long response"}}))
                self.remaining = 12
            def readline(self, size=-1):
                if self.remaining:
                    self.remaining -= 1
                    time.sleep(.02)
                    return b": heartbeat\n"
                return super().readline(size)
        opener = mock.Mock()
        opener.open.return_value = Heartbeats()
        with mock.patch("app.providers.request.build_opener", return_value=opener):
            result = self.manager._request("https://fixture.invalid/v1/responses", {"Accept": "text/event-stream"},
                                           json.dumps({"input": [], "stream": True}).encode(), .15, threading.Event())
        self.assertEqual(result["output_text"], "long response")
        self.assertGreater(time.monotonic() - started, .15)
        self.assertEqual(opener.open.call_count, 1)

    def test_idle_timeout_stops_worker_without_cancelling_whole_run(self):
        closed = threading.Event()
        release = threading.Event()
        cancel = threading.Event()
        reads = []
        class Idle(Response):
            def readline(self, size=-1):
                release.wait(2)
                reads.append(1)
                return b": heartbeat\n"
            def close(self):
                super().close()
                closed.set()
        opener = mock.Mock()
        opener.open.return_value = Idle("")
        try:
            with mock.patch("app.providers.request.build_opener", return_value=opener):
                with self.assertRaises(ProviderError) as caught:
                    self.manager._request("https://fixture.invalid/v1/responses", {"Accept": "text/event-stream"},
                                          json.dumps({"input": [], "stream": True}).encode(), .05, cancel)
                release.set()
                self.assertTrue(closed.wait(.5), "stream worker kept reading after idle timeout")
        finally:
            release.set()
        self.assertEqual(caught.exception.kind, "timeout")
        self.assertTrue(caught.exception.retryable)
        self.assertTrue(reads)
        self.assertFalse(cancel.is_set())
        self.assertEqual(opener.open.call_count, 1)

    def test_user_can_cancel_continuous_heartbeats(self):
        cancel = threading.Event()
        closed = threading.Event()
        class Heartbeats(Response):
            def readline(self, size=-1):
                cancel.set()
                return b": heartbeat\n"
            def close(self):
                super().close()
                closed.set()
        opener = mock.Mock()
        opener.open.return_value = Heartbeats("")
        with mock.patch("app.providers.request.build_opener", return_value=opener):
            with self.assertRaises(ProviderError) as caught:
                self.manager._request("https://fixture.invalid/v1/responses", {"Accept": "text/event-stream"},
                                      json.dumps({"input": [], "stream": True}).encode(), .05, cancel)
        self.assertEqual(caught.exception.kind, "cancelled")
        self.assertTrue(closed.wait(.5))
        self.assertEqual(opener.open.call_count, 1)

    def test_network_timeout_is_retryable_but_never_automatically_retried(self):
        for exc, kind in [(TimeoutError("PRIVATE"), "timeout"), (URLError(TimeoutError("PRIVATE")), "timeout"),
                          (URLError("PRIVATE_NETWORK"), "network")]:
            opener = mock.Mock()
            opener.open.side_effect = exc
            with self.subTest(kind=kind), mock.patch("app.providers.request.build_opener", return_value=opener):
                with self.assertRaises(ProviderError) as caught:
                    self.manager.complete("openai", [{"role": "user", "content": "test"}])
            self.assertEqual(caught.exception.kind, kind)
            self.assertTrue(caught.exception.retryable)
            self.assertNotIn("PRIVATE", str(caught.exception))
            self.assertEqual(opener.open.call_count, 1)


if __name__ == "__main__":
    unittest.main()
