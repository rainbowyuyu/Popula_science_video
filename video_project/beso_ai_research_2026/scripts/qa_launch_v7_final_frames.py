"""Extract SHA-bound v7 review frames, WAN seams and readable interface crops.

Example:
  python scripts/qa_launch_v7_final_frames.py --plan-only
  python scripts/qa_launch_v7_final_frames.py
  python scripts/qa_launch_v7_final_frames.py --bridges research/generation/launch-v7-bridges.json

This creates evidence for a visual reviewer, not aesthetic acceptance or a claim
of continuous normal-speed viewing. Crop coordinates use the 1920x1080 canvas.
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
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def resolve(value: str | Path) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (ROOT / path).resolve()


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf8", errors="replace")
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr[-4000:]}")
    return result


def parse_box(value: str) -> tuple[int, int, int, int]:
    values = tuple(int(item) for item in value.split(","))
    if len(values) != 4:
        raise argparse.ArgumentTypeError("crop box must be x,y,width,height")
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1920 or y + height > 1080:
        raise argparse.ArgumentTypeError("crop box must stay within the 1920x1080 canvas")
    return values


def parse_window(value: str) -> tuple[float, float]:
    values = value.split("-")
    if len(values) != 2:
        raise argparse.ArgumentTypeError("web window must be START-END seconds")
    start, end = map(float, values)
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start or end > 105:
        raise argparse.ArgumentTypeError("web window must be within 0-105 seconds")
    return start, end


def bridge_windows(path: Path, fps: int, duration: int) -> tuple[list[dict], str]:
    if not path.is_file():
        specs = [{"id": "web-to-platform", "fromFrame": 900, "durationInFrames": 300},
                 {"id": "platform-to-results", "fromFrame": 2940, "durationInFrames": 300}]
        source = "Tentative 15-20s and 49-54s windows; pass the final --bridges schedule before delivery."
    else:
        data = json.loads(path.read_text("utf-8-sig"))
        if isinstance(data, dict):
            data = data.get("bridges", data.get("shots", data.get("specs", data)))
        specs = list(data.values()) if isinstance(data, dict) else data
        if not isinstance(specs, list):
            raise ValueError("bridge specification must be a list or object of bridge records")
        if isinstance(data, dict):
            specs = [dict(value, id=value.get("id", key)) for key, value in data.items() if isinstance(value, dict)]
        source = relative(path)
    records = []
    for index, spec in enumerate(specs):
        if not isinstance(spec, dict):
            continue
        raw_start = spec.get("fromFrame", spec.get("startFrame", spec.get("from")))
        if raw_start is None:
            continue
        start = int(raw_start)
        if "endFrameExclusive" in spec:
            end = int(spec["endFrameExclusive"])
        elif "toFrame" in spec:
            end = int(spec["toFrame"]) + 1
        elif "endFrame" in spec:
            end = int(spec["endFrame"]) + 1
        else:
            count = spec.get("durationInFrames", spec.get("durationFrames", spec.get("frames")))
            if count is None:
                count = round(float(spec.get("sourceDurationSeconds", spec.get("durationSeconds", spec.get("durationSec", spec.get("durationS", spec.get("duration", 5)))))) * fps)
            end = start + int(count)
        if start < 0 or end <= start or end > duration:
            raise ValueError(f"Invalid bridge frame window: {start}-{end}")
        record = {"id": str(spec.get("id", spec.get("name", f"bridge-{index + 1}"))), "startFrame": start,
                  "endFrameExclusive": end, "durationInFrames": end - start,
                  "status": spec.get("status", "unspecified"), "asset": spec.get("asset", spec.get("file"))}
        # Endpoints have near-seam (1 frame) and 12/24-frame overlap samples.
        record["frames"] = sorted({max(0, min(duration - 1, frame))
                                   for edge in (start, end) for frame in
                                   (edge - 24, edge - 12, edge - 1, edge, edge + 12, edge + 24)} |
                                  {start + (end - start) // 2})
        records.append(record)
    return records, source


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", default="output/ai_engineer_launch_v7_1080p60.mp4")
    parser.add_argument("--story", default="src/launch-v7-story.json")
    parser.add_argument("--bridges", default="research/generation/launch-v7-bridges.json",
                        help="final schedule with fromFrame and durationFrames/durationInFrames (or durationSeconds)")
    parser.add_argument("--output", default="research/qa/launch-v7-final-frames")
    parser.add_argument("--frames", default="", help="extra comma-separated absolute frame numbers")
    parser.add_argument("--web-window", type=parse_window, action="append",
                        help="repeatable START-END seconds; defaults to 87.2-94.8")
    parser.add_argument("--web-box", type=parse_box, default=(1015, 440, 770, 415))
    parser.add_argument("--logo-box", type=parse_box, default=(1535, 10, 375, 140))
    parser.add_argument("--caption-box", type=parse_box, default=(70, 925, 1780, 155))
    parser.add_argument("--plan-only", action="store_true", help="write frame/crop plan without reading or decoding the MP4")
    args = parser.parse_args()
    video, story_path, specs_path, output = map(resolve, (args.video, args.story, args.bridges, args.output))
    story = json.loads(story_path.read_text("utf-8-sig"))
    fps, duration = story["fps"], story["duration"]
    if fps != 60 or duration != 6300:
        raise ValueError("v7 QA requires the verified 105-second / 60fps timeline")
    output.mkdir(parents=True, exist_ok=True)
    content = {0, 30, 180, 300, 5670, 5970, 6209, 6299}
    for scene in story["scenes"]:
        content.update(scene["start"] + round(scene["duration"] * fraction) for fraction in (.15, .5, .85))
        if scene["start"]:
            content.update(scene["start"] + offset for offset in (-30, -15, -1, 0, 15, 30, 60))
    if args.frames:
        extra_frames = [int(value) for value in args.frames.split(",")]
        if any(frame < 0 or frame >= duration for frame in extra_frames):
            raise ValueError("--frames contains an out-of-range frame")
        content.update(extra_frames)
    bridges, schedule_source = bridge_windows(specs_path, fps, duration)
    windows = args.web_window or [(87.2, 94.8)]
    web_frames = sorted({round(second * fps) for start, end in windows
                         for second in [start + .5 + index * .8 for index in range(math.ceil((end - start) / .8))]
                         if start <= second < end})
    frames = sorted(frame for frame in content | set(web_frames) | {f for bridge in bridges for f in bridge["frames"]}
                    if 0 <= frame < duration)
    plan = {"schema": "launch-v7-final-frame-plan-v1", "video": relative(video), "fps": fps,
            "durationInFrames": duration, "frames": frames, "bridgeSchedule": schedule_source,
            "bridges": bridges, "webWindowsSeconds": windows, "webFrames": web_frames,
            "cropBoxesXYWH": {"web": args.web_box, "logo": args.logo_box, "caption": args.caption_box},
            "timelineSHA256": sha(story_path), "bridgeSpecSHA256": sha(specs_path) if specs_path.is_file() else None,
            "acceptance": "Pending actual visual review; frame planning/extraction is not aesthetic approval."}
    (output / "qa-plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", "utf8")
    if args.plan_only:
        print(json.dumps({"plan": str(output / "qa-plan.json"), "frames": len(frames), "bridges": len(bridges),
                          "webFrames": len(web_frames)}, ensure_ascii=False))
        return 0
    if not video.is_file():
        raise FileNotFoundError(f"Final v7 MP4 missing: {video}")
    probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(video)]).stdout)
    stream = next(item for item in probe["streams"] if item.get("codec_type") == "video")
    if (stream["width"], stream["height"]) != (1920, 1080) or float(Fraction(stream["avg_frame_rate"])) != 60:
        raise ValueError("Review frames must come from the final 1920x1080 / 60fps encode")
    if abs(float(stream.get("duration", 0)) - 105) > .06:
        raise ValueError("Review frames must come from the full 105-second v7 encode")
    expression = "+".join(f"eq(n,{frame})" for frame in frames).replace(",", "\\,")
    run(["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", str(video),
         "-vf", "select=" + expression, "-fps_mode", "vfr", "-q:v", "2", str(output / "extract-%04d.jpg")])
    for index, frame in enumerate(frames, 1):
        extracted = output / f"extract-{index:04d}.jpg"
        if not extracted.is_file():
            raise RuntimeError(f"Exact frame {frame} was not extracted")
        extracted.replace(output / f"frame-{frame:06d}.jpg")
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 19) if font_path.exists() else ImageFont.load_default()

    def sheet(group: list[int], filename: str, width=640, columns=3, box=None) -> dict:
        aspect = 9 / 16 if box is None else box[3] / box[2]
        height, label_height = round(width * aspect), 30
        canvas = Image.new("RGB", (width * columns, (height + label_height) * math.ceil(len(group) / columns)), "#edf3f4")
        draw = ImageDraw.Draw(canvas)
        for index, frame in enumerate(group):
            x, y = index % columns * width, index // columns * (height + label_height)
            with Image.open(output / f"frame-{frame:06d}.jpg") as source:
                image = source.convert("RGB")
                if box:
                    bx, by, bw, bh = box
                    image = image.crop((bx, by, bx + bw, by + bh))
                canvas.paste(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
            scene = max((scene for scene in story["scenes"] if scene["start"] <= frame), key=lambda scene: scene["start"])
            draw.text((x + 8, y + height + 4), f'{frame} | {frame / fps:.3f}s | {scene["id"]}', font=font, fill="#102c3c")
        destination = output / filename
        canvas.save(destination, quality=95, subsampling=0)
        return {"file": relative(destination), "sha256": sha(destination), "frames": group, "cropBoxXYWH": box}

    def pages(group: list[int], prefix: str, width: int, columns: int, page_size: int, box=None) -> list[dict]:
        return [sheet(group[start:start + page_size], f"{prefix}-{start // page_size + 1:02d}.jpg", width, columns, box)
                for start in range(0, len(group), page_size)]

    bridge_sheets = []
    for index, bridge in enumerate(bridges):
        safe_id = re.sub(r"[^A-Za-z0-9_-]+", "-", bridge["id"]).strip("-") or str(index + 1)
        bridge_sheets.append(sheet(bridge["frames"], f"bridge-{index + 1:02d}-{safe_id}.jpg", 480, 4))
    representative = sorted(content | {frame for bridge in bridges for frame in bridge["frames"]})
    representative = [frame for frame in representative if frame in frames]
    report = {**plan, "createdUTC": datetime.now(timezone.utc).isoformat(), "videoSHA256": sha(video),
              "videoSizeBytes": video.stat().st_size,
              "frameRecords": [{"frame": frame, "file": relative(output / f"frame-{frame:06d}.jpg"),
                                "sha256": sha(output / f"frame-{frame:06d}.jpg")} for frame in frames],
              "contactSheets": pages(frames, "contact", 640, 3, 12),
              "phoneScaleSheets": pages(representative, "phone", 432, 2, 6),
              "bridgeSeamSheets": bridge_sheets,
              "webDetailSheets": pages(web_frames, "web-detail", 960, 2, 6, args.web_box),
              "logoDetailSheets": pages(representative, "logo-detail", 500, 4, 16, args.logo_box),
              "captionDetailSheets": pages(representative, "caption-detail", 1200, 1, 8, args.caption_box),
              "reviewed": False, "fullRealTimeViewingChecked": False,
              "source": "Exact selected frame numbers decoded from final encoded MP4.",
              "limitation": "Extraction/crops do not certify continuity, readable labels, geometry, listening or aesthetic quality."}
    (output / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf8")
    print(json.dumps({"manifest": str(output / "manifest.json"), "videoSHA256": report["videoSHA256"],
                      "frames": len(frames), "bridgeSeams": len(bridge_sheets), "webDetails": len(report["webDetailSheets"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
