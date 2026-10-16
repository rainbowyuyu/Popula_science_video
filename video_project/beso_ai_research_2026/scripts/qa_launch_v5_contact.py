"""Create independent review sheets from actual v5 render stills.

The contact-sheet labels live outside the video image. This script does not
change rendered frames or infer aesthetic acceptance from thumbnail creation.
"""
from pathlib import Path
import argparse
import hashlib
import json
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("render_dir", type=Path)
args = parser.parse_args()
render_dir = args.render_dir.resolve()
frames = sorted((render_dir / "stills").glob("frame-*.jpg"))
if not frames:
    raise SystemExit("No actual rendered v5 stills found.")
timeline_path = ROOT / "src/launch-v5-story.json"
timeline_bytes = timeline_path.read_bytes()
timeline = json.loads(timeline_bytes.decode("utf-8-sig"))
fps = timeline["fps"]
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
qa_dir = render_dir / "independent-contact"
qa_dir.mkdir(exist_ok=True)
records = []


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sheets(prefix, tile_width, columns, per_page):
    tile_height = round(tile_width * 9 / 16)
    label_height = 28
    pages = []
    for start in range(0, len(frames), per_page):
        batch = frames[start:start + per_page]
        height = (tile_height + label_height) * ((len(batch) + columns - 1) // columns)
        sheet = Image.new("RGB", (tile_width * columns, height), "#ecf3f4")
        draw = ImageDraw.Draw(sheet)
        batch_frames = []
        for index, path in enumerate(batch):
            frame = int(path.stem.rsplit("-", 1)[1])
            scene = max((s for s in timeline["scenes"] if s["start"] <= frame), key=lambda s: s["start"])
            x = index % columns * tile_width
            y = index // columns * (tile_height + label_height)
            with Image.open(path) as source:
                image = source.convert("RGB").resize((tile_width, tile_height), Image.Resampling.LANCZOS)
                sheet.paste(image, (x, y))
            draw.text((x + 8, y + tile_height + 4), f'{frame} | {frame / fps:.2f}s | {scene["id"]}', font=font, fill="#102c3c")
            batch_frames.append(frame)
        output = qa_dir / f"{prefix}-{start // per_page + 1:02d}.jpg"
        sheet.save(output, quality=95, subsampling=0)
        pages.append({"file": str(output.relative_to(ROOT)), "sha256": digest(output), "frames": batch_frames, "tileWidth": tile_width})
    return pages


for path in frames:
    with Image.open(path) as image:
        records.append({"file": str(path.relative_to(ROOT)), "sha256": digest(path), "frame": int(path.stem.rsplit("-", 1)[1]), "dimensions": list(image.size)})
report = {
    "schema": "launch-v5-independent-contact-v1",
    "created": datetime.now(timezone.utc).isoformat(),
    "timelineSHA256": hashlib.sha256(timeline_bytes).hexdigest(),
    "inputFrames": records,
    "regularSheets": sheets("contact", 640, 3, 12),
    "phoneScaleSheets": sheets("phone", 432, 2, 6),
    "acceptance": "Pending actual visual review; making contact sheets does not certify acceptance.",
}
manifest = qa_dir / "manifest.json"
manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"manifest": str(manifest), "frameCount": len(frames), "regularSheets": len(report["regularSheets"]), "phoneScaleSheets": len(report["phoneScaleSheets"])}, ensure_ascii=False))
