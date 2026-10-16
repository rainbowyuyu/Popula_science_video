import base64
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from unittest import mock

from app.harness import RunManager, safe_path
from app.providers import ProviderError


class LibraryStub:
    def __init__(self, root):
        self.record = {"id": "episode", "name": "测试工程", "path": str(root)}

    def project(self, ident):
        if ident != "episode":
            raise KeyError(ident)
        return copy.deepcopy(self.record)

    def snapshot(self, **kwargs):
        return {"projects": [self.record], "skills": [], "tools": []}

    def media(self, ident):
        return []


class ProviderStub:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.requests = []

    def public_status(self):
        return [{"id": "openai", "configured": True, "model": "mock-model"}]

    def complete(self, provider, messages, **kwargs):
        self.requests.append({"provider": provider, "messages": copy.deepcopy(messages), "kwargs": kwargs})
        reply = next(self.replies)
        return reply(kwargs) if callable(reply) else reply


def reply(text="已完成", calls=None, reason="completed"):
    return {"text": text, "tool_calls": calls or [], "model": "mock-returned", "usage": {"output_tokens": 10}, "stop_reason": reason}


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "episode"
        self.project.mkdir()
        self.state = self.root / "state"
        self.resources = self.root / "resources"
        self.resources.mkdir()
        self.library = LibraryStub(self.project)

    def tearDown(self):
        self.tmp.cleanup()

    def start(self, replies, mode="creative", prompt="完善动画"):
        provider = ProviderStub(replies)
        manager = RunManager(self.library, provider, self.state, self.resources)
        ident = manager.start({"projectId": "episode", "mode": mode, "provider": "openai", "prompt": prompt})["id"]
        return manager, provider, ident

    def finish(self, manager, ident):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            result = manager.get(ident)
            if result["status"] not in {"queued", "running", "cancelling"}:
                # finishedAt is written immediately before final durable persist.
                if "finishedAt" in result or result["status"] == "cancelled":
                    time.sleep(0.03)
                    return manager.get(ident)
            time.sleep(0.02)
        self.fail("Mock task did not finish")

    def test_write_backs_up_original_and_tool_loop_receives_result(self):
        source = self.project / "scene.ts"
        source.write_text("const score = 7;\n", encoding="utf-8")
        call = {"id": "write_1", "name": "write_file", "arguments": {"path": "scene.ts", "content": "const score = 8;\n"}}
        manager, provider, ident = self.start([reply("更新画面", [call]), reply()])
        result = self.finish(manager, ident)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(source.read_text(), "const score = 8;\n")
        change = result["changedFiles"][0]
        self.assertEqual(Path(change["backup"]).read_text(), "const score = 7;\n")
        self.assertIn("-const score = 7;", change["diff"])
        tool_result = provider.requests[1]["messages"][-1]
        self.assertEqual(tool_result["role"], "tool")
        self.assertEqual(tool_result["tool_call_id"], "write_1")
        self.assertEqual(json.loads(tool_result["content"])["written"], "scene.ts")
        persisted = json.loads((self.state / "runs" / ident / "run.json").read_text(encoding="utf-8"))
        self.assertEqual(persisted["status"], "completed")
        self.assertEqual(result["usage"][0]["model"], "mock-returned")

    def test_review_never_offers_or_executes_mutation(self):
        source = self.project / "scene.ts"
        source.write_text("original")
        malicious_call = {"id": "write_1", "name": "write_file", "arguments": {"path": "scene.ts", "content": "changed"}}
        manager, provider, ident = self.start([reply("", [malicious_call]), reply("只能审阅")], mode="review")
        result = self.finish(manager, ident)
        self.assertEqual(source.read_text(), "original")
        offered = {t["function"]["name"] for t in provider.requests[0]["kwargs"]["tools"]}
        self.assertFalse(offered & {"write_file", "replace_text", "run_process"})
        tool_result = json.loads(provider.requests[1]["messages"][-1]["content"])
        self.assertIn("error", tool_result)
        self.assertEqual(result["changedFiles"], [])

    def test_exact_replace_and_failed_path_result(self):
        source = self.project / "scene.ts"
        source.write_text("left + left")
        calls = [{"id": "replace_1", "name": "replace_text", "arguments": {"path": "scene.ts", "old": "left", "new": "right"}},
                 {"id": "read_1", "name": "read_file", "arguments": {"path": "../outside.txt"}}]
        manager, provider, ident = self.start([reply("", calls), reply("需要唯一片段")])
        self.finish(manager, ident)
        self.assertEqual(source.read_text(), "left + left")
        for turn in provider.requests[1]["messages"][-2:]:
            self.assertIn("error", json.loads(turn["content"]))

    def test_secret_paths_and_credentials_not_sent_or_persisted(self):
        (self.project / ".env").write_text("API_KEY=private")
        secret = "sk-test" + "abc123" * 8
        calls = [{"id": "read_secret", "name": "read_file", "arguments": {"path": ".env"}},
                 {"id": "write_secret", "name": "write_file", "arguments": {"path": "config.json", "content": json.dumps({"api_key": secret})}}]
        manager, provider, ident = self.start([reply("", calls), reply("已阻止凭据读取")], prompt="测试 " + secret)
        result = self.finish(manager, ident)
        self.assertFalse((self.project / "config.json").exists())
        self.assertNotIn(secret, json.dumps(result))
        self.assertNotIn(secret, json.dumps(provider.requests[0]["messages"]))
        for turn in provider.requests[1]["messages"][-2:]:
            self.assertIn("error", json.loads(turn["content"]))

    def test_removing_legacy_credential_does_not_leak_it_in_diff(self):
        secret = "sk-legacy" + "abc123" * 8
        source = self.project / "legacy.py"
        source.write_text('API_KEY = "' + secret + '"\nprint("hello")\n')
        call = {"id": "cleanup", "name": "write_file", "arguments": {"path": "legacy.py", "content": 'print("hello")\n'}}
        manager, _, ident = self.start([reply("", [call]), reply("清理完成")])
        result = self.finish(manager, ident)
        self.assertEqual(result["status"], "completed")
        self.assertNotIn(secret, json.dumps(result))
        persisted = (self.state / "runs" / ident / "run.json").read_text(encoding="utf-8")
        self.assertNotIn(secret, persisted)

    def test_cancel_during_provider_call_is_cancelled_not_failed(self):
        entered, release = threading.Event(), threading.Event()
        def blocked(kwargs):
            entered.set()
            release.wait(3)
            if kwargs["cancel_event"].is_set():
                raise ProviderError("生成已取消。")
            return reply()
        manager, _, ident = self.start([blocked])
        self.assertTrue(entered.wait(1))
        manager.stop(ident)
        release.set()
        result = self.finish(manager, ident)
        self.assertEqual(result["status"], "cancelled")

    def test_responses_token_truncation_continues_before_delivering_complete_text(self):
        manager, provider, ident = self.start([
            reply("这是正文的前半句，", reason="max_output_tokens"),
            reply("这里接上后半句。")])
        result = self.finish(manager, ident)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(provider.requests), 2)
        self.assertEqual(result["response"], "这是正文的前半句，这里接上后半句。")

    def test_safe_path_rejects_outside_absolute_and_reserved_sources(self):
        for path in ("../escape.ts", "nested/../../escape.ts", str(self.root / "outside.ts"), ".claude/settings.json", "credentials.json", "secret.pem"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                safe_path(self.project, path, write=True)

    @unittest.skipUnless(os.name == "nt", "Windows path normalization")
    def test_windows_secret_alias_with_trailing_dot_rejected(self):
        (self.project / ".env").write_text("private")
        for path in (".env.", ".env ", "src/config.json:alternate.ts", "NUL.txt"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                safe_path(self.project, path)

    @unittest.skipUnless(shutil.which("ffmpeg"), "Local FFmpeg required")
    def test_inspect_frame_real_extraction_follows_all_tool_results(self):
        # Use a tiny real video and real extraction, but a mock provider. This
        # catches tool/image ordering errors that static schema tests cannot.
        video = self.project / "sample.mp4"
        fixture = subprocess.run([shutil.which("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i",
                                  "color=c=blue:s=128x72:r=2", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)],
                                 capture_output=True, timeout=15, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.assertEqual(fixture.returncode, 0)
        (self.project / "README.md").write_text("Video story", encoding="utf-8")
        calls = [{"id": "frame_one", "name": "inspect_frame", "arguments": {"path": "sample.mp4", "timeSec": 0.25}},
                 {"id": "read_after", "name": "read_file", "arguments": {"path": "README.md"}}]
        manager, provider, ident = self.start([reply("核对画面", calls), reply("已检查这一帧")], mode="review")
        result = self.finish(manager, ident)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["inspectedFrames"], 1)
        turns = provider.requests[1]["messages"][-3:]
        self.assertEqual([t["role"] for t in turns], ["tool", "tool", "user"])
        self.assertEqual([t["tool_call_id"] for t in turns[:2]], ["frame_one", "read_after"])
        self.assertTrue(json.loads(turns[0]["content"])["imageAttached"])
        image = turns[2]["content"][1]["image_url"]["url"]
        self.assertTrue(image.startswith("data:image/jpeg;base64,"))
        decoded = base64.b64decode(image.split(",", 1)[1])
        self.assertTrue(decoded.startswith(b"\xff\xd8\xff"))
        self.assertEqual(decoded, (self.state / "runs" / ident / "inspected-1.jpg").read_bytes())
        persisted = (self.state / "runs" / ident / "run.json").read_text(encoding="utf-8")
        self.assertNotIn("data:image/", persisted)
        self.assertNotIn("_pendingImages", result)

    @unittest.skipUnless(Path("D:/python_project/tts/.venv/Scripts/python.exe").is_file() or shutil.which("python"), "Local Python required")
    def test_creative_process_runs_actual_script_in_selected_project(self):
        (self.project / "proof.py").write_text('from pathlib import Path\nPath("proof.txt").write_text("local execution", encoding="utf-8")\nprint("LOCAL_RUN_OK")\n', encoding="utf-8")
        call = {"id": "process_one", "name": "run_process", "arguments": {"program": "python", "args": ["proof.py"], "timeout": 10}}
        manager, provider, ident = self.start([reply("运行工程脚本", [call]), reply("实际进程成功")])
        result = self.finish(manager, ident)
        self.assertEqual(result["status"], "completed")
        self.assertEqual((self.project / "proof.txt").read_text(), "local execution")
        tool_result = json.loads(provider.requests[1]["messages"][-1]["content"])
        self.assertEqual(tool_result["exitCode"], 0)
        self.assertIn("LOCAL_RUN_OK", tool_result["output"])
        self.assertTrue((self.state / tool_result["log"]).is_file())

    def test_resource_search_reaches_last_page_and_hidden_skill(self):
        catalog = {"projects": [self.library.record], "skills": [
            {"id": f"skill_{i:03}", "name": f"Visual Skill {i:03}", "description": "x" * 260, "status": "registered", "path": f"skills/s{i}/SKILL.md"}
            for i in range(105)], "plugins": [], "tools": []}
        catalog["skills"][-1]["name"] = "Zebra Camera Final"
        self.library.snapshot = lambda **_: copy.deepcopy(catalog)
        calls = [{"id": "last_page", "name": "search_resources", "arguments": {"kind": "skills", "offset": 100, "limit": 40}},
                 {"id": "search_hidden", "name": "search_resources", "arguments": {"query": "zebra camera", "kind": "skills"}}]
        manager, provider, ident = self.start([reply("检索完整索引", calls), reply("找到末页技能")], mode="review")
        self.assertEqual(self.finish(manager, ident)["status"], "completed")
        self.assertNotIn("Zebra Camera Final", provider.requests[0]["messages"][0]["content"])
        page, search = [json.loads(t["content"]) for t in provider.requests[1]["messages"][-2:]]
        self.assertEqual(page["total"], 105)
        self.assertEqual(len(page["items"]), 5)
        self.assertEqual(page["items"][-1]["id"], "skill_104")
        self.assertEqual(search["items"][0]["name"], "Zebra Camera Final")
        self.assertEqual(search["total"], 1)


if __name__ == "__main__":
    unittest.main()
