"""Extract transition contact sheets from completed production segments."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("--scene", action="append")
args = parser.parse_args()
story = json.loads((ROOT / "src/beso-story.json").read_text(encoding="utf-8"))
folder = ROOT / "output" / f"render-{args.revision}"
dest = ROOT / "research/qa/rendered-transitions"
dest.mkdir(parents=True, exist_ok=True)
fps = story["fps"]
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
notes = []

def extract(frame):
    segment, offset = divmod(frame, 900)
    source = folder / f"segment-{segment:03}.mp4"
    if not source.with_suffix(".mp4.json").exists():
        return None
    target = dest / f"{args.revision}-frame-{frame:06}.jpg"
    if not target.exists():
        result = subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", str(offset / fps),
            "-i", str(source), "-frames:v", "1", "-vf", "scale=480:270", "-q:v", "2", "-y", str(target)
        ], capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors="replace"))
    return target

points = [(s["id"], s["start"], [-.25, 0, .4, 1, 1.7, 2.4, 2.68, 3, 4, 6]) for s in story["scenes"][1:]]
rebuild = next(s for s in story["scenes"] if s["id"] == "rebuild")
points += [("bridge-handoff", rebuild["start"], [4.8, 5.0, 5.2, 5.35, 5.383, 5.4, 5.417, 5.5, 5.7, 6.0])]
points += [("tube-entry", rebuild["start"], [6.2, 6.6, 7, 7.5, 8, 8.5, 9.0, 9.6, 10.5, 12])]
for name, boundary, offsets in points:
    if args.scene and name not in args.scene:
        continue
    frames = [max(0, min(story["duration"] - 1, boundary + round(t * fps))) for t in offsets]
    with ThreadPoolExecutor(max_workers=3) as pool:
        images = list(pool.map(extract, frames))
    if any(p is None for p in images):
        print("WAITING", name)
        continue
    sheet = Image.new("RGB", (2400, 604), "#e7eef0")
    pen = ImageDraw.Draw(sheet)
    for i, (p, f, t) in enumerate(zip(images, frames, offsets)):
        x, y = i % 5 * 480, i // 5 * 302
        sheet.paste(Image.open(p).convert("RGB"), (x, y))
        pen.text((x + 9, y + 276), f"{name} {t:+.3f}s | frame {f}", fill="#163c54", font=font)
    target = dest / f"{args.revision}-{name}.jpg"
    sheet.save(target, quality=94)
    notes.append({"name": name, "frames": frames, "sheet": str(target)})
    print("CONTACT", name, str(target))
(dest / f"{args.revision}-last-extraction.json").write_text(json.dumps(notes, indent=2), encoding="utf-8")
