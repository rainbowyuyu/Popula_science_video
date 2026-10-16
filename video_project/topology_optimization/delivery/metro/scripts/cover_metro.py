"""Four independently composed metro covers from the episode's clean 3-D frame.

No scene elements are invented or regenerated. The source crop always retains the
person, luggage, train and safety line as one photograph-like rendered image.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FONT = Path("C:/Windows/Fonts/msyhbd.ttc")
LOGO = ROOT / "public/metro/logo.png"
BG = (13, 31, 46)
IVORY = (246, 241, 229)
AMBER = (255, 203, 113)
MUTED = (180, 200, 212)
LAYOUTS = {
    "16x9": {"size": (1920, 1080), "scale": 1.12, "offset": (250, -35),
              "title": (84, 266), "font": 136, "lineGap": 30, "series": (88, 647), "seriesFont": 43},
    "3x4": {"size": (1440, 1920), "scale": 1.23, "anchorX": 1010, "offsetY": 592,
             "title": (91, 292), "font": 183, "lineGap": 33, "series": (98, 780), "seriesFont": 50},
    "4x3": {"size": (1920, 1440), "scale": 1.22, "offset": (255, 122),
             "title": (98, 360), "font": 142, "lineGap": 33, "series": (105, 780), "seriesFont": 46},
    "9x16": {"size": (1080, 1920), "scale": 1.25, "anchorX": 1010, "offsetY": 570,
              "title": (70, 286), "font": 150, "lineGap": 27, "series": (76, 710), "seriesFont": 39},
}


def font(size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), round(size))


def smooth(a: np.ndarray) -> np.ndarray:
    a = np.clip(a, 0, 1)
    return a * a * (3 - 2 * a)


def text_top(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str,
             face: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> tuple[int, int, int, int]:
    x, y = xy
    b = draw.textbbox((0, 0), text, font=face)
    draw.text((x - b[0], y - b[1]), text, font=face, fill=fill)
    return round(x), round(y), round(x + b[2] - b[0]), round(y + b[3] - b[1])


def intersect(a, b) -> bool:
    return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])


def render(source: Image.Image, name: str, cfg: dict) -> tuple[Image.Image, dict]:
    w, h = cfg["size"]
    s = min(w, h) / 1080
    canvas = Image.new("RGB", (w, h), BG)
    scale = cfg["scale"]
    hero = ImageEnhance.Color(source).enhance(.9)
    hero = ImageEnhance.Contrast(hero).enhance(1.035)
    hero = ImageEnhance.Brightness(hero).enhance(.94)
    hero = hero.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    ox, oy = cfg.get("offset", (round(w / 2 - cfg.get("anchorX", 0) * scale), cfg.get("offsetY", 0)))
    plate = Image.new("RGB", (w, h), BG)
    plate.paste(hero, (ox, oy))
    yy, xx = np.mgrid[:h, :w]
    if w > h:
        # A continuous dark field supports the large title, without a title card.
        alpha = smooth((xx - w * .23) / (w * .42))
        alpha *= .98 - .11 * smooth((yy - h * .74) / (h * .26))
        if oy > 0:
            alpha *= smooth((yy - oy) / (160 * s))
    else:
        # The portrait formats retain the central scene, including both feet,
        # luggage, the line behind them, and train doors above them.
        alpha = smooth((yy - oy - 80) / 360)
        alpha *= .99 - .08 * smooth((yy - h * .85) / (h * .15))
    bounds = ((xx >= ox) & (xx < ox + hero.width) & (yy >= oy) & (yy < oy + hero.height))
    alpha *= bounds
    canvas = Image.composite(plate, canvas, Image.fromarray((alpha * 255).astype(np.uint8)))
    draw = ImageDraw.Draw(canvas)

    # Fixed brand placement by short-side scale, with a quiet ivory backing.
    lx, ly, lh = 64 * s, 48 * s, 90 * s
    logo = Image.open(LOGO).convert("RGBA")
    lw = lh * logo.width / logo.height
    pad = 8 * s
    draw.rounded_rectangle((round(lx - pad), round(ly - pad), round(lx + lw + pad), round(ly + lh + pad)),
                           radius=15 * s, fill=IVORY)
    logo = logo.resize((round(lw), round(lh)), Image.Resampling.LANCZOS)
    canvas.paste(logo, (round(lx), round(ly)), logo)
    brand_face = font(44 * s)
    brand_bbox = brand_face.getbbox("rainbow鱼")
    brand_h = brand_bbox[3] - brand_bbox[1]
    brand = text_top(draw, (lx + lw + 20 * s, ly + (lh - brand_h) / 2), "rainbow鱼", brand_face, IVORY)

    tx, ty = cfg["title"]
    face = font(cfg["font"])
    first = text_top(draw, (tx, ty), "退后这一步", face, IVORY)
    second_y = first[3] + cfg["lineGap"]
    second = text_top(draw, (tx, second_y), "到底躲什么？", face, AMBER)
    series = text_top(draw, cfg["series"], "每天5分钟 · 地铁安全线", font(cfg["seriesFont"]), MUTED)
    bboxes = {"brandText": brand, "titleFirst": first, "titleSecond": second, "series": series}
    # Protected subject rectangle was measured from clean-1090's source frame.
    subject = tuple(round(v * scale + (ox if i % 2 == 0 else oy))
                    for i, v in enumerate((830, 303, 1192, 801)))
    for label, bb in bboxes.items():
        assert bb[0] >= 0 and bb[1] >= 0 and bb[2] < w and bb[3] < h, (name, label, bb)
    for label in ("titleFirst", "titleSecond", "series"):
        assert not intersect(bboxes[label], subject), (name, "Text overlaps subject", label)
    assert 0 <= subject[0] < subject[2] <= w and 0 <= subject[1] < subject[3] <= h
    assert not intersect(first, second) and not intersect(second, series)
    return canvas, {"ratio": name, "size": [w, h], "sourceScale": scale, "sourceOffset": [ox, oy],
                    "brandLogo": [round(lx), round(ly), round(lw), round(lh)], "brandFont": round(44 * s),
                    "textBounds": bboxes, "protectedSubjectBounds": subject}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "output/metro/clean-1090.jpg")
    parser.add_argument("--out", type=Path, default=ROOT / "output/metro/covers")
    args = parser.parse_args()
    if not args.input.exists():
        raise SystemExit(f"Awaiting the clean, text-free source frame: {args.input}")
    source = Image.open(args.input).convert("RGB")
    if source.size != (1920, 1080):
        raise SystemExit("Expected 1920×1080 source; recheck framing before using another size.")
    args.out.mkdir(parents=True, exist_ok=True)
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    report = {"source": str(args.input.resolve()), "sourceSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
              "logoSource": str(LOGO), "fontSource": str(FONT), "outputs": [],
              "design": "One real 3-D source scene, format-specific crop and layout, no generated scene additions."}
    for name, cfg in LAYOUTS.items():
        cover, data = render(source, name, cfg)
        path = args.out / f"metro-cover-{name}.jpg"
        cover.save(path, "JPEG", quality=96, subsampling=0, icc_profile=icc)
        thumb = cover.copy()
        thumb.thumbnail((640, 640), Image.Resampling.LANCZOS)
        thumb.save(args.out / f"preview-{name}.jpg", quality=93, icc_profile=icc)
        data.update(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), mode="RGB", colorSpace="sRGB")
        report["outputs"].append(data)
    (args.out / "cover-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
