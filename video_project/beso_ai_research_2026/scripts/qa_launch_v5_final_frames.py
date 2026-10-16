"""Extract final encoded v5 frames for explicit, SHA-bound visual review.

This makes contact sheets; it does not infer aesthetic acceptance or claim
normal-speed viewing. Transition strips sample four frames per second.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "output/ai_engineer_launch_v5_1080p60.mp4"
OUT = ROOT / "research/qa/launch-v5-final-frames"
OUT.mkdir(parents=True, exist_ok=True)
story = json.loads((ROOT / "src/launch-v5-story.json").read_text("utf-8-sig"))
fps = story["fps"]
content = {0, 30, 180, 420, 780, 1140, 1380, 1740, 1950, 2070, 2190,
           2490, 2700, 2970, 3150, 3420, 3870, 3930, 4260, 4710, 4920,
           5040, 5400, 5670, 5970, 6299}
for scene in story["scenes"]:
    for fraction in (.15, .5, .85):
        content.add(scene["start"] + round(scene["duration"] * fraction))
    if scene["start"]:
        content.update(scene["start"] + offset for offset in (-30, -15, 0, 15, 30, 60))
# Evidence enters/exits over multiple seconds, independently of scene boundaries.
windows = [(6, 11), (16, 21), (31, 37), (42, 46), (51, 56),
           (62, 68), (76, 81), (92, 97), (102, 105)]
strips = [[n for n in range(a * fps, min(b * fps, story["duration"]), 15)]
          for a, b in windows]
frames = sorted(content | {n for strip in strips for n in strip})
frames = [n for n in frames if 0 <= n < story["duration"]]
expression = "+".join(f"eq(n,{n})" for n in frames).replace(",", "\\,")
subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y",
                "-i", str(VIDEO), "-vf", "select=" + expression,
                "-fps_mode", "vfr", "-q:v", "2", str(OUT / "extract-%04d.jpg")], check=True)
for index, frame in enumerate(frames, 1):
    (OUT / f"extract-{index:04d}.jpg").replace(OUT / f"frame-{frame:06d}.jpg")
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sheet(group, filename, width=640, columns=3):
    height = round(width * 9 / 16)
    tile = height + 28
    canvas = Image.new("RGB", (width * columns, tile * ((len(group) + columns - 1) // columns)), "#edf3f4")
    draw = ImageDraw.Draw(canvas)
    for index, frame in enumerate(group):
        x, y = index % columns * width, index // columns * tile
        path = OUT / f"frame-{frame:06d}.jpg"
        with Image.open(path) as image:
            canvas.paste(image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS), (x, y))
        scene = max((s for s in story["scenes"] if s["start"] <= frame), key=lambda s: s["start"])
        draw.text((x + 8, y + height + 4), f'{frame} | {frame / fps:.3f}s | {scene["id"]}', font=font, fill="#102c3c")
    path = OUT / filename
    canvas.save(path, quality=95, subsampling=0)
    return {"file": path.relative_to(ROOT).as_posix(), "sha256": sha(path), "frames": group}


regular = []
for start in range(0, len(frames), 12):
    regular.append(sheet(frames[start:start + 12], f"contact-{start // 12 + 1:02d}.jpg"))
transition = []
for index, strip in enumerate(strips):
    transition.append(sheet(strip, f"transition-{windows[index][0]:03d}-{windows[index][1]:03d}.jpg", 480, 4))
report = {
    "createdUTC": datetime.now(timezone.utc).isoformat(),
    "video": str(VIDEO), "videoSHA256": sha(VIDEO),
    "frames": frames,
    "frameRecords": [{"frame": n, "file": f"research/qa/launch-v5-final-frames/frame-{n:06d}.jpg",
                      "sha256": sha(OUT / f"frame-{n:06d}.jpg")} for n in frames],
    "contactSheets": regular, "transitionSheets": transition,
    "reviewed": False,
    "source": "Decoded final encoded MP4; continuous native camera and evidence surface transitions.",
    "limitation": "Frame extraction is not acceptance, continuous human playback, or listening.",
}
(OUT / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf8")
print(json.dumps({"frames": len(frames), "contacts": len(regular), "transitions": len(transition),
                  "videoSHA256": report["videoSHA256"]}))
