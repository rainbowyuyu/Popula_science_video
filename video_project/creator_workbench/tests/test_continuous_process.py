"""Long local tools and enclosing workflows stay active until done or stopped."""
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from app.harness import RunManager
from app.workflows import Workflows
from tests.test_run_continuation import Library, Providers


class ContinuousProcessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.executable = self.root / "fixture-tool.exe"
        self.executable.write_bytes(b"fixture")
        self.manager = RunManager(Library(self.project), Providers([]), self.root / "state", self.root / "resources")
        self.ident = "fixture"
        (self.root / "state/runs" / self.ident).mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_local_process_is_not_killed_after_legacy_timeout(self):
        process = Mock(pid=123, returncode=0)
        process.poll.side_effect = [None, None, 0]
        clock = [0]
        def tick(_seconds):
            clock[0] += 3600
        timing = SimpleNamespace(monotonic=lambda: clock[0], sleep=tick)
        with patch("app.harness.shutil.which", return_value=str(self.executable)), \
             patch("app.harness.subprocess.Popen", return_value=process), \
             patch("app.harness.subprocess.run") as kill, patch("app.harness.time", timing):
            result = self.manager.process(self.ident, self.project,
                {"program": "node", "args": ["render.mjs"], "timeout": 5}, threading.Event())
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["elapsedSeconds"], 7200)
        kill.assert_not_called()
        process.terminate.assert_not_called()
        process.wait.assert_not_called()

    def test_user_cancel_still_terminates_long_running_process_tree(self):
        process = Mock(pid=123, returncode=0)
        process.poll.return_value = None
        cancel = threading.Event()
        timing = SimpleNamespace(monotonic=lambda: 1000, sleep=lambda _seconds: cancel.set())
        with patch("app.harness.shutil.which", return_value=str(self.executable)), \
             patch("app.harness.subprocess.Popen", return_value=process), \
             patch("app.harness.subprocess.run") as kill, patch("app.harness.time", timing):
            with self.assertRaises(InterruptedError):
                self.manager.process(self.ident, self.project, {"program": "node", "args": ["render.mjs"]}, cancel)
        self.assertTrue(kill.called or process.terminate.called)
        process.wait.assert_called_once_with(timeout=10)

    def test_workflow_waits_beyond_legacy_2600_seconds_without_stopping_agent(self):
        clock = [0]
        wait_event = Mock()
        wait_event.wait.side_effect = lambda _seconds: clock.__setitem__(0, clock[0] + 3000)
        runs = Mock()
        runs.has_active.return_value = False
        runs.summary.return_value = []
        runs.start.return_value = {"id": "long-run"}
        runs.get.side_effect = [{"status": "running"}, {"status": "running"},
                                {"id": "long-run", "status": "completed", "response": "done"}]
        studio = Mock()
        studio.context.return_value = {}
        studio.config.return_value = {}
        workflow = Workflows.__new__(Workflows)
        workflow.app = SimpleNamespace(runs=runs, studio=studio)
        workflow.lock = threading.RLock()
        workflow.cancel = {"workflow": wait_event}
        workflow._check = Mock()
        workflow._save = Mock()
        workflow.event = Mock()
        job = {"id": "workflow", "kind": "learn", "request": {}, "runIds": []}
        with patch("app.workflows.time", SimpleNamespace(monotonic=lambda: clock[0], time=lambda: clock[0])):
            result = workflow._run_agent(job, "project", "模型制作", "finish actual work")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(clock[0], 6000)
        self.assertEqual(runs.get.call_count, 3)
        runs.stop.assert_not_called()
        self.assertEqual(job["runIds"], ["long-run"])


if __name__ == "__main__":
    unittest.main()
