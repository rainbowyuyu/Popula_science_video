"""Local media jobs: user voice, music mixing, captions and optional Wan API.

Only the TTS child imports the user's existing audio stack; server code is stdlib.
"""
from __future__ import annotations

import array
import copy
from contextlib import contextmanager
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import threading
import time
from urllib import error, parse, request
import uuid

from .library import _link, _plain_path

from .local_paths import TTS_ROOT, MUSIC_ROOT
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
ACTIVE = {"queued", "running", "submitted", "polling"}
WAN_BASE = "https://dashscope.aliyuncs.com/api/v1"
QWEN_CREDENTIAL_SOURCES = ("QWEN_API_KEY_PRIMARY", "QWEN_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY_BACKUP")
SECRET_NAME = re.compile(r"(^\.env($|\.)|(?:api[-_]?keys?|credentials?|secrets?|auth)\.(?:json|toml|ya?ml)$|id_(?:rsa|ed25519)|\.pem$)", re.I)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _redact(value):
    value = str(value)
    value = re.sub(r"\bsk-[A-Za-z0-9_.-]{8,}", "[REDACTED]", value)
    return re.sub(r"(?i)(bearer\s+)[^\s\"']+", r"\1[REDACTED]", value)


def _number(value, minimum, maximum, name):
    result = float(value)
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ValueError(f"{name} 应在 {minimum}–{maximum} 之间")
    return result


def _write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _probe(path):
    binary = shutil.which("ffprobe")
    if not binary:
        raise RuntimeError("未找到 FFprobe，请检查已有 FFmpeg 安装")
    result = subprocess.run([binary, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)], capture_output=True, timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode:
        raise ValueError("媒体无法解码或格式不支持")
    data = json.loads(result.stdout)
    duration = float(data.get("format", {}).get("duration", 0))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("媒体时长不可用")
    return {"duration": duration, "streams": data.get("streams", [])}


def _caption_time(value):
    if isinstance(value, (int, float)):
        return float(value)
    match = re.fullmatch(r"(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})", str(value).strip())
    if not match:
        raise ValueError("字幕时间应使用 HH:MM:SS,mmm 或 HH:MM:SS.mmm")
    hours, minutes, seconds, millis = match.groups()
    if int(minutes) >= 60 or int(seconds) >= 60:
        raise ValueError("字幕分秒必须小于60")
    return int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def validate_cues(cues):
    if not isinstance(cues, list) or len(cues) > 10000:
        raise ValueError("字幕应为最多10000条的列表")
    result, previous = [], 0.0
    for index, cue in enumerate(cues):
        if not isinstance(cue, dict):
            raise ValueError("字幕条目格式无效")
        start = _number(_caption_time(cue.get("start", cue.get("startSec", -1))), 0, 86400, "开始时间")
        end = _number(_caption_time(cue.get("end", cue.get("endSec", -1))), 0, 86400, "结束时间")
        text = str(cue.get("text", "")).strip()
        if end <= start or start < previous - .001:
            raise ValueError(f"第{index + 1}条字幕时间倒置或与前一条重叠")
        if not text or len(text) > 2000 or "\x00" in text or "-->" in text:
            raise ValueError(f"第{index + 1}条字幕文字无效")
        result.append({"id": str(cue.get("id", index + 1)), "start": round(start, 3), "end": round(end, 3), "text": text})
        previous = end
    return result


def parse_subtitles(content, suffix):
    if suffix == ".json":
        data = json.loads(content)
        if isinstance(data, dict):
            data = data.get("cues", data.get("captions", data.get("items")))
        return validate_cues(data)
    content = content.lstrip("\ufeff").replace("\r\n", "\n")
    if suffix == ".vtt":
        content = re.sub(r"^WEBVTT[^\n]*\n", "", content)
    cues = []
    for block in re.split(r"\n\s*\n", content.strip()):
        if not block.strip() or block.startswith(("NOTE", "STYLE", "REGION")):
            continue
        lines = block.splitlines()
        timing = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if timing is None:
            raise ValueError("字幕块缺少时间范围")
        sides = lines[timing].split("-->", 1)
        cues.append({"start": _caption_time(sides[0].strip()), "end": _caption_time(sides[1].strip().split()[0]), "text": "\n".join(lines[timing + 1:])})
    return validate_cues(cues)


def _clock(seconds, dot=False):
    ms = round(seconds * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}{'.' if dot else ','}{ms % 1000:03d}"


def encode_subtitles(cues, suffix):
    cues = validate_cues(cues)
    if suffix == ".json":
        return json.dumps({"cues": cues}, ensure_ascii=False, indent=2) + "\n"
    blocks = [f"{i + 1}\n{_clock(c['start'], suffix == '.vtt')} --> {_clock(c['end'], suffix == '.vtt')}\n{c['text']}" for i, c in enumerate(cues)]
    return ("WEBVTT\n\n" if suffix == ".vtt" else "") + "\n\n".join(blocks) + "\n"


class MediaStudio:
    def __init__(self, video_root, state_root, library, coordinator=None):
        self.video_root, self.state_root = Path(video_root).resolve(), Path(state_root).resolve()
        self.library = library
        self.root = self.state_root / "media-studio"
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.coordinator = coordinator
        self.project_locks = {}
        self.jobs, self.music, self.cancel = {}, {}, {}
        self._poll_workers = {}
        registry = self.root / "music.json"
        if registry.is_file():
            try:
                self.music = {m["id"]: m for m in json.loads(registry.read_text(encoding="utf-8"))}
            except (OSError, ValueError, KeyError):
                pass
        for path in sorted(self.root.glob("jobs/*/job.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:200]:
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
                if job.get("status") in {"queued", "running", "polling"}:
                    job["status"] = "submitted" if job.get("taskId") else "submission_unknown" if job.get("submissionStarted") else "interrupted"
                    job["message"] = "工作台重启，已有输出保留；云端任务可继续查询，未重新计费提交。"
                    _write_json(path, job)
                self.jobs[job["id"]] = job
            except (OSError, ValueError, KeyError):
                continue

    def _save(self, job):
        _write_json(self.root / "jobs" / job["id"] / "job.json", job)

    def _event(self, job, message):
        with self.lock:
            job.setdefault("events", []).append({"at": _now(), "message": _redact(message)[:5000]})
            job["message"] = _redact(message)[:2000]
            self._save(job)

    def _new(self, kind, project_id, parameters):
        project = self.library.project(project_id)
        job = {"id": uuid.uuid4().hex, "kind": kind, "projectId": project_id, "projectPath": project["path"], "parameters": parameters, "createdAt": _now(), "status": "queued", "events": []}
        with self.lock:
            self.jobs[job["id"]] = job
            self.cancel[job["id"]] = threading.Event()
            self._save(job)
        return job

    def _background(self, job, action):
        def run():
            try:
                with self._project_operation(job):
                    if self.cancel[job["id"]].is_set():
                        raise InterruptedError("任务已停止")
                    with self.lock:
                        job["status"] = "running"
                        self._save(job)
                    completion_status = action(job)
                    with self.lock:
                        if self.cancel[job["id"]].is_set():
                            job["status"] = "detached" if job.get("taskId") else "cancelled"
                        elif job["status"] == "running":
                            job["status"] = completion_status if completion_status == "submitted" else "completed"
                        job["updatedAt"] = _now()
                        self._save(job)
            except Exception as exc:
                with self.lock:
                    job["status"] = "detached" if job.get("taskId") and self.cancel[job["id"]].is_set() else "cancelled" if isinstance(exc, InterruptedError) else "failed"
                    # Uncertain paid submission is preserved and never retried.
                    if job.get("submissionStarted") and not job.get("taskId"):
                        job["status"] = "submission_unknown"
                    self._event(job, f"{type(exc).__name__}: {_redact(exc)}")
        threading.Thread(target=run, name="media-" + job["id"][:8], daemon=True).start()
        return self.get_job(job["id"])

    @contextmanager
    def _project_operation(self, job):
        cancel = self.cancel[job['id']]
        if self.coordinator is not None:
            with self.coordinator.project_operation(job['projectId'], cancel,
                    lambda:self._event(job, '等待当前工程的文件操作，其他工程可同时处理。')):
                yield
            return
        with self.lock:
            lock = self.project_locks.setdefault(job['projectId'], threading.RLock())
        while not lock.acquire(timeout=.1):
            if cancel.is_set():raise InterruptedError('排队任务已停止')
        try:
            if cancel.is_set():raise InterruptedError('任务已停止')
            yield
        finally:lock.release()

    def has_active(self, project_id=None):
        with self.lock:
            return any(j["status"] in ACTIVE and (project_id is None or j['projectId'] == project_id) for j in self.jobs.values())

    def submit_external(self, kind, project_id, worker, parameters=None):
        """Use the same persisted queue for trusted server-owned job workers.

        worker(job) receives the mutable job with id/projectPath/parameters and
        may return a JSON-serializable dict to merge into its result. This never
        accepts code or callbacks from HTTP request data.
        """
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,48}", kind):
            raise ValueError("任务类型无效")
        job = self._new(kind, project_id, parameters or {})
        def action(current):
            result = worker(current)
            if result is not None:
                if not isinstance(result, dict):
                    raise ValueError("外部任务结果必须是对象")
                protected = {"id", "projectId", "projectPath", "createdAt", "kind"}
                with self.lock:
                    current.update({k: v for k, v in result.items() if k not in protected})
                    self._save(current)
        return self._background(job, action)

    def cancelled(self, job_id):
        event = self.cancel.get(job_id)
        return bool(event and event.is_set())

    def job_event(self, job_id, message):
        with self.lock:
            if job_id not in self.jobs:
                raise KeyError("媒体任务不存在")
            self._event(self.jobs[job_id], message)

    def list_jobs(self):
        with self.lock:
            return copy.deepcopy(sorted(self.jobs.values(), key=lambda j: j["createdAt"], reverse=True)[:100])

    def get_job(self, job_id):
        with self.lock:
            if job_id not in self.jobs:
                raise KeyError("媒体任务不存在")
            return copy.deepcopy(self.jobs[job_id])

    def cancel_job(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise KeyError("媒体任务不存在")
            if job.get("taskId"):
                self.cancel.setdefault(job_id, threading.Event()).set()
                job["status"] = "detached"
                self._event(job, "已停止本地等待；云端任务可能继续运行和计费，可使用原任务ID继续查询。")
            elif job["status"] in ACTIVE:
                self.cancel[job_id].set()
            return copy.deepcopy(job)

    def _project_path(self, project_id, name, suffixes=None):
        root = Path(self.library.project(project_id)["path"])
        raw = Path(str(name))
        if not name or raw.is_absolute() or raw.drive or ".." in raw.parts:
            raise ValueError("请使用当前工程内的相对路径")
        if any(p.casefold() in {".git", "node_modules", ".env", "credentials", "secrets"} or SECRET_NAME.search(p) for p in raw.parts):
            raise ValueError("不可访问此工程路径")
        target = root / raw
        # Existing ancestors may not be junctions; a new destination is allowed.
        ancestor = target
        while not ancestor.exists() and ancestor != root:
            ancestor = ancestor.parent
        if not _plain_path(ancestor, root) or not target.resolve().is_relative_to(root.resolve()):
            raise ValueError("路径越界或包含目录链接")
        if suffixes and target.suffix.casefold() not in suffixes:
            raise ValueError("文件格式不支持")
        return target

    def _destination(self, job, stem, extension):
        stem = re.sub(r"[^\w\-\u4e00-\u9fff ]", "_", str(stem))[:70].strip() or job["kind"]
        relative = f"output/media-studio/{stem}-{job['id'][:10]}{extension}"
        path = self._project_path(job["projectId"], relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            raise FileExistsError("输出已存在，不覆盖")
        return path

    def _output(self, job, path):
        probe = _probe(path)
        job["output"] = {"path": str(path), "relativePath": path.relative_to(Path(job["projectPath"])).as_posix(), "duration": probe["duration"], "size": path.stat().st_size, "sha256": _sha(path)}
        self.library.snapshot(refresh=True)
        self._event(job, "输出已保存，可刷新右侧素材试听/预览。")

    def _run(self, job, argv, timeout=900):
        log = self.root / "jobs" / job["id"] / f"process-{uuid.uuid4().hex[:8]}.log"
        env = os.environ.copy()
        for key in list(env):
            if any(t in key.upper() for t in ("API_KEY", "AUTH_TOKEN", "SECRET", "BEARER")):
                env.pop(key, None)
        started = time.monotonic()
        with log.open("wb") as stream:
            process = subprocess.Popen([str(a) for a in argv], stdout=stream, stderr=subprocess.STDOUT, cwd=job["projectPath"], env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            while process.poll() is None:
                if self.cancel[job["id"]].is_set() or time.monotonic() - started > timeout:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    else:
                        process.terminate()
                    process.wait(timeout=10)
                    raise InterruptedError("媒体任务停止或超过运行时间，源素材保留")
                time.sleep(.15)
        text = _redact(log.read_text(encoding="utf-8", errors="replace"))
        log.write_text(text, encoding="utf-8")
        if process.returncode:
            raise RuntimeError(f"工具退出码 {process.returncode}：{text[-2500:]}")
        return text

    def import_folder(self, path):
        root = Path(path).expanduser().absolute()
        if not root.is_dir() or _link(root):
            raise ValueError("音乐目录不存在或为目录链接")
        added, errors, examined = [], 0, 0
        for directory, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and not _link(Path(directory) / d))
            if len(Path(directory).relative_to(root).parts) >= 3:
                dirs[:] = []
            for name in sorted(files):
                source = Path(directory) / name
                if source.suffix.casefold() not in AUDIO_EXTS or not _plain_path(source, root):
                    continue
                examined += 1
                if examined > 500:
                    break
                ident = "music_" + hashlib.sha256(str(source).casefold().encode()).hexdigest()[:24]
                st = source.stat()
                old = self.music.get(ident)
                try:
                    duration = old["duration"] if old and old.get("modified") == st.st_mtime and old.get("size") == st.st_size else _probe(source)["duration"]
                    row = {"id": ident, "name": source.name, "path": str(source), "root": str(root), "duration": duration, "size": st.st_size, "modified": st.st_mtime, "kind": "audio", "source": "user-local"}
                    with self.lock:
                        self.music[ident] = row
                    added.append(row)
                except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
                    errors += 1
            if examined > 500:
                break
        with self.lock:
            _write_json(self.root / "music.json", list(self.music.values()))
        return {"items": added, "errors": errors, "truncated": examined > 500, "copied": False}

    def music_path(self, music_id):
        with self.lock:
            row = self.music.get(music_id)
        if not row or not _plain_path(Path(row["path"]), Path(row["root"])) or Path(row["path"]).suffix.casefold() not in AUDIO_EXTS:
            raise KeyError("音乐不存在或路径已改变")
        return Path(row["path"])

    def read_subtitles(self, project_id, path):
        file = self._project_path(project_id, path, {".srt", ".vtt", ".json"})
        if file.stat().st_size > 3_000_000:
            raise ValueError("字幕文件过大")
        return {"path": str(path), "format": file.suffix[1:], "cues": parse_subtitles(file.read_text(encoding="utf-8-sig"), file.suffix.casefold())}

    def save_subtitles(self, project_id, path, cues):
        file = self._project_path(project_id, path, {".srt", ".vtt", ".json"})
        content = encode_subtitles(cues, file.suffix.casefold())
        backup = None
        if file.exists():
            backup = self.root / "subtitle-backups" / uuid.uuid4().hex / file.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, backup)
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding="utf-8")
        return {"path": str(path), "count": len(cues), "backup": str(backup) if backup else None, "sha256": _sha(file)}

    def tts_status(self):
        needed = [".venv/Scripts/python.exe", "models/Qwen3-TTS-0.6B/config.json", "work/clone-reference.wav", "work/clone-reference.json", "broadcast_voice.py", "RAINBOW_AUDIO_WORKFLOW.md", "BROADCAST_NARRATION.md"]
        missing = [p for p in needed if not (TTS_ROOT / p).is_file()]
        return {"status": "configured" if not missing else "unavailable", "voice": "rainbow鱼个人音色", "model": "Qwen3-TTS-0.6B", "missing": missing, "gpu": "在任务启动时实际检查 CUDA；不自动切换云端或通用音色", "defaultSpeed": 1}

    def start_tts(self, project_id, text, pronunciations=None, speed=1, preview=False):
        text = str(text).strip()
        if not text or len(text) > (240 if preview else 5000):
            raise ValueError("试听文案最多240字，完整配音最多5000字")
        speed = _number(speed, .8, 1.2, "语速")
        replacements = pronunciations or {}
        if not isinstance(replacements, dict) or len(replacements) > 80 or any(not isinstance(k, str) or not isinstance(v, str) or not k or len(k) > 100 or len(v) > 100 for k, v in replacements.items()):
            raise ValueError("读音替换应为标准词到朗读词的映射")
        if self.tts_status()["status"] != "configured":
            raise RuntimeError("本机用户 TTS 资源不完整；未使用替代音色")
        job = self._new("tts", project_id, {"text": text, "pronunciations": replacements, "speed": speed, "preview": bool(preview)})
        return self._background(job, self._tts)

    def _tts(self, job):
        # Re-read documented workflow for every invocation, without modifying it.
        docs = {name: _sha(TTS_ROOT / name) for name in ("RAINBOW_AUDIO_WORKFLOW.md", "BROADCAST_NARRATION.md")}
        path = self._destination(job, "个人配音试听" if job["parameters"]["preview"] else "个人配音", ".wav")
        jobdir = self.root / "jobs" / job["id"]
        spec = {**job["parameters"], "output": str(path), "ttsRoot": str(TTS_ROOT), "jobDir": str(jobdir), "docs": docs}
        _write_json(jobdir / "tts-input.json", spec)
        worker = jobdir / "tts_worker.py"
        worker.write_text(TTS_WORKER, encoding="utf-8")
        self._event(job, "使用本机 Qwen3 与既有个人参考音色；开始加载模型。")
        self._run(job, [TTS_ROOT / ".venv/Scripts/python.exe", worker, jobdir / "tts-input.json"], timeout=3600)
        report = json.loads((jobdir / "tts-report.json").read_text(encoding="utf-8"))
        job["voiceReport"] = report
        self._output(job, path)

    def start_mix(self, project_id, source_path, music_id, output_name=None, gain_db=-20, duck=True, loop=True, start_sec=0, end_sec=None, preview=False):
        source = self._project_path(project_id, source_path, {".mp4", ".mov", ".webm", ".m4v", ".wav", ".mp3", ".m4a", ".flac"})
        music = self.music_path(music_id)
        info = _probe(source)
        start = _number(start_sec, 0, info["duration"], "起点")
        end = info["duration"] if end_sec is None else _number(end_sec, 0, info["duration"], "终点")
        if end - start < .25:
            raise ValueError("混音区间至少0.25秒")
        if preview:
            end = min(end, start + 10)
        params = {"sourcePath": str(source), "musicId": music_id, "musicPath": str(music), "outputName": output_name or ("混音试听" if preview else "新版混音"), "gainDb": _number(gain_db, -50, 6, "音乐音量"), "duck": bool(duck), "loop": bool(loop), "startSec": start, "endSec": end, "preview": bool(preview), "sourceInfo": info}
        job = self._new("mix", project_id, params)
        return self._background(job, self._mix)

    def start_replace(self, project_id, source_path, replacement_path, start_sec, end_sec, transition_sec=.25, preview=False):
        suffixes = {".mp4", ".mov", ".webm", ".m4v"}
        source = self._project_path(project_id, source_path, suffixes)
        replacement = self._project_path(project_id, replacement_path, suffixes)
        info, rep_info = _probe(source), _probe(replacement)
        video = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
        rep = next((s for s in rep_info["streams"] if s.get("codec_type") == "video"), None)
        if not video or not rep:
            raise ValueError("源片与替换素材都必须有视频轨")
        rate = Fraction(video.get("avg_frame_rate") or video.get("r_frame_rate") or "30")
        if rate <= 0 or rate > 240:
            raise ValueError("源视频帧率不可用")
        fps = float(rate)
        duration = int(video["nb_frames"]) / fps if str(video.get("nb_frames", "")).isdigit() else float(video.get("duration") or info["duration"])
        # Snap edit boundaries to original frames; never accumulate subframe cuts.
        start = round(_number(start_sec, 0, duration, "替换起点") * fps) / fps
        end = min(duration, round(_number(end_sec, 0, duration, "替换终点") * fps) / fps)
        if end - start < 1 / fps:
            raise ValueError("替换范围至少一帧")
        transition = _number(transition_sec, 0, .5, "转场时长")
        incoming = min(transition, start * 2, (end - start) / 2) if start > 0 else 0
        outgoing = min(transition, (duration - end) * 2, (end - start) / 2) if end < duration - .5 / fps else 0
        incoming = math.floor(incoming * fps) / fps
        outgoing = math.floor(outgoing * fps) / fps
        needed = end - start + incoming / 2 + outgoing / 2
        if rep_info["duration"] + .25 / fps < needed:
            raise ValueError(f"替换素材需要至少 {needed:.3f} 秒（含转场余量），当前 {rep_info['duration']:.3f} 秒；未冻结或变速")
        params = {"sourcePath": str(source), "replacementPath": str(replacement), "startSec": start, "endSec": end, "transitionSec": transition, "incoming": incoming, "outgoing": outgoing, "needed": needed, "duration": duration, "fps": str(rate), "width": int(video["width"]), "height": int(video["height"]), "hasAudio": any(s.get("codec_type") == "audio" for s in info["streams"]), "preview": bool(preview)}
        job = self._new("replace", project_id, params)
        return self._background(job, self._replace)

    def _replace(self, job):
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("未找到FFmpeg")
        p = job["parameters"]
        start, end, duration, t1, t2 = (p[k] for k in ("startSec", "endSec", "duration", "incoming", "outgoing"))
        filters = []
        common = f"fps={p['fps']},scale={p['width']}:{p['height']}:force_original_aspect_ratio=decrease,pad={p['width']}:{p['height']}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,settb=AVTB"
        use_before = start > 0
        use_after = end < duration - .5 / float(Fraction(p["fps"]))
        source_parts = int(use_before) + int(use_after)
        if source_parts == 2:
            filters.append("[0:v:0]split=2[beforeSource][afterSource]")
        elif source_parts == 1:
            filters.append(f"[0:v:0]null[{'beforeSource' if use_before else 'afterSource'}]")
        filters.append(f"[1:v:0]trim=duration={p['needed']:.9f},setpts=PTS-STARTPTS,{common}[replace]")
        tail = "replace"
        if use_before:
            filters.append(f"[beforeSource]trim=end={start+t1/2:.9f},setpts=PTS-STARTPTS,{common}[before]")
            filters.append(f"[before][replace]xfade=transition=fade:duration={t1:.9f}:offset={start-t1/2:.9f}[joined]" if t1 else "[before][replace]concat=n=2:v=1:a=0[joined]")
            tail = "joined"
        if use_after:
            filters.append(f"[afterSource]trim=start={end-t2/2:.9f},setpts=PTS-STARTPTS,{common}[after]")
            filters.append(f"[{tail}][after]xfade=transition=fade:duration={t2:.9f}:offset={end-t2/2:.9f}[whole]" if t2 else f"[{tail}][after]concat=n=2:v=1:a=0[whole]")
            tail = "whole"
        preview_start = max(0, start - 2) if p["preview"] else 0
        preview_length = min(10, duration - preview_start) if p["preview"] else duration
        filters.append(f"[{tail}]trim=start={preview_start:.9f}:duration={preview_length:.9f},setpts=PTS-STARTPTS,fps={p['fps']}[outv]")
        if p["hasAudio"]:
            filters.append(f"[0:a:0]atrim=start={preview_start:.9f}:duration={preview_length:.9f},asetpts=PTS-STARTPTS,apad,atrim=duration={preview_length:.9f}[outa]")
        dest = self._destination(job, "局部替换试听" if p["preview"] else "局部替换新版", ".mp4")
        argv = [ffmpeg, "-hide_banner", "-v", "warning", "-n", "-i", p["sourcePath"], "-i", p["replacementPath"], "-filter_complex", ";".join(filters), "-map", "[outv]"]
        if p["hasAudio"]:
            argv += ["-map", "[outa]", "-c:a", "aac", "-b:a", "256k"]
        argv += ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", p["fps"], "-t", str(preview_length), "-movflags", "+faststart", str(dest)]
        job["replacePlan"] = {"originalDuration": duration, "expectedDuration": preview_length, "fps": p["fps"], "resolution": [p["width"], p["height"]], "sourceAudioPreserved": p["hasAudio"], "replacementAudioUsed": False, "replacementTimeStretch": False, "fitMode": "contain-with-letterbox", "previewOffset": preview_start}
        self._event(job, f"替换 {start:.3f}–{end:.3f} 秒；保留源音轨，两侧短交叠，替换素材无变速。")
        self._run(job, argv, timeout=3600)
        actual = _probe(dest)
        result_video = next(s for s in actual["streams"] if s.get("codec_type") == "video")
        tolerance = 1 / float(Fraction(p["fps"])) + .002
        video_duration = float(result_video.get("duration") or actual["duration"])
        if abs(video_duration - preview_length) > tolerance or result_video.get("width") != p["width"] or result_video.get("height") != p["height"] or Fraction(result_video["avg_frame_rate"]) != Fraction(p["fps"]):
            raise RuntimeError("替换输出时长/分辨率/帧率检查失败，未标为完成")
        job["replacePlan"]["durationErrorSec"] = round(video_duration - preview_length, 6)
        self._output(job, dest)

    def _beat_plan(self, music, duration):
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("未找到FFmpeg")
        result = subprocess.run([ffmpeg, "-v", "error", "-i", str(music), "-t", str(min(duration, 90)), "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"], capture_output=True, timeout=45, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode:
            raise ValueError("音乐节拍分析解码失败")
        pcm = array.array("h", result.stdout)
        envelope = [sum(abs(v) for v in pcm[i:i + 160]) / 160 for i in range(0, len(pcm) - 160, 160)]
        flux = [max(0, envelope[i] - envelope[i - 1]) for i in range(1, len(envelope))]
        if len(flux) < 120 or max(flux, default=0) < 1:
            return {"bpm": None, "confidence": "fallback", "crossfade": min(2.5, duration / 5), "loopStart": 0, "loopEnd": duration}
        correlations = [(sum(flux[i] * flux[i - lag] for i in range(lag, len(flux))), lag) for lag in range(17, 51)]
        score, lag = max(correlations)
        bpm = 3000 / lag
        beat = lag * .02
        threshold = statistics.mean(flux) + statistics.pstdev(flux)
        peak = next((i for i, value in enumerate(flux[:250]) if value > threshold), 0)
        start = max(0, peak * .02)
        bar = beat * 4
        end = start + math.floor((duration - start) / bar) * bar
        if end - start < bar * 3:
            start, end = 0, duration
        return {"bpm": round(bpm, 3), "confidence": "estimated-energy-autocorrelation", "crossfade": min(bar, (end - start) / 4), "loopStart": start, "loopEnd": end, "note": "节拍估计需试听核实；采用整拍等功率交叠，不声称已人工听审"}

    def _mix(self, job):
        p = job["parameters"]
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("未找到FFmpeg")
        length = p["endSec"] - p["startSec"]
        streams = p["sourceInfo"]["streams"]
        video = any(s.get("codec_type") == "video" for s in streams)
        audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
        music_duration = _probe(Path(p["musicPath"]))["duration"]
        plan = self._beat_plan(Path(p["musicPath"]), music_duration)
        if not p["loop"] or length <= music_duration:
            plan.update(loopStart=0, loopEnd=music_duration)
        job["musicPlan"] = plan
        span, fade = plan["loopEnd"] - plan["loopStart"], plan["crossfade"]
        repeats = 1 if not p["loop"] or length <= span else math.ceil((length - span) / (span - fade)) + 1
        if repeats > 100:
            raise ValueError("音乐过短或目标过长，请使用更长曲目")
        filters = []
        if repeats > 1:
            filters.append(f"[1:a:0]asplit={repeats}" + "".join(f"[mus{i}]" for i in range(repeats)))
        for i in range(repeats):
            label = f"[mus{i}]" if repeats > 1 else "[1:a:0]"
            filters.append(f"{label}atrim=start={plan['loopStart']:.6f}:end={plan['loopEnd']:.6f},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[m{i}]")
        tail = "m0"
        for i in range(1, repeats):
            filters.append(f"[{tail}][m{i}]acrossfade=d={fade:.6f}:c1=qsin:c2=qsin[loop{i}]")
            tail = f"loop{i}"
        filters.append(f"[{tail}]volume={p['gainDb']}dB,apad,atrim=duration={length:.6f},afade=t=in:d={min(.6,length/4):.6f},afade=t=out:st={max(0,length-1.5):.6f}:d={min(1.5,length):.6f}[music]")
        if audio:
            filters.append("[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[voice][side]")
            if p["duck"]:
                filters.append("[music][side]sidechaincompress=threshold=0.025:ratio=5:attack=35:release=500:makeup=1[ducked]")
            else:
                filters.append("[side]anullsink")
                filters.append("[music]anull[ducked]")
            filters.append("[voice][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89:level=0:latency=1[outa]")
            job["audioNote"] = "保留源文件第一音轨并加入音乐；若源音轨已有旧BGM，它也会保留。"
        else:
            filters.append("[music]alimiter=limit=0.89:level=0:latency=1[outa]")
            job["audioNote"] = "源文件无音轨，仅添加音乐；未伪造旁白，ducking不适用。"
        dest = self._destination(job, p["outputName"], ".mp4" if video else ".wav")
        argv = [ffmpeg, "-hide_banner", "-v", "warning", "-n", "-ss", str(p["startSec"]), "-t", str(length), "-i", p["sourcePath"], "-i", p["musicPath"], "-filter_complex", ";".join(filters)]
        if video:
            argv += ["-map", "0:v:0", "-map", "[outa]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart"]
        else:
            argv += ["-map", "[outa]", "-c:a", "pcm_s24le"]
        argv += ["-t", str(length), "-ar", "48000", "-ac", "2", str(dest)]
        _write_json(self.root / "jobs" / job["id"] / "mix-plan.json", {"parameters": p, "beatPlan": plan, "filters": filters, "repeats": repeats, "subjectiveListeningChecked": False})
        self._event(job, f"按估计拍点交叠循环 {repeats} 次，混音区间 {length:.2f} 秒。{job['audioNote']}")
        self._run(job, argv, timeout=3600)
        self._output(job, dest)

    def _qwen_key(self, credential_source=None):
        if credential_source is not None and credential_source not in QWEN_CREDENTIAL_SOURCES:
            raise ValueError("凭据来源只能选择已支持的环境变量别名")
        for slot in (credential_source,) if credential_source else QWEN_CREDENTIAL_SOURCES:
            value = os.environ.get(slot, "").strip()
            if value:
                return value, slot
        raise RuntimeError("所选 Qwen/Wan 环境凭据未配置；请使用已有安全环境配置后重启工作台")

    def _qwen_request(self, path, payload=None, credential_source=None):
        key, slot = self._qwen_key(credential_source)
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
        if payload is not None:
            headers["X-DashScope-Async"] = "enable"
        req = request.Request(WAN_BASE + path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        class NoRedirect(request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        try:
            with request.build_opener(NoRedirect).open(req, timeout=60) as response:
                return json.loads(response.read(2_000_000))
        except error.HTTPError as exc:
            raise RuntimeError(f"Qwen API HTTP {exc.code}；未自动重试或切换凭据") from None
        except (error.URLError, TimeoutError):
            raise RuntimeError("Qwen API连接超时/失败；已提交请求状态可能未知，不自动重复计费") from None

    def qwen_status(self, probe=False, credential_source=None):
        aliases = [{"id": alias, "configured": bool(os.environ.get(alias, "").strip())} for alias in QWEN_CREDENTIAL_SOURCES]
        try:
            _, slot = self._qwen_key(credential_source)
        except RuntimeError as exc:
            return {"status": "not-configured", "message": str(exc), "credentialSource": credential_source, "credentialSources": aliases, "models": ["wan2.6-t2v", "wan2.2-t2v-plus"]}
        result = {"status": "configured", "credentialSource": slot, "credentialSources": aliases, "models": ["wan2.6-t2v", "wan2.2-t2v-plus"], "message": "环境凭据已发现；生成仅由明确提交按钮触发，同一云端任务固定此凭据别名"}
        if probe:
            try:
                # Non-generation authenticated GET. No upload or synthesis is submitted.
                data = self._qwen_request("/uploads?action=getPolicy&model=wan2.6-t2v", credential_source=slot)
                result.update(status="reachable", message="无生成 GET 探针成功；不代表生成模型额度已验证", checkedAt=_now())
            except RuntimeError as exc:
                result.update(status="unavailable", message=str(exc), checkedAt=_now())
        return result

    def start_video(self, project_id, prompt, model="wan2.6-t2v", duration=5, size="1280*720", credential_source=None):
        _, slot = self._qwen_key(credential_source)
        prompt = str(prompt).strip()
        if not prompt or len(prompt) > 6000:
            raise ValueError("视频提示词应在1至6000字之间")
        if model not in {"wan2.6-t2v", "wan2.2-t2v-plus"} or int(duration) not in ({5, 10, 15} if model == "wan2.6-t2v" else {5}):
            raise ValueError("此模型或时长不在已支持参数中")
        if size not in {"1280*720", "720*1280", "1920*1080", "1080*1920"}:
            raise ValueError("不支持的生成尺寸")
        if model == "wan2.2-t2v-plus" and size not in {"1280*720", "720*1280"}:
            raise ValueError("wan2.2 当前仅开放720P参数")
        job = self._new("qwen-video", project_id, {"prompt": prompt, "model": model, "duration": int(duration), "size": size, "credentialSource": slot})
        return self._background(job, self._submit_video)

    def _submit_video(self, job):
        p = job["parameters"]
        payload = {"model": p["model"], "input": {"prompt": p["prompt"] + "\nNo readable text, no letters, no numbers, no formulas, no logo, no watermark. Silent illustrative atmosphere only."}, "parameters": {"size": p["size"], "duration": p["duration"], "prompt_extend": False, "watermark": False, "seed": 261016}}
        if p["model"] == "wan2.6-t2v":
            payload["parameters"]["audio"] = False
        with self.lock:
            job["submissionStarted"] = _now()
            self._event(job, "即将提交一次 Wan 计费生成；提交状态未知时不自动重试。")
        data = self._qwen_request("/services/aigc/video-generation/video-synthesis", payload, credential_source=p["credentialSource"])
        out = data.get("output", {})
        if not out.get("task_id"):
            job["status"] = "rejected"
            job.pop("submissionStarted", None)
            raise RuntimeError("Wan未返回任务ID，生成未获确认；请检查模型与额度")
        with self.lock:
            job.update(taskId=out["task_id"], cloudStatus=out.get("task_status"), requestId=data.get("request_id"))
            self._event(job, "云端任务已登记；点击查询可追踪同一个任务，不重新提交。")
        return "submitted"

    def poll_video(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if not job or job["kind"] != "qwen-video" or not job.get("taskId"):
                raise ValueError("此任务没有已确认的Wan任务ID，不可自动补交")
            if job.get("output"):
                return copy.deepcopy(job)
            prior = self._poll_workers.get(job_id)
            if job["status"] == "polling" or (prior and prior.is_alive()):
                return copy.deepcopy(job)
            cancel = threading.Event()
            self.cancel[job_id] = cancel
            job["status"] = "polling"
            self._save(job)
        def poll():
            updates = {}
            message = None
            try:
                slot = job["parameters"].get("credentialSource")
                if not slot:
                    raise ValueError("此历史任务未记录凭据来源，不能猜测切换账户查询")
                data = self._qwen_request("/tasks/" + parse.quote(job["taskId"], safe=""), credential_source=slot)
                if cancel.is_set():
                    return
                out = data.get("output", {})
                status = out.get("task_status", "UNKNOWN")
                updates["cloudStatus"] = status
                next_status = "submitted" if status in {"PENDING", "RUNNING", "UNKNOWN"} else "failed"
                if status == "SUCCEEDED":
                    with self._project_operation(job):
                        updates.update(self._download_video(job, out.get("video_url", ""), cancel))
                    next_status = "completed"
                    message = "输出已保存，可刷新右侧素材试听/预览。"
                elif status in {"FAILED", "CANCELED"}:
                    message = "云端生成失败或取消；原taskId已保留，不自动重提"
            except Exception as exc:
                next_status = "submitted"
                message = "查询失败，可稍后查询原任务：" + _redact(exc)
            # Publish terminal status only after download/validation and all
            # persistence is ready. get_job cannot observe it before _save.
            # Cancellation already persisted detached; never overwrite it.
            with self.lock:
                if cancel.is_set() or job["status"] == "detached":
                    return
                job.update(updates)
                job["status"] = next_status
                job["updatedAt"] = _now()
                if message:
                    job.setdefault("events", []).append({"at": _now(), "message": _redact(message)[:5000]})
                    job["message"] = _redact(message)[:2000]
                self._save(job)
        worker = threading.Thread(target=poll, daemon=True)
        with self.lock:
            self._poll_workers[job_id] = worker
            worker.start()
        return self.get_job(job_id)

    def _download_video(self, job, url, cancel=None):
        parsed = parse.urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or not (parsed.hostname.endswith(".aliyuncs.com") or parsed.hostname.endswith(".alicdn.com")):
            raise ValueError("生成视频地址不在受支持的阿里云HTTPS域名内")
        dest = self._destination(job, "Wan氛围素材", ".mp4")
        partial = dest.with_name(dest.stem + ".download-" + uuid.uuid4().hex[:8] + ".part")
        class NoRedirect(request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        with request.build_opener(NoRedirect).open(url, timeout=120) as response, partial.open("xb") as stream:
            total = 0
            while True:
                if cancel and cancel.is_set():
                    raise InterruptedError("已停止本地下载")
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 500_000_000:
                    raise ValueError("视频超过500MB下载上限")
                stream.write(chunk)
        _probe(partial)
        if cancel and cancel.is_set():
            raise InterruptedError("已停止本地下载")
        partial.replace(dest)
        probe = _probe(dest)
        output = {"path": str(dest), "relativePath": dest.relative_to(Path(job["projectPath"])).as_posix(), "duration": probe["duration"], "size": dest.stat().st_size, "sha256": _sha(dest)}
        self.library.snapshot(refresh=True)
        return {"output": output, "visualReview": "pending: check text/watermarks/continuity before final use"}

    def snapshot(self):
        with self.lock:
            music = copy.deepcopy(list(self.music.values()))
        return {"jobs": self.list_jobs(), "music": music, "tts": self.tts_status(), "qwen": self.qwen_status(), "defaultMusicFolder": str(MUSIC_ROOT), "hasActive": self.has_active()}


TTS_WORKER = r'''
import os,sys,json,hashlib,re
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
os.environ['USE_TF']='0'
os.environ['USE_FLAX']='0'
spec=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
root=Path(spec['ttsRoot']);work=Path(spec['jobDir'])
sys.path.insert(0,str(root))
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
from broadcast_voice import master_voice
if not torch.cuda.is_available(): raise RuntimeError('本机CUDA不可用；未切换通用音色、CPU或云端服务')
import transformers.modeling_utils as mu
mu.caching_allocator_warmup=lambda *a,**k:None
torch.set_num_threads(4)
def sha(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
reference=root/'work/clone-reference.wav'
meta=json.loads((root/'work/clone-reference.json').read_text(encoding='utf-8'))
text=spec['text']
if spec['pronunciations']:
 pattern='|'.join(re.escape(k) for k in sorted(spec['pronunciations'],key=len,reverse=True))
 text=re.sub(pattern,lambda m:spec['pronunciations'][m.group()],text)
chunks=[]
for sentence in re.split(r'(?<=[。！？!?；;])',text):
 if not sentence.strip():continue
 while len(sentence)>150:
  split=max(sentence.rfind('，',0,150),sentence.rfind(',',0,150))
  if split<35:split=120
  chunks.append(sentence[:split+1]);sentence=sentence[split+1:]
 if sentence.strip():chunks.append(sentence.strip())
model=Qwen3TTSModel.from_pretrained(str(root/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
prompt=model.create_voice_clone_prompt(ref_audio=str(reference),ref_text=meta['text'])
clips=[];record=[];cursor=0
parameters={'temperature':.48,'top_p':.88,'repetition_penalty':1.1,'max_new_tokens':1300,'non_streaming_mode':True}
for i,chunk in enumerate(chunks):
 seed=26101600+i;torch.manual_seed(seed)
 waves,sr=model.generate_voice_clone(text=[chunk],language='Chinese',voice_clone_prompt=prompt,**parameters)
 x=np.asarray(waves[0],np.float32)
 if not len(x) or not np.isfinite(x).all():raise RuntimeError('TTS返回无效音频')
 raw=work/f'raw-{i:03d}.wav';protected=work/f'protected-{i:03d}.wav';clean=work/f'clean-{i:03d}.wav'
 sf.write(raw,x,sr,subtype='PCM_24')
 sf.write(protected,np.pad(x,(round(.08*sr),round(.16*sr))),sr,subtype='PCM_24')
 report=master_voice(protected,clean,work/f'clean-{i:03d}.json')
 y,out_sr=sf.read(clean,dtype='float32');clips.append(y)
 record.append({'text':chunk,'seed':seed,'rawSha256':sha(raw),'cleanSha256':sha(clean),'startSec':cursor/48000,'durationSec':len(y)/48000})
 cursor+=len(y)
 print(f'Sentence {i+1}/{len(chunks)} generated {len(y)/48000:.2f}s',flush=True)
merged=np.concatenate(clips)
destination=Path(spec['output']);natural=work/'natural-narration.wav'
sf.write(natural,merged,48000,subtype='PCM_24')
if spec['speed']!=1:
 import subprocess
 subprocess.run(['ffmpeg','-v','error','-n','-i',str(natural),'-af',f"atempo={spec['speed']}",'-c:a','pcm_s24le',str(destination)],check=True)
else:
 import shutil
 shutil.copyfile(natural,destination)
report={'model':'Qwen3-TTS-0.6B','referenceSha256':sha(reference),'modelSha256':sha(root/'models/Qwen3-TTS-0.6B/model.safetensors'),'parameters':parameters,'sourceText':spec['text'],'spokenText':text,'speed':spec['speed'],'speedChangedByExplicitUserSetting':spec['speed']!=1,'sentences':record,'outputSha256':sha(destination),'subjectiveListeningChecked':False,'docs':spec['docs']}
(work/'tts-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('TTS_COMPLETED',flush=True)
'''
