from __future__ import annotations

"""Create four light-paper covers for the 2026 Nobel Prize in Chemistry.

The attached two-person line drawing is the source of truth.  Its RGB pixels
are kept unchanged; only the exterior scan paper is made transparent.  The
cover adds a Qwen hand-drawn cue for chirality and autocatalytic feedback,
based on the official Nobel API motivation.
"""

from collections import deque
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import math

import numpy as np
from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "delivery/chemistry2026_cover_v01/covers"
ASSET = ROOT / "delivery/chemistry2026_cover_v01/assets"
OUT.mkdir(parents=True, exist_ok=True)
ASSET.mkdir(parents=True, exist_ok=True)

PORTRAIT_SRC = Path(r"C:/Users/zju/AppData/Local/Temp/codex-clipboard-354992ba-ce58-4c6d-bc0f-786c089072f5.png")
LOGO_SRC = Path(r"D:/python_project/manim_extend_rainbow/video_project/nobel_physics_2026/public/logo.png")
QWEN_MOTIF_SRC = ASSET / "qwen-chemistry-motif-v01.png"
FONT_CN_BOLD = Path(r"C:/Windows/Fonts/msyhbd.ttc")
FONT_CN = Path(r"C:/Windows/Fonts/msyh.ttc")
FONT_EN = Path(r"C:/Windows/Fonts/arial.ttf")

SERIES = "每天5分钟科普·自催化"
TITLE = ("诺贝尔", "化学奖")
NAMES = "Henri B. Kagan  ·  Kenso Soai"
PERSON_NAMES = ("Henri B. Kagan", "Kenso Soai")
INK = (10, 42, 55, 255)
CYAN = (48, 165, 184, 215)
CYAN_SOFT = (92, 174, 184, 115)
GOLD = (197, 147, 56, 220)
PAPER = (244, 245, 240, 255)

CONFIG = {
    "16x9": {
        "size": (1920, 1080), "brand": (64, 48, 90), "pill": (68, 184, 40),
        "title": (64, 294, 172, 18), "motif": (62, 733, 750, 215),
        "portrait": (830, 258, 1030, 690), "names": (970, 40),
    },
    "4x3": {
        "size": (1920, 1440), "brand": (85, 64, 120), "pill": (85, 244, 48),
        "title": (82, 388, 188, 20), "motif": (80, 908, 680, 220),
        "portrait": (780, 491, 1080, 750), "names": (1235, 44),
    },
    "3x4": {
        "size": (1440, 1920), "brand": (85, 64, 120), "pill": (85, 244, 50),
        "title": (82, 382, 190, 20), "motif": (70, 800, 1300, 280),
        "portrait": (45, 1090, 1350, 725), "names": (1820, 46),
    },
    "9x16": {
        "size": (1080, 1920), "brand": (64, 48, 90), "pill": (64, 184, 42),
        "title": (60, 316, 162, 18), "motif": (52, 767, 976, 265),
        "portrait": (35, 1090, 1010, 630), "names": (1740, 37),
    },
}


def fnt(path: Path, px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), int(px))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def paper_background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = (yy / max(1, h))[..., None]
    top = np.array([247, 247, 243], dtype=np.float32)
    bottom = np.array([239, 244, 241], dtype=np.float32)
    rgb = (top * (1 - t) + bottom * t).astype(np.uint8)
    rng = np.random.default_rng(20261007 + w + h)
    rgb = np.clip(rgb.astype(np.float32) + rng.normal(0, 0.7, (h, w, 1)), 0, 255).astype(np.uint8)
    out = Image.fromarray(rgb, "RGB").convert("RGBA")
    return out


def tinted_logo(height: int) -> Image.Image:
    src = Image.open(LOGO_SRC).convert("RGBA")
    delta = ImageChops.difference(src.convert("RGB"), Image.new("RGB", src.size, (255, 255, 255))).convert("L")
    alpha = delta.point(lambda p: 0 if p < 12 else min(255, (p - 12) * 10))
    out = Image.new("RGBA", src.size, (21, 44, 48, 0)); out.putalpha(alpha)
    ratio = height / src.height
    return out.resize((round(src.width * ratio), height), Image.Resampling.LANCZOS)


def draw_brand(canvas: Image.Image, cfg: dict) -> dict:
    x, y, h = cfg["brand"]
    logo = tinted_logo(h); canvas.alpha_composite(logo, (x, y))
    d = ImageDraw.Draw(canvas); face = fnt(FONT_CN_BOLD, round(h * 44 / 90))
    bb = d.textbbox((0, 0), "rainbow鱼", font=face, anchor="lt")
    tx, ty = x + logo.width + round(h * 20 / 90), y + (h - bb[3]) // 2
    d.text((tx, ty), "rainbow鱼", font=face, fill=INK, anchor="lt")
    return {"logo": [x, y, x + logo.width, y + h], "brandText": list(d.textbbox((tx, ty), "rainbow鱼", font=face, anchor="lt"))}


def draw_pill(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, px = cfg["pill"]; face = fnt(FONT_CN_BOLD, px); d = ImageDraw.Draw(canvas)
    bb = d.textbbox((0, 0), SERIES, font=face, anchor="lt"); pad_x, pad_y = round(px * .50), round(px * .34)
    box = [x, y, x + bb[2] + 2 * pad_x, y + (bb[3] - bb[1]) + 2 * pad_y]
    d.rounded_rectangle(box, radius=round(px * .34), fill=(10, 43, 53, 250))
    d.text((x + pad_x, y + pad_y), SERIES, font=face, fill=(246, 247, 242, 255), anchor="lt")
    return box


def draw_title(canvas: Image.Image, cfg: dict) -> dict:
    x, y, px, gap = cfg["title"]; face = fnt(FONT_CN_BOLD, px); d = ImageDraw.Draw(canvas); out = {}
    for i, line in enumerate(TITLE):
        yy = y + i * (px + gap); d.text((x, yy), line, font=face, fill=INK, anchor="lt")
        out[f"title{i + 1}"] = list(d.textbbox((x, yy), line, font=face, anchor="lt"))
    return out


def _largest_component(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape; seen = np.zeros_like(mask, dtype=bool); best: list[int] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]: continue
            q = [y * w + x]; seen[y, x] = True; comp: list[int] = []
            while q:
                idx = q.pop(); comp.append(idx); cy, cx = divmod(idx, w)
                for dy in (-1, 0, 1):
                    ny = cy + dy
                    if ny < 0 or ny >= h: continue
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0: continue
                        nx = cx + dx
                        if 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append(ny * w + nx)
            if len(comp) > len(best): best = comp
    out = np.zeros_like(mask, dtype=bool)
    if best: out.reshape(-1)[np.asarray(best, dtype=np.int64)] = True
    return out


def _fill_mask_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape; empty = ~mask; outside = np.zeros_like(mask, dtype=bool); q: deque[tuple[int, int]] = deque()
    def add(y: int, x: int) -> None:
        if 0 <= y < h and 0 <= x < w and empty[y, x] and not outside[y, x]:
            outside[y, x] = True; q.append((y, x))
    for x in range(w): add(0, x); add(h - 1, x)
    for y in range(h): add(y, 0); add(y, w - 1)
    while q:
        y, x = q.popleft(); add(y - 1, x); add(y + 1, x); add(y, x - 1); add(y, x + 1)
    return ~outside


@lru_cache(maxsize=1)
def extract_portrait() -> Image.Image:
    """Keep the attached two-person drawing pixel-for-pixel.

    The ink and ochre contours define a connected silhouette. Filling the
    enclosed regions keeps the white faces and shirts while removing only the
    unrelated scan paper. No recolouring or line reconstruction is performed.
    """
    src = Image.open(PORTRAIT_SRC).convert("RGBA")
    rgb = np.asarray(src.convert("RGB")).astype(np.int16)
    lum = rgb.mean(axis=2); chroma = rgb.max(axis=2) - rgb.min(axis=2); warm = rgb[..., 0] - rgb[..., 2]
    foreground = (lum < 225) | (warm > 12) | (chroma > 12)
    silhouette = _fill_mask_holes(_largest_component(foreground))
    alpha = Image.fromarray(np.where(silhouette, 255, 0).astype(np.uint8), "L")
    # The crown and brow contours are intentionally open in the source.
    # Keep the whole face interior opaque: filling only the forehead would
    # leave transparent gaps (and shadow stripes) between the brows.
    ImageDraw.Draw(alpha).polygon(
        [(274, 98), (307, 98), (338, 110), (369, 131), (387, 157),
         (398, 194), (401, 234), (414, 246), (417, 266), (413, 288),
         (398, 301), (383, 331), (372, 354), (352, 377), (329, 393),
         (298, 404), (274, 403), (249, 394), (229, 375), (211, 352),
         (194, 325), (188, 308), (176, 306), (171, 287), (169, 263),
         (174, 244), (181, 234), (185, 205), (191, 176), (201, 153),
         (219, 129), (244, 111)], fill=255)
    src.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox:
        pad_x, pad_y = round(src.width * .025), round(src.height * .02)
        bbox = (max(0, bbox[0] - pad_x), max(0, bbox[1] - pad_y), min(src.width, bbox[2] + pad_x), min(src.height, bbox[3] + pad_y))
        src = src.crop(bbox)
        src.info["sourceCrop"] = list(bbox)
    return src


def draw_orbit(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["orbit"]; layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.arc((x, y, x + w, y + h), 202, 345, fill=(54, 161, 176, 48), width=max(2, round(min(canvas.size) / 640)))
    d.arc((x + round(w * .04), y + round(h * .07), x + round(w * .96), y + round(h * .93)), 205, 344, fill=(205, 159, 69, 25), width=max(1, round(min(canvas.size) / 900)))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(max(.5, min(canvas.size) / 1100))))
    return [x, y, x + w, y + h]


@lru_cache(maxsize=1)
def extract_qwen_motif() -> Image.Image:
    """Make the Qwen hand-drawn motif behave like ink on the cover paper."""
    src = Image.open(QWEN_MOTIF_SRC).convert("RGBA")
    rgb = np.asarray(src.convert("RGB")).astype(np.float32)
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    warm = np.maximum(rgb[..., 0] - rgb[..., 2], 0)
    cool = np.maximum(rgb[..., 2] - rgb[..., 0], 0)
    contrast = np.maximum.reduce([255 - lum, sat * 2.6, warm * 1.4, cool * 1.4])
    # Keep the pale watercolor wash, while dropping near-white generation
    # paper and its edge noise.
    alpha = np.clip((contrast - 22) * 5.4, 0, 255).astype(np.uint8)
    mask = alpha >= 18
    bbox = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").getbbox()
    src.putalpha(Image.fromarray(alpha, "L"))
    if bbox:
        pad_x, pad_y = round(src.width * .018), round(src.height * .035)
        bbox = (max(0, bbox[0] - pad_x), max(0, bbox[1] - pad_y), min(src.width, bbox[2] + pad_x), min(src.height, bbox[3] + pad_y))
        src = src.crop(bbox)
    return src


def paste_qwen_motif(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["motif"]
    motif = extract_qwen_motif()
    scale = min(w / motif.width, h / motif.height)
    im = motif.resize((round(motif.width * scale), round(motif.height * scale)), Image.Resampling.LANCZOS)
    xx, yy = x + (w - im.width) // 2, y + (h - im.height) // 2
    alpha = im.getchannel("A")
    halo = Image.new("RGBA", im.size, (64, 170, 182, 0))
    halo.putalpha(alpha.filter(ImageFilter.GaussianBlur(max(8, round(min(im.size) * .035)))).point(lambda p: int(p * .10)))
    canvas.alpha_composite(halo, (xx, yy)); canvas.alpha_composite(im, (xx, yy))
    return [xx, yy, xx + im.width, yy + im.height]


def line_glow(canvas: Image.Image, points, fill, width: int, glow: int = 8) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.line(points, fill=fill, width=width, joint="curve")
    if glow: canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(glow)))
    canvas.alpha_composite(layer)


def molecule(d: ImageDraw.ImageDraw, cx: int, cy: int, r: int, flip: int) -> None:
    """Small tetrahedral chiral motif; mirror it for the opposite handedness."""
    d.ellipse((cx - r // 4, cy - r // 4, cx + r // 4, cy + r // 4), fill=GOLD)
    pts = [(cx, cy - r), (cx + flip * r, cy), (cx, cy + r), (cx - flip * r, cy)]
    for px, py in pts:
        d.line((cx, cy, px, py), fill=(61, 118, 124, 180), width=max(2, r // 13))
        d.ellipse((px - r // 5, py - r // 5, px + r // 5, py + r // 5), fill=(58, 166, 183, 220), outline=(242, 244, 237, 220), width=max(1, r // 18))


def arrowhead(d: ImageDraw.ImageDraw, x: int, y: int, size: int, angle: float, fill) -> None:
    pts = []
    for a in (angle + math.pi * .82, angle, angle - math.pi * .82):
        pts.append((x + math.cos(a) * size, y + math.sin(a) * size))
    d.polygon(pts, fill=fill)


def draw_chemistry_motif(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["motif"]; layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    cy = y + round(h * .52); r = round(min(48, h * .17))
    # Reactants flow into two mirror-image products.
    d.ellipse((x + 20, cy - r, x + 20 + 2 * r, cy + r), outline=(58, 166, 183, 190), width=max(2, r // 10))
    d.ellipse((x + 52, cy - r // 2, x + 52 + r, cy + r // 2), fill=(197, 147, 56, 130))
    line_glow(canvas, [(x + 2 * r + 45, cy), (x + round(w * .27), cy)], CYAN_SOFT, max(2, r // 12), 7)
    arrowhead(d, x + round(w * .27), cy, round(r * .28), 0, CYAN)
    left_c = x + round(w * .46); right_c = x + round(w * .62)
    molecule(d, left_c, cy, r, 1); molecule(d, right_c, cy, r, -1)
    # A restrained mirror line makes the chirality relation legible.
    d.line((left_c + r + 22, cy - r * 1.55, right_c - r - 22, cy - r * 1.55), fill=(197, 147, 56, 110), width=max(1, r // 15))
    # Feedback loop around the product: the product helps make more product.
    loop = (x + round(w * .62), cy - round(r * 1.75), x + round(w * .94), cy + round(r * 1.75))
    d.arc(loop, 205, 505, fill=(197, 147, 56, 180), width=max(2, r // 11))
    end_ang = math.radians(205)
    ex = loop[0] + (loop[2] - loop[0]) / 2 + (loop[2] - loop[0]) / 2 * math.cos(end_ang)
    ey = loop[1] + (loop[3] - loop[1]) / 2 + (loop[3] - loop[1]) / 2 * math.sin(end_ang)
    arrowhead(d, round(ex), round(ey), round(r * .30), end_ang + math.pi / 2, GOLD)
    # Three small pulses suggest nonlinear amplification without a text panel.
    for i, rr in enumerate((r * .30, r * .44, r * .58)):
        cx = x + round(w * (.77 + .055 * i)); d.ellipse((cx - rr / 2, cy - rr / 2, cx + rr / 2, cy + rr / 2), outline=(58, 166, 183, 90 - i * 18), width=max(1, r // 16))
    # Quiet baseline keeps the motif seated in the paper composition.
    d.line((x, y + h - 8, x + w, y + h - 8), fill=(98, 173, 181, 32), width=max(1, round(min(canvas.size) / 1000)))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(.35)))
    canvas.alpha_composite(layer)
    return [x, y, x + w, y + h]


def draw_portrait(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["portrait"]; portrait = extract_portrait()
    scale = min(w / portrait.width, h / portrait.height)
    resized = portrait.resize((round(portrait.width * scale), round(portrait.height * scale)), Image.Resampling.LANCZOS)
    px, py = x + (w - resized.width) // 2, y + (h - resized.height) // 2
    alpha = resized.getchannel("A"); shadow_alpha = alpha.filter(ImageFilter.GaussianBlur(16)).point(lambda p: min(58, int(p * .23)))
    shadow = Image.new("RGBA", resized.size, (54, 83, 88, 0)); shadow.putalpha(shadow_alpha)
    canvas.alpha_composite(shadow, (px + 9, py + 14)); canvas.alpha_composite(resized, (px, py))
    return [px, py, px + resized.width, py + resized.height]


def draw_names(canvas: Image.Image, cfg: dict, portrait_box: list[int]) -> dict:
    cy, px = cfg["names"]; face = fnt(FONT_EN, px); d = ImageDraw.Draw(canvas)
    left, _, right, _ = portrait_box; result = {}
    # Tie each name to the corresponding face, rather than centring a
    # combined caption on the page independently of the drawing.
    for i, (name, fraction) in enumerate(zip(PERSON_NAMES, (.272, .717))):
        width = d.textlength(name, font=face)
        x = round(left + (right - left) * fraction - width / 2)
        d.text((x, cy), name, font=face, fill=INK, anchor="lt")
        result[f"name{i + 1}"] = list(d.textbbox((x, cy), name, font=face, anchor="lt"))
    return result


def compose(ratio: str) -> tuple[Image.Image, dict]:
    cfg = CONFIG[ratio]; canvas = paper_background(cfg["size"]); boxes = draw_brand(canvas, cfg)
    boxes["series"] = draw_pill(canvas, cfg)
    boxes.update(draw_title(canvas, cfg))
    boxes["motif"] = paste_qwen_motif(canvas, cfg)
    boxes["portrait"] = draw_portrait(canvas, cfg)
    boxes.update(draw_names(canvas, cfg, boxes["portrait"]))
    return canvas, boxes


def save_outputs() -> None:
    portrait = extract_portrait()
    portrait.save(ASSET / "portrait-alpha.png")
    extract_qwen_motif().save(ASSET / "qwen-chemistry-motif-clean.png")
    original_crop = Image.open(PORTRAIT_SRC).convert("RGB").crop(portrait.info["sourceCrop"])
    rgb_preserved = np.array_equal(np.asarray(portrait.convert("RGB")), np.asarray(original_crop))
    assert rgb_preserved, "Portrait RGB must come unchanged from the supplied image"
    records = []
    for ratio, cfg in CONFIG.items():
        image, boxes = compose(ratio); path = OUT / f"chemistry2026-cover-{ratio}.jpg"
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        image.convert("RGB").save(path, "JPEG", quality=96, subsampling=0, optimize=True, icc_profile=profile)
        with Image.open(path) as check:
            assert check.size == cfg["size"] and check.mode == "RGB" and check.info.get("icc_profile")
        # Review actual text ink bounds and image placements at delivery size.
        for key, (left, top, right, bottom) in boxes.items():
            assert 0 <= left < right <= image.width and 0 <= top < bottom <= image.height, (ratio, key, "clipped")
        for i, (key_a, a) in enumerate(boxes.items()):
            for key_b, b in list(boxes.items())[i + 1:]:
                overlap = min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])
                assert not overlap, (ratio, key_a, key_b, "overlap")
        records.append({"ratio": ratio, "size": list(cfg["size"]), "file": path.name, "textBounds": boxes, "sha256": sha256(path), "mode": "RGB", "colorSpace": "sRGB", "validation": {"allBoundsInsideCanvas": True, "noComponentBoxOverlaps": True}})

    contact = Image.new("RGB", (1640, 1120), (222, 228, 227)); cd = ImageDraw.Draw(contact)
    slots = [(30, 30), (850, 30), (30, 580), (850, 580)]
    for ratio, (x, y) in zip(CONFIG, slots):
        im = Image.open(OUT / f"chemistry2026-cover-{ratio}.jpg").convert("RGB"); im.thumbnail((760, 470), Image.Resampling.LANCZOS); contact.paste(im, (x + (760 - im.width) // 2, y)); cd.text((x, y + 480), f"{ratio.replace('x', ':')}  {CONFIG[ratio]['size'][0]} × {CONFIG[ratio]['size'][1]}", font=fnt(FONT_CN_BOLD, 26), fill=INK)
    contact.save(OUT / "cover-contact.jpg", "JPEG", quality=96, subsampling=0)
    review = Image.new("RGB", (1640, 860), (222, 228, 227)); rd = ImageDraw.Draw(review)
    for col, ratio in enumerate(CONFIG):
        x = 25 + col * 405; rd.text((x, 18), f"{ratio.replace('x', ':')} · 320 / 160", font=fnt(FONT_CN, 22), fill=INK); im = Image.open(OUT / f"chemistry2026-cover-{ratio}.jpg").convert("RGB")
        for edge, yy in ((320, 64), (160, 445)):
            thumb = im.copy(); thumb.thumbnail((edge, edge), Image.Resampling.LANCZOS); review.paste(thumb, (x, yy))
    review.save(OUT / "cover-thumbnails.jpg", "JPEG", quality=96, subsampling=0)

    source = {
        "subject": "2026 Nobel Prize in Chemistry", "awardYear": "2026", "dateAwarded": "2026-10-07", "laureates": ["Henri B. Kagan", "Kenso Soai"],
        "motivation": "for the discovery of non-linear effects and autocatalysis in asymmetric organic synthesis", "series": SERIES, "headline": "诺贝尔化学奖", "topic": "自催化与不对称有机合成", "names": NAMES,
        "layoutRevision": "2026-10-07 editorial reflow: larger titles; true top text anchors; larger tightly cropped motif; individual names under each face; no decorative orbit or ruled background",
        "portraitSource": str(PORTRAIT_SRC), "portraitProcessing": "attached two-person line drawing RGB preserved exactly before proportional resizing; alpha-only exterior scan-paper removal with connected silhouette and enclosed-hole fill; source-specific forehead interior mask closes the open crown ink gap and retains white face paper; restrained offset shadow behind portrait",
        "portraitValidation": {"unscaledRGBIdenticalToOriginalCrop": rgb_preserved, "sourceCrop": portrait.info["sourceCrop"], "sourceSHA256": sha256(PORTRAIT_SRC)},
        "visualMotif": "Qwen hand-drawn redraw: reactants → mirrored chiral products → curved autocatalytic feedback loop; no fabricated experimental data",
        "qwenMotif": {"file": str(QWEN_MOTIF_SRC), "model": "qwen-image-2.0-pro-2026-06-22", "promptRecord": str(ASSET / "qwen-chemistry-motif-v01-request.json"), "processing": "existing generated asset reused; near-white noise below contrast 22 removed; tight content crop with edge padding; original generated RGB retained; light halo and paper compositing", "generationStatus": "existing successful Qwen generation reused; no new generation in this layout revision"},
        "officialSources": ["https://api.nobelprize.org/2.1/nobelPrizes?limit=20&nobelPrizeCategory=che&sort=desc", "https://api.nobelprize.org/2/laureate/1065", "https://api.nobelprize.org/2/laureate/1066", "https://www.nobelprize.org/prizes/chemistry/2026/summary/"],
        "outputs": records,
    }
    (OUT / "source-record.json").write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "layout.json").write_text(json.dumps({"config": CONFIG, "fonts": {"chinese": str(FONT_CN_BOLD), "english": str(FONT_EN)}, "actualBounds": {r["ratio"]: r["textBounds"] for r in records}}, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "layout-report.md").write_text("""# 化学奖封面排版优化

- 四比例独立重排：16:9 1920×1080；4:3 1920×1440；3:4 1440×1920；9:16 1080×1920。
- 横版为左侧标题与机制、右侧人物；竖版依次安排标题、手绘机制、人物。放大主标题，统一边距和文字基线。
- 修正栏目标签的垂直居中，避免文字贴近底边。保留文案：每天5分钟科普·自催化；诺贝尔 / 化学奖。
- 两位英文姓名分别与对应人脸中心对齐。没有新增副标题或小字。
- 复用已生成的 Qwen 手绘示意，提高背景噪声阈值并紧裁内容，放大有效图形；没有新增 API 调用。
- 移除背景横线与装饰弧线，延续浅色纸张、深蓝灰、青金色的系列配色。
- 人物仅修改透明度，未修改原始 RGB、线条粗细或面部颜色；等比缩放前与源图裁切逐像素对比通过。修复左侧人物头顶开口轮廓导致的白色额头透明问题。
- 导出检查：四张 JPG 均为 RGB、内嵌 sRGB、quality 96；所有元素框位于画内，无相互重叠。实际坐标保存在 layout.json 和 source-record.json。
- 320 px / 160 px 缩略图供人工复核。主标题优先可辨，英文姓名和机制细节在 160 px 时属于次级信息。
""", encoding="utf-8")
    print("\n".join(str(OUT / f"chemistry2026-cover-{r}.jpg") for r in CONFIG))


if __name__ == "__main__":
    save_outputs()
