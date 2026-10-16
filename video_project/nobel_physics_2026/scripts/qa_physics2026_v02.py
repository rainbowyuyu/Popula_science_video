"""Delivery QA for the five-minute Nobel Physics 2026 V02 preview.

This checks the mechanical delivery contract (streams, dimensions, frame
rate, duration and full decode). Visual continuity and spoken-word review are
kept as a separate human check because ffmpeg metadata cannot judge them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MP4 = ROOT / "delivery/physics2026_v02/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v02_完整预览1080p.mp4"
TIMELINE = ROOT / "src/physics2026/timeline-v02.json"


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, text=True, encoding="utf-8", errors="replace", capture_output=True)


def probe(path: Path) -> dict:
    p = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)])
    return json.loads(p.stdout or "{}") if p.returncode == 0 else {"error": p.stderr.strip()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_MP4)
    ap.add_argument("--report", type=Path)
    args = ap.parse_args()
    target = args.input if args.input.is_absolute() else ROOT / args.input
    report: dict = {"target": str(target), "checks": [], "warnings": [], "errors": []}
    if not target.exists():
        report["errors"].append(f"missing delivery: {target}")
    else:
        report["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
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
                report["errors"].append(f"unexpected frame rate {video.get('r_frame_rate')}")
            if int(video.get("nb_frames", 0)) != 9054:
                report["errors"].append(f"video frame count is {video.get('nb_frames')}, expected 9054")
        if not audio:
            report["errors"].append("no audio stream")
        elif int(audio.get("sample_rate", 0)) != 48000:
            report["errors"].append(f"audio sample rate is {audio.get('sample_rate')}Hz, expected 48000Hz")
        if video and audio:
            vd = float(video.get("duration") or metadata.get("format", {}).get("duration") or 0)
            ad = float(audio.get("duration") or metadata.get("format", {}).get("duration") or 0)
            delta = abs(vd - ad)
            report["checks"].append({"videoDuration": vd, "audioDuration": ad, "avDelta": delta})
            if delta > 2 / 30:
                report["errors"].append(f"audio/video duration delta {delta:.3f}s exceeds 2 frames")
        dec = run(["ffmpeg", "-v", "error", "-i", str(target), "-f", "null", "-"])
        if dec.returncode:
            report["errors"].append("full ffmpeg decode failed: " + dec.stderr[-600:])
        else:
            report["checks"].append("full ffmpeg decode passed")
    if TIMELINE.exists():
        data = json.loads(TIMELINE.read_text(encoding="utf-8"))
        report["timeline"] = {"durationFrames": data.get("duration"), "clips": len(data.get("clips", []))}
    if args.report:
        output = args.report if args.report.is_absolute() else ROOT / args.report
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
