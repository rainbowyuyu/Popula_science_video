"""Create the four social cover formats for the metro airflow episode.

The hero is a real rendered frame from the episode.  Typography is added as a
separate layer so the cover remains readable at thumbnail size while the train
and the cyan flow field stay visible.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageEnhance, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
# A clean Remotion still from the same airflow shot; it contains no embedded
# captions, legend, or watermark, so the cover has one consistent typography
# layer.  It is regenerated with ``render_metro.mjs stills --clean`` when the
# episode's camera framing changes.
SOURCE_DEFAULT = ROOT / "output/metro/clean-2904.jpg"
LOGO = ROOT / "public/metro/logo.png"
FONT = Path("C:/Windows/Fonts/msyhbd.ttc")
BG = (8, 24, 38)
INK = (248, 246, 237)
CYAN = (126, 231, 225)
AMBER = (255, 202, 105)
MUTED = (183, 205, 211)


def face(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), size)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str,
         f: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> tuple[int, int, int, int]:
    x, y = xy
    b = draw.textbbox((0, 0), value, font=f)
    draw.text((x - b[0], y - b[1]), value, font=f, fill=fill)
    return (x, y, x + b[2] - b[0], y + b[3] - b[1])


def cover_resize(im: Image.Image, size: tuple[int, int], anchor: tuple[float, float] = (.5, .5)) -> Image.Image:
    """Resize to cover *size* and crop around a normalized anchor."""
    w, h = size
    scale = max(w / im.width, h / im.height)
    nw, nh = round(im.width * scale), round(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    max_x, max_y = max(0, nw - w), max(0, nh - h)
    left = round(max_x * anchor[0])
    top = round(max_y * anchor[1])
    return im.crop((left, top, left + w, top + h))


def add_landscape_gradient(canvas: Image.Image, stop: float) -> Image.Image:
    """Darken the left side without hiding the flow field."""
    w, h = canvas.size
    x = np.arange(w, dtype=np.float32)[None, :]
    alpha = np.clip(1 - x / (w * stop), 0, 1) ** 1.25
    alpha = np.repeat(alpha, h, axis=0)
    # Keep the title zone quiet while retaining a little blue texture.
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = np.array(BG, dtype=np.uint8)
    rgba[..., 3] = (alpha * 220).astype(np.uint8)
    return Image.alpha_composite(canvas.convert("RGBA"), Image.fromarray(rgba, "RGBA")).convert("RGB")


def add_portrait_background(source: Image.Image, size: tuple[int, int], hero_y: int,
                            hero_h: int, anchor_x: float) -> Image.Image:
    """Place a tall hero panel below the title area for 3:4 and 9:16."""
    w, h = size
    canvas = Image.new("RGB", size, BG)
    hero = cover_resize(source, (w, hero_h), (anchor_x, .55))
    hero = ImageEnhance.Contrast(hero).enhance(1.03)
    hero = ImageEnhance.Color(hero).enhance(.95)
    canvas.paste(hero, (0, hero_y))
    # Softly blend the panel into the navy title and lower edge.
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    a = np.zeros((h, w), dtype=np.uint8)
    top = max(0, hero_y - 130)
    for yy in range(max(0, top), min(h, hero_y + 180)):
        t = (yy - top) / max(1, (hero_y + 180 - top))
        a[yy] = int(190 * (1 - t) ** 1.7)
    for yy in range(min(h, hero_y + hero_h), min(h, hero_y + hero_h + 150)):
        t = (yy - (hero_y + hero_h)) / 150
        a[yy] = int(170 * t)
    layer_arr = np.zeros((h, w, 4), dtype=np.uint8)
    layer_arr[..., :3] = np.array(BG, dtype=np.uint8)
    layer_arr[..., 3] = a
    return Image.alpha_composite(canvas.convert("RGBA"), Image.fromarray(layer_arr, "RGBA")).convert("RGB")


def draw_logo(canvas: Image.Image, x: int, y: int, icon_h: int, word_size: int) -> tuple[int, int, int, int]:
    draw = ImageDraw.Draw(canvas)
    icon = Image.open(LOGO).convert("RGBA")
    icon_w = round(icon_h * icon.width / icon.height)
    pad = round(icon_h * .12)
    draw.rounded_rectangle((x - pad, y - pad, x + icon_w + pad, y + icon_h + pad),
                           radius=round(icon_h * .16), fill=(247, 245, 235))
    icon = icon.resize((icon_w, icon_h), Image.Resampling.LANCZOS)
    canvas.paste(icon, (x, y), icon)
    bbox = text(draw, (x + icon_w + round(icon_h * .22), y + round(icon_h * .12)),
                "rainbow鱼", face(word_size), INK)
    return (x - pad, y - pad, bbox[2], max(y + icon_h + pad, bbox[3]))


def render(source: Image.Image, ratio: str) -> tuple[Image.Image, dict]:
    configs = {
        "16x9": {"size": (1920, 1080), "kind": "landscape", "hero_anchor": (.5, .5)},
        # Shift the train a little right so the compact 4:3 headline stays on
        # the quiet flow-field area instead of covering the nose.
        "4x3": {"size": (1920, 1440), "kind": "landscape", "hero_anchor": (.2, .45)},
        "3x4": {"size": (1440, 1920), "kind": "portrait", "hero_y": 650, "hero_h": 1000, "hero_anchor": (.57, .55)},
        "9x16": {"size": (1080, 1920), "kind": "portrait", "hero_y": 600, "hero_h": 1100, "hero_anchor": (.57, .55)},
    }
    cfg = configs[ratio]
    w, h = cfg["size"]
    if cfg["kind"] == "landscape":
        canvas = cover_resize(source, (w, h), cfg["hero_anchor"])
        canvas = ImageEnhance.Contrast(canvas).enhance(1.03)
        canvas = ImageEnhance.Color(canvas).enhance(.96)
        canvas = add_landscape_gradient(canvas, .48 if ratio == "16x9" else .46)
    else:
        canvas = add_portrait_background(source, (w, h), cfg["hero_y"], cfg["hero_h"], cfg["hero_anchor"][0])

    # A subtle overall vignette keeps the title readable without a card or border.
    vignette = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    v = np.zeros((h, w, 4), dtype=np.uint8)
    yy, xx = np.mgrid[:h, :w]
    edge = np.maximum.reduce([xx / w, yy / h, 1 - xx / w, 1 - yy / h])
    v[..., 3] = np.clip((edge - .72) / .28 * 46, 0, 46).astype(np.uint8)
    v[..., :3] = 0
    canvas = Image.alpha_composite(canvas.convert("RGBA"), Image.fromarray(v, "RGBA")).convert("RGB")
    draw = ImageDraw.Draw(canvas)

    short = min(w, h)
    if cfg["kind"] == "landscape":
        scale = short / 1080
        lx, ly = round(70 * scale), round(54 * scale)
        logo_bb = draw_logo(canvas, lx, ly, round(58 * scale), round(36 * scale))
        series_bb = text(draw, (round(86 * scale), round(214 * scale)), "每天5分钟科普",
                         face(round(50 * scale)), CYAN)
        # The 4:3 crop brings the train nose farther into the left half; a
        # slightly tighter title keeps every glyph on the dark field.
        title_size = round(152 * scale if ratio == "16x9" else (118 if ratio == "4x3" else 145) * scale)
        title_x, title_y = round(86 * scale), round(315 * scale)
        first = text(draw, (title_x, title_y), "车还没到", face(title_size), INK)
        second = text(draw, (title_x, first[3] + round(18 * scale)), "风先到了", face(title_size), AMBER)
        kicker = text(draw, (title_x, second[3] + round(34 * scale)), "地铁活塞风",
                      face(round(44 * scale)), MUTED)
    else:
        scale = short / 1080
        lx, ly = round(70 * scale), round(56 * scale)
        logo_bb = draw_logo(canvas, lx, ly, round(54 * scale), round(34 * scale))
        series_bb = text(draw, (round(70 * scale), round(178 * scale)), "每天5分钟科普",
                         face(round(48 * scale)), CYAN)
        title_size = round(124 * scale if ratio == "9x16" else 118 * scale)
        title_x, title_y = round(70 * scale), round(252 * scale)
        first = text(draw, (title_x, title_y), "车还没到", face(title_size), INK)
        second = text(draw, (title_x, first[3] + round(12 * scale)), "风先到了", face(title_size), AMBER)
        kicker = text(draw, (title_x, second[3] + round(25 * scale)), "地铁活塞风",
                      face(round(40 * scale)), MUTED)

    # Keep the source's flow legend as a quiet technical cue; no new cards or formulas.
    boxes = {"logo": logo_bb, "series": series_bb, "title1": first, "title2": second, "kicker": kicker}
    for name, bb in boxes.items():
        assert 0 <= bb[0] < bb[2] <= w and 0 <= bb[1] < bb[3] <= h, (ratio, name, bb)
    assert not (first[3] > second[1] or second[3] > kicker[1])
    meta = {"ratio": ratio, "size": [w, h], "text": boxes, "source": SOURCE_DEFAULT.name,
            "title": "车还没到，风先到了", "series": "每天5分钟科普"}
    return canvas, meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=SOURCE_DEFAULT)
    ap.add_argument("--out", type=Path, default=ROOT / "output/metro/covers/flow")
    args = ap.parse_args()
    if not args.input.exists():
        raise SystemExit(f"Missing source frame: {args.input}")
    if not LOGO.exists() or not FONT.exists():
        raise SystemExit("The metro logo or Microsoft YaHei Bold font is unavailable")
    source = Image.open(args.input).convert("RGB")
    if source.size != (1920, 1080):
        raise SystemExit(f"Expected 1920x1080 source, got {source.size}")
    args.out.mkdir(parents=True, exist_ok=True)
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    report = {"source": str(args.input.resolve()), "sourceSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
              "logo": str(LOGO.resolve()), "font": str(FONT), "outputs": [],
              "design": "High-resolution rendered train and airflow frame with minimal large typography."}
    for ratio in ("16x9", "3x4", "4x3", "9x16"):
        cover, meta = render(source, ratio)
        out_path = args.out / f"metro-flow-cover-{ratio}.jpg"
        cover.save(out_path, "JPEG", quality=96, subsampling=0, icc_profile=icc)
        preview = cover.copy()
        preview.thumbnail((640, 640), Image.Resampling.LANCZOS)
        preview.save(args.out / f"preview-{ratio}.jpg", "JPEG", quality=94, icc_profile=icc)
        meta.update(file=out_path.name, sha256=hashlib.sha256(out_path.read_bytes()).hexdigest(), mode="RGB", colorSpace="sRGB")
        report["outputs"].append(meta)
    (args.out / "cover-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
