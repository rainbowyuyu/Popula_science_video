"""Reproducible technical QA and review frames from the final V11 MP4.

This script never edits or deletes a video, source asset, or existing report.
It records machine checks separately from the human review still required.
Run only after the render/remux process has finished.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TIMELINE = ROOT / "src/physics2026/timeline-v11.json"
EXPECTED = {"width": 1920, "height": 1080, "fps": 30, "frames": 7403,
            "videoStreams": 1, "audioStreams": 1, "audioCodec": "aac"}
# These are the actual figure cue times in EvidenceFigureV11.tsx, in clip seconds.
PAPER_SWITCHES = {"005": [6.85], "006": [10.397], "011": [13.794],
                  "012": [14.181, 21.3]}


def resolve_project_path(value: Path) -> Path:
    return (value if value.is_absolute() else ROOT / value).resolve()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(command: list[str], log_path: Path) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, cwd=ROOT, text=True, encoding="utf-8",
                               errors="replace", capture_output=True)
    log_path.write_text(completed.stderr, encoding="utf-8")
    return completed


def frame_seconds(frame: int, fps: int) -> str:
    return f"{frame / fps:.3f}s / frame {frame}"


def frame_groups(timeline: dict) -> tuple[dict[str, list[dict]], list[int]]:
    fps = int(timeline["fps"])
    total = int(timeline["duration"])
    clips = timeline["clips"]
    clamp = lambda f: max(0, min(total - 1, int(f)))
    groups: dict[str, list[dict]] = {"content": [], "seams": [], "paper_switches": []}
    for clip in clips:
        start, end = int(clip["start"]), int(clip["end"])
        # 15%, 50%, 85% stay inside the narrated clip and avoid only sampling fades.
        samples = [clamp(start + math.floor((end - start - 1) * p)) for p in (.15, .5, .85)]
        groups["content"].append({"group": f"{clip['id']} {clip['scene']}",
            "clipId": clip["id"], "frames": samples,
            "samplePositions": ["15%", "50%", "85%"]})
    for index, clip in enumerate(clips[1:], 1):
        center = int(clip["start"])
        groups["seams"].append({"group": f"{clips[index-1]['id']} → {clip['id']} {clip['scene']}",
            "clipId": clip["id"], "centerFrame": center,
            "frames": [clamp(center + d) for d in (-15, 0, 15)],
            "samplePositions": ["−0.5s", "seam", "+0.5s"]})
    for clip in clips:
        for seconds in PAPER_SWITCHES.get(clip["id"], []):
            # First actual video frame at or after the cue (cues use elapsed >= at).
            center = int(clip["start"]) + math.ceil(seconds * fps)
            groups["paper_switches"].append({"group": f"{clip['id']} paper +{seconds:.3f}s",
                "clipId": clip["id"], "cueSeconds": seconds, "centerFrame": center,
                "frames": [clamp(center + d) for d in (-10, 0, 10)],
                "samplePositions": ["−10 frames", "cue", "+10 frames"]})
    frames = sorted({f for category in groups.values() for group in category for f in group["frames"]})
    return groups, frames


def number(value: Any) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def loudness_summary(log: str) -> dict:
    # ebur128 prints the final measurement after 'Summary:'; earlier values are running totals.
    tail = log.rsplit("Summary:", 1)[-1] if "Summary:" in log else ""
    patterns = {"integratedLUFS": r"\bI:\s*([-+\d.]+)\s+LUFS",
                "loudnessRangeLU": r"\bLRA:\s*([-+\d.]+)\s+LU",
                "truePeakDBTP": r"\bPeak:\s*([-+\d.]+)\s+dBFS"}
    result = {key: number(match.group(1)) if (match := re.search(pattern, tail)) else None
              for key, pattern in patterns.items()}
    result["measurement"] = "FFmpeg ebur128 true peak on the final MP4 decoded audio"
    return result


def make_contact_sheets(out: Path, groups: dict[str, list[dict]], paths: dict[int, Path]) -> list[str]:
    from PIL import Image, ImageDraw, ImageFont

    font_paths = [Path("C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/segoeui.ttf"),
                  Path("C:/Windows/Fonts/arial.ttf")]
    font_path = next((p for p in font_paths if p.exists()), None)
    font = ImageFont.truetype(str(font_path), 23) if font_path else ImageFont.load_default(size=23)
    small = ImageFont.truetype(str(font_path), 18) if font_path else ImageFont.load_default(size=18)
    thumb_w, thumb_h, gutter, label_h, header_h = 640, 360, 12, 65, 76
    sheet_paths: list[str] = []
    sheet_dir = out / "contact-sheets"
    sheet_dir.mkdir()
    for category, rows in groups.items():
        for page_start in range(0, len(rows), 3):
            page = rows[page_start:page_start + 3]
            width = gutter + 3 * (thumb_w + gutter)
            height = header_h + len(page) * (thumb_h + label_h + gutter)
            image = Image.new("RGB", (width, height), "#071721")
            draw = ImageDraw.Draw(image)
            page_number = page_start // 3 + 1
            draw.text((gutter, 10), f"V11 · {category} · page {page_number}", font=font, fill="#e9f1ed")
            draw.text((gutter, 43), "Final MP4 samples · frames are 0-based · visual review pending", font=small, fill="#a6bdc9")
            for row_index, group in enumerate(page):
                y = header_h + row_index * (thumb_h + label_h + gutter)
                for column, frame in enumerate(group["frames"]):
                    x = gutter + column * (thumb_w + gutter)
                    with Image.open(paths[frame]) as original:
                        thumb = original.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                        image.paste(thumb, (x, y))
                    draw.text((x + 5, y + thumb_h + 4), group["group"], font=font, fill="#e9f1ed")
                    desc = f"{group['samplePositions'][column]} · {frame_seconds(frame, EXPECTED['fps'])}"
                    draw.text((x + 5, y + thumb_h + 35), desc, font=small, fill="#a6bdc9")
            path = sheet_dir / f"{category}-{page_number:02d}.jpg"
            image.save(path, quality=94, subsampling=0)
            sheet_paths.append(str(path.relative_to(out)))
    return sheet_paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--video", type=Path, required=True, help="Finished MP4, absolute or project-relative path")
    parser.add_argument("--out", type=Path, required=True, help="New/empty QA output directory, absolute or project-relative")
    args = parser.parse_args()
    video, out = resolve_project_path(args.video), resolve_project_path(args.out)
    if not video.is_file():
        parser.error(f"Video does not exist: {video}")
    if not TIMELINE.is_file():
        parser.error(f"Timeline does not exist: {TIMELINE}")
    if out.exists() and any(out.iterdir()):
        parser.error(f"Output directory must be empty; no files will be overwritten: {out}")
    for executable in ("ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            parser.error(f"Required executable is not on PATH: {executable}")
    try:
        import PIL  # noqa: F401 -- fail before any expensive work if unavailable
    except ImportError:
        parser.error("Pillow is required for contact sheets")
    out.mkdir(parents=True, exist_ok=True)
    initial_stat = video.stat()
    report: dict[str, Any] = {"schema": "physics-v11-final-qa/1", "createdUTC": datetime.now(timezone.utc).isoformat(),
        "video": str(video), "out": str(out), "expected": EXPECTED, "errors": [], "warnings": [],
        "commands": [], "humanReview": {"status": "pending", "reviewedFrames": [],
            "note": "This automated report does not certify aesthetic quality, scientific correctness, pronunciation, or sentence-level AV synchronization."}}
    report_path = out / "qa-report.json"

    def call(command: list[str], log: str) -> subprocess.CompletedProcess[str]:
        print(f"Running: {log}", flush=True)
        report["commands"].append({"argv": command, "stderrLog": log})
        result = run(command, out / log)
        report["commands"][-1]["returnCode"] = result.returncode
        save_json(report_path, report)
        return result

    try:
        timeline = json.loads(TIMELINE.read_text(encoding="utf-8-sig"))
        report["timeline"] = {"path": str(TIMELINE), "sha256": sha256(TIMELINE),
            "version": timeline.get("version"), "clips": len(timeline["clips"]),
            "fps": timeline["fps"], "frames": timeline["duration"]}
        if len(timeline["clips"]) != 17 or timeline["duration"] != EXPECTED["frames"] or timeline["fps"] != 30:
            raise ValueError("Timeline contract changed; update this QA script before claiming V11 coverage")
        probe = call(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)], "ffprobe.log")
        if probe.returncode:
            raise RuntimeError("ffprobe failed; see ffprobe.log")
        metadata = json.loads(probe.stdout)
        save_json(out / "ffprobe.json", metadata)
        videos = [s for s in metadata.get("streams", []) if s.get("codec_type") == "video"]
        audios = [s for s in metadata.get("streams", []) if s.get("codec_type") == "audio"]
        checks: dict[str, Any] = {"videoStreamCount": len(videos), "audioStreamCount": len(audios)}
        report["streamChecks"] = checks
        if len(videos) != 1 or len(audios) != 1:
            report["errors"].append(f"Expected exactly 1 video and 1 audio stream; found {len(videos)} and {len(audios)}")
        if not videos or not audios:
            raise ValueError("Cannot run audiovisual checks without video and audio streams")
        v, a = videos[0], audios[0]
        checks.update({"width": v.get("width"), "height": v.get("height"),
            "rFrameRate": v.get("r_frame_rate"), "avgFrameRate": v.get("avg_frame_rate"),
            "containerFrameCount": v.get("nb_frames"), "audioCodec": a.get("codec_name"),
            "sampleRate": a.get("sample_rate")})
        if (v.get("width"), v.get("height")) != (1920, 1080):
            report["errors"].append("Video dimensions differ from 1920×1080")
        for key in ("r_frame_rate", "avg_frame_rate"):
            if Fraction(v.get(key, "0/1")) != 30:
                report["errors"].append(f"{key} differs from 30 fps: {v.get(key)}")
        if v.get("nb_frames") not in (None, "N/A") and int(v["nb_frames"]) != 7403:
            report["errors"].append(f"Container reports {v['nb_frames']} frames, expected 7403")
        if a.get("codec_name") != "aac":
            report["errors"].append(f"Final audio codec is {a.get('codec_name')}, expected AAC")
        vd = number(v.get("duration")) or number(metadata.get("format", {}).get("duration"))
        ad = number(a.get("duration"))
        checks.update({"videoDurationSeconds": vd, "audioDurationSeconds": ad,
                       "avDurationDeltaSeconds": abs(vd - ad) if vd is not None and ad is not None else None})
        if vd is None or abs(vd - 7403 / 30) > 1 / 30:
            report["errors"].append("Video duration differs from 7403/30 seconds by more than one frame")
        if vd is not None and ad is not None and abs(vd - ad) > 2 / 30:
            report["errors"].append("Audio/video duration delta exceeds two frames")

        # A single complete video+audio decode also measures the final encoded AAC.
        decoded = call(["ffmpeg", "-hide_banner", "-nostats", "-v", "info", "-xerror",
            "-i", str(video), "-map", "0:v:0", "-map", "0:a:0", "-af",
            "ebur128=peak=true:framelog=verbose", "-progress", "pipe:1", "-stats_period", "5",
            "-fps_mode", "passthrough", "-f", "null", "-"], "full-decode-ebur128.log")
        (out / "decode-progress.log").write_text(decoded.stdout, encoding="utf-8")
        counts = re.findall(r"^frame=(\d+)\s*$", decoded.stdout, flags=re.MULTILINE)
        decoded_frames = int(counts[-1]) if counts else None
        report["fullDecode"] = {"returnCode": decoded.returncode, "frames": decoded_frames,
            "progressReachedEnd": "progress=end" in decoded.stdout, "passed": decoded.returncode == 0 and decoded_frames == 7403}
        if not report["fullDecode"]["passed"]:
            report["errors"].append("Full decode failed or decoded frame count differs from 7403; see logs")
        report["loudness"] = loudness_summary(decoded.stderr)
        loud = report["loudness"]
        if loud["integratedLUFS"] is None or loud["truePeakDBTP"] is None:
            report["errors"].append("Final loudness/true peak summary could not be measured")
        else:
            if loud["truePeakDBTP"] > -1.0:
                report["errors"].append(f"True peak {loud['truePeakDBTP']} dBTP exceeds −1 dBTP")
            if abs(loud["integratedLUFS"] - (-14)) > 1:
                report["warnings"].append(f"Integrated loudness {loud['integratedLUFS']} LUFS lies outside −14±1 LUFS")

        groups, frame_numbers = frame_groups(timeline)
        frame_dir = out / "frames"
        frame_dir.mkdir()
        # One select invocation extracts every unique 1080p frame from the final MP4.
        expression = "+".join(f"eq(n\\,{frame})" for frame in frame_numbers)
        extracted = call(["ffmpeg", "-hide_banner", "-nostats", "-v", "error", "-xerror", "-n",
            "-i", str(video), "-map", "0:v:0", "-an", "-vf", f"select='{expression}'",
            "-fps_mode", "passthrough", "-start_number", "0", "-compression_level", "3",
            str(frame_dir / "sample-%03d.png")], "extract-frames.log")
        actual_frames = sorted(frame_dir.glob("sample-*.png"))
        if extracted.returncode or len(actual_frames) != len(frame_numbers):
            raise RuntimeError(f"Frame extraction failed: {len(actual_frames)} images, expected {len(frame_numbers)}")
        paths = dict(zip(frame_numbers, actual_frames))
        report["sampling"] = {"contentSamples": sum(len(g["frames"]) for g in groups["content"]),
            "seamSamples": sum(len(g["frames"]) for g in groups["seams"]),
            "paperSwitchSamples": sum(len(g["frames"]) for g in groups["paper_switches"]),
            "uniqueFrameCount": len(frame_numbers), "groups": groups,
            "frames": [{"frame": f, "seconds": f / 30, "file": str(paths[f].relative_to(out)),
                        "sha256": sha256(paths[f])} for f in frame_numbers]}
        report["contactSheets"] = make_contact_sheets(out, groups, paths)
        print("Computing final video SHA256", flush=True)
        report["videoSHA256"] = sha256(video)
        report["videoBytes"] = initial_stat.st_size
        final_stat = video.stat()
        report["inputStableDuringQA"] = (initial_stat.st_size, initial_stat.st_mtime_ns) == (final_stat.st_size, final_stat.st_mtime_ns)
        if not report["inputStableDuringQA"]:
            report["errors"].append("Video changed during QA; this report is invalid and must be rerun after rendering")
    except Exception as exc:
        report["errors"].append(f"{type(exc).__name__}: {exc}")
    report["finishedUTC"] = datetime.now(timezone.utc).isoformat()
    report["technicalStatus"] = "failed" if report["errors"] else "passed"
    save_json(report_path, report)
    print(json.dumps({"technicalStatus": report["technicalStatus"], "report": str(report_path),
                      "errors": report["errors"], "warnings": report["warnings"],
                      "humanReview": "pending"}, ensure_ascii=False, indent=2), flush=True)
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
