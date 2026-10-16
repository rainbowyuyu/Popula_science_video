import base64
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock
from urllib.error import HTTPError, URLError

from app.providers import ProviderError, ProviderManager, _NoRedirect


TOOLS = [{"type": "function", "function": {"name": "read_project_file", "description": "Read a project file",
    "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}}]


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class ProvidersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        (self.home / ".codex").mkdir()
        (self.home / ".claude").mkdir()
        self.manager = ProviderManager(self.home)
        self.openai_config()
        self.claude_config()

    def tearDown(self):
        self.tmp.cleanup()

    def openai_config(self, wire="responses", key="test-api-secret", extra=""):
        (self.home / ".codex/config.toml").write_text(
            'model = "gpt-6-test"\nmodel_provider = "switched"\n[model_providers.switched]\n'
            'base_url = "https://gateway.example/v1"\nwire_api = "' + wire + '"\n'
            + ('experimental_bearer_token = "' + key + '"\n' if key else "") + extra,
            encoding="utf-8")

    def claude_config(self, env=None):
        (self.home / ".claude/settings.json").write_text(json.dumps({"env": env or {
            "ANTHROPIC_BASE_URL": "https://claude.example",
            "ANTHROPIC_MODEL": "claude-opus-test",
            "ANTHROPIC_AUTH_TOKEN": "claude-api-secret"}}), encoding="utf-8")

    def invoke(self, payload, *, provider="openai", messages=None, **kwargs):
        captured = {}
        def open_request(req, timeout):
            captured.update(url=req.full_url, headers=dict(req.header_items()), body=json.loads(req.data), timeout=timeout)
            return Response(json.dumps(payload).encode())
        opener = mock.Mock()
        opener.open.side_effect = open_request
        with mock.patch("app.providers.request.build_opener", return_value=opener):
            result = self.manager.complete(provider, messages or [{"role": "user", "content": "test"}], **kwargs)
        return result, captured

    def test_status_only_public_and_fresh(self):
        status = self.manager.public_status()
        self.assertTrue(all(p["configured"] for p in status))
        self.assertEqual(status[0]["endpointDisplay"], "https://gateway.example")
        self.assertEqual(status[0]["wireApi"], "responses")
        self.assertNotIn("secret", json.dumps(status))
        self.openai_config(key="")
        self.assertFalse(self.manager.public_status()[0]["configured"])

    def test_responses_tool_roundtrip(self):
        first = {"model": "returned-model", "status": "completed", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": "Inspecting"}]},
            {"type": "function_call", "id": "fc_internal", "call_id": "call_one", "name": "read_project_file", "arguments": '{"path":"src/World.ts"}'}],
            "usage": {"input_tokens": 19, "output_tokens": 9}}
        result, req = self.invoke(first, tools=TOOLS)
        self.assertEqual(result["model"], "returned-model")
        self.assertEqual(result["tool_calls"], [{"id": "call_one", "name": "read_project_file", "arguments": {"path": "src/World.ts"}}])
        self.assertFalse(req["body"]["store"])
        self.assertEqual(req["headers"]["User-agent"], "RainbowCreatorWorkbench/1.0")
        self.assertEqual(req["body"]["max_output_tokens"], 4096)
        self.assertNotIn("temperature", req["body"])
        self.assertEqual(req["body"]["tools"][0]["parameters"], TOOLS[0]["function"]["parameters"])
        self.assertFalse(req["body"]["tools"][0]["strict"])
        self.assertTrue(req["url"].endswith("/v1/responses"))
        second = {"model": "actual-second", "status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "Done"}]}]}
        turns = [{"role": "system", "content": "Bounded scope"}, {"role": "user", "content": "Inspect"},
                 {"role": "assistant", "content": result["text"], "tool_calls": result["tool_calls"]},
                 {"role": "tool", "tool_call_id": "call_one", "content": "source contents"}]
        _, req2 = self.invoke(second, messages=turns)
        self.assertEqual(req2["body"]["instructions"], "Bounded scope")
        self.assertEqual(req2["body"]["input"][-2]["call_id"], "call_one")
        self.assertEqual(req2["body"]["input"][-1], {"type": "function_call_output", "call_id": "call_one", "output": "source contents"})

    def test_chat_completions_roundtrip(self):
        self.openai_config(wire="chat")
        payload = {"model": "chat-reported", "choices": [{"finish_reason": "tool_calls", "message": {"content": None, "tool_calls": [
            {"id": "call_2", "type": "function", "function": {"name": "read_project_file", "arguments": '{"path":"test.txt"}'}}]}}]}
        result, req = self.invoke(payload, tools=TOOLS)
        self.assertEqual(result["tool_calls"][0]["arguments"]["path"], "test.txt")
        self.assertTrue(req["url"].endswith("/v1/chat/completions"))
        self.assertEqual(req["body"]["max_completion_tokens"], 4096)
        turns = [{"role": "assistant", "tool_calls": result["tool_calls"]}, {"role": "tool", "tool_call_id": "call_2", "content": "file"}]
        _, second = self.invoke(payload, messages=turns, tools=TOOLS)
        self.assertEqual(json.loads(second["body"]["messages"][0]["tool_calls"][0]["function"]["arguments"]), {"path": "test.txt"})

    def test_anthropic_tool_roundtrip_and_headers(self):
        payload = {"model": "claude-returned", "stop_reason": "tool_use", "content": [
            {"type": "text", "text": "Reading"}, {"type": "tool_use", "id": "tool_one", "name": "read_project_file", "input": {"path": "scene.ts"}}]}
        result, req = self.invoke(payload, provider="claude", tools=TOOLS)
        self.assertEqual(req["url"], "https://claude.example/v1/messages")
        self.assertIn("Authorization", req["headers"])
        self.assertEqual(req["body"]["tools"][0]["input_schema"], TOOLS[0]["function"]["parameters"])
        turns = [{"role": "system", "content": "Scope"}, {"role": "assistant", "content": "Reading", "tool_calls": result["tool_calls"]},
                 {"role": "tool", "tool_call_id": "tool_one", "content": "file"}, {"role": "tool", "tool_call_id": "tool_two", "content": "other file"}]
        _, second = self.invoke(payload, provider="claude", messages=turns, tools=TOOLS)
        self.assertEqual(second["body"]["system"], "Scope")
        self.assertEqual(second["body"]["messages"][0]["content"][1]["type"], "tool_use")
        self.assertEqual(len(second["body"]["messages"][-1]["content"]), 2)
        self.assertEqual(second["body"]["messages"][-1]["content"][0]["tool_use_id"], "tool_one")

    def test_explicit_environment_only_and_settings_priority(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "stale-secret", "MY_SWITCH_KEY": "fresh-secret", "ANTHROPIC_AUTH_TOKEN": "stale-claude"}):
            self.openai_config(key="", extra='env_key = "MY_SWITCH_KEY"\n')
            payload = {"output_text": "ok"}
            _, req = self.invoke(payload)
            self.assertEqual(req["headers"]["Authorization"], "Bearer fresh-secret")
            self.openai_config(key="")
            self.assertFalse(self.manager.public_status()[0]["configured"])
            _, claude = self.invoke({"content": [{"type": "text", "text": "ok"}]}, provider="claude")
            self.assertEqual(claude["headers"]["Authorization"], "Bearer claude-api-secret")

    def test_auth_json_api_key_allowed_oauth_ignored(self):
        self.openai_config(key="")
        auth = self.home / ".codex/auth.json"
        auth.write_text(json.dumps({"tokens": {"access_token": "subscription-secret"}}))
        self.assertFalse(self.manager.public_status()[0]["configured"])
        auth.write_text(json.dumps({"OPENAI_API_KEY": "fresh-api-secret", "tokens": {"access_token": "subscription-secret"}}))
        self.assertTrue(self.manager.public_status()[0]["configured"])
        self.claude_config({"ANTHROPIC_AUTH_TOKEN": "LOCAL_CREDENTIAL_REQUIRED"})
        self.assertFalse(self.manager.public_status()[1]["configured"])

    def test_auth_refresh_between_complete_calls(self):
        _, first = self.invoke({"output_text": "ok"})
        self.openai_config(key="new-api-secret")
        _, second = self.invoke({"output_text": "ok"})
        self.assertNotEqual(first["headers"]["Authorization"], second["headers"]["Authorization"])
        self.assertEqual(second["headers"]["Authorization"], "Bearer new-api-secret")

    def test_api_key_anthropic_header_and_v1_not_duplicated(self):
        self.claude_config({"ANTHROPIC_BASE_URL": "https://claude.example/v1", "ANTHROPIC_API_KEY": "apikey"})
        _, req = self.invoke({"content": [{"type": "text", "text": "ok"}]}, provider="claude")
        self.assertEqual(req["url"], "https://claude.example/v1/messages")
        self.assertEqual(req["headers"]["X-api-key"], "apikey")
        self.assertNotIn("Authorization", req["headers"])

    def test_errors_do_not_echo_upstream_credentials(self):
        for exception in (HTTPError("https://key-secret@example", 401, "body-secret", {"Authorization": "header-secret"}, io.BytesIO(b"echo-key-secret")),
                          URLError("endpoint-query-secret"), RuntimeError("test-api-secret")):
            opener = mock.Mock()
            opener.open.side_effect = exception
            with mock.patch("app.providers.request.build_opener", return_value=opener):
                with self.assertRaises(ProviderError) as ctx:
                    self.manager.complete("openai", [{"role": "user", "content": "hello"}])
            self.assertNotIn("secret", str(ctx.exception))
            self.assertEqual(opener.open.call_count, 1)

    def test_json_error_and_malformed_arguments_are_not_executed(self):
        with self.assertRaises(ProviderError):
            self.invoke({"error": {"message": "echo-secret"}})
        for args in ('{"unfinished":', '[1,2]', '"string"'):
            with self.assertRaises(ProviderError):
                self.invoke({"output": [{"type": "function_call", "call_id": "id", "name": "read_project_file", "arguments": args}]})

    def test_size_boundaries(self):
        with self.assertRaisesRegex(ProviderError, "8 MB"):
            self.invoke({"output_text": "ok"}, messages=[{"role": "user", "content": "x" * (8 * 1024 * 1024)}])
        opener = mock.Mock()
        opener.open.return_value = Response(b"x" * (8 * 1024 * 1024 + 1))
        with mock.patch("app.providers.request.build_opener", return_value=opener):
            with self.assertRaisesRegex(ProviderError, "8 MB"):
                self.manager.complete("openai", [{"role": "user", "content": "test"}])

    def test_endpoint_hides_paths_and_rejects_credentials(self):
        self.claude_config({"ANTHROPIC_BASE_URL": "https://gateway.example/private-path", "ANTHROPIC_API_KEY": "key"})
        self.assertEqual(self.manager.public_status()[1]["endpointDisplay"], "https://gateway.example")
        for url in ("https://user:secret@gateway.example", "https://gateway.example?key=secret", "http://remote.example/v1", "file:///secret"):
            self.claude_config({"ANTHROPIC_BASE_URL": url, "ANTHROPIC_API_KEY": "key"})
            status = self.manager.public_status()[1]
            self.assertFalse(status["configured"])
            self.assertNotIn("secret", json.dumps(status))

    def test_redirects_never_forward_credentials(self):
        self.assertIsNone(_NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://other.example"))

    def test_cancel_before_request(self):
        cancel = threading.Event()
        cancel.set()
        with mock.patch("app.providers.request.build_opener") as build:
            with self.assertRaisesRegex(ProviderError, "取消"):
                self.manager.complete("openai", [{"role": "user", "content": "hi"}], cancel_event=cancel)
        build.assert_not_called()

    def test_cancel_during_request_returns_promptly(self):
        cancel, release = threading.Event(), threading.Event()
        opener = mock.Mock()
        def blocked(*_, **__):
            cancel.set()
            release.wait(2)
            return Response(b'{"output_text":"late"}')
        opener.open.side_effect = blocked
        start = time.monotonic()
        try:
            with mock.patch("app.providers.request.build_opener", return_value=opener):
                with self.assertRaisesRegex(ProviderError, "取消"):
                    self.manager.complete("openai", [{"role": "user", "content": "hi"}], cancel_event=cancel)
            self.assertLess(time.monotonic() - start, 0.8)
        finally:
            release.set()

    def test_malformed_config_public_safe(self):
        (self.home / ".codex/config.toml").write_text('api_secret = "broken-secret')
        public = self.manager.public_status()[0]
        self.assertFalse(public["configured"])
        self.assertNotIn("broken-secret", json.dumps(public))

    def test_returned_model_not_fabricated(self):
        result, _ = self.invoke({"output_text": "answer"})
        self.assertEqual(result["model"], "")

    def test_incomplete_reason_preserved(self):
        result, _ = self.invoke({"output_text": "partial", "status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}})
        self.assertEqual(result["stop_reason"], "max_output_tokens")

    def test_unoffered_tool_is_rejected(self):
        with self.assertRaisesRegex(ProviderError, "未提供"):
            self.invoke({"output": [{"type": "function_call", "call_id": "call_id", "name": "secret_tool", "arguments": "{}"}]}, tools=TOOLS)

    def test_duplicate_tool_ids_are_rejected(self):
        call = {"type": "function_call", "call_id": "call_id", "name": "read_project_file", "arguments": "{}"}
        with self.assertRaisesRegex(ProviderError, "重复"):
            self.invoke({"output": [call, call]}, tools=TOOLS)

    def test_openai_anthropic_wire_is_rejected(self):
        self.openai_config(wire="messages")
        self.assertFalse(self.manager.public_status()[0]["configured"])

    def image_messages(self, url=None):
        # A valid PNG signature plus an ordinary 1x1 raster, no external source.
        data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCfcAAAAASUVORK5CYII="
        self.image_base64 = data
        return [{"role": "user", "content": [{"type": "text", "text": "检查遮挡"},
                 {"type": "image_url", "image_url": {"url": url or "data:image/png;base64," + data, "detail": "high"}}]}]

    def test_responses_image_content_schema(self):
        result, req = self.invoke({"output_text": "视觉检查"}, messages=self.image_messages())
        parts = req["body"]["input"][0]["content"]
        self.assertEqual(parts[0], {"type": "input_text", "text": "检查遮挡"})
        self.assertEqual(parts[1]["type"], "input_image")
        self.assertEqual(parts[1]["detail"], "high")
        self.assertTrue(parts[1]["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual(result["text"], "视觉检查")

    def test_chat_image_content_schema(self):
        self.openai_config(wire="chat")
        _, req = self.invoke({"choices": [{"message": {"content": "ok"}}]}, messages=self.image_messages())
        image = req["body"]["messages"][0]["content"][1]
        self.assertEqual(image["type"], "image_url")
        self.assertEqual(image["image_url"]["detail"], "high")

    def test_anthropic_image_content_schema(self):
        _, req = self.invoke({"content": [{"type": "text", "text": "ok"}]}, provider="claude", messages=self.image_messages())
        image = req["body"]["messages"][0]["content"][1]
        self.assertEqual(image, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": self.image_base64}})

    def test_remote_image_mime_and_oversize_rejected_before_request(self):
        examples = ("https://example.com/secret.png", "file:///C:/secret.png", "data:image/svg+xml;base64,PHN2Zz4=",
                    "data:image/jpeg;base64," + base64.b64encode(b"not jpeg").decode(),
                    "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (4 * 1024 * 1024)).decode())
        for url in examples:
            with self.subTest(kind=url[:40]), mock.patch("app.providers.request.build_opener") as build:
                with self.assertRaises(ProviderError):
                    self.manager.complete("openai", self.image_messages(url))
                build.assert_not_called()

    def test_tool_result_cannot_smuggle_image(self):
        messages = self.image_messages()
        messages[0].update(role="tool", tool_call_id="tool1")
        with self.assertRaises(ProviderError):
            self.invoke({"output_text": "ok"}, messages=messages)


if __name__ == "__main__":
    unittest.main()
