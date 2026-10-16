"""Delivery QA for Nobel Physics 2026 V01.

Runs metadata/decode checks on the rendered MP4 and lightweight content checks.
It intentionally does not inspect aesthetics or replace human listening.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MP4 = ROOT / "delivery/physics2026_v01/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v01_完整预览1080p.mp4"
TIMELINE = ROOT / "src/physics2026/timeline-v01.json"


def run(cmd: list[str], *, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, text=True, encoding="utf-8", errors="replace", capture_output=True, check=check)


def probe(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)])
    if p.returncode:
        return {"error": p.stderr.strip() or "ffprobe failed"}
    return json.loads(p.stdout or "{}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["full", "metadata"], default="full")
    ap.add_argument("--input", type=Path, default=DEFAULT_MP4)
    args = ap.parse_args()
    target = args.input if args.input.is_absolute() else ROOT / args.input
    report: dict = {"target": str(target), "checks": [], "warnings": [], "errors": []}
    if not target.exists():
        report["errors"].append(f"missing delivery: {target}")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2

    metadata = probe(target)
    report["probe"] = metadata
    streams = metadata.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video:
        report["errors"].append("no video stream")
    else:
        if (video.get("width"), video.get("height")) != (1920, 1080):
            report["errors"].append(f"video size is {video.get('width')}x{video.get('height')}, expected 1920x1080")
        if video.get("r_frame_rate") not in ("30/1", "60/2"):
            report["warnings"].append(f"unexpected frame rate {video.get('r_frame_rate')}")
    if not audio:
        report["errors"].append("no audio stream")
    elif int(audio.get("sample_rate", 0)) != 48000:
        report["warnings"].append(f"audio sample rate {audio.get('sample_rate')}Hz, expected 48000Hz")
    if video and audio:
        vd = float(video.get("duration") or metadata.get("format", {}).get("duration") or 0)
        ad = float(audio.get("duration") or metadata.get("format", {}).get("duration") or 0)
        report["checks"].append({"videoDuration": vd, "audioDuration": ad, "avDelta": abs(vd - ad)})
        if abs(vd - ad) > 2 / 30:
            report["errors"].append(f"audio/video duration delta {abs(vd-ad):.3f}s exceeds 2 frames")

    if args.mode == "full":
        dec = run(["ffmpeg", "-v", "error", "-i", str(target), "-f", "null", "-"])
        if dec.returncode:
            report["errors"].append("ffmpeg decode failed: " + dec.stderr[-600:])
        else:
            report["checks"].append("full ffmpeg decode passed")
    if TIMELINE.exists():
        data = json.loads(TIMELINE.read_text(encoding="utf-8"))
        report["timeline"] = {"durationFrames": data.get("duration"), "clips": len(data.get("clips", []))}
    else:
        report["warnings"].append("timeline missing")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
