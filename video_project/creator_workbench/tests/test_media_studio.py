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

from app.media_studio import MediaStudio, encode_subtitles, parse_subtitles, validate_cues


class FakeLibrary:
    def __init__(self, root):
        self.root = root
    def project(self, ident):
        if ident != "p":
            raise KeyError("unknown")
        return {"id": "p", "path": str(self.root)}
    def snapshot(self, refresh=False):
        return {}


class MediaTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.video = self.base / "video_project"
        self.project = self.video / "episode"
        self.project.mkdir(parents=True)
        self.state = self.base / "state"
        self.studio = MediaStudio(self.video, self.state, FakeLibrary(self.project))

    def wait(self, job):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            value = self.studio.get_job(job["id"])
            if value["status"] not in {"queued", "running", "polling"}:
                # Allow final timestamp/persistence after a submitted cloud task.
                if value["status"] == "submitted" and not value.get("updatedAt"):
                    time.sleep(.01)
                    continue
                return value
            time.sleep(.03)
        self.fail("job timeout")


class MediaTests(MediaTestCase):
    def test_captions_roundtrip_all_formats(self):
        cues = [{"start": .2, "end": 1.25, "text": "这是一条字幕"}, {"start": 1.5, "end": 2, "text": "第二行\n继续"}]
        for ext in [".srt", ".vtt", ".json"]:
            parsed = parse_subtitles(encode_subtitles(cues, ext), ext)
            self.assertEqual(parsed[0]["start"], .2)
            self.assertEqual(parsed[1]["text"], cues[1]["text"])

    def test_captions_reject_invalid_times(self):
        for cues in [[{"start": 2, "end": 1, "text": "x"}], [{"start": 0, "end": 2, "text": "x"}, {"start": 1, "end": 3, "text": "y"}], [{"start": float("nan"), "end": 1, "text": "x"}]]:
            with self.assertRaises(ValueError):
                validate_cues(cues)

    def test_captions_save_backup_and_scope(self):
        cues = [{"start": 0, "end": 1, "text": "原稿"}]
        self.studio.save_subtitles("p", "subtitles.srt", cues)
        cues[0]["text"] = "新版"
        saved = self.studio.save_subtitles("p", "subtitles.srt", cues)
        self.assertIn("原稿", Path(saved["backup"]).read_text(encoding="utf-8"))
        self.assertEqual(self.studio.read_subtitles("p", "subtitles.srt")["cues"][0]["text"], "新版")
        with self.assertRaises(ValueError):
            self.studio.save_subtitles("p", "../escape.srt", cues)
        with self.assertRaises(ValueError):
            self.studio.save_subtitles("p", "auth.json", cues)

    def test_import_music_registers_no_copy(self):
        folder = self.base / "music"
        folder.mkdir()
        file = folder / "歌曲.mp3"
        file.write_bytes(b"fake")
        with mock.patch("app.media_studio._probe", return_value={"duration": 12, "streams": []}):
            imported = self.studio.import_folder(folder)
        self.assertFalse(imported["copied"])
        row = imported["items"][0]
        self.assertEqual(self.studio.music_path(row["id"]), file)
        self.assertEqual(row["duration"], 12)
        restarted = MediaStudio(self.video, self.state, FakeLibrary(self.project))
        self.assertEqual(restarted.music_path(row["id"]), file)

    def test_external_job_active_and_persisted(self):
        gate = threading.Event()
        def worker(job):
            gate.wait(2)
            return {"answer": 42}
        job = self.studio.submit_external("reference", "p", worker)
        self.assertTrue(self.studio.has_active())
        gate.set()
        result = self.wait(job)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["answer"], 42)
        restarted = MediaStudio(self.video, self.state, FakeLibrary(self.project))
        self.assertEqual(restarted.get_job(job["id"])["answer"], 42)

    def test_restart_marks_local_interrupted_keeps_cloud_task(self):
        local = self.studio._new("tts", "p", {})
        cloud = self.studio._new("qwen-video", "p", {})
        cloud.update(status="running", taskId="cloud-123")
        self.studio._save(cloud)
        other = MediaStudio(self.video, self.state, FakeLibrary(self.project))
        self.assertEqual(other.get_job(local["id"])["status"], "interrupted")
        self.assertEqual(other.get_job(cloud["id"])["status"], "submitted")
        self.assertTrue(other.has_active())

    def test_tts_uses_existing_voice_input_not_cloud(self):
        with mock.patch.object(self.studio, "tts_status", return_value={"status": "configured"}), mock.patch.object(self.studio, "_background", side_effect=lambda job, worker: job):
            job = self.studio.start_tts("p", "密钥怎么读", {"密钥": "密药"}, preview=True)
        self.assertEqual(job["parameters"]["pronunciations"], {"密钥": "密药"})
        self.assertEqual(job["parameters"]["speed"], 1)
        with self.assertRaises(ValueError):
            self.studio.start_tts("p", "x" * 241, preview=True)

    def test_qwen_missing_config_and_non_generation_probe(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.studio.qwen_status()["status"], "not-configured")
        with mock.patch.object(self.studio, "_qwen_key", return_value=("test", "QWEN_API_KEY")), mock.patch.object(self.studio, "_qwen_request", return_value={"data": {}}) as request:
            status = self.studio.qwen_status(probe=True)
            self.assertEqual(status["status"], "reachable")
            self.assertEqual(len(request.call_args.args), 1)
            self.assertIn("/uploads?", request.call_args.args[0])

    def test_qwen_submit_only_once_and_persist_id(self):
        with mock.patch.object(self.studio, "_qwen_key", return_value=("test", "QWEN_API_KEY")), mock.patch.object(self.studio, "_qwen_request", return_value={"output": {"task_id": "task-test", "task_status": "PENDING"}}) as api:
            result = self.wait(self.studio.start_video("p", "清澈水滴的微距运镜"))
            self.assertEqual(result["status"], "submitted")
            self.assertEqual(result["taskId"], "task-test")
            self.assertEqual(api.call_count, 1)
            self.assertIn("No readable text", api.call_args.args[1]["input"]["prompt"])
        serialized = (self.studio.root / "jobs" / result["id"] / "job.json").read_text(encoding="utf-8")
        self.assertNotIn("Bearer", serialized)

    def test_qwen_explicit_credential_source_no_fallback(self):
        with mock.patch.dict(os.environ, {"QWEN_API_KEY_PRIMARY": "primary-test", "QWEN_API_KEY_BACKUP": "backup-test"}, clear=True):
            self.assertEqual(self.studio._qwen_key()[1], "QWEN_API_KEY_PRIMARY")
            self.assertEqual(self.studio._qwen_key("QWEN_API_KEY_BACKUP")[1], "QWEN_API_KEY_BACKUP")
            with self.assertRaises(RuntimeError):
                self.studio._qwen_key("DASHSCOPE_API_KEY")
            with self.assertRaises(ValueError):
                self.studio._qwen_key("OTHER_SECRET")
            status = self.studio.qwen_status(credential_source="QWEN_API_KEY_BACKUP")
            self.assertEqual(status["credentialSource"], "QWEN_API_KEY_BACKUP")
            self.assertNotIn("backup-test", json.dumps(status))

    def test_qwen_poll_locks_original_credential_source(self):
        with mock.patch.dict(os.environ, {"QWEN_API_KEY_PRIMARY": "primary-test", "QWEN_API_KEY_BACKUP": "backup-test"}, clear=True), mock.patch.object(self.studio, "_qwen_request", return_value={"output": {"task_id": "locked-task", "task_status": "PENDING"}}) as api:
            result = self.wait(self.studio.start_video("p", "水滴", credential_source="QWEN_API_KEY_BACKUP"))
            self.assertEqual(api.call_args.kwargs["credential_source"], "QWEN_API_KEY_BACKUP")
            self.assertEqual(result["parameters"]["credentialSource"], "QWEN_API_KEY_BACKUP")
        restarted = MediaStudio(self.video, self.state, FakeLibrary(self.project))
        with mock.patch.object(restarted, "_qwen_request", return_value={"output": {"task_status": "RUNNING"}}) as api:
            restarted.poll_video(result["id"])
            until = time.monotonic() + 2
            while restarted.get_job(result["id"])["status"] == "polling" and time.monotonic() < until:
                time.sleep(.01)
            self.assertEqual(api.call_args.kwargs["credential_source"], "QWEN_API_KEY_BACKUP")

    def cloud_job(self):
        job = self.studio._new("qwen-video", "p", {"credentialSource": "QWEN_API_KEY_BACKUP"})
        job.update(status="submitted", taskId="persisted-task")
        self.studio._save(job)
        return job

    def test_poll_keeps_polling_until_download_finishes(self):
        job = self.cloud_job()
        downloading, release = threading.Event(), threading.Event()
        def download(*args):
            downloading.set()
            release.wait(2)
            return {"output": {"path": "fixture.mp4"}}
        with mock.patch.object(self.studio, "_qwen_request", return_value={"output": {"task_status": "SUCCEEDED", "video_url": "https://example.aliyuncs.com/test.mp4"}}), mock.patch.object(self.studio, "_download_video", side_effect=download):
            self.studio.poll_video(job["id"])
            self.assertTrue(downloading.wait(1))
            self.assertEqual(self.studio.get_job(job["id"])["status"], "polling")
            release.set()
            self.studio._poll_workers[job["id"]].join(2)
        current = self.studio.get_job(job["id"])
        saved = json.loads((self.studio.root / "jobs" / job["id"] / "job.json").read_text(encoding="utf-8"))
        self.assertEqual(current["status"], "completed")
        self.assertEqual(current, saved)

    def test_poll_final_status_not_visible_before_save(self):
        job = self.cloud_job()
        entered, release, observed = threading.Event(), threading.Event(), threading.Event()
        original_save = self.studio._save
        def blocking_save(value):
            if value["status"] == "submitted":
                entered.set()
                release.wait(2)
            original_save(value)
        with mock.patch.object(self.studio, "_qwen_request", return_value={"output": {"task_status": "RUNNING"}}), mock.patch.object(self.studio, "_save", side_effect=blocking_save):
            # poll_video returns a snapshot and may wait for the final-save lock.
            caller = threading.Thread(target=lambda: (self.studio.poll_video(job["id"]), observed.set()))
            caller.start()
            self.assertTrue(entered.wait(1))
            reader_done = threading.Event()
            reader = threading.Thread(target=lambda: (self.studio.get_job(job["id"]), reader_done.set()))
            reader.start()
            self.assertFalse(reader_done.wait(.05))
            release.set()
            caller.join(2)
            reader.join(2)
            self.studio._poll_workers[job["id"]].join(2)
        self.assertTrue(reader_done.is_set())

    def test_cancelled_poll_stays_detached_after_success_or_error(self):
        for failed in (False, True):
            with self.subTest(failed=failed):
                job = self.cloud_job()
                requested, release = threading.Event(), threading.Event()
                def api(*args, **kwargs):
                    requested.set()
                    release.wait(2)
                    if failed:
                        raise RuntimeError("network error")
                    return {"output": {"task_status": "RUNNING"}}
                with mock.patch.object(self.studio, "_qwen_request", side_effect=api):
                    self.studio.poll_video(job["id"])
                    self.assertTrue(requested.wait(1))
                    cancelled = self.studio.cancel_job(job["id"])
                    self.assertEqual(cancelled["status"], "detached")
                    release.set()
                    self.studio._poll_workers[job["id"]].join(2)
                self.assertEqual(self.studio.get_job(job["id"]), cancelled)

    def test_qwen_uncertain_submission_not_retried(self):
        with mock.patch.object(self.studio, "_qwen_key", return_value=("test", "QWEN_API_KEY")), mock.patch.object(self.studio, "_qwen_request", side_effect=RuntimeError("timeout")) as api:
            result = self.wait(self.studio.start_video("p", "清澈水滴"))
        self.assertEqual(result["status"], "submission_unknown")
        self.assertEqual(api.call_count, 1)
        with self.assertRaises(ValueError):
            self.studio.poll_video(result["id"])

    def test_qwen_rejects_wrong_model_and_duration(self):
        with mock.patch.object(self.studio, "_qwen_key", return_value=("test", "QWEN_API_KEY")):
            with self.assertRaises(ValueError):
                self.studio.start_video("p", "test", model="other")
            with self.assertRaises(ValueError):
                self.studio.start_video("p", "test", duration=30)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg needed")
class RealFFmpegTests(MediaTestCase):
    def make_clip(self, path, duration, color, audio=False, size="320x180", fps=24):
        args = [shutil.which("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i", f"color={color}:s={size}:r={fps}:d={duration}"]
        if audio:
            args += ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=48000:duration={duration}"]
        args += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
        if audio:
            args += ["-c:a", "aac"]
        args += ["-t", str(duration), str(path)]
        subprocess.run(args, check=True, capture_output=True)

    def test_real_replace_preserves_frames_audio_and_sources(self):
        source, replacement = self.project / "source.mp4", self.project / "replacement.mp4"
        self.make_clip(source, 4, "red", True)
        self.make_clip(replacement, 3, "blue", False, "160x160", 30)
        before = source.read_bytes()
        result = self.wait(self.studio.start_replace("p", "source.mp4", "replacement.mp4", 1, 3, .25))
        self.assertEqual(result["status"], "completed", result.get("message"))
        self.assertLessEqual(abs(result["replacePlan"]["durationErrorSec"]), 1 / 24)
        self.assertEqual(source.read_bytes(), before)
        self.assertTrue(result["replacePlan"]["sourceAudioPreserved"])
        self.assertTrue(Path(result["output"]["path"]).is_file())

    def test_real_mix_silent_source_and_short_loop(self):
        source = self.project / "silent.mp4"
        self.make_clip(source, 5, "green")
        music_dir = self.base / "music"
        music_dir.mkdir()
        music = music_dir / "short.wav"
        subprocess.run([shutil.which("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=2", str(music)], check=True, capture_output=True)
        imported = self.studio.import_folder(music_dir)
        result = self.wait(self.studio.start_mix("p", "silent.mp4", imported["items"][0]["id"], preview=True))
        self.assertEqual(result["status"], "completed", result.get("message"))
        self.assertIn("无音轨", result["audioNote"])
        self.assertAlmostEqual(result["output"]["duration"], 5, places=1)

    def test_real_mix_ducks_existing_audio(self):
        source = self.project / "source.mp4"
        self.make_clip(source, 3, "yellow", True)
        music_dir = self.base / "music"
        music_dir.mkdir()
        music = music_dir / "tone.wav"
        subprocess.run([shutil.which("ffmpeg"), "-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=4", str(music)], check=True, capture_output=True)
        imported = self.studio.import_folder(music_dir)
        result = self.wait(self.studio.start_mix("p", "source.mp4", imported["items"][0]["id"]))
        self.assertEqual(result["status"], "completed", result.get("message"))
        self.assertAlmostEqual(result["output"]["duration"], 3, places=1)

    def test_replace_short_clip_rejected_before_job(self):
        source, replacement = self.project / "source.mp4", self.project / "short.mp4"
        self.make_clip(source, 4, "red")
        self.make_clip(replacement, 1, "blue")
        with self.assertRaisesRegex(ValueError, "至少"):
            self.studio.start_replace("p", "source.mp4", "short.mp4", 1, 3)

    def test_real_replace_at_start_end_full_and_hard_cut(self):
        source, replacement = self.project / "source.mp4", self.project / "replacement.mp4"
        self.make_clip(source, 4, "red", True)
        self.make_clip(replacement, 5, "blue")
        for start, end, transition in [(0, 2, .25), (2, 4, .25), (0, 4, .25), (1, 3, 0)]:
            with self.subTest(start=start, end=end, transition=transition):
                result = self.wait(self.studio.start_replace("p", "source.mp4", "replacement.mp4", start, end, transition))
                self.assertEqual(result["status"], "completed", result.get("message"))
                self.assertLessEqual(abs(result["replacePlan"]["durationErrorSec"]), 1 / 24)


if __name__ == "__main__":
    unittest.main()
