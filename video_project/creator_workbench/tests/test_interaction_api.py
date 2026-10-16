"""Real local HTTP/state tests for editor controls; no model API calls."""
import json
from pathlib import Path
import threading
import unittest
from unittest import mock

from tests import test_server as server_fixture


class InteractionAPITests(unittest.TestCase):
    setUp = server_fixture.ServerTests.setUp
    tearDown = server_fixture.ServerTests.tearDown
    call = server_fixture.ServerTests.call

    def configure(self, tokens, pid=None):
        return self.call("POST", "/api/studio/action", {
            "action": "context.configure", "projectId": pid or self.project["id"],
            "contextBudgetTokens": tokens}, csrf=True)

    def test_context_setting_is_durable_and_exposed_in_bootstrap(self):
        status, _, body = self.configure(192000)
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)["contextBudgetTokens"], 192000)
        stored = json.loads((Path(self.project["path"]) / ".studio/project.json").read_text(encoding="utf8"))
        self.assertEqual(stored["contextBudgetTokens"], 192000)
        # Reload the module state from disk, not only its in-memory cache.
        self.app.studio = type(self.app.studio)(self.app)
        result = json.loads(self.call("GET", "/api/bootstrap")[2])
        selected = next(p for p in result["projects"] if p["id"] == self.project["id"])
        self.assertEqual(selected["contextBudgetTokens"], 192000)
        self.app.providers.complete.assert_not_called()

    def test_context_rejects_invalid_values_without_overwriting_saved_setting(self):
        self.assertEqual(self.configure(96000)[0], 200)
        for value in (0, 15999, 1000001, "128000", 96000.5, True, []):
            with self.subTest(value=value):
                self.assertEqual(self.configure(value)[0], 400)
                self.assertEqual(self.app.studio.config(self.project["id"])["contextBudgetTokens"], 96000)

    def test_context_project_changes_remain_scoped(self):
        other = self.app.create_project("另一个工程")
        self.assertEqual(self.configure(48000)[0], 200)
        self.assertEqual(self.configure(128000, other["id"])[0], 200)
        data = json.loads(self.call("GET", "/api/bootstrap")[2])
        values = {p["id"]: p["contextBudgetTokens"] for p in data["projects"]}
        self.assertEqual(values[self.project["id"]], 48000)
        self.assertEqual(values[other["id"]], 128000)

    def test_run_endpoint_defaults_to_project_setting_but_keeps_explicit_override(self):
        self.assertEqual(self.configure(192000)[0], 200)
        body = {"projectId": self.project["id"], "prompt": "优化当前镜头", "provider": "openai"}
        with mock.patch.object(self.app.runs, "start", return_value={"id": "test-run"}) as start:
            self.assertEqual(self.call("POST", "/api/runs", body, csrf=True)[0], 202)
            self.assertEqual(start.call_args.args[0]["contextBudgetTokens"], 192000)
            self.assertEqual(self.call("POST", "/api/runs", {**body, "contextBudgetTokens": 32000}, csrf=True)[0], 202)
            self.assertEqual(start.call_args.args[0]["contextBudgetTokens"], 32000)
        self.app.providers.complete.assert_not_called()

    def test_run_endpoint_invalid_budget_does_not_start_model_request(self):
        status, _, body = self.call("POST", "/api/runs", {
            "projectId": self.project["id"], "prompt": "测试",
            "contextBudgetTokens": "64000"}, csrf=True)
        self.assertEqual(status, 400, body)
        self.app.providers.complete.assert_not_called()

    def test_efforts_persist_and_run_uses_project_defaults_with_explicit_override(self):
        efforts = {'openai': 'xhigh', 'claude': 'low'}
        status, _, raw = self.call('POST', '/api/studio/action', {'action': 'context.configure',
            'projectId': self.project['id'], 'contextBudgetTokens': 1000000, 'modelEfforts': efforts}, csrf=True)
        self.assertEqual(status, 200, raw)
        self.assertEqual(json.loads(raw)['modelEfforts'], efforts)
        selected = next(p for p in json.loads(self.call('GET', '/api/bootstrap')[2])['projects'] if p['id'] == self.project['id'])
        self.assertEqual(selected['modelEfforts'], efforts)
        body = {'projectId': self.project['id'], 'provider': 'dual', 'prompt': '检查片段'}
        with mock.patch.object(self.app.runs, 'start', return_value={'id': 'fixture-run'}) as start:
            self.assertEqual(self.call('POST', '/api/runs', body, csrf=True)[0], 202)
            self.assertEqual(start.call_args.args[0]['modelEfforts'], efforts)
            self.assertEqual(start.call_args.args[0]['contextBudgetTokens'], 1000000)
            override = {'openai': 'low', 'claude': 'high'}
            self.assertEqual(self.call('POST', '/api/runs', {**body, 'modelEfforts': override}, csrf=True)[0], 202)
            self.assertEqual(start.call_args.args[0]['modelEfforts'], override)
        self.assertEqual(self.app.studio.config(self.project['id'])['modelEfforts'], efforts)
        self.app.providers.complete.assert_not_called()

    def test_bad_effort_setting_does_not_change_saved_budget(self):
        self.assertEqual(self.configure(96000)[0], 200)
        for efforts in ([], {'openai': 'max'}, {'claude': True}, {'other': 'high'}):
            with self.subTest(efforts=efforts):
                status, _, _ = self.call('POST', '/api/studio/action', {'action': 'context.configure',
                    'projectId': self.project['id'], 'contextBudgetTokens': 1000000, 'modelEfforts': efforts}, csrf=True)
                self.assertEqual(status, 400)
                self.assertEqual(self.app.studio.config(self.project['id'])['contextBudgetTokens'], 96000)

    def test_missing_project_context_budget_defaults_to_1m(self):
        body = {'projectId': self.project['id'], 'provider': 'openai', 'prompt': 'fixture'}
        with mock.patch.object(self.app.runs, 'start', return_value={'id': 'fixture-run'}) as start:
            self.assertEqual(self.call('POST', '/api/runs', body, csrf=True)[0], 202)
            self.assertEqual(start.call_args.args[0]['contextBudgetTokens'], 1_000_000)

    def test_reveal_uses_relative_project_path_and_no_shell(self):
        windows = self.root / "windows"
        windows.mkdir()
        (windows / "explorer.exe").write_bytes(b"fixture-not-executable")
        with mock.patch.dict("os.environ", {"SystemRoot": str(windows)}), mock.patch("app.server.subprocess.Popen") as launch:
            status, _, body = self.call("POST", "/api/studio/action", {
                "action": "file.reveal", "projectId": self.project["id"],
                "path": "output/episode_v1_final.mp4"}, csrf=True)
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body), {"opened": True, "path": "output/episode_v1_final.mp4"})
        args = launch.call_args.args[0]
        self.assertEqual(args, [str(windows / "explorer.exe"), "/select,", str(self.media)])
        self.assertFalse(launch.call_args.kwargs.get("shell", False))

    def test_reveal_rejects_outside_paths_and_other_projects(self):
        other = self.app.create_project("其他视频")
        outside = self.root / "private.txt"
        outside.write_text("private")
        for name in ("../其他视频", str(outside), str(Path(other["path"]) / "README.md"), "output/../../其他视频/README.md"):
            with self.subTest(name=name), mock.patch("app.server.subprocess.Popen") as launch:
                status, _, _ = self.call("POST", "/api/studio/action", {
                    "action": "file.reveal", "projectId": self.project["id"], "path": name}, csrf=True)
                self.assertEqual(status, 400)
                launch.assert_not_called()

    def workflow_job(self, request=None):
        workflow = self.app.workflows
        job = {"id": "context-test", "projectId": self.project["id"], "projectIds": [self.project["id"]],
               "kind": "learn", "status": "running", "request": request or {}, "createdAt": 1,
               "runIds": [], "results": [], "events": []}
        workflow.jobs[job["id"]] = job
        workflow.cancel[job["id"]] = threading.Event()
        return job

    def test_workflow_reads_each_project_budget_and_preserves_explicit_override(self):
        other = self.app.create_project("另一任务")
        self.assertEqual(self.configure(48000)[0], 200)
        self.assertEqual(self.configure(128000, other["id"])[0], 200)
        job = self.workflow_job()
        with mock.patch.object(self.app.runs, "start", return_value={"id": "fake-run"}) as start, \
             mock.patch.object(self.app.runs, "get", return_value={"id": "fake-run", "status": "completed"}):
            for pid, expected in ((self.project["id"], 48000), (other["id"], 128000)):
                self.app.workflows._run_agent(job, pid, "fixture", "检查当前镜头")
                self.assertEqual(start.call_args.args[0]["contextBudgetTokens"], expected)
            job["request"]["contextBudgetTokens"] = 256000
            self.app.workflows._run_agent(job, self.project["id"], "fixture", "检查当前镜头")
            self.assertEqual(start.call_args.args[0]["contextBudgetTokens"], 256000)
        job["status"] = "completed"
        self.app.providers.complete.assert_not_called()

    def test_workflow_start_validates_and_persists_budget(self):
        workflow = self.app.workflows
        with mock.patch("app.workflows.threading.Thread") as thread:
            for value in (0, True, "64000", 1000001):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    workflow.start({"kind": "batch-covers", "projectIds": [self.project["id"]], "contextBudgetTokens": value})
            thread.assert_not_called()
            result = workflow.start({"kind": "batch-covers", "projectIds": [self.project["id"]], "contextBudgetTokens": 128000})
            self.assertEqual(result["workflow"]["request"]["contextBudgetTokens"], 128000)
            workflow.jobs[result["workflowId"]]["status"] = "completed"


if __name__ == "__main__":
    unittest.main()
