from __future__ import annotations

"""Build the Nobel optogenetics cover in the light metro-cover layout.

The attached line-art portrait is treated as the source of truth for the
scientists. Pillow handles deterministic typography and composition so the
names, award title, logo, and output dimensions remain exact.
"""

from pathlib import Path
from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageFilter, ImageFont
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "delivery/nobel2026_v2/covers"
OUT.mkdir(parents=True, exist_ok=True)
SRC = Path(r"C:/Users/zju/AppData/Local/Temp/codex-clipboard-acc1f3fe-e66c-419a-807d-32d946e0fe72.png")
LOGO = ROOT / "public/nobel2026/logo.png"
FONT = Path(r"C:/Windows/Fonts/msyhbd.ttc")

INK = (13, 43, 53)
PAPER = (247, 246, 241)
CYAN = (52, 169, 184)
GOLD = (201, 157, 64)
SERIES = "每天5分钟科普·光遗传学"
TITLE = ("诺贝尔生理学", "和医学奖")
NAMES = "Karl Deisseroth  ·  Peter Hegemann  ·  Georg Nagel"
_PORTRAIT_CACHE: Image.Image | None = None

CONFIG = {
    "16x9": {
        "size": (1920, 1080),
        "logo": (64, 48, 90, 20),
        "pill": (64, 182, 44),
        "title": (64, 302, 124, 24),
        # Keep a little breathing room at the right edge and leave the lower
        # shoulder line clear for the English names.
        "portrait": (850, 260, 1010, 740),
        "names": (1320, 1022, 36),
    },
    "4x3": {
        "size": (1920, 1440),
        "logo": (85, 64, 120, 26),
        "pill": (85, 230, 54),
        "title": (85, 350, 144, 22),
        # The faces are larger and the group sits left of its former anchor.
        # Trim quiet scan paper, then let the shoulders dissolve into the
        # cover paper so the enlarged portrait does not crowd the name line.
        "portrait": (-40, 590, 2020, 900),
        "portraitCrop": (0, 18, 768, 390),
        "portraitFade": (1275, 1350),
        "names": (960, 1375, 34),
    },
    "3x4": {
        "size": (1440, 1920),
        "logo": (85, 64, 120, 24),
        "pill": (85, 242, 54),
        "title": (85, 392, 176, 28),
        "portrait": (72, 825, 1295, 800),
        "names": (720, 1660, 30),
    },
    "9x16": {
        "size": (1080, 1920),
        "logo": (64, 48, 90, 18),
        "pill": (64, 210, 43),
        "title": (64, 352, 150, 24),
        "portrait": (70, 770, 920, 655),
        "names": (540, 1495, 30),
    },
}


def font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), int(px))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def paper_base(size: tuple[int, int]) -> Image.Image:
    w, h = size
    base = Image.new("RGB", size, PAPER).convert("RGBA")
    grain = Image.effect_noise((w, h), 2.4).convert("L")
    grain = grain.point(lambda p: int(p * 0.045))
    texture = Image.new("RGBA", size, (255, 255, 255, 0))
    texture.putalpha(grain)
    base = Image.alpha_composite(base, texture)
    wash = Image.new("RGBA", size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.ellipse((int(w * 0.48), int(h * 0.34), int(w * 1.18), int(h * 1.18)), fill=(160, 204, 209, 32))
    wash = wash.filter(ImageFilter.GaussianBlur(max(20, int(min(size) * 0.08))))
    return Image.alpha_composite(base, wash)


def logo_without_white() -> Image.Image:
    logo = Image.open(LOGO).convert("RGBA")
    rgb = logo.convert("RGB")
    reference = Image.new("RGB", logo.size, (255, 255, 255))
    difference = ImageChops.difference(rgb, reference).convert("L")
    alpha = difference.point(lambda p: 0 if p < 14 else min(255, (p - 14) * 8))
    logo.putalpha(alpha)
    return logo


def draw_brand(canvas: Image.Image, cfg: dict) -> dict:
    lx, ly, lh, _ = cfg["logo"]
    logo = logo_without_white()
    lw = round(lh * logo.width / logo.height)
    logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (lx, ly))
    draw = ImageDraw.Draw(canvas)
    scale = min(canvas.size) / 1080
    brand_face = font(round(44 * scale))
    text_x = lx + lw + round(20 * scale)
    metrics = brand_face.getbbox("rainbow鱼")
    text_y = ly + round((lh - (metrics[3] - metrics[1])) / 2)
    draw.text((text_x, text_y), "rainbow鱼", font=brand_face, fill=INK)
    bbox = draw.textbbox((0, 0), "rainbow鱼", font=brand_face)
    return {"logo": [lx, ly, lx + lw, ly + lh], "brandText": [text_x, text_y, text_x + bbox[2] - bbox[0], text_y + bbox[3] - bbox[1]]}


def draw_series_pill(canvas: Image.Image, cfg: dict) -> list[int]:
    sx, sy, px = cfg["pill"]
    face = font(px)
    draw = ImageDraw.Draw(canvas)
    box = draw.textbbox((0, 0), SERIES, font=face)
    pad_x = round(px * 0.45)
    pad_y = round(px * 0.30)
    pill = [sx, sy, sx + box[2] - box[0] + pad_x * 2, sy + box[3] - box[1] + pad_y * 2]
    draw.rounded_rectangle(pill, radius=round(px * 0.31), fill=INK)
    draw.text((sx + pad_x, sy + pad_y), SERIES, font=face, fill=(255, 255, 252))
    return pill


def draw_title(canvas: Image.Image, cfg: dict) -> dict:
    tx, ty, px, gap = cfg["title"]
    face = font(px)
    draw = ImageDraw.Draw(canvas)
    first = draw.textbbox((0, 0), TITLE[0], font=face)
    second = draw.textbbox((0, 0), TITLE[1], font=face)
    first_y = ty
    second_y = ty + (first[3] - first[1]) + gap
    draw.text((tx, first_y), TITLE[0], font=face, fill=INK)
    draw.text((tx, second_y), TITLE[1], font=face, fill=INK)
    return {
        "titleFirst": [tx, first_y, tx + first[2] - first[0], first_y + first[3] - first[1]],
        "titleSecond": [tx, second_y, tx + second[2] - second[0], second_y + second[3] - second[1]],
    }


def extract_portrait() -> Image.Image:
    """Keep white faces while removing the surrounding scan paper.

    The line drawing's light face planes are semantically important. We build
    an alpha layer from the ink/ochre strokes, then restore three soft face
    ellipses so their white fill remains visible after compositing.
    """
    global _PORTRAIT_CACHE
    if _PORTRAIT_CACHE is not None:
        return _PORTRAIT_CACHE.copy()
    original = Image.open(SRC).convert("RGBA")
    w, h = original.size
    rgb = original.convert("RGB")
    pixels = rgb.load()
    # Dark ink and warm ochre contours remain opaque; near-white scan paper is
    # dropped. The threshold is deliberately conservative around the faces.
    alpha_values = []
    for yy in range(h):
        for xx in range(w):
            r, g, b = pixels[xx, yy]
            luminance = (r + g + b) / 3
            dark = max(0, min(255, int((195 - luminance) * 5)))
            ochre = max(0, min(255, int((r - b - 10) * 12)))
            alpha_values.append(max(dark, ochre))
    line_alpha = Image.frombytes("L", (w, h), bytes(alpha_values)).filter(ImageFilter.GaussianBlur(0.5))
    face_alpha = Image.new("L", (w, h), 0)
    fd = ImageDraw.Draw(face_alpha)
    # Coordinates are relative to the attached 768×508 portrait reference.
    fd.ellipse((58, 79, 221, 300), fill=240)
    fd.ellipse((285, 74, 470, 308), fill=240)
    fd.ellipse((522, 70, 710, 306), fill=240)
    face_alpha = face_alpha.filter(ImageFilter.GaussianBlur(5.0))
    mask = ImageChops.lighter(line_alpha, face_alpha)
    original.putalpha(mask)
    _PORTRAIT_CACHE = original.copy()
    return original


def draw_motion_lines(canvas: Image.Image) -> None:
    w, h = canvas.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    left = int(w * 0.34)
    for idx in range(5):
        y = int(h * (0.19 + idx * 0.055))
        points = []
        for i in range(100):
            x = left + i * (w - left) / 100
            yy = y + 12 * math.sin(i * 0.12 + idx * 0.8)
            points.append((round(x), round(yy)))
        draw.line(points, fill=(59, 173, 187, 42), width=max(2, round(min(w, h) / 720)))
    canvas.alpha_composite(layer)


def draw_portrait(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["portrait"]
    portrait = extract_portrait()
    crop_box = cfg.get("portraitCrop")
    if crop_box:
        portrait = portrait.crop(crop_box)
    ratio = min(w / portrait.width, h / portrait.height)
    resized = portrait.resize((round(portrait.width * ratio), round(portrait.height * ratio)), Image.Resampling.LANCZOS)
    px = x + (w - resized.width) // 2
    py = y + (h - resized.height) // 2
    if "portraitFade" in cfg:
        fade_start, fade_end = cfg["portraitFade"]
        fade = Image.new("L", resized.size, 255)
        fade_draw = ImageDraw.Draw(fade)
        for row in range(max(0, fade_start - py), resized.height):
            screen_y = py + row
            opacity = round(255 * max(0.0, min(1.0, (fade_end - screen_y) / (fade_end - fade_start))))
            fade_draw.line((0, row, resized.width, row), fill=opacity)
        resized.putalpha(ImageChops.multiply(resized.getchannel("A"), fade))
    shadow = Image.new("RGBA", resized.size, (0, 0, 0, 0))
    shadow.putalpha(resized.getchannel("A").filter(ImageFilter.GaussianBlur(16)))
    shadow_color = Image.new("RGBA", resized.size, (72, 108, 111, 38))
    shadow_color.putalpha(shadow.getchannel("A"))
    canvas.alpha_composite(shadow_color, (px + 8, py + 14))
    canvas.alpha_composite(resized, (px, py))
    return [px, py, px + resized.width, py + resized.height]


def draw_names(canvas: Image.Image, cfg: dict) -> list[int]:
    cx, cy, px = cfg["names"]
    face = font(px)
    draw = ImageDraw.Draw(canvas)
    max_width = canvas.width - 52
    full = draw.textbbox((0, 0), NAMES, font=face)
    if full[2] - full[0] <= max_width:
        x = max(32, min(canvas.width - (full[2] - full[0]) - 32, cx - (full[2] - full[0]) // 2))
        y = cy - (full[3] - full[1]) // 2
        draw.text((x, y), NAMES, font=face, fill=INK)
        return [x, y, x + full[2] - full[0], y + full[3] - full[1]]
    first = "Karl Deisseroth  ·  Peter Hegemann"
    second = "Georg Nagel"
    b1 = draw.textbbox((0, 0), first, font=face)
    b2 = draw.textbbox((0, 0), second, font=face)
    x1 = max(32, (canvas.width - (b1[2] - b1[0])) // 2)
    x2 = max(32, (canvas.width - (b2[2] - b2[0])) // 2)
    y = cy - (b1[3] - b1[1])
    draw.text((x1, y), first, font=face, fill=INK)
    draw.text((x2, y + (b1[3] - b1[1]) + 8), second, font=face, fill=INK)
    return [min(x1, x2), y, max(x1 + b1[2] - b1[0], x2 + b2[2] - b2[0]), y + (b1[3] - b1[1]) * 2 + 8]


def compose(ratio: str) -> tuple[Image.Image, dict]:
    cfg = CONFIG[ratio]
    canvas = paper_base(cfg["size"])
    draw_motion_lines(canvas)
    brand_boxes = draw_brand(canvas, cfg)
    series_box = draw_series_pill(canvas, cfg)
    title_boxes = draw_title(canvas, cfg)
    portrait_box = draw_portrait(canvas, cfg)
    names_box = draw_names(canvas, cfg)
    boxes = {**brand_boxes, "series": series_box, **title_boxes, "portrait": portrait_box, "names": names_box}
    return canvas, boxes


def save_outputs() -> None:
    files = []
    records = []
    for ratio in CONFIG:
        canvas, boxes = compose(ratio)
        filename = f"nobel2026-cover-{ratio}.jpg"
        path = OUT / filename
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        canvas.convert("RGB").save(path, "JPEG", quality=95, subsampling=0, optimize=True, icc_profile=profile)
        with Image.open(path) as saved:
            assert saved.size == CONFIG[ratio]["size"]
            assert saved.mode == "RGB"
            assert saved.info.get("icc_profile")
        files.append(path)
        records.append({
            "ratio": ratio,
            "size": list(CONFIG[ratio]["size"]),
            "file": filename,
            "textBounds": boxes,
            "sha256": digest(path),
            "mode": "RGB",
            "colorSpace": "sRGB",
        })

    contact = Image.new("RGB", (1640, 1120), (224, 228, 227))
    cd = ImageDraw.Draw(contact)
    slots = [(30, 30), (850, 30), (30, 580), (850, 580)]
    for ratio, (x, y) in zip(CONFIG, slots):
        thumb = Image.open(OUT / f"nobel2026-cover-{ratio}.jpg").convert("RGB")
        thumb.thumbnail((760, 470), Image.Resampling.LANCZOS)
        contact.paste(thumb, (x + (760 - thumb.width) // 2, y))
        cd.text((x, y + 480), f"{ratio.replace('x', ':')}  {CONFIG[ratio]['size'][0]} × {CONFIG[ratio]['size'][1]}", font=font(26), fill=INK)
    contact.save(OUT / "cover-contact.jpg", "JPEG", quality=95, subsampling=0)

    review = Image.new("RGB", (1640, 860), (224, 228, 227))
    rd = ImageDraw.Draw(review)
    for col, ratio in enumerate(CONFIG):
        x = 25 + col * 405
        rd.text((x, 18), f"{ratio.replace('x', ':')} · 320 / 160", font=font(22), fill=INK)
        im = Image.open(OUT / f"nobel2026-cover-{ratio}.jpg").convert("RGB")
        for edge, y in ((320, 64), (160, 445)):
            thumb = im.copy()
            thumb.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            review.paste(thumb, (x, y))
    review.save(OUT / "cover-thumbnails.jpg", "JPEG", quality=95, subsampling=0)

    source_record = {
        "sourceImage": str(SRC),
        "sourceRole": "user-attached line-art portrait reference",
        "brandAsset": str(LOGO),
        "petriAsset": None,
        "petriAssetRole": "removed from the cover composition at the user's request",
        "layoutReference": "delivery/metro/封面/封面总览.jpg",
        "series": SERIES,
        "headline": "诺贝尔生理学和医学奖",
        "topic": "光遗传学",
        "names": NAMES,
        "mechanism": "三位科学家线描肖像 + 光遗传学主题",
        "layoutNotes": {
            "4x3": "Portrait uses a 768×372 source crop, is enlarged into a 2020×900 canvas box, and resolves at x≈41; the enlarged faces sit farther left without touching the title. The shoulders fade into the paper before the name line.",
            "petriDish": "No culture-dish illustration or dish-shaped decorative asset is composited in any ratio.",
        },
        "outputs": records,
    }
    (OUT / "source-record.json").write_text(json.dumps(source_record, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n".join(str(path) for path in files))


if __name__ == "__main__":
    save_outputs()
