"""Plan or extract final encoded V5 repair-boundary samples, CPU only.

Default invocation prints a read-only plan. --execute requires fresh successful
automatic QA for a new final MP4, then writes a SHA-specific, non-overwriting
extraction. Contact sheets never contain more than eight frames. Extraction
does not certify subjective smoothness; the images must actually be reviewed.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "delivery/GLP1_V5_1080p.mp4"
TIMELINE = ROOT / "src/timeline.json"
QA_REPORT = ROOT / "research/qa/final-v5/automatic-report.json"
OUTPUT_ROOT = ROOT / "research/qa/final-v5/final-boundary-motion"
BASELINE_SHA = "6d77b4522f419fa56ba01cfc3abe89ccf2a31b6905c0e3e9857293dc537e8e7c"
LOCKED_TIMELINE_SHA = "0ef7997628a5c9d86e8364da053e803ec38b1a34d69b0db24d7b49f9bcd6819d"
SPECS = [
    ("wardrobe-blend", 3520, 3542, 1,
     "Inspect every frame around the previous F3526 teal-to-white switch."),
    ("vascular-mode-blend", 21325, 21348, 1,
     "Inspect every frame around the previous F21337 vessel-to-plaque hard cut."),
    ("clot-to-atrium-surface", 20535, 20585, 5,
     "Inspect ventricular-wall clearance, retained vessel and whole-heart return."),
    ("clot-to-brainheart-surface", 21670, 21730, 5,
     "Inspect ventricular-wall clearance without removing useful anatomy context."),
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    require(path.is_file(), f"Required input missing: {path}")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def build_windows(timeline):
    require(timeline["fps"] == 30 and timeline["duration"] == 25621,
            "These fixed repair boundaries require the locked 30 fps / 25621-frame timeline.")
    windows = []
    for name, first, last, step, purpose in SPECS:
        core = list(range(first, last + 1, step))
        require(core[-1] == last, f"Sampling must include the last repair frame: {name}")
        context = [first - offset for offset in (30, 20, 10, 5)]
        context += [last + offset for offset in (5, 10, 20, 30)]
        require(min(context) >= 0 and max(context) < timeline["duration"],
                f"Repair context leaves the video: {name}")
        windows.append({"name": name, "kind": "repair-core", "range": [first, last],
                        "stepFrames": step, "frames": core, "purpose": purpose})
        windows.append({"name": name + "-context", "kind": "before-after-context",
                        "coreRange": [first, last], "frames": context,
                        "purpose": "One second of surrounding context on each side; " + purpose})
    return windows


def lock_for_execution(video_sha, timeline_sha, timeline):
    require(video_sha != BASELINE_SHA,
            "Refusing the known pre-repair final video. Install the new final MP4 and run automatic QA first.")
    qa = read_json(QA_REPORT)
    require(qa.get("automaticChecksPass") is True, "Final automatic QA has not passed.")
    require(Path(qa.get("video", "")).resolve() == VIDEO.resolve(),
            "Automatic QA identifies another video.")
    require(qa.get("videoSHA256") == video_sha, "Automatic QA is stale for the current final MP4.")
    require(qa.get("timelineSHA256") == timeline_sha, "Automatic QA uses another timeline.")
    require(qa.get("videoBytes") == VIDEO.stat().st_size, "Automatic QA video byte count is stale.")
    require(qa.get("measured", {}).get("decodedFrames") == timeline["duration"],
            "Automatic QA did not decode the required frame count.")
    require(abs(qa.get("measured", {}).get("fps", 0) - timeline["fps"]) < .0001,
            "Automatic QA frame rate differs from the timeline.")
    require(qa.get("expected", {}).get("frames") == timeline["duration"],
            "Automatic QA expected frame count differs from the timeline.")
    require(qa.get("measured", {}).get("width") == 1920
            and qa.get("measured", {}).get("height") == 1080,
            "Automatic QA must identify the 1920x1080 final export.")
    return qa, sha(QA_REPORT)


def font(size):
    from PIL import ImageFont
    for candidate in ("C:/Windows/Fonts/NotoSansSC-VF.ttf", "C:/Windows/Fonts/arial.ttf"):
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size=size)


def extract_frames(out, frames, timeline):
    import cv2
    from PIL import Image
    # CAP_FFMPEG is the normal software decoder here; no GPU surface is used.
    capture = cv2.VideoCapture(str(VIDEO), cv2.CAP_FFMPEG)
    require(capture.isOpened(), "Cannot open the final MP4 using the CPU decoder.")
    require(round(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == timeline["duration"],
            "CPU decoder metadata differs from the locked timeline.")
    frame_dir = out / "frames"
    frame_dir.mkdir()
    wanted, records = set(frames), []
    try:
        # Decode sequentially to avoid keyframe-seeking ambiguity.
        for number in range(frames[-1] + 1):
            ok, bgr = capture.read()
            require(ok, f"Cannot decode final encoded frame {number}.")
            if number in wanted:
                require(bgr.shape[:2] == (1080, 1920), "Decoded frame dimensions changed.")
                file = frame_dir / f"frame-{number:06d}.jpg"
                Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).save(
                    file, quality=95, subsampling=0)
                records.append({"frame": number, "seconds": number / timeline["fps"],
                                "path": file.relative_to(ROOT).as_posix(), "sha256": sha(file)})
            if number and number % 3000 == 0:
                print(f"Decoded through F{number}; saved {len(records)}/{len(frames)} samples.", flush=True)
    finally:
        capture.release()
    require([r["frame"] for r in records] == frames, "Incomplete repair-boundary extraction.")
    return records


def contact_sheets(out, windows, timeline, video_sha):
    from PIL import Image, ImageDraw
    records = []
    for window in windows:
        for offset in range(0, len(window["frames"]), 8):
            frames = window["frames"][offset:offset + 8]
            require(1 <= len(frames) <= 8, "Invalid contact-sheet frame count.")
            page = offset // 8 + 1
            image = Image.new("RGB", (1322, 100 + ((len(frames) + 1) // 2) * 408), "#f2eee7")
            draw = ImageDraw.Draw(image)
            draw.text((14, 10), "FINAL MP4 | " + window["name"], font=font(26), fill="#29484a")
            spacing = (f'every {window["stepFrames"]} frame(s)' if "stepFrames" in window
                       else "before / after context; not continuous samples")
            draw.text((14, 49), f"SHA {video_sha[:20]} | {spacing} | visual review pending",
                      font=font(19), fill="#29484a")
            for index, frame in enumerate(frames):
                x, y = 14 + index % 2 * 654, 96 + index // 2 * 408
                with Image.open(out / "frames" / f"frame-{frame:06d}.jpg") as original:
                    image.paste(original.resize((640, 360), Image.Resampling.LANCZOS), (x, y))
                clip = next((c["id"] for c in timeline["clips"]
                             if c["start"] <= frame < c["end"]), "opening-or-coda")
                draw.text((x, y + 365), f"F{frame} | {frame / timeline['fps']:.3f}s | {clip}",
                          font=font(24), fill="#29484a")
            file = out / f"{window['name']}-{page:02d}.jpg"
            image.save(file, quality=95, subsampling=0)
            records.append({"path": file.relative_to(ROOT).as_posix(), "sha256": sha(file),
                            "window": window["name"], "frames": frames,
                            "visualReviewStatus": "pending"})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true",
                        help="Extract only after successful automatic QA for the new final MP4.")
    args = parser.parse_args()
    timeline = read_json(TIMELINE)
    timeline_sha = sha(TIMELINE)
    require(timeline_sha == LOCKED_TIMELINE_SHA, "Fixed repair-frame plan requires the unchanged locked timeline.")
    windows = build_windows(timeline)
    frames = sorted({f for w in windows for f in w["frames"]})
    require(VIDEO.is_file(), f"Final MP4 missing: {VIDEO}")
    video_sha = sha(VIDEO)
    out = OUTPUT_ROOT / video_sha
    if not args.execute:
        print(json.dumps({"mode": "read-only-plan", "videoSHA256": video_sha,
                          "timelineSHA256": timeline_sha,
                          "isNewVideo": video_sha != BASELINE_SHA,
                          "executionRequires": "A new final video and matching successful automatic-report.json.",
                          "output": str(out), "uniqueFrames": len(frames),
                          "contactSheetCount": sum((len(w["frames"]) + 7) // 8 for w in windows),
                          "windows": windows, "filesWritten": False}, indent=2))
        return
    qa, qa_sha = lock_for_execution(video_sha, timeline_sha, timeline)
    require(not out.exists(), f"Refusing to overwrite an existing SHA-bound extraction: {out}")
    started = datetime.now(timezone.utc).isoformat()
    out.mkdir(parents=True)
    extracted = extract_frames(out, frames, timeline)
    sheets = contact_sheets(out, windows, timeline, video_sha)
    require(sha(VIDEO) == video_sha, "Final MP4 changed during extraction.")
    require(sha(TIMELINE) == timeline_sha, "Timeline changed during extraction.")
    require(sha(QA_REPORT) == qa_sha, "Automatic QA report changed during extraction.")
    manifest = {"startedAtUTC": started, "finishedAtUTC": datetime.now(timezone.utc).isoformat(),
                "video": str(VIDEO), "videoSHA256": video_sha, "timelineSHA256": timeline_sha,
                "automaticReportSHA256": qa_sha, "automaticChecksPass": qa["automaticChecksPass"],
                "scriptSHA256": sha(Path(__file__)), "windows": windows,
                "frames": extracted, "contactSheets": sheets,
                "uniqueFrameCount": len(extracted), "contactSheetCount": len(sheets),
                "subjectiveReviewCompleted": False,
                "scope": "CPU extraction from the final encoded MP4. Two repair cores are sampled every frame; "
                         "two surface-return cores every five frames. Context samples are separate. "
                         "Extraction and matching hashes do not certify subjective smoothness or full-film review."}
    file = out / "manifest.json"
    file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(file), "manifestSHA256": sha(file),
                      "videoSHA256": video_sha, "frames": len(extracted),
                      "contactSheets": len(sheets), "subjectiveReviewCompleted": False}, indent=2))


if __name__ == "__main__":
    main()
