"""Extract exact encoded frames for human review, without touching the render bundle.

Run after the final audio-muxed MP4 exists:
    python scripts/review_final.py
Plan only, with no video decoding:
    python scripts/review_final.py --plan-only

The contact sheets are review aids, never automatic proof of visual correctness.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, default=ROOT / "delivery/密码学_让小偷送秘密_1080p.mp4")
    parser.add_argument("--out", type=Path, default=None,
                        help="Fresh output directory. Defaults to a timestamped QA directory.")
    parser.add_argument("--plan-only", action="store_true")
    parser.add_argument("--width", type=int, default=960, help="Width of individual review frames")
    args = parser.parse_args()
    data = json.loads((ROOT / "src/timeline-data.json").read_text(encoding="utf-8"))
    fps, duration = data["fps"], data["durationFrames"]
    cues, groups = data["cues"], data["groups"]
    assert fps == 30 and duration == 9129, (fps, duration)
    assert len(cues) == 32 and len(groups) == 7, (len(cues), len(groups))
    bound = lambda frame: min(duration - 1, max(0, int(frame)))
    cue_at = lambda frame: next((c for c in cues if c["startFrame"] <= frame < c["endFrame"]), None)
    sections = []

    # Each of the 32 actual narration windows gets a midpoint, not a guessed time.
    rows = [{"frame": bound(round((c["startFrame"] + c["endFrame"]) / 2)),
             "title": c["id"], "text": c["text"], "cueId": c["id"]} for c in cues]
    for page in range(math.ceil(len(rows) / 12)):
        sections.append({"name": f"overview-{page + 1}", "columns": 3,
                         "purpose": "actual narration midpoint", "items": rows[page * 12:(page + 1) * 12]})

    # Seven frames around each of the six act boundaries: -90..+90 in steps of30.
    for group in groups[1:]:
        center = round(group["start"] * fps)
        items = []
        for offset in [-90, -60, -30, 0, 30, 60, 90]:
            frame = bound(center + offset)
            c = cue_at(frame)
            items.append({"frame": frame, "title": f'{group["id"]} {offset:+d}f',
                          "text": c["text"] if c else "旁白停顿 / 转场", "cueId": c["id"] if c else None})
        sections.append({"name": f'transition-{group["id"]}', "columns": 2,
                         "purpose": "act boundary minus/plus 90 frames", "items": items})

    # Midpoints cannot establish late outcomes. Inspect correct final values and
    # receive/reject outcomes at 85% through their actual narration windows.
    key_ids = {"s09", "s10", "s11", "s13", "s14", "s15", "s19", "s20", "s23", "s25", "s27", "s28", "s29"}
    outcome_rows = [{"frame": bound(round(c["startFrame"] + .85 * (c["endFrame"] - c["startFrame"]))),
                     "title": c["id"] + " outcome 85%", "text": c["text"], "cueId": c["id"]}
                    for c in cues if c["id"] in key_ids]
    for page in range(math.ceil(len(outcome_rows) / 9)):
        sections.append({"name": f"outcomes-{page + 1}", "columns": 3,
                         "purpose": "late mechanism outcomes", "items": outcome_rows[page * 9:(page + 1) * 9]})
    coda_start = round(data["coda"]["startSec"] * fps)
    sections.append({"name": "evidence-ending", "columns": 2, "purpose": "evidence readability and final frame",
                     "items": [{"frame": bound(f), "title": title, "text": "论文、公式、品牌与末尾停留", "cueId": None}
                               for f, title in [(coda_start, "evidence begins"),
                                                (coda_start + 45, "evidence +1.5s"),
                                                (round((coda_start + duration - 1) / 2), "evidence midpoint"),
                                                (duration - 1, "last encoded frame")]]})
    frames = sorted({item["frame"] for section in sections for item in section["items"]})
    plan = {"timelineFrames": duration, "fps": fps, "durationSec": duration / fps,
            "narrationCueCount": len(cues), "actBoundaryCount": len(groups) - 1,
            "uniqueFrameCount": len(frames), "frames": frames, "sections": sections,
            "limitations": "Representative encoded frames and boundary samples only. Does not establish continuous motion, auditory quality, or semantic correctness without human review."}
    if args.plan_only:
        print(json.dumps({k: v for k, v in plan.items() if k not in ("frames", "sections")}, ensure_ascii=False, indent=2))
        return
    if not args.video.is_file():
        raise FileNotFoundError(f"Final encoded video is not ready: {args.video}")
    for executable in ("ffmpeg", "ffprobe"):
        if shutil.which(executable) is None:
            raise RuntimeError(f"Missing {executable} on PATH")
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = args.out or ROOT / "work/qa" / f"encoded-v2-{stamp}"
    # Do not overwrite or remove previous review evidence.
    if out.exists() and any(out.iterdir()):
        raise FileExistsError(f"Use a fresh review directory: {out}")
    out.mkdir(parents=True, exist_ok=True)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(args.video)],
                           capture_output=True, text=True, encoding="utf-8", check=True)
    media = json.loads(probe.stdout)
    video = next(s for s in media["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (1920, 1080), (video["width"], video["height"])
    assert video["avg_frame_rate"] == "30/1", video["avg_frame_rate"]
    if video.get("nb_frames", "N/A") != "N/A":
        assert int(video["nb_frames"]) == duration, video["nb_frames"]
    assert abs(float(video["duration"]) - duration / fps) <= 1 / fps, video.get("duration")
    assert any(s["codec_type"] == "audio" for s in media["streams"]), "Expected final audio-muxed file"

    # Decode the final MP4 once. select(n) uses exact decoded frame indices rather
    # than approximate timestamp seeks or source-scene rerendering.
    select = "+".join(f"eq(n\\,{frame})" for frame in frames)
    vf = f"select='{select}',scale={args.width}:-2:flags=lanczos"
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(args.video),
                             "-vf", vf, "-fps_mode", "vfr", "-q:v", "2", "-start_number", "0",
                             str(out / "selected-%03d.jpg")], capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(result.stderr)
    selected = sorted(out.glob("selected-*.jpg"))
    assert len(selected) == len(frames), (len(selected), len(frames))
    for index, frame in enumerate(frames):
        selected[index].rename(out / f"frame-{frame:05d}.jpg")

    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    font = ImageFont.truetype(str(font_path), 22)
    small = ImageFont.truetype(str(font_path), 19)
    cell_w, frame_h, label_h = 640, 360, 86
    for section in sections:
        columns = section["columns"]
        sheet = Image.new("RGB", (columns * cell_w, math.ceil(len(section["items"]) / columns) * (frame_h + label_h)), "#0b1630")
        draw = ImageDraw.Draw(sheet)
        for index, item in enumerate(section["items"]):
            x, y = (index % columns) * cell_w, (index // columns) * (frame_h + label_h)
            with Image.open(out / f'frame-{item["frame"]:05d}.jpg') as im:
                sheet.paste(im.resize((cell_w, frame_h), Image.Resampling.LANCZOS), (x, y))
            draw.text((x + 12, y + frame_h + 5), f'{item["title"]} · {item["frame"] / fps:.2f}s · f{item["frame"]}', font=font, fill="#f8e5bc")
            snippet = item["text"]
            if len(snippet) > 56:
                snippet = snippet[:55] + "…"
            draw.text((x + 12, y + frame_h + 36), snippet[:29], font=small, fill="#c0cbe0")
            if len(snippet) > 29:
                draw.text((x + 12, y + frame_h + 60), snippet[29:], font=small, fill="#c0cbe0")
        section["contactSheet"] = section["name"] + ".jpg"
        sheet.save(out / section["contactSheet"], quality=94)

    plan.update({"encodedVideo": str(args.video.resolve()), "encodedSha256": sha256(args.video),
                 "timelineSha256": sha256(ROOT / "src/timeline-data.json"), "probe": media,
                 "humanReviewStatus": "pending", "createdLocal": dt.datetime.now().isoformat(timespec="seconds")})
    (out / "frames.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index_text = ["# 最终编码视频的抽帧审查", "", f"来源：`{args.video.name}`；9129 帧 / 304.3 秒 / 1920×1080 / 30fps。",
                  "", "这些图片直接解码自最终 MP4，不是重新渲染的源场景。逐帧语义、遮挡、排版结论仍需人工查看；不会自动标记画面通过。", "",
                  f"覆盖32句中点、6处转场前后各90帧、13个后段动作结果与4个片尾帧，共{len(frames)}个不同编码帧。", ""]
    index_text += [f'- [{s["name"]}]({s["contactSheet"]}) — {s["purpose"]}' for s in sections]
    index_text += ["", "音频试听、正常速度连续播放及更密集的边界动作检查由其他验收步骤完成。", ""]
    (out / "README.md").write_text("\n".join(index_text), encoding="utf-8")
    print(json.dumps({"output": str(out), "frames": len(frames), "sheets": len(sections), "humanReviewStatus": "pending"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
