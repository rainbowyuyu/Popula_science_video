"""Read-only guard for encoded black rectangles and abrupt raster changes.

Decodes every frame in the requested interval to 320x180 RGB using FFmpeg,
keeps only the current/previous rasters, and records candidates for human
review. A clean report is not evidence that anatomy, optics, geometry,
storytelling, or every transition is correct.

Uses NumPy and either OpenCV or the existing SciPy connected-component backend.
No source/public mutation, video rendering, or media overwrite occurs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

import numpy as np
from v10_review_windows import planned_transitions as manifest_planned_transitions
try:
    import cv2
    COMPONENT_BACKEND = "OpenCV 8-connected components"
except ImportError:
    cv2 = None
    from scipy.ndimage import label, find_objects
    COMPONENT_BACKEND = "SciPy 8-connected components"

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "work/output-root-v10.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def probe(video: Path) -> dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams",
         "-show_format", "-of", "json", str(video)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=True,
    )
    data = json.loads(result.stdout)
    if not data.get("streams"):
        raise RuntimeError("No video stream")
    return data


def planned_transitions(fps: float) -> list[dict[str, Any]]:
    """Actual V10 source timing; annotations never suppress a black candidate."""
    timeline = json.loads((ROOT / "src/timeline.json").read_text("utf-8"))
    manifest = json.loads((ROOT / "src/transitions-v10.json").read_text("utf-8"))
    if abs(fps - timeline["fps"]) > 1e-8:
        raise ValueError("Encoded FPS differs from actual V10 timeline")
    return manifest_planned_transitions(timeline, manifest)

def component_stats(mask):
    """Same8-neighbour areas and bounding boxes; no optional package install."""
    if cv2 is not None:
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        return count, labels, stats
    labels, foreground_count = label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    stats = np.zeros((foreground_count + 1, 5), dtype=np.int64)
    areas = np.bincount(labels.ravel(), minlength=foreground_count + 1)
    for i, box in enumerate(find_objects(labels), 1):
        if box is None:
            continue
        y, x = box
        stats[i] = [x.start, y.start, x.stop-x.start, y.stop-y.start, areas[i]]
    return foreground_count + 1, labels, stats


def black_regions(rgb: np.ndarray, source_size: tuple[int, int], threshold: int,
                  min_fraction: float) -> tuple[list[dict[str, Any]], float]:
    height, width = rgb.shape[:2]
    mask = np.all(rgb <= threshold, axis=2).astype(np.uint8)
    fraction = float(mask.mean())
    if fraction < min_fraction:
        return [], fraction
    # A few overlaid white letters do not break a large black GPU block: the
    # component keeps its bounding rectangle and tolerates small interior holes.
    count, labels, stats = component_stats(mask)
    del labels
    regions = []
    total = width * height
    for i in range(1, count):
        x, y, w, h, area = map(int, stats[i])
        fill = area / (w * h)
        if area < total * min_fraction or w < 12 or h < 8 or fill < .86:
            continue
        crop = mask[y:y + h, x:x + w]
        # Dark organic silhouettes have irregular edges. A rectangle must have
        # near-continuous pixels on at least three of its four boundary strips.
        strip = min(2, w, h)
        edges = [float(crop[:strip].mean()), float(crop[-strip:].mean()),
                 float(crop[:, :strip].mean()), float(crop[:, -strip:].mean())]
        if sum(value > .82 for value in edges) < 3:
            continue
        source_width, source_height = source_size
        source_box = [round(x * source_width / width), round(y * source_height / height),
                      round(w * source_width / width), round(h * source_height / height)]
        regions.append({"scanBoxXYWH": [x, y, w, h], "sourceBoxXYWHApprox": source_box,
                        "areaFraction": round(area / total, 6), "rectangleFill": round(fill, 5),
                        "edgeCoverage": [round(e, 5) for e in edges],
                        "classification": "full black raster" if area / total > .94
                        else "partial near-black rectangle"})
    return sorted(regions, key=lambda r: r["areaFraction"], reverse=True), fraction


def read_frame(stream, size: int) -> bytes:
    chunks = []
    remaining = size
    while remaining:
        part = stream.read(remaining)
        if not part:
            break
        chunks.append(part)
        remaining -= len(part)
    data = b"".join(chunks)
    if data and len(data) != size:
        raise RuntimeError(f"Truncated raw frame: {len(data)} / {size} bytes")
    return data


def main() -> int:
    output_root = Path(json.loads(CONFIG.read_text("utf-8"))["outputRoot"])
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, default=output_root / "delivery/彩虹为什么是弧形_V10_1080p.mp4")
    parser.add_argument("--output", type=Path, default=ROOT / "research/qa/encoded-visual-guard-v10.json")
    parser.add_argument("--start-frame", type=int, default=0)
    parser.add_argument("--end-frame", type=int, help="Inclusive; default scans entire video")
    parser.add_argument("--width", type=int, default=320)
    parser.add_argument("--height", type=int, default=180)
    parser.add_argument("--black-threshold", type=int, default=12)
    parser.add_argument("--min-region-fraction", type=float, default=.006)
    parser.add_argument("--expected-black-frame", type=int, action="append", default=[],
                        help="Detector regression assertion against explicitly supplied known failed source frames")
    args = parser.parse_args()
    video = args.video.resolve()
    if not video.is_file():
        raise FileNotFoundError(video)
    if args.output.resolve() == video:
        raise ValueError("Report cannot overwrite input media")
    if not (64 <= args.width <= 960 and 36 <= args.height <= 540):
        raise ValueError("Bounded diagnostic raster dimensions required")
    initial_stat = video.stat()
    source_hash = sha256(video)
    metadata = probe(video)
    stream = metadata["streams"][0]
    numerator, denominator = map(int, stream["avg_frame_rate"].split("/"))
    fps = numerator / denominator
    frame_count = int(stream.get("nb_frames") or round(float(metadata["format"]["duration"]) * fps))
    end = args.end_frame if args.end_frame is not None else frame_count - 1
    if args.start_frame < 0 or end < args.start_frame or end >= frame_count:
        raise ValueError(f"Invalid inclusive frame range for {frame_count} frames")
    checked_sources = ["scripts/encoded-visual-guard-v10.py", "scripts/v10_review_windows.py",
                       "src/timeline.json", "src/transitions-v10.json",
                       "src/RealityBridgeV10.tsx", "src/V10RainbowArcFilm.tsx"]
    source_hashes = {relative: sha256(ROOT / relative) for relative in checked_sources}
    expected = planned_transitions(fps)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-xerror", "-threads", "2"]
    if args.start_frame:
        command += ["-ss", f"{args.start_frame / fps:.12f}"]
    command += ["-i", str(video), "-map", "0:v:0", "-an", "-sn", "-dn",
                "-frames:v", str(end - args.start_frame + 1), "-vf",
                f"scale={args.width}:{args.height}:flags=area", "-pix_fmt", "rgb24",
                "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1"]
    started = time.monotonic()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    black = []
    changes = []
    previous = None
    decoded = 0
    max_change = {"frame": None, "meanAbsoluteRGBChange": 0.0}
    try:
        assert process.stdout is not None
        frame_bytes = args.width * args.height * 3
        while data := read_frame(process.stdout, frame_bytes):
            frame = args.start_frame + decoded
            rgb = np.frombuffer(data, dtype=np.uint8).reshape(args.height, args.width, 3)
            regions, black_fraction = black_regions(
                rgb, (int(stream["width"]), int(stream["height"])),
                args.black_threshold, args.min_region_fraction)
            if regions:
                black.append({"frame": frame, "seconds": round(frame / fps, 6),
                              "nearBlackFraction": round(black_fraction, 6), "regions": regions})
            if previous is not None:
                delta = np.abs(rgb.astype(np.int16) - previous.astype(np.int16))
                mean_change = float(delta.mean())
                changed_fraction = float((delta.max(axis=2) > 45).mean())
                if mean_change > max_change["meanAbsoluteRGBChange"]:
                    max_change = {"frame": frame, "meanAbsoluteRGBChange": round(mean_change, 5)}
                if mean_change >= 25 and changed_fraction >= .32:
                    nearest = min(expected, key=lambda e: abs(e["frame"] - frame))
                    distance = frame - nearest["frame"]
                    changes.append({"frame": frame, "seconds": round(frame / fps, 6),
                                    "meanAbsoluteRGBChange": round(mean_change, 5),
                                    "changedPixelFractionOver45": round(changed_fraction, 5),
                                    "nearestPlannedTransition": {**nearest, "deltaFrames": distance},
                                    "classification": "near planned transition; review"
                                    if abs(distance) <= 24 else "unexpected raster jump; review"})
            previous = rgb.copy()
            decoded += 1
            if decoded % 1500 == 0:
                print(f"decoded {decoded}/{end - args.start_frame + 1}; black candidates={len(black)}; jumps={len(changes)}", flush=True)
        stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
        code = process.wait(timeout=60)
        if code:
            raise RuntimeError(f"FFmpeg failed {code}: {stderr[-4000:]}")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        if process.stdout:
            process.stdout.close()
        if process.stderr:
            process.stderr.close()
    if decoded != end - args.start_frame + 1:
        raise RuntimeError(f"Decoded {decoded} frames, expected {end - args.start_frame + 1}")
    final_stat = video.stat()
    if initial_stat.st_size != final_stat.st_size or initial_stat.st_mtime_ns != final_stat.st_mtime_ns:
        raise RuntimeError("Input video changed during scan; results are not valid")
    source_changes = [relative for relative, digest in source_hashes.items()
                      if sha256(ROOT / relative) != digest]
    found = {row["frame"] for row in black}
    regression_missing = [frame for frame in args.expected_black_frame if frame not in found]
    report = {"version": "V10", "schema": "rainbow.v10.encoded-visual-guard/1", "generatedAt": datetime.now(timezone.utc).isoformat(),
              "sourceHashes": source_hashes, "sourceChangesDuringScan": source_changes,
              "plannedTransitions": expected, "inheritedV09FixedWindows": False,
              "sourceVideo": str(video), "sourceVideoSHA256": source_hash, "sourceBytes": initial_stat.st_size,
              "sourceDimensions": [int(stream["width"]), int(stream["height"])], "fps": fps,
              "inclusiveFrameRange": [args.start_frame, end], "decodedFrames": decoded,
              "scanDimensions": [args.width, args.height], "elapsedSeconds": round(time.monotonic() - started, 3),
              "method": {"nearBlackRGBThreshold": args.black_threshold, "minConnectedAreaFraction": args.min_region_fraction,
                         "connectedComponentBackend": COMPONENT_BACKEND, "connectivity": 8,
                         "minRectangleFill": .86, "minThreeEdgeCoverage": .82,
                         "jumpMeanAbsoluteRGBThreshold": 25, "jumpFractionThreshold": .32,
                         "jumpPixelDifferenceThreshold": 45, "decoding": "Every encoded frame in range; bounded rawvideo streaming; no frame skipping"},
              "blackRegionCandidates": black, "abruptChangeCandidates": changes, "maximumRasterChange": max_change,
              "regressionExpectedBlackFrames": args.expected_black_frame, "regressionMissingFrames": regression_missing,
              "status": "source-changed-during-scan" if source_changes else "regression-failed" if regression_missing else "candidates-require-review" if black or changes
              else "no-threshold-candidates", "fullSubjectivePlaybackClaimed": False,
              "limitations": ["Small or non-black corruptions can escape thresholds.",
                              "Legitimate dark rectangles and deliberate cuts can be false positives.",
                              "No candidates is not an audit of optics, geometry, occlusion, anatomy, narration or human playback.",
                              "Approximate region boxes use a downscaled raster; inspect source-frame evidence."]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"report": str(args.output), "hash": source_hash, "decodedFrames": decoded,
                      "blackCandidateFrames": sorted(found), "jumpCandidateFrames": [c["frame"] for c in changes],
                      "regressionMissingFrames": regression_missing, "status": report["status"]}, ensure_ascii=False))
    return 3 if source_changes else 2 if regression_missing else 0


if __name__ == "__main__":
    sys.exit(main())
