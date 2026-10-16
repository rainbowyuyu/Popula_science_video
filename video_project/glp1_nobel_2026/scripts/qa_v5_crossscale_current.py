"""Extract dense cross-scale samples from the current, QA-locked final MP4.

Run only after qa_final.py --revision v5 has completed successfully. This
extractor does not certify subjective motion quality or scientific accuracy.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "delivery/GLP1_V5_1080p.mp4"
TIMELINE = ROOT / "src/timeline.json"
MASTER = ROOT / "public/master.wav"
MARKER = ROOT / "tmp/final-render.json"
QA_REPORT = ROOT / "research/qa/final-v5/automatic-report.json"
OUT = ROOT / "research/qa/final-v5/crossscale-current"


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def lock_inputs():
    for path in (VIDEO, TIMELINE, MASTER, MARKER, QA_REPORT):
        require(path.is_file(), f"Required final-QA input is missing: {path}")
    qa = read_json(QA_REPORT)
    marker = read_json(MARKER)
    timeline = read_json(TIMELINE)
    require(qa.get("automaticChecksPass") is True, "Final automatic QA has not passed.")
    require(marker.get("success") is True, "Final render marker is not successful.")
    require(Path(qa["video"]).resolve() == VIDEO.resolve(), "QA report identifies another video.")
    require(Path(marker["outputLocation"]).resolve() == VIDEO.resolve(), "Render marker identifies another video.")
    require(marker.get("frames") == [0, timeline["duration"] - 1], "Render marker frame range is stale.")
    require(qa["measured"]["decodedFrames"] == timeline["duration"], "Final QA decoded another frame count.")
    require(abs(qa["measured"]["fps"] - timeline["fps"]) < 0.0001, "Final QA frame rate differs from timeline.")
    hashes = {"videoSHA256": sha(VIDEO), "timelineSHA256": sha(TIMELINE), "masterSHA256": sha(MASTER)}
    for key in ("videoSHA256", "timelineSHA256"):
        require(qa.get(key) == hashes[key], f"Final QA {key} does not match the current file.")
        require(marker.get(key) == hashes[key], f"Render marker {key} does not match the current file.")
    require(marker.get("masterSHA256") == hashes["masterSHA256"], "Render marker does not match current master.wav.")
    return qa, timeline, hashes, sha(QA_REPORT), sha(MARKER)


def build_windows(timeline, step):
    specs = [
        ("muscle-to-cell", 3500, 3650),
        ("cell-to-muscle", 4300, 4480),
        ("lcell-to-islet", 5480, 5680),
        ("islet-to-receptor", 6100, 6300),
        ("stomach-to-drug", 7050, 7220),
        ("nephron-to-meal", 14450, 14620),
        ("atrium-to-clot", 20700, 20950),
    ]
    clips = {clip["id"]: clip for clip in timeline["clips"]}
    # Also covers the initial human/organ handoff and the later cuff entry.
    for name, clip_id, before, after in [
        ("opening-person-to-organs", "h003", 90, 330),
        ("opening-intestine-entry", "h005", 90, 180),
        ("meal-to-measurement", "h086", 150, 180),
    ]:
        require(clip_id in clips, f"Required current clip is missing: {clip_id}")
        start = clips[clip_id]["start"]
        specs.append((name, start - before, start + after))
    windows = []
    repair_frames = {
        "stomach-to-drug": [7050, 7090],
        "opening-intestine-entry": [1244, 1314, 1440],
    }
    for name, first, last in specs:
        first = max(0, first)
        last = min(timeline["duration"] - 1, last)
        require(last >= first, f"Invalid current window: {name}")
        extra = repair_frames.get(name, [])
        require(all(0 <= frame < timeline["duration"] for frame in extra), f"Invalid repair frame: {name}")
        frames = sorted(set(range(first, last + 1, step)) | {last} | set(extra))
        windows.append({"name": name, "firstFrame": frames[0], "lastFrame": frames[-1],
                        "regularSamplingRange": [first, last], "additionalRepairFrames": extra,
                        "stepFrames": step, "stepSeconds": step / timeline["fps"], "frames": frames})
    return windows


def font(size):
    for path in ["C:/Windows/Fonts/NotoSansSC-VF.ttf", "C:/Windows/Fonts/arial.ttf"]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def extract_frames(frames, timeline):
    wanted = set(frames)
    capture = cv2.VideoCapture(str(VIDEO))
    require(capture.isOpened(), "Cannot open current final MP4.")
    require(round(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == timeline["duration"], "Decoder frame count does not match timeline.")
    frame_dir = OUT / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    extracted = 0
    # Sequential decoding avoids keyframe-seek ambiguity; only requested frames are saved.
    try:
        for frame in range(frames[-1] + 1):
            ok, bgr = capture.read()
            require(ok, f"Cannot decode final MP4 frame {frame}.")
            if frame in wanted:
                image = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                image.save(frame_dir / f"frame-{frame:06d}.jpg", quality=94, subsampling=0)
                extracted += 1
            if frame and frame % 3000 == 0:
                print(f"Decoded through F{frame}; saved {extracted}/{len(frames)} samples.", flush=True)
    finally:
        capture.release()
    require(extracted == len(frames), "Not every planned encoded sample was extracted.")


def contact_sheets(windows, timeline):
    sheets = []
    header_font, label_font = font(25), font(24)
    for window in windows:
        for start in range(0, len(window["frames"]), 8):
            subset = window["frames"][start:start + 8]
            canvas = Image.new("RGB", (1322, 70 + ((len(subset) + 1) // 2) * 408), "#f2eee7")
            draw = ImageDraw.Draw(canvas)
            spacing = f'every {window["stepFrames"]} frames' + (' + anchors' if window['additionalRepairFrames'] else '')
            draw.text((14, 13), f'FINAL MP4 | {window["name"]} | {spacing}',
                      font=header_font, fill="#29484a")
            for i, frame in enumerate(subset):
                x, y = 14 + (i % 2) * 654, 64 + (i // 2) * 408
                with Image.open(OUT / "frames" / f"frame-{frame:06d}.jpg") as original:
                    canvas.paste(original.resize((640, 360), Image.Resampling.LANCZOS), (x, y))
                clip_ids = [c["id"] for c in timeline["clips"] if c["start"] <= frame < c["end"]]
                draw.text((x, y + 365), f'F{frame} | {frame / timeline["fps"]:.3f}s | {" / ".join(clip_ids)}',
                          font=label_font, fill="#29484a")
            path = OUT / f'{window["name"]}-{start // 8 + 1:02d}.jpg'
            canvas.save(path, quality=94, subsampling=0)
            sheets.append(str(path.relative_to(ROOT)))
    return sheets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--step", type=int, choices=[10, 15], default=10,
                        help="Encoded-frame spacing, default 10 frames (one third second at 30 fps).")
    args = parser.parse_args()
    qa, timeline, hashes, qa_hash, marker_hash = lock_inputs()
    windows = build_windows(timeline, args.step)
    frames = sorted({frame for window in windows for frame in window["frames"]})
    OUT.mkdir(parents=True, exist_ok=True)
    extract_frames(frames, timeline)
    sheets = contact_sheets(windows, timeline)
    for key, path in [("videoSHA256", VIDEO), ("timelineSHA256", TIMELINE), ("masterSHA256", MASTER)]:
        require(sha(path) == hashes[key], f"{key} input changed during extraction.")
    require(sha(QA_REPORT) == qa_hash, "Final automatic QA report changed during extraction.")
    require(sha(MARKER) == marker_hash, "Final render marker changed during extraction.")
    manifest = {
        "createdAtUTC": datetime.now(timezone.utc).isoformat(), "video": str(VIDEO),
        **hashes, "automaticReportSHA256": qa_hash, "renderMarkerSHA256": marker_hash,
        "durationFrames": timeline["duration"], "fps": timeline["fps"],
        "qaFinishedAtUTC": qa["finishedAtUTC"], "windows": windows,
        "frames": frames, "framesExtracted": len(frames), "contactSheets": sheets,
        "subjectiveReviewCompleted": False,
        "scope": "Dense samples from the current final encoded MP4 at selected cross-scale and pose handoffs. "
                 "All video/timeline/master inputs are hash-locked. Samples do not certify continuous subjective "
                 "playback, anatomical accuracy, or absence of brief artifacts between sampled frames.",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"framesExtracted": len(frames), "contactSheets": len(sheets),
                      "manifest": str(OUT / "manifest.json"), **hashes}), flush=True)


if __name__ == "__main__":
    main()
