"""Stream every decoded frame of a completed V13 film into review candidates.

Independent, CPU-only offline analysis. Never renders, modifies video, or changes
the active renderer/source audit. Pixel changes are candidates for human review,
not automatic aesthetic failures. Scaled-frame equality is not a proof that two
native full-resolution frames are identical. No paid/network calls are made.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_FRAMES, EXPECTED_FPS = 10702, 30
SAMPLE_WIDTH, SAMPLE_HEIGHT = 192, 108
NEAR_BOUNDARY_FRAMES = 24


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def file_state(path: Path):
    stat = path.stat()
    return {"bytes": stat.st_size, "mtimeNs": stat.st_mtime_ns}


def frame_round(seconds: float) -> int:
    # Timeline.ts uses Math.round on nonnegative seconds, not bankers rounding.
    return math.floor(float(seconds) * EXPECTED_FPS + .5)


def read_exact(stream, size: int) -> bytes:
    """Pipe reads can be short without EOF; accumulate one bounded frame."""
    chunks, count = [], 0
    while count < size:
        chunk = stream.read(size - count)
        if not chunk:
            break
        chunks.append(chunk)
        count += len(chunk)
    return b"".join(chunks)


def timecode(frame: int) -> str:
    seconds, sub = divmod(frame, EXPECTED_FPS)
    minutes, second = divmod(seconds, 60)
    return f"{minutes:02}:{second:02}:{sub:02}"


def load_context(timeline, bridges):
    scenes = []
    for index, scene in enumerate(timeline["scenes"]):
        start = frame_round(scene["start"])
        end = (frame_round(timeline["scenes"][index + 1]["start"])
               if index + 1 < len(timeline["scenes"]) else EXPECTED_FRAMES)
        scenes.append({"id": scene["id"], "start": start, "endExclusive": end})
    scene_starts = {scene["id"]: scene["start"] for scene in scenes}
    clip_starts = {clip["id"]: frame_round(clip["start"])
                   for clip in timeline["clips"]}
    prepared = []
    for bridge in bridges["clips"]:
        anchor = bridge["anchor"]
        if anchor["kind"] == "frame":
            base = 0
        elif anchor["kind"] == "scene":
            base = scene_starts[anchor["id"]]
        elif anchor["kind"] == "clip":
            base = clip_starts[anchor["id"]]
        else:
            raise RuntimeError("Unsupported bridge anchor")
        start = base + anchor["offsetFrames"]
        prepared.append({"id": bridge["id"], "nominalStart": start,
                         "frames": bridge["frames"],
                         "transition": bridge["transition"],
                         "requiresForegroundMist": bridge.get("requiresForegroundMist")})
    # Mirrors bridgeLayersAtV12: predecessor has native nominal end == start.
    for bridge in prepared:
        has_previous = any(other is not bridge and
                           other["nominalStart"] + other["frames"] == bridge["nominalStart"]
                           for other in prepared)
        transition = bridge["transition"]
        shift = min(transition["overlapFrames"], transition["enterFrames"]) if has_previous else 0
        bridge["start"] = bridge["nominalStart"] - shift
        bridge["endExclusive"] = bridge["start"] + bridge["frames"]
        bridge["enterEnd"] = bridge["start"] + transition["enterFrames"]
        bridge["exitStart"] = bridge["endExclusive"] - transition["exitFrames"]
    caption_changes = sorted({frame_round(caption[key]) for caption in timeline["captions"]
                              for key in ("start", "end")})
    return scenes, prepared, caption_changes


def annotate(frame, scenes, bridges, caption_changes):
    scene = next((scene["id"] for scene in scenes
                  if scene["start"] <= frame < scene["endExclusive"]), None)
    boundaries = []
    for candidate in scenes:
        for kind, boundary in (("enter", candidate["start"]), ("exit", candidate["endExclusive"])):
            if abs(frame - boundary) <= NEAR_BOUNDARY_FRAMES:
                boundaries.append({"kind": kind, "scene": candidate["id"],
                                   "boundary": boundary, "offset": frame - boundary})
    active, nearby = [], []
    for bridge in bridges:
        start, end = bridge["start"], bridge["endExclusive"]
        if start <= frame < end:
            active.append({"id": bridge["id"], "sourceFrameZeroBased": frame - start,
                           "phase": ("enter" if frame < bridge["enterEnd"] else
                                     "exit" if frame >= bridge["exitStart"] else "native-middle")})
        for kind, boundary in (("start", start), ("enterEnd", bridge["enterEnd"]),
                               ("exitStart", bridge["exitStart"]), ("endExclusive", end)):
            if abs(frame - boundary) <= NEAR_BOUNDARY_FRAMES:
                nearby.append({"id": bridge["id"], "kind": kind,
                               "boundary": boundary, "offset": frame - boundary})
    caption_near = [value for value in caption_changes if abs(frame - value) <= 1]
    peaks = [{"kind": kind, "frame": value, "offset": frame - value}
             for kind, value in (("camera-translation-peak", 7157),
                                 ("camera-rotation-peak", 7661),
                                 ("fish-bone-rotation-peak", 8481))
             if abs(frame - value) <= NEAR_BOUNDARY_FRAMES]
    return {"scene": scene, "sceneBoundaryNearby": boundaries,
            "bridgeLayers": active, "bridgeBoundaryNearby": nearby,
            "captionChangeNearby": caption_near, "knownSourcePeakNearby": peaks}


def summary(values):
    data = np.asarray(values, dtype=np.float64)
    return {"count": int(data.size), "mean": float(np.mean(data)),
            "median": float(np.median(data)), "p90": float(np.percentile(data, 90)),
            "p95": float(np.percentile(data, 95)), "p99": float(np.percentile(data, 99)),
            "max": float(np.max(data)), "min": float(np.min(data))}


def ranked_candidates(values, limit, minimum_spacing, metric, scenes, bridges, caption_changes):
    indices = np.argsort(np.asarray(values))[::-1]
    selected = []
    for index in indices:
        frame = int(index) + 1  # Difference refers to previous -> current frame.
        if all(abs(frame - row["frame"]) >= minimum_spacing for row in selected):
            selected.append({"frame": frame, "previousFrame": frame - 1,
                             "timecode": timecode(frame), "seconds": frame / EXPECTED_FPS,
                             "metric": metric, "value": float(values[index]),
                             "reviewFrames": sorted({max(0, frame - 2), frame - 1, frame,
                                                     min(EXPECTED_FRAMES - 1, frame + 1),
                                                     min(EXPECTED_FRAMES - 1, frame + 2)}),
                             "context": annotate(frame, scenes, bridges, caption_changes)})
            if len(selected) >= limit:
                break
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, help="Default: configured V13 delivery MP4")
    parser.add_argument("--record", type=Path, default=ROOT / "research/qa-v13/render-start-v13.json")
    parser.add_argument("--report", type=Path,
                        default=ROOT / "research/qa-v13/motion-content-film-v13.json")
    parser.add_argument("--top", type=int, default=24, help="Candidates per metric, 1–100")
    parser.add_argument("--spacing", type=int, default=12,
                        help="Minimum frame separation per candidate list, 1–120")
    args = parser.parse_args()
    if not 1 <= args.top <= 100 or not 1 <= args.spacing <= 120:
        raise RuntimeError("Candidate parameters outside bounded range")
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe are required on PATH")
    record_path = args.record.resolve()
    record_bytes = record_path.read_bytes()
    record = json.loads(record_bytes)
    if record.get("version") != "V13" or record.get("status") != "completed":
        raise RuntimeError("Refusing motion decode before V13 render-record is completed")
    configured = read_json(ROOT / "work/output-root-v13.json")
    video = (args.video or Path(configured["outputRoot"]) /
             "delivery/彩虹为什么是弧形_V13_1080p.mp4").resolve()
    if video != Path(record["output"]).resolve():
        raise RuntimeError("Video is not the output named by completed render-record")
    if not video.is_file() or video.stat().st_size == 0:
        raise RuntimeError("Completed video is absent or empty")
    before_state = file_state(video)
    video_hash = sha256(video)
    if video_hash != record.get("videoSHA256"):
        raise RuntimeError("Completed render-record videoSHA256 does not match delivery")
    timeline_path, bridge_path = ROOT / "src/timeline.json", ROOT / "src/transitions-v11.json"
    timeline, bridge_data = read_json(timeline_path), read_json(bridge_path)
    if timeline.get("duration") != EXPECTED_FRAMES or timeline.get("fps") != EXPECTED_FPS:
        raise RuntimeError("Timeline must remain exactly10702frames at30fps")
    if timeline.get("timeUnit") != "seconds" or bridge_data.get("version") != "V13":
        raise RuntimeError("Unexpected timeline time units or bridge version")
    scenes, bridges, caption_changes = load_context(timeline, bridge_data)
    if scenes[0]["start"] != 0 or scenes[-1]["endExclusive"] != EXPECTED_FRAMES:
        raise RuntimeError("Scene coverage does not match all film frames")
    input_hashes = [{"file": str(path), "sha256": sha256(path)}
                    for path in (timeline_path, bridge_path, Path(__file__).resolve())]
    locked_hashes = {row["file"]: row["sha256"] for row in record.get("sourceHashes", [])}
    for path in (timeline_path, bridge_path):
        key = path.relative_to(ROOT).as_posix()
        if key not in locked_hashes or sha256(path) != locked_hashes[key]:
            raise RuntimeError("Context is not the frozen render source: " + key)
    if Path(__file__).resolve().relative_to(ROOT).as_posix() in locked_hashes:
        raise RuntimeError("Independent audit must not be part of active sourceHashes")

    metadata_result = subprocess.run([ffprobe, "-v", "error", "-select_streams", "v:0",
                                      "-show_streams", "-of", "json", str(video)],
                                     capture_output=True, encoding="utf-8", errors="replace", check=True)
    metadata = json.loads(metadata_result.stdout)["streams"][0]
    if (metadata.get("width"), metadata.get("height")) != (1920, 1080):
        raise RuntimeError("Completed video is not1920×1080")
    if Fraction(metadata["avg_frame_rate"]) != EXPECTED_FPS:
        raise RuntimeError("Completed video is not native30fps")
    if int(metadata.get("nb_frames", -1)) != EXPECTED_FRAMES:
        raise RuntimeError("Completed container does not declare exactly10702frames")

    report_path = args.report.resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    for protected in (video, record_path, timeline_path, bridge_path,
                      ROOT / "research/qa-v13/audit-v13.json"):
        if report_path == protected.resolve():
            raise RuntimeError("Independent report cannot overwrite protected source/video/record")
    csv_path = report_path.with_suffix(".frames.csv")
    stderr_path = report_path.with_suffix(".ffmpeg.stderr.txt")
    csv_pending = csv_path.with_suffix(csv_path.suffix + ".pending")
    if csv_pending.exists():
        raise RuntimeError("Pending CSV exists; inspect previous interrupted audit")
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-hwaccel", "none",
               "-threads", "2", "-i", str(video), "-map", "0:v:0", "-an", "-sn", "-dn",
               "-filter_threads", "1", "-vf", f"scale={SAMPLE_WIDTH}:{SAMPLE_HEIGHT}:flags=area,format=rgb24",
               "-fps_mode", "passthrough", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
    arrays = {key: [] for key in ("rgbMAD", "lumaMAD", "lumaMeanJump", "maxTileMAD", "changedPixelFraction")}
    luma_values, black_values, white_values = [], [], []
    duplicate_runs, run_start = [], None
    frame_bytes, count, previous, previous_luma, previous_mean = SAMPLE_WIDTH * SAMPLE_HEIGHT * 3, 0, None, None, None
    decoded_chain = hashlib.sha256()
    with stderr_path.open("wb") as errors, csv_pending.open("w", newline="", encoding="utf-8") as csv_file:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, bufsize=frame_bytes * 2)
        try:
            writer = csv.DictWriter(csv_file, fieldnames=["frame", "timecode", "scene", "bridgeLayers",
                      "scaledRGBSHA256", "lumaMean", "blackPixelFraction", "whitePixelFraction",
                      "rgbMAD", "lumaMAD", "lumaMeanJump", "maxTileMAD", "changedPixelFraction",
                      "scaledIdenticalToPrevious"])
            writer.writeheader()
            while True:
                raw = read_exact(process.stdout, frame_bytes)
                if not raw:
                    break
                if len(raw) != frame_bytes:
                    raise RuntimeError("FFmpeg ended with a partial raw frame")
                if count >= EXPECTED_FRAMES:
                    raise RuntimeError("Actual decode contains more than10702frames")
                decoded_chain.update(raw)
                digest = hashlib.sha256(raw).hexdigest()
                current = np.frombuffer(raw, dtype=np.uint8).reshape(SAMPLE_HEIGHT, SAMPLE_WIDTH, 3)
                floating = current.astype(np.float32)
                luma = floating[:, :, 0] * .2126 + floating[:, :, 1] * .7152 + floating[:, :, 2] * .0722
                luma_mean = float(np.mean(luma))
                black, white = float(np.mean(luma < 6)), float(np.mean(luma > 249))
                luma_values.append(luma_mean); black_values.append(black); white_values.append(white)
                context = annotate(count, scenes, bridges, caption_changes)
                row = {"frame": count, "timecode": timecode(count), "scene": context["scene"],
                       "bridgeLayers": ";".join(item["id"] for item in context["bridgeLayers"]),
                       "scaledRGBSHA256": digest, "lumaMean": luma_mean,
                       "blackPixelFraction": black, "whitePixelFraction": white}
                if previous is not None:
                    delta = np.abs(current.astype(np.int16) - previous.astype(np.int16))
                    pixel_mad = np.mean(delta, axis=2)
                    #12 fixed4×3 regions; one strong local replacement can be masked by global MAD.
                    tiles = pixel_mad.reshape(3, SAMPLE_HEIGHT // 3, 4, SAMPLE_WIDTH // 4).mean(axis=(1, 3))
                    metrics = {"rgbMAD": float(np.mean(delta)),
                               "lumaMAD": float(np.mean(np.abs(luma - previous_luma))),
                               "lumaMeanJump": abs(luma_mean - previous_mean),
                               "maxTileMAD": float(np.max(tiles)),
                               "changedPixelFraction": float(np.mean(np.max(delta, axis=2) >= 12))}
                    for key, value in metrics.items():
                        arrays[key].append(value)
                    same = bool(np.array_equal(current, previous))
                    if same and run_start is None:
                        run_start = count - 1
                    elif not same and run_start is not None:
                        duplicate_runs.append({"start": run_start, "endInclusive": count - 1,
                                               "frames": count - run_start})
                        run_start = None
                    row.update(metrics); row["scaledIdenticalToPrevious"] = int(same)
                writer.writerow(row)
                previous, previous_luma, previous_mean = current, luma, luma_mean
                count += 1
                if count % 1800 == 0:
                    print(json.dumps({"decodedFrames": count, "expectedFrames": EXPECTED_FRAMES}), flush=True)
            if process.wait(timeout=30) != 0:
                raise RuntimeError("FFmpeg decode failed; inspect independent stderr file")
        finally:
            if process.poll() is None:
                process.kill(); process.wait(timeout=30)
            if process.stdout:
                process.stdout.close()
    if run_start is not None:
        duplicate_runs.append({"start": run_start, "endInclusive": count - 1, "frames": count - run_start})
    if count != EXPECTED_FRAMES or any(len(values) != EXPECTED_FRAMES - 1 for values in arrays.values()):
        raise RuntimeError("Actual full frame/pair coverage incomplete")
    # Check record, source context and film bytes again before naming a final report.
    if record_path.read_bytes() != record_bytes or file_state(video) != before_state or sha256(video) != video_hash:
        raise RuntimeError("Video or completed render-record changed during streamed audit")
    if any(sha256(Path(row["file"])) != row["sha256"] for row in input_hashes):
        raise RuntimeError("Audit script or context changed during decode")
    csv_pending.replace(csv_path)
    for run in duplicate_runs:
        run.update(seconds=run["frames"] / EXPECTED_FPS,
                   startTimecode=timecode(run["start"]), endTimecode=timecode(run["endInclusive"]),
                   context=annotate(run["start"], scenes, bridges, caption_changes))
    candidates = {key: ranked_candidates(values, args.top, args.spacing, key, scenes, bridges, caption_changes)
                  for key, values in arrays.items()}
    by_scene = {}
    for scene in scenes:
        start, end = max(1, scene["start"]), scene["endExclusive"]
        by_scene[scene["id"]] = {key: summary(values[start - 1:end - 1]) for key, values in arrays.items()}
    result = {"version": "V13", "createdUTC": datetime.now(timezone.utc).isoformat(),
              "status": "analysis-complete-review-required", "technicalCoveragePassed": True,
              "aestheticPassed": None, "humanPlaybackChecked": False,
              "scope": "All actual decoded frames/pairs; CPU scaled-image signal review candidates only. Does not prove visibility, absence of object occlusion, native-frame identity or smooth perceived motion.",
              "video": {"file": str(video), "sha256": video_hash, "stat": before_state,
                        "width": 1920, "height": 1080, "fps": 30, "frames": count},
              "renderRecord": {"file": str(record_path), "sha256": hashlib.sha256(record_bytes).hexdigest(),
                               "status": record["status"], "completedUTC": record.get("completedUTC")},
              "inputHashes": input_hashes,
              "coverage": {"actualFrames": count, "firstFrame": 0, "lastFrame": count - 1,
                           "adjacentPairs": count - 1, "firstPair": [0, 1], "lastPair": [count - 2, count - 1],
                           "allFramesDecodedForward": True, "frameRateFilterUsed": False,
                           "frameLimitUsed": False, "decodedScaledRGBChainSHA256": decoded_chain.hexdigest()},
              "sample": {"width": SAMPLE_WIDTH, "height": SAMPLE_HEIGHT, "format": "rgb24",
                         "scale": "area", "luma": "BT709 weights applied to decoded RGB for analysis, not calibrated display luminance",
                         "unit": "0–255 code-value pixel differences", "hardwareDecode": False,
                         "retainedFullFrames": 2, "metricsCSV": str(csv_path), "metricsCSVSHA256": sha256(csv_path),
                         "ffmpegCommand": command, "ffmpegStderr": str(stderr_path)},
              "summary": {key: summary(value) for key, value in arrays.items()},
              "visibilitySignals": {"lumaMean": summary(luma_values), "blackPixelFraction": summary(black_values),
                                    "whitePixelFraction": summary(white_values),
                                    "framesAbove98PercentNearBlack": [i for i, value in enumerate(black_values) if value > .98],
                                    "framesAbove98PercentNearWhite": [i for i, value in enumerate(white_values) if value > .98]},
              "scaledIdenticalFrameRuns": duplicate_runs,
              "longestScaledIdenticalRunFrames": max((row["frames"] for row in duplicate_runs), default=0),
              "sceneRanges": scenes, "bridgeRanges": bridges, "perSceneSummary": by_scene,
              "candidateMinimumSpacingFrames": args.spacing, "topCandidates": candidates,
              "interpretation": ["Ranks are review priorities; no threshold auto-fails a designed transition or moving camera.",
                                 "Low-resolution exact equality may miss native detail; repeated runs are candidates, not proof of duplicate source frames.",
                                 "Labels and subtitles can produce local jumps; context marks nearby caption changes.",
                                 "All candidate frame indices are zero-based final delivery decode, and mean previous→current changes.",
                                 "Content visibility requires final-frame visual inspection; these signals do not identify hidden objects."]}
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(report_path), "videoSHA256": video_hash,
                      "actualFrames": count, "adjacentPairs": count - 1,
                      "longestScaledIdenticalRunFrames": result["longestScaledIdenticalRunFrames"],
                      "aestheticPassed": None}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(json.dumps({"auditError": type(error).__name__, "message": str(error)}, ensure_ascii=False),
              file=sys.stderr)
        raise SystemExit(2)
