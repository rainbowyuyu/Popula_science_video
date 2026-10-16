"""Auditable WAN 2.7 endpoint-conditioned editorial bridges for Launch v5.

Credentials are read only from the existing process environment. A POST is
never retried automatically, and every task key is immutable after submission.
Use bind only after the shot's clean start/end frames have been approved.
Generated clips are concept footage, never product or solver evidence.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from PIL import Image, ImageDraw
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/generated/v5"
AUDIT = ROOT / "research/generation"
SPECS = AUDIT / "qwen-v5-specs.json"
LEDGER = AUDIT / "qwen-v5-tasks.json"
LOCK = AUDIT / ".qwen-v5-ledger.lock"
BASE = "https://dashscope.aliyuncs.com"
MODEL = "wan2.7-i2v-2026-04-25"
PRICING_SOURCE = "https://help.aliyun.com/zh/model-studio/model-pricing"
API_SOURCE = "https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference"
PRICING_DATE = "2026-10-11"
PURPOSE = (
    "Editorial concept transition only. No numerical, solver, stress, "
    "displacement, engineering-success or product-execution claim."
)
AUTH_FAILURES = {401, 403}
AUTH_OK_CODES = {"InvalidTaskId", "TaskNotFound", "TaskNotExist", "TaskNotExists"}
sys.stdout.reconfigure(encoding="utf8")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path, fallback=None):
    return json.loads(path.read_text("utf8")) if path.exists() else fallback


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), "utf8")
    temporary.replace(path)


@contextmanager
def locked():
    AUDIT.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 15
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise RuntimeError("Ledger locked; inspect the current process before removing a stale lock")
            time.sleep(0.2)
    os.write(fd, str(os.getpid()).encode("ascii"))
    os.close(fd)
    try:
        yield
    finally:
        LOCK.unlink(missing_ok=True)


def public_path(value: str) -> Path:
    path = Path(value)
    path = path.resolve() if path.is_absolute() else (ROOT / path).resolve()
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError("Bridge images must be copied into this project first")
    return path


def image_info(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError("Official endpoint image limit is 20 MB")
    with Image.open(path) as image:
        if image.mode in ("RGBA", "LA") or "transparency" in image.info:
            raise ValueError("Official endpoint does not accept transparent images; use clean opaque RGB anchors")
        width, height = image.size
        if min(width, height) < 240 or max(width, height) > 8000:
            raise ValueError("Official endpoint image width and height must be between 240 and 8000")
        if not 1 / 8 <= width / height <= 8:
            raise ValueError("Official endpoint image aspect must be between 1:8 and 8:1")
        image.verify()
    return {
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sha256": sha(path), "width": width, "height": height,
        "bytes": path.stat().st_size,
    }


def image_url(path: Path) -> str:
    mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def credentials():
    seen = set()
    for name in ("QWEN_API_KEY_PRIMARY", "DASHSCOPE_API_KEY", "QWEN_API_KEY", "QWEN_API_KEY_BACKUP"):
        key = os.environ.get(name, "").strip()
        if key and key not in seen:
            seen.add(key)
            yield name, key


def authentication():
    probes = []
    for source, key in credentials():
        try:
            response = requests.get(
                BASE + "/api/v1/tasks/00000000-0000-0000-0000-000000000000",
                headers={"Authorization": "Bearer " + key}, timeout=30,
            )
        except requests.RequestException as error:
            probes.append({"credentialSource": source, "errorType": type(error).__name__})
            write(AUDIT / "qwen-v5-auth-probe.json", {"at": now(), "probes": probes})
            raise RuntimeError("Authentication network result uncertain; no provider or credential retry") from None
        try:
            body = response.json()
        except ValueError:
            body = {}
        code = body.get("code")
        status = body.get("output", {}).get("task_status")
        probes.append({"credentialSource": source, "http": response.status_code, "code": code, "status": status})
        write(AUDIT / "qwen-v5-auth-probe.json", {"at": now(), "probes": probes})
        if response.status_code in AUTH_FAILURES:
            continue  # User explicitly authorized backup after primary failure.
        if code in AUTH_OK_CODES or status == "UNKNOWN":
            return source, key
        raise RuntimeError("Authentication did not return a recognized task result; inspect safe probe record")
    raise RuntimeError("No existing environment credential authenticated for the native media endpoint")


def bind(name: str, first: str, last: str, start: int):
    with locked():
        specs = read(SPECS)
        if name not in specs["shots"]:
            raise KeyError(name)
        if name in read(LEDGER, {}).get("tasks", {}):
            raise RuntimeError("Task anchors are immutable after submission; add a distinct revision name")
        images = [image_info(public_path(value)) for value in (first, last)]
        if images[0]["width"] / images[0]["height"] != images[1]["width"] / images[1]["height"]:
            raise ValueError("Start/end frame aspect ratios must match")
        shot = specs["shots"][name]
        shot.update(
            first=images[0]["path"], last=images[1]["path"],
            fromFrame=start, durationInFrames=300, ready=True,
            sourceFrames=images, anchorsBoundAt=now(),
        )
        write(SPECS, specs)
    print(name, "BOUND", start, start + 300)


def submit(name: str):
    OUT.mkdir(parents=True, exist_ok=True)
    with locked():
        specs = read(SPECS)
        spec = specs["shots"][name]
        ledger = read(LEDGER, {"version": 5, "tasks": {}})
        tasks = ledger["tasks"]
        if name in tasks:
            raise RuntimeError("Task key already exists; poll or reconcile it, never automatically re-submit")
        if not spec.get("ready") or spec.get("fromFrame") is None:
            raise RuntimeError("No approved shot endpoints/time range; bind clean frames before submission")
        inputs = [public_path(spec[key]) for key in ("first", "last")]
        images = [image_info(path) for path in inputs]
        if images != spec.get("sourceFrames"):
            raise RuntimeError("Anchor file changed after bind; re-bind reviewed images before submission")
        duration = spec.get("durationS", 5)
        if duration != 5:
            raise ValueError("This revision is bounded to two five-second bridges")
        reserved = sum(t["estimatedMaxCostCNY"] for t in tasks.values() if t.get("status") != "FAILED_BEFORE_TASK")
        estimate = duration * 1.0
        if reserved + estimate > specs["nominalBudgetMaxCNY"]:
            raise RuntimeError("This revision's reserved nominal generation budget would be exceeded")
        source, key = authentication()
        parameters = {
            "resolution": "1080P", "duration": duration,
            "prompt_extend": False, "watermark": False,
            "seed": spec.get("seed", 202610115),
        }
        record = {
            "provider": "Alibaba Cloud Model Studio / WAN", "model": MODEL,
            "credentialSource": source, "status": "submitting", "submittedAt": now(),
            "purpose": PURPOSE, "parameters": parameters, "prompt": spec["prompt"],
            "negativePrompt": spec.get("negativePrompt", ""),
            "sourceFrames": images, "fromFrame": spec["fromFrame"],
            "durationInFrames": spec["durationInFrames"],
            "estimatedMaxCostCNY": estimate, "actualCostCNY": None,
            "pricingSource": PRICING_SOURCE, "pricingCheckedAt": PRICING_DATE,
            "apiSource": API_SOURCE, "billingNote": "Nominal Beijing price; provider bill not reconciled",
            "editorialSelection": "pending_review",
        }
        tasks[name] = record
        write(LEDGER, ledger)  # Persist the reservation before the paid POST.
        payload = {
            "model": MODEL,
            "input": {
                "prompt": spec["prompt"], "negative_prompt": spec.get("negativePrompt", ""),
                "media": [{"type": "first_frame", "url": image_url(inputs[0])}, {"type": "last_frame", "url": image_url(inputs[1])}],
            },
            "parameters": parameters,
        }
        try:
            response = requests.post(
                BASE + "/api/v1/services/aigc/video-generation/video-synthesis",
                headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "X-DashScope-Async": "enable"},
                json=payload, timeout=180,
            )
        except requests.RequestException as error:
            record.update(status="submission_unconfirmed", errorType=type(error).__name__)
            write(LEDGER, ledger)
            raise RuntimeError("Submission unknown; reconcile the original request before any new generation") from None
        try:
            body = response.json()
        except ValueError:
            body = {}
        record.update(http=response.status_code, requestId=body.get("request_id"))
        output = body.get("output", {})
        if not response.ok or not output.get("task_id"):
            record.update(status="FAILED_BEFORE_TASK", error=body.get("code", "HTTP_ERROR"))
        else:
            record.update(taskId=output["task_id"], status=output.get("task_status", "PENDING"))
        write(LEDGER, ledger)
    print(name, record["status"], record.get("taskId", ""), record.get("error", ""))


def poll(name: str):
    with locked():
        ledger = read(LEDGER)
        record = ledger["tasks"][name]
        if record.get("status") == "SUCCEEDED" and record.get("asset") and public_path(record["asset"]).exists():
            print(name, "SUCCEEDED", "cached")
            return
        if not record.get("taskId"):
            raise RuntimeError("No confirmed provider task; no automatic resubmission allowed")
        key = os.environ.get(record["credentialSource"], "").strip()
        if not key:
            raise RuntimeError("Original credential source is absent from this process environment")
        response = requests.get(BASE + "/api/v1/tasks/" + record["taskId"], headers={"Authorization": "Bearer " + key}, timeout=45)
        try:
            body = response.json()
        except ValueError:
            raise RuntimeError("Task poll response was not JSON; task state left unchanged") from None
        output = body.get("output", {})
        if not response.ok or not output.get("task_status"):
            record.update(lastPollError=body.get("code", "HTTP_ERROR"), lastPollHTTP=response.status_code, lastPolledAt=now())
            write(LEDGER, ledger)
            raise RuntimeError("Task poll failed; existing provider task state retained")
        record.update(status=output["task_status"], lastPolledAt=now(), usage=body.get("usage"), error=output.get("code"))
        write(LEDGER, ledger)
        if record["status"] == "SUCCEEDED":
            url = output.get("video_url") or next((item.get("url") for item in output.get("results", []) if item.get("url")), None)
            if not url:
                raise RuntimeError("Successful provider task has no recognized asset URL")
            target = OUT / (name + ".mp4")
            if not target.exists():
                response = requests.get(url, timeout=240)
                response.raise_for_status()
                temporary = target.with_suffix(".download")
                temporary.write_bytes(response.content)
                temporary.replace(target)
            record.update(asset=str(target.relative_to(ROOT)).replace("\\", "/"), sha256=sha(target), completedAt=now())
            write(LEDGER, ledger)
    print(name, record["status"], record.get("asset", ""), record.get("error", ""))


def qa(name: str):
    ledger = read(LEDGER)
    record = ledger["tasks"][name]
    path = public_path(record["asset"])
    if sha(path) != record["sha256"]:
        raise RuntimeError("Output asset hash differs from the confirmed downloaded asset")
    directory = ROOT / "work/qwen-v5-qa" / name
    directory.mkdir(parents=True, exist_ok=True)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], check=True, capture_output=True, text=True)
    metadata = json.loads(probe.stdout)
    video = next(stream for stream in metadata["streams"] if stream["codec_type"] == "video")
    # WAN's generated audio may have an AAC padding tail. Sample only the video
    # stream; the editorial composite will mute this generated audio entirely.
    duration = float(video.get("duration", metadata["format"]["duration"]))
    samples = [min(duration - 0.045, duration * index / 10) for index in range(11)]
    thumbs = []
    for index, timestamp in enumerate(samples):
        destination = directory / f"frame-{index:02d}.png"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(timestamp), "-i", str(path), "-frames:v", "1", "-threads", "1", str(destination)], check=True)
        with Image.open(destination) as image:
            thumb = image.convert("RGB")
            thumb.thumbnail((480, 270))
            thumbs.append((timestamp, thumb.copy()))
    contact = Image.new("RGB", (1920, 3 * 302), "#e7eef2")
    draw = ImageDraw.Draw(contact)
    for index, (timestamp, image) in enumerate(thumbs):
        x, y = index % 4 * 480, index // 4 * 302
        contact.paste(image, (x, y))
        draw.text((x + 12, y + 276), f"{name}  {timestamp:.2f}s", fill="#15394a")
    sheet = directory / "contact-sheet.jpg"
    contact.save(sheet, quality=94)
    report = {
        "asset": record["asset"], "sha256": sha(path), "inspectedAt": now(),
        "metadata": metadata, "sampleSeconds": samples,
        "contactSheet": str(sheet.relative_to(ROOT)).replace("\\", "/"),
        "technicalChecks": {"durationNear5s": abs(duration - 5) < .15, "heightAtLeast1080": video["height"] >= 1080},
        "editorialChecksRequired": ["three outer columns maintained", "member connections stable", "no additional tower/blade", "no generated data", "no melted geometry or flicker", "no unplanned letters/logo", "continuous camera", "endpoint alignment"],
        "editorialReview": "pending_visual_review",
    }
    destination = directory / "qa.json"
    write(destination, report)
    with locked():
        ledger = read(LEDGER)
        ledger["tasks"][name]["qa"] = str(destination.relative_to(ROOT)).replace("\\", "/")
        write(LEDGER, ledger)
    print(name, "QA_SAMPLES_READY", str(sheet))


def review(name: str, selection: str, note: str):
    with locked():
        ledger = read(LEDGER)
        record = ledger["tasks"][name]
        if record["status"] != "SUCCEEDED" or not record.get("qa"):
            raise RuntimeError("Download and sample QA must be completed before editorial selection")
        record.update(editorialSelection=selection, editorialReviewNote=note, editorialReviewedAt=now())
        write(LEDGER, ledger)
        path = ROOT / record["qa"]
        report = read(path)
        report.update(editorialReview=selection, editorialReviewNote=note, editorialReviewedAt=now())
        write(path, report)
    print(name, selection)


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="mode", required=True)
    for mode in ("submit", "poll", "qa"):
        commands.add_parser(mode).add_argument("name")
    command = commands.add_parser("bind")
    command.add_argument("name"); command.add_argument("first"); command.add_argument("last"); command.add_argument("from_frame", type=int)
    command = commands.add_parser("review")
    command.add_argument("name"); command.add_argument("selection", choices=["selected", "rejected"]); command.add_argument("note")
    commands.add_parser("list")
    args = parser.parse_args()
    if args.mode == "bind":
        bind(args.name, args.first, args.last, args.from_frame)
    elif args.mode == "review":
        review(args.name, args.selection, args.note)
    elif args.mode == "list":
        print(json.dumps({"specs": read(SPECS), "ledger": read(LEDGER)}, ensure_ascii=False, indent=2))
    else:
        {"submit": submit, "poll": poll, "qa": qa}[args.mode](args.name)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not print Requests exception text: it can contain signed media URLs.
        print("ERROR", type(error).__name__, str(error) if isinstance(error, (RuntimeError, ValueError, KeyError, FileNotFoundError)) else "See the safe task ledger; exception details suppressed")
        raise SystemExit(1)
