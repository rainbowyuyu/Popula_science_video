"""Create and optionally generate Qwen/Wan environmental bridge plates.

The plates are deliberately visual only. Scientific data, formulae and source
labels stay in the deterministic Remotion composition. Credentials are read
from the environment and never written to a ledger. By default this script
only prepares a manifest; ``--run`` submits resumable provider jobs, while
``--fallback`` writes deterministic local placeholders if a provider is not
available.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import shutil
import subprocess
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "bridges-v01"
LEDGER = ROOT / "research" / "generation" / "qwen-bridge-ledger-v01.json"
HOST = "https://dashscope.aliyuncs.com"
MODEL = "wan3.0-video-prime"
FPS = 30
WIDTH, HEIGHT = 1920, 1080
DURATION = 5

BASE = (
    "16:9 widescreen, premium cinematic science documentary, WebGL-like deep "
    "blue-black environment, restrained cyan Cherenkov glow and very small warm "
    "gold highlights, natural physically plausible perspective, soft volumetric "
    "light, stable exposure, one continuous camera move, no cuts, no dissolve, "
    "no double exposure, no freeze, no sudden zoom, no text, no typography, no "
    "numbers, no logo, no watermark, no UI, no people. Leave clean negative "
    "space for post-composited educational graphics. Silent plate. "
)

JOBS = [
    {
        "id": "bridge-01-cosmic-arrival",
        "fromClip": "000",
        "toClip": "001",
        "seed": 260601,
        "prompt": BASE + (
            "Begin in a dense but elegant star field with faint Milky Way dust. "
            "A single thin cyan-blue neutrino-like light path travels diagonally "
            "across the frame, never becoming a solid object. The camera follows "
            "the path in a slow parallax glide, then eases toward a dark clean "
            "center frame ready for the award title. Keep the path subtle and "
            "continuous; no icons or particle text."
        ),
        "role": "cosmic atmosphere and title handoff",
    },
    {
        "id": "bridge-02-ice-descent",
        "fromClip": "004",
        "toClip": "005",
        "seed": 260602,
        "prompt": BASE + (
            "A slow vertical descent through translucent Antarctic blue ice. "
            "Layered bubbles, fine fractures and realistic caustic light drift "
            "past the camera. Far below, a few vertical dark detector strings "
            "with tiny glass modules gradually resolve in the distance; keep the "
            "modules sparse and physically plausible, with no readable marks. "
            "End with the ice opening into a clean deep-blue composition for the "
            "programmatic detector diagram."
        ),
        "role": "surface-to-IceCube environment handoff",
    },
    {
        "id": "bridge-03-cherenkov-volume",
        "fromClip": "006",
        "toClip": "007",
        "seed": 260603,
        "prompt": BASE + (
            "Macro view inside clear polar ice. A compact interaction point emits "
            "a smooth translucent blue Cherenkov cone that opens through the ice, "
            "with tiny dust motes and soft volumetric scattering. The camera makes "
            "a gentle half-arc around the cone while its rim light brightens and "
            "then settles. Keep the cone simple and clean, without equations or "
            "labels; the exact geometry will be drawn later by the renderer."
        ),
        "role": "interaction-to-formula visual bridge",
    },
    {
        "id": "bridge-04-source-return",
        "fromClip": "011",
        "toClip": "012",
        "seed": 260604,
        "prompt": BASE + (
            "Start close to a faint cyan detector glow suspended in blue-black ice. "
            "The camera slowly pulls back and tilts upward; the glow becomes a "
            "single thin trajectory that extends through the ice toward a distant "
            "star field. Keep one continuous line and natural depth of field. The "
            "last moment is a calm dark sky with a generous empty center for the "
            "source association overlay."
        ),
        "role": "evidence to astrophysical-source handoff",
    },
    {
        "id": "bridge-05-night-coda",
        "fromClip": "015",
        "toClip": "016",
        "seed": 260605,
        "prompt": BASE + (
            "Begin in a close view of softly glowing blue ice, then make a very "
            "slow, stable pullback through the ice toward the quiet South Pole "
            "horizon. The distant IceCube surface structures are tiny and low "
            "contrast, with a subtle polar twilight gradient and a few stars. End "
            "on an elegant dark-blue horizon with clean negative space for the "
            "closing logo. Avoid a literal map or any text."
        ),
        "role": "limits-to-coda closing handoff",
    },
]


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def load_ledger() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    return {"version": "qwen-bridge-v01", "createdAt": now(), "jobs": {}}


def save_ledger(data: dict) -> None:
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(LEDGER)


def prepare() -> None:
    data = load_ledger()
    data["manifest"] = {
        "width": WIDTH,
        "height": HEIGHT,
        "fps": FPS,
        "durationSeconds": DURATION,
        "model": MODEL,
        "provider": HOST,
        "scientificBoundary": "environment only; all measurements and labels are deterministic post-compositing",
        "jobs": JOBS,
    }
    for job in JOBS:
        row = data["jobs"].setdefault(job["id"], {})
        row.update({
            "id": job["id"],
            "status": row.get("status", "prepared"),
            "model": MODEL,
            "request": {"model": MODEL, "input": {"prompt": job["prompt"]}, "parameters": {
                "resolution": "1080P", "ratio": "16:9", "duration": DURATION,
                "audio": False, "prompt_extend": False, "watermark": False,
                "seed": job["seed"],
            }},
            "output": str((OUT / f"{job['id']}.mp4").relative_to(ROOT)).replace("\\", "/"),
            "source": "Qwen/Wan requested; no result asserted until status SUCCEEDED and file hash exists",
        })
    save_ledger(data)
    print(f"Prepared {len(JOBS)} bridge manifests at {LEDGER}")


def api_key() -> str:
    # The first token in this workspace may be a coding-plan credential
    # (``sk-sp-...``), which cannot submit native media jobs. Prefer the
    # explicit media slot and the configured backup before falling back to the
    # generic names.
    for name in ("DASHSCOPE_MEDIA_API_KEY", "QWEN_API_KEY_BACKUP", "QWEN_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY_PRIMARY"):
        value = (os.getenv(name) or "").strip()
        if value and not value.lower().startswith("sk-sp-"):
            return value
    raise RuntimeError("No media API key in DASHSCOPE_MEDIA_API_KEY/QWEN_API_KEY_PRIMARY/DASHSCOPE_API_KEY/QWEN_API_KEY")


def submit(job: dict, data: dict) -> None:
    out = OUT / f"{job['id']}.mp4"
    row = data["jobs"][job["id"]]
    if row.get("status") == "SUCCEEDED" and out.exists():
        return
    key = api_key()
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json", "X-DashScope-Async": "enable"}
    payload = row["request"]
    try:
        response = requests.post(HOST + "/api/v1/services/aigc/video-generation/video-synthesis", headers=headers, json=payload, timeout=240)
        response.raise_for_status()
        result = response.json()
    except Exception as exc:
        row.update({"status": "FAILED", "error": {"type": type(exc).__name__, "message": str(exc)}, "updatedAt": now()})
        save_ledger(data)
        raise
    task_id = result.get("output", {}).get("task_id")
    if not task_id:
        row.update({"status": "FAILED", "error": result, "updatedAt": now()})
        save_ledger(data)
        raise RuntimeError(f"Provider did not return task_id for {job['id']}")
    row.update({"status": "RUNNING", "providerTaskId": task_id, "submissionResult": result, "submittedAt": now()})
    save_ledger(data)
    for _ in range(180):
        time.sleep(10)
        poll = requests.get(HOST + f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {key}"}, timeout=90)
        poll.raise_for_status()
        result = poll.json()
        state = result.get("output", {}).get("task_status")
        row.update({"providerStatus": state, "updatedAt": now()})
        save_ledger(data)
        if state == "SUCCEEDED":
            url = result["output"].get("video_url")
            if not url:
                raise RuntimeError(f"Provider task succeeded without video_url: {job['id']}")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(requests.get(url, timeout=240).content)
            row.update({"status": "SUCCEEDED", "downloadUrl": url, "sha256": sha(out), "completedAt": now()})
            save_ledger(data)
            print(f"SUCCEEDED {job['id']} {out}")
            return
        if state in {"FAILED", "CANCELED", "UNKNOWN"}:
            row.update({"status": state, "result": result, "updatedAt": now()})
            save_ledger(data)
            raise RuntimeError(f"Provider task {state}: {job['id']}")
    row.update({"status": "PENDING", "updatedAt": now()})
    save_ledger(data)
    raise TimeoutError(f"Task still pending; rerun --run to resume: {job['id']}")


def retry_text_free(data: dict) -> None:
    """Retry the opening plate after visual review found provider lettering.

    The first result is retained under ``tmp/bridges-rejected`` for audit, and
    the selected output path remains stable so the Remotion composition does
    not need a timeline change.
    """
    job = JOBS[0]
    out = OUT / f"{job['id']}.mp4"
    if out.exists():
        rejected = ROOT / "tmp" / "bridges-rejected" / f"{job['id']}-r1.mp4"
        rejected.parent.mkdir(parents=True, exist_ok=True)
        if not rejected.exists():
            shutil.copy2(out, rejected)
        data["jobs"][job["id"]]["rejectedAttempt"] = {"file": str(rejected.relative_to(ROOT)).replace("\\", "/"), "sha256": sha(rejected), "reason": "provider introduced unreadable award lettering in final frames"}
    cleaned = dict(job)
    cleaned["seed"] = 260691
    cleaned["prompt"] = job["prompt"] + " ABSOLUTE TEXT BAN: the entire video must contain zero letters, words, glyphs, signage, pseudo-writing, symbols or award marks, including the last frame; render only stars, dust and one cyan light path."
    data["jobs"][job["id"]].update({"status": "prepared", "request": {"model": MODEL, "input": {"prompt": cleaned["prompt"]}, "parameters": {"resolution": "1080P", "ratio": "16:9", "duration": DURATION, "audio": False, "prompt_extend": False, "watermark": False, "seed": cleaned["seed"]}}, "retryOf": job["id"], "retryReason": "text artifact in r1", "updatedAt": now()})
    if out.exists():
        out.unlink()
    save_ledger(data)
    submit(cleaned, data)


def fallback_frame(index: int, job: dict):
    """Draw a clean, deterministic fallback plate with no scientific labels."""
    from PIL import Image, ImageDraw
    import numpy as np
    p = index / (FPS * DURATION - 1)
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH]
    radial = np.exp(-(((xx - WIDTH * (.56 + .08 * p)) / 800) ** 2 + ((yy - HEIGHT * .45) / 560) ** 2))
    arr = np.stack((3 + 4 * radial, 12 + 32 * radial, 24 + 58 * radial), axis=-1).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    d = ImageDraw.Draw(img, "RGBA")
    if job["id"] == "bridge-01-cosmic-arrival":
        for i in range(170):
            x = (i * 113 + index * 4) % WIDTH; y = (i * 67 + index * 2) % HEIGHT
            d.ellipse((x, y, x + 2, y + 2), fill=(160, 220, 235, 120))
        pts = [(int(WIDTH * .15 + p * WIDTH * .6), int(HEIGHT * .72 - p * HEIGHT * .36))]
        pts += [(int(WIDTH * .15 + (p + q) * WIDTH * .6), int(HEIGHT * .72 - (p + q) * HEIGHT * .36)) for q in (.03, .06, .09)]
        d.line(pts, fill=(80, 219, 239, 190), width=5)
    elif job["id"] == "bridge-02-ice-descent":
        for i in range(16):
            x = int(WIDTH * (.1 + i * .06)); d.line((x, 0, x + int(30 * math.sin(p * 4 + i)), HEIGHT), fill=(82, 190, 222, 25), width=16)
        for i in range(4):
            x = WIDTH * (.30 + i * .13); d.line((x, HEIGHT * .38, x, HEIGHT * .95), fill=(140, 210, 222, 110), width=3)
            for j in range(3): d.ellipse((x - 8, HEIGHT * (.5 + j * .14), x + 8, HEIGHT * (.5 + j * .14) + 16), fill=(103, 211, 226, 160))
    elif job["id"] == "bridge-03-cherenkov-volume":
        cx, cy = WIDTH * .52, HEIGHT * .56; spread = WIDTH * (.12 + .06 * p)
        d.polygon([(cx, cy), (cx - spread, HEIGHT * .95), (cx + spread, HEIGHT * .95)], fill=(51, 199, 226, 36), outline=(83, 219, 240, 130))
        d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill=(231, 199, 109, 220))
    elif job["id"] == "bridge-04-source-return":
        cx, cy = WIDTH * .50, HEIGHT * .48; d.line((cx, cy, WIDTH * (.86 - .18 * p), HEIGHT * (.18 + .18 * p)), fill=(79, 214, 235, 160), width=5)
        for i in range(100):
            x = (i * 173) % WIDTH; y = (i * 97) % int(HEIGHT * .7); d.ellipse((x, y, x + 2, y + 2), fill=(160, 221, 235, 100))
    else:
        horizon = int(HEIGHT * (.74 - .06 * p)); d.rectangle((0, horizon, WIDTH, HEIGHT), fill=(10, 37, 52, 180)); d.line((0, horizon, WIDTH, horizon), fill=(130, 211, 222, 110), width=3)
    return img


def fallback(data: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    import tempfile
    for job in JOBS:
        out = OUT / f"{job['id']}.mp4"
        if out.exists() and data["jobs"][job["id"]].get("status") == "FALLBACK":
            continue
        with tempfile.TemporaryDirectory(prefix="physics2026-bridge-") as td:
            tdpath = Path(td)
            for i in range(FPS * DURATION):
                fallback_frame(i, job).save(tdpath / f"{i:05d}.png")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(tdpath / "%05d.png"), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", str(out)], check=True)
        data["jobs"][job["id"]].update({"status": "FALLBACK", "fallbackReason": "Deterministic local plate; no Qwen result claimed", "sha256": sha(out), "completedAt": now()})
        save_ledger(data)
        print(f"FALLBACK {job['id']} {out}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--fallback", action="store_true")
    parser.add_argument("--retry-text-free", action="store_true", help="retry opening bridge with stricter no-lettering prompt")
    parser.add_argument("--job", choices=[j["id"] for j in JOBS])
    args = parser.parse_args()
    prepare()
    if not (args.run or args.fallback or args.retry_text_free):
        return
    data = load_ledger()
    if args.retry_text_free:
        retry_text_free(data)
        return
    jobs = [j for j in JOBS if args.job is None or j["id"] == args.job]
    if args.fallback:
        fallback(data)
    if args.run:
        for job in jobs:
            submit(job, data)


if __name__ == "__main__":
    main()
