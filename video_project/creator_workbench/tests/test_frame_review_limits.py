"""Frame review continues across prior quotas while preserving inspection evidence."""
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.harness import RunManager
from tests.test_run_continuation import Library, Providers


class FrameReviewLimitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        (self.project / "scene.png").write_bytes(b"fixture input")
        self.library = Library(self.project)
        self.manager = RunManager(self.library, Providers([]), self.root / "state", self.root / "resources")
        with patch("app.harness.threading.Thread"):
            self.ident = self.manager.start({"projectId": "project", "prompt": "检查多个阶段的帧", "provider": "dual"})["id"]
        self.row = self.manager.runs[self.ident]
        self.calls = []
        def extract(cmd, **_kwargs):
            out = Path(cmd[-1])
            out.write_bytes(b"\xff\xd8\xff-fixture")
            self.calls.append(out.name)
            return SimpleNamespace(returncode=0, stderr=b"")
        self.which = patch("app.harness.shutil.which", return_value="fixture-ffmpeg")
        self.process = patch("app.harness.subprocess.run", side_effect=extract)
        self.which.start()
        self.process.start()

    def tearDown(self):
        self.process.stop()
        self.which.stop()
        self.tmp.cleanup()

    def inspect(self, phase):
        self.row["phase"] = phase
        return self.manager.tool(self.ident, self.library.project("project"), "inspect_frame",
                                 {"path": "scene.png"}, threading.Event())

    def test_same_phase_can_inspect_beyond_six_without_overwriting_images(self):
        for _ in range(9):
            self.assertTrue(self.inspect("model")["imageAttached"])
        self.assertTrue(self.inspect("motion")["imageAttached"])
        self.assertEqual(self.row["inspectedFrames"], 10)
        self.assertEqual(self.calls, [f"inspected-{i}.jpg" for i in range(1, 11)])

    def test_old_success_events_do_not_reinstate_old_phase_quota(self):
        self.row["inspectedFrames"] = 6
        self.row["events"] = [{"type": "tool_result", "tool": "inspect_frame", "phase": "model",
                               "message": json.dumps({"path": "scene.png", "imageAttached": True})} for _ in range(6)]
        self.assertTrue(self.inspect("model")["imageAttached"])
        self.assertTrue(self.inspect("motion")["imageAttached"])
        self.assertEqual(self.calls, ["inspected-7.jpg", "inspected-8.jpg"])
        self.assertEqual(self.row["inspectedFrames"], 8)

    def test_single_execution_can_inspect_more_than_twenty_four_frames(self):
        self.row["_inspectionSessionStart"] = 0
        for phase in ("plan", "model", "motion", "integrate"):
            for _ in range(7):
                self.inspect(phase)
        self.assertEqual(self.row["inspectedFrames"], 28)
        self.assertEqual(len(self.calls), 28)
        self.assertEqual(len(set(self.calls)), 28)



if __name__ == "__main__":
    unittest.main()
