"""Verify the *finished* episode 3 export and prepare final-video review evidence.

Run only after render_episode3v2.mjs has completed. This script never edits the
composition, timeline, audio sources, or original MP4. Pillow is required.
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
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FRAMES = [180, 2340, 2500, 2700, 2920, 3140, 3340, 4300, 4390, 4540,
          5350, 5680, 6138, 6139, 6700, 7000, 8600, 8625, 8690, 8800, 8839]
EXPECTED_FRAMES = 8840
EXPECTED_FPS = 30


def json_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_logged(command: list[str], log: Path) -> int:
    with log.open("w", encoding="utf-8") as handle:
        result = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", check=False)
    return result.returncode


def checked(command: list[str], log: Path) -> None:
    code = run_logged(command, log)
    if code:
        raise RuntimeError(f"Command failed ({code}); see {log}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(ffprobe: str, movie: Path, out: Path) -> dict:
    result = subprocess.run([ffprobe, "-v", "error", "-show_format", "-show_streams",
                             "-of", "json", str(movie)], capture_output=True,
                            text=True, encoding="utf-8", errors="replace", check=True)
    info = json.loads(result.stdout)
    json_write(out / "ffprobe.json", info)
    return info


def make_contacts(out: Path, timeline: dict) -> list[str]:
    font_file = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_file), 21) if font_file.exists() else ImageFont.load_default()
    sheets = []
    cell_w, cell_h, gap, columns, per_sheet = 480, 304, 12, 3, 12
    for offset in range(0, len(FRAMES), per_sheet):
        batch = FRAMES[offset:offset + per_sheet]
        rows = math.ceil(len(batch) / columns)
        sheet = Image.new("RGB", (columns * cell_w + (columns + 1) * gap,
                                  rows * cell_h + (rows + 1) * gap), "#ece8df")
        draw = ImageDraw.Draw(sheet)
        for n, frame in enumerate(batch):
            x, y = gap + (n % columns) * (cell_w + gap), gap + (n // columns) * (cell_h + gap)
            with Image.open(out / f"frame-{frame:05}.jpg") as source:
                sheet.paste(source.convert("RGB").resize((480, 270), Image.Resampling.LANCZOS), (x, y))
            scene = next(s["id"] for s in timeline["scenes"] if s["start"] <= frame < s["end"])
            draw.text((x + 6, y + 277), f"f{frame} / {frame / EXPECTED_FPS:.2f}s / {scene}",
                      font=font, fill="#253d37")
        target = out / f"contact-{offset // per_sheet + 1}.jpg"
        sheet.save(target, quality=93, subsampling=0)
        sheets.append(str(target.relative_to(ROOT)))
    return sheets


def make_reel(ffmpeg: str, movie: Path, out: Path, timeline: dict, threads: int) -> dict:
    """Keep original picture and its matching original audio around all 12 cuts.

    Each 3-second excerpt is accurately sought and independently encoded. Joined
    excerpts retain original timing and sound; no replacement BGM or fades.
    """
    reel_dir = out / "transitions"
    reel_dir.mkdir(exist_ok=True)
    segments, entries = [], []
    for n, scene in enumerate(timeline["scenes"][1:]):
        first = max(0, scene["start"] - 45)
        end = min(EXPECTED_FRAMES, scene["start"] + 45)
        target = reel_dir / f"{n + 1:02}-{scene['id']}.mp4"
        checked([ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "warning",
                 "-threads", str(threads), "-ss", f"{first / EXPECTED_FPS:.9f}",
                 "-i", str(movie), "-t", f"{(end - first) / EXPECTED_FPS:.9f}",
                 "-map", "0:v:0", "-map", "0:a:0", "-vf", "scale=1280:720",
                 "-filter_threads", str(threads), "-c:v", "libx264", "-preset", "fast",
                 "-crf", "20", "-threads", str(threads), "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                 "-movflags", "+faststart", str(target)], reel_dir / f"{n + 1:02}.log")
        segments.append(target)
        entries.append({"nextScene": scene["id"], "boundaryFrame": scene["start"],
                        "firstFrame": first, "endFrameExclusive": end,
                        "reelStartSeconds": n * 3,
                        "file": str(target.relative_to(ROOT))})
    playlist = reel_dir / "concat.txt"
    playlist.write_text("\n".join(f"file '{p.name}'" for p in segments) + "\n", encoding="utf-8")
    reel = out / "all-transitions-720p.mp4"
    checked([ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "warning", "-f", "concat",
             "-safe", "0", "-i", str(playlist), "-map", "0:v:0", "-map", "0:a:0",
             "-c", "copy", "-movflags", "+faststart", str(reel)], out / "reel-concat.log")
    return {"file": str(reel.relative_to(ROOT)), "segments": entries,
            "audio": "Matching original export audio retained in each excerpt; AAC re-encoded.",
            "note": "Excerpt joins in this review reel are editorial cuts, not source-video transitions."}


def make_transition_contacts(ffmpeg: str, out: Path, reel: dict, threads: int) -> dict:
    """Sample encoded review excerpts, never invoke or rerender Three.js.

    Excerpt frames 44/45/56/66/87 correspond to boundary offsets
    -1/0/+11/+21/+42 frames, or -0.033/0/+0.367/+0.700/+1.400 seconds.
    """
    local_frames = [44, 45, 56, 66, 87]
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
    selection = "+".join(f"eq(n\\,{frame})" for frame in local_frames)
    rows = []
    for n, entry in enumerate(reel["segments"], start=1):
        segment = ROOT / entry["file"]
        prefix = out / "transitions" / f"sample-{n:02}"
        checked([ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "warning",
                 "-threads", str(threads), "-i", str(segment), "-an",
                 "-vf", f"select={selection},scale=384:216", "-filter_threads", str(threads),
                 "-fps_mode", "vfr", "-q:v", "2", "-frames:v", str(len(local_frames)),
                 str(prefix) + "-%02d.jpg"], prefix.with_suffix(".log"))
        samples = []
        for index, local_frame in enumerate(local_frames, start=1):
            source_frame = entry["firstFrame"] + local_frame
            samples.append({"excerptFrame": local_frame,
                            "correspondingSourceFrame": source_frame,
                            "secondsFromBoundary": (source_frame - entry["boundaryFrame"]) / EXPECTED_FPS,
                            "image": str(Path(str(prefix) + f"-{index:02}.jpg").relative_to(ROOT))})
        rows.append({"nextScene": entry["nextScene"], "boundaryFrame": entry["boundaryFrame"],
                     "excerpt": entry["file"], "samples": samples})
    sheets = []
    cell_w, cell_h = 384, 246
    for start in range(0, len(rows), 3):
        batch = rows[start:start + 3]
        sheet = Image.new("RGB", (cell_w * 5, cell_h * len(batch)), "#ece8df")
        draw = ImageDraw.Draw(sheet)
        for row_number, row in enumerate(batch):
            for column, sample in enumerate(row["samples"]):
                x, y = column * cell_w, row_number * cell_h
                with Image.open(ROOT / sample["image"]) as thumbnail:
                    sheet.paste(thumbnail.convert("RGB"), (x, y))
                label = (f"{row['nextScene']} | f{sample['correspondingSourceFrame']} | "
                         f"{sample['secondsFromBoundary']:+.3f}s")
                draw.text((x + 6, y + 222), label, font=font, fill="#253d37")
        target = out / f"transition-contact-{start // 3 + 1}.jpg"
        sheet.save(target, quality=94, subsampling=0)
        sheets.append(str(target.relative_to(ROOT)))
    return {"contactSheets": sheets, "sampleCount": sum(len(row["samples"]) for row in rows),
            "source": "Sampled decoded frames from the 720p excerpts of the final encoded MP4; no Three.js rendering.",
            "excerptSampleFrames": local_frames, "boundaries": rows,
            "note": "At 30 fps the requested +0.35s sample uses +11 frames (+0.3667s)."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, default=ROOT / "output/episode3/joinery_v5_1080p.mp4")
    parser.add_argument("--ffmpeg-dir", type=Path, default=Path("C:/ffmpeg/bin"))
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--reel", action="store_true", help="Also build all 12 transition excerpts and one reel.")
    args = parser.parse_args()
    movie = args.video.resolve()
    out = ROOT / "output/episode3/qa-final"
    out.mkdir(parents=True, exist_ok=True)
    report_path = ROOT / "research/episode3v2/final-media-qa.json"
    ffmpeg, ffprobe = str(args.ffmpeg_dir / "ffmpeg.exe"), str(args.ffmpeg_dir / "ffprobe.exe")
    threads = max(1, min(args.threads, 4))
    timeline = json.loads((ROOT / "src/episode3v2/timeline.json").read_text(encoding="utf-8"))
    stat_before = movie.stat()
    report = {"createdUTC": datetime.now(timezone.utc).isoformat(), "video": str(movie),
              "expected": {"frames": EXPECTED_FRAMES, "fps": EXPECTED_FPS,
                           "dimensions": [1920, 1080], "seconds": EXPECTED_FRAMES / EXPECTED_FPS},
              "subjectiveListeningChecked": False, "humanFullPlaybackChecked": False,
              "sampledVisualReview": "Pending review of final-video frames and transition reel.",
              "checks": {}}
    report["sourceFiles"] = {}
    for relative in ["src/episode3v2/World.ts", "src/episode3v2/Film.tsx",
                     "src/episode3v2/timeline.json", "public/episode3v2/timeline.json"]:
        source = ROOT / relative
        source_stat = source.stat()
        report["sourceFiles"][relative] = {
            "sha256": sha256(source), "bytes": source_stat.st_size,
            "mtimeNs": source_stat.st_mtime_ns,
            "modifiedUTC": datetime.fromtimestamp(source_stat.st_mtime, timezone.utc).isoformat()}
    checks = report["checks"]
    try:
        print("Probe finished export", flush=True)
        info = probe(ffprobe, movie, out)
        v = next(s for s in info["streams"] if s["codec_type"] == "video")
        a = next(s for s in info["streams"] if s["codec_type"] == "audio")
        report["streams"] = info["streams"]
        report["metadata"] = {"width": v["width"], "height": v["height"],
                              "fps": float(Fraction(v["avg_frame_rate"])),
                              "frames": int(v["nb_frames"]) if v.get("nb_frames", "N/A") != "N/A" else None,
                              "videoSeconds": float(v["duration"]),
                              "audioSeconds": float(a["duration"]),
                              "containerSeconds": float(info["format"]["duration"]),
                              "audioSampleRate": int(a["sample_rate"]), "audioChannels": a["channels"]}
        report["frames"] = report["metadata"]["frames"]
        report["durationSeconds"] = report["metadata"]["videoSeconds"]
        checks["dimensions"] = [v["width"], v["height"]] == [1920, 1080]
        checks["fps"] = Fraction(v["avg_frame_rate"]) == EXPECTED_FPS
        checks["videoDuration"] = abs(float(v["duration"]) - EXPECTED_FRAMES / EXPECTED_FPS) < 1 / EXPECTED_FPS
        checks["audioDuration"] = abs(float(a["duration"]) - EXPECTED_FRAMES / EXPECTED_FPS) < 0.15
        checks["containerDuration"] = abs(float(info["format"]["duration"]) - EXPECTED_FRAMES / EXPECTED_FPS) < 0.15
        print("Full decode + black-frame scan + original AAC loudness measurement", flush=True)
        progress_file = out / "decode-progress.txt"
        log_file = out / "decode-black-loudness.log"
        code = run_logged([ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-xerror",
                           "-threads", str(threads), "-i", str(movie),
                           "-map", "0:v:0", "-map", "0:a:0", "-filter_threads", str(threads),
                           "-vf", "blackdetect=d=0.1:pic_th=0.98:pix_th=0.10",
                           "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json",
                           "-progress", str(progress_file), "-f", "null", "NUL"], log_file)
        logs = log_file.read_text(encoding="utf-8", errors="replace")
        checks["completeDecode"] = code == 0
        progress = progress_file.read_text(encoding="utf-8", errors="replace") if progress_file.exists() else ""
        decoded = re.findall(r"^frame=\s*(\d+)\s*$", progress, re.MULTILINE)
        report["decodedFrames"] = int(decoded[-1]) if decoded else None
        checks["frameCount"] = report["decodedFrames"] == EXPECTED_FRAMES
        if report["metadata"]["frames"] is not None:
            checks["containerFrameCount"] = report["metadata"]["frames"] == EXPECTED_FRAMES
        checks["decodeReachedEnd"] = "progress=end" in progress
        black = [{"startSeconds": float(s), "endSeconds": float(e), "durationSeconds": float(d)}
                 for s, e, d in re.findall(r"black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)", logs)]
        report["blackSegmentsAtLeast100ms"] = black
        checks["noBlackSegmentsAtLeast100ms"] = not black
        loud_blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}', logs)
        if loud_blocks:
            loud = json.loads(loud_blocks[-1])
            report["loudnormFullOutput"] = loud
            report["originalAACMeasurement"] = {
                "integratedLUFS": float(loud["input_i"]), "truePeakDbTP": float(loud["input_tp"]),
                "loudnessRangeLU": float(loud["input_lra"]), "thresholdLUFS": float(loud["input_thresh"]),
                "note": "Measured INPUT AAC; output_* fields describe hypothetical loudnorm output and are not export measurements."}
            checks["loudnessMeasured"] = all(math.isfinite(report["originalAACMeasurement"][k])
                                             for k in ["integratedLUFS", "truePeakDbTP", "loudnessRangeLU"])
            checks["truePeakAtMostMinus1dBTP"] = report["originalAACMeasurement"]["truePeakDbTP"] <= -1
            checks["loudnessWithinTargetTolerance"] = -16.5 <= report["originalAACMeasurement"]["integratedLUFS"] <= -13.5
        else:
            checks["loudnessMeasured"] = False
        json_write(report_path, report)
        if code:
            raise RuntimeError(f"Full media decode failed; see {log_file}")
        print(f"Extract {len(FRAMES)} exact numbered frames", flush=True)
        selection = "+".join(f"eq(n\\,{frame})" for frame in FRAMES)
        checked([ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "warning",
                 "-threads", str(threads), "-i", str(movie), "-an", "-vf", "select=" + selection,
                 "-filter_threads", str(threads), "-fps_mode", "vfr", "-q:v", "2",
                 "-frames:v", str(len(FRAMES)), str(out / "selected-%03d.jpg")], out / "frame-extract.log")
        for n, frame in enumerate(FRAMES, start=1):
            (out / f"selected-{n:03}.jpg").replace(out / f"frame-{frame:05}.jpg")
        report["exactSampleFrames"] = FRAMES
        report["contactSheets"] = make_contacts(out, timeline)
        checks["sampleFramesExtracted"] = all((out / f"frame-{f:05}.jpg").exists() for f in FRAMES)
        if args.reel:
            print("Build 12 transition excerpts with corresponding original audio", flush=True)
            report["transitionReel"] = make_reel(ffmpeg, movie, out, timeline, threads)
            print("Sample 60 transition frames into four contact sheets", flush=True)
            report["transitionFrameReview"] = make_transition_contacts(ffmpeg, out, report["transitionReel"], threads)
            checks["transitionSamplesExtracted"] = report["transitionFrameReview"]["sampleCount"] == 60
        stat_after = movie.stat()
        checks["sourceFileStableDuringQA"] = (stat_before.st_size, stat_before.st_mtime_ns) == (stat_after.st_size, stat_after.st_mtime_ns)
        report["sha256"] = sha256(movie)
        report["videoSha256"] = report["sha256"]
        report["fileBytes"] = stat_after.st_size
        report["videoMtimeNs"] = stat_after.st_mtime_ns
        report["videoModifiedUTC"] = datetime.fromtimestamp(stat_after.st_mtime, timezone.utc).isoformat()
        report["automatedChecksPassed"] = all(checks.values())
        json_write(report_path, report)
        print(json.dumps({"report": str(report_path), "automatedChecksPassed": report["automatedChecksPassed"],
                          "checks": checks, "originalAACMeasurement": report.get("originalAACMeasurement"),
                          "evidence": str(out)}, ensure_ascii=False, indent=2), flush=True)
        return 0 if report["automatedChecksPassed"] else 1
    except Exception as exc:
        report["automatedChecksPassed"] = False
        report["error"] = f"{type(exc).__name__}: {exc}"
        json_write(report_path, report)
        print(f"QA failed: {exc}\nReport: {report_path}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
