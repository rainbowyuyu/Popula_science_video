from __future__ import annotations

"""Create the dark four-ratio cover for the 2026 Nobel Prize in Physics.

The portrait is the user-provided line drawing.  The small scientific motifs
are deterministic vector reconstructions of the verified IceCube story:
neutrino path, optical modules in deep ice, and Cherenkov light.  They are
deliberately schematic and are not presented as raw detector imagery.
"""

from pathlib import Path
import hashlib
import json
import math

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageCms

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "delivery/physics2026_cover_v01/covers"
OUT.mkdir(parents=True, exist_ok=True)
PORTRAIT_SRC = Path(r"C:/Users/zju/AppData/Local/Temp/codex-clipboard-ba9dedd5-0800-4c8e-9211-12874f63887c.png")
LOGO_SRC = ROOT / "public/logo.png"
FONT_CN = Path(r"C:/Windows/Fonts/msyhbd.ttc")
FONT_REG = Path(r"C:/Windows/Fonts/msyh.ttc")
FONT_EN = Path(r"C:/Windows/Fonts/arial.ttf")

INK = (237, 242, 242, 255)
MUTED = (170, 191, 199, 255)
CYAN = (64, 211, 235, 255)
BLUE = (48, 119, 218, 235)
GOLD = (224, 176, 82, 255)
PAPER = (10, 18, 29)
PAPER_2 = (17, 31, 47)
SERIES = "每天5分钟科普·诺贝尔物理学奖"
TITLE = ("2026 诺贝尔", "物理学奖")
NAME = "Francis Halzen"
TOPIC = "IceCube · 高能中微子"
TAGLINE = "一立方公里的冰，留下来自宇宙的光"

CONFIG = {
    "16x9": {
        "size": (1920, 1080), "brand": (66, 48, 66), "pill": (66, 172, 38),
        "title": (66, 286, 116, 20), "name": (72, 610, 56), "topic": (74, 704, 29),
        "tagline": (74, 748, 28), "portrait": (1000, 120, 900, 830),
        "motif": (72, 872, 830, 148), "motif_scale": 1.0,
    },
    "4x3": {
        "size": (1920, 1440), "brand": (84, 60, 78), "pill": (84, 218, 44),
        "title": (84, 354, 138, 24), "name": (92, 730, 64), "topic": (94, 832, 34),
        "tagline": (94, 886, 32), "portrait": (690, 570, 1215, 850),
        "motif": (84, 1110, 560, 205), "motif_scale": 1.0,
    },
    "3x4": {
        "size": (1440, 1920), "brand": (76, 56, 86), "pill": (76, 230, 50),
        "title": (76, 378, 162, 26), "name": (82, 780, 56), "topic": (84, 882, 32),
        "tagline": (84, 932, 30), "portrait": (60, 1040, 1320, 710),
        "motif": (74, 1540, 1270, 180), "motif_scale": 0.88,
    },
    "9x16": {
        "size": (1080, 1920), "brand": (58, 46, 58), "pill": (58, 214, 38),
        "title": (58, 360, 128, 24), "name": (64, 718, 47), "topic": (66, 805, 27),
        "tagline": (66, 852, 26), "portrait": (48, 1010, 984, 620),
        "motif": (58, 1490, 964, 190), "motif_scale": 0.72,
    },
}


def fnt(path: Path, px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), int(px))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dark_background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = xx / max(1, w)
    base = np.zeros((h, w, 4), dtype=np.uint8)
    base[..., 0] = np.clip(7 + 9 * (1 - t), 0, 255)
    base[..., 1] = np.clip(14 + 17 * (1 - t), 0, 255)
    base[..., 2] = np.clip(25 + 25 * (1 - t), 0, 255)
    base[..., 3] = 255
    im = Image.fromarray(base, "RGBA")
    glows = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glows)
    gd.ellipse((int(w * .46), int(h * .08), int(w * 1.15), int(h * .98)), fill=(18, 83, 122, 72))
    gd.ellipse((int(-w * .28), int(h * .48), int(w * .62), int(h * 1.28)), fill=(17, 47, 84, 50))
    glows = glows.filter(ImageFilter.GaussianBlur(max(24, int(min(size) * .09))))
    return Image.alpha_composite(im, glows)


def tinted_logo(height: int) -> Image.Image:
    src = Image.open(LOGO_SRC).convert("RGBA")
    rgb = src.convert("RGB")
    delta = ImageChops.difference(rgb, Image.new("RGB", src.size, (255, 255, 255))).convert("L")
    alpha = delta.point(lambda p: 0 if p < 12 else min(255, (p - 12) * 10))
    out = Image.new("RGBA", src.size, (235, 245, 242, 0))
    out.putalpha(alpha)
    ratio = height / src.height
    return out.resize((round(src.width * ratio), height), Image.Resampling.LANCZOS)


def extract_portrait() -> Image.Image:
    src = Image.open(PORTRAIT_SRC).convert("RGB")
    w, h = src.size
    arr = np.asarray(src).astype(np.int16)
    lum = arr.mean(axis=2)
    dark = np.clip((218 - lum) * 3.8, 0, 225)
    gold = np.clip((arr[..., 0] - arr[..., 2] - 12) * 8.5, 0, 175)
    # Keep the illustration strokes but remove the paper rectangle.
    ink_alpha = Image.fromarray(dark.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(.45))
    gold_alpha = Image.fromarray(gold.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(.45))
    # The source scan has a few low-level paper pixels. Remove them before
    # scaling and haloing; otherwise the paper rectangle reappears as a faint
    # box around the otherwise feathered portrait.
    ink_alpha = ink_alpha.point(lambda p: p if p >= 22 else 0)
    gold_alpha = gold_alpha.point(lambda p: p if p >= 15 else 0)
    # A low-opacity face plane keeps the portrait readable on navy while the
    # edges fall away softly; it does not create a rectangular background.
    fill = Image.new("L", (w, h), 0)
    fd = ImageDraw.Draw(fill)
    fd.ellipse((145, 12, 453, 386), fill=54)
    fd.ellipse((75, 170, 555, 412), fill=20)
    fill = fill.filter(ImageFilter.GaussianBlur(18))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    plane = Image.new("RGBA", (w, h), (231, 239, 235, 0)); plane.putalpha(fill)
    out = Image.alpha_composite(out, plane)
    ivory = Image.new("RGBA", (w, h), (227, 238, 237, 0)); ivory.putalpha(ink_alpha)
    warm = Image.new("RGBA", (w, h), (225, 174, 76, 0)); warm.putalpha(gold_alpha)
    out = Image.alpha_composite(out, ivory)
    out = Image.alpha_composite(out, warm)
    # Soften the outer contour after compositing, avoiding a hard cut-out edge.
    a = out.getchannel("A").filter(ImageFilter.GaussianBlur(.35))
    out.putalpha(a)
    return out


def draw_brand(canvas: Image.Image, cfg: dict) -> dict:
    x, y, h = cfg["brand"]
    logo = tinted_logo(h)
    canvas.alpha_composite(logo, (x, y))
    d = ImageDraw.Draw(canvas)
    face = fnt(FONT_REG, round(h * .52))
    tx = x + logo.width + round(h * .24)
    ty = y + round(h * .22)
    d.text((tx, ty), "rainbow鱼", font=face, fill=INK)
    bb = d.textbbox((0, 0), "rainbow鱼", font=face)
    return {"logo": [x, y, x + logo.width, y + h], "brandText": [tx, ty, tx + bb[2], ty + bb[3] - bb[1]]}


def draw_pill(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, px = cfg["pill"]
    face = fnt(FONT_CN, px)
    d = ImageDraw.Draw(canvas)
    bb = d.textbbox((0, 0), SERIES, font=face)
    pad_x, pad_y = round(px * .43), round(px * .30)
    box = [x, y, x + bb[2] + 2 * pad_x, y + (bb[3] - bb[1]) + 2 * pad_y]
    d.rounded_rectangle(box, radius=round(px * .36), fill=(229, 240, 239, 245))
    d.text((x + pad_x, y + pad_y), SERIES, font=face, fill=(7, 20, 31, 255))
    return box


def draw_title(canvas: Image.Image, cfg: dict) -> dict:
    x, y, px, gap = cfg["title"]
    face = fnt(FONT_CN, px)
    d = ImageDraw.Draw(canvas)
    out = {}
    for i, line in enumerate(TITLE):
        yy = y + i * (px + gap)
        d.text((x, yy), line, font=face, fill=INK)
        bb = d.textbbox((0, 0), line, font=face)
        out[f"title{i+1}"] = [x, yy, x + bb[2], yy + bb[3] - bb[1]]
    return out


def line_glow(canvas: Image.Image, points, fill, width=2, glow=10):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line(points, fill=fill, width=width, joint="curve")
    if glow:
        blur = layer.filter(ImageFilter.GaussianBlur(glow))
        canvas.alpha_composite(blur)
    canvas.alpha_composite(layer)


def draw_research_motifs(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, width, height = cfg["motif"]
    sc = cfg["motif_scale"]
    d = ImageDraw.Draw(canvas)
    # A hairline connector unifies the three research steps.
    base_y = y + round(height * .55)
    line_glow(canvas, [(x, base_y), (x + width, base_y)], (65, 153, 203, 95), max(1, round(2 * sc)), 8)
    centers = [x + round(width * .17), x + round(width * .50), x + round(width * .83)]
    r = round(min(44, height * .29) * sc)
    # 1. A neutrino keeps its direction while crossing Earth.
    cx, cy = centers[0], base_y
    d.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(66, 151, 206, 205), width=max(1, round(2*sc)), fill=(17, 42, 65, 130))
    d.arc((cx-r+6, cy-r+8, cx+r-6, cy+r-8), 200, 335, fill=(210, 225, 226, 120), width=max(1, round(1*sc)))
    line_glow(canvas, [(cx-r*2.2, cy-r*1.4), (cx+r*1.9, cy+r*1.2)], (75, 219, 239, 235), max(1, round(2*sc)), 8)
    d.text((cx-r*1.95, cy-r*1.9), "ν", font=fnt(FONT_EN, round(28*sc)), fill=CYAN)
    # 2. IceCube: strings + optical modules in deep ice.
    cx, cy = centers[1], base_y
    for j in range(-2, 3):
        xx = cx + round(j * 15 * sc)
        line_glow(canvas, [(xx, cy-r*1.7), (xx, cy+r*1.7)], (94, 156, 194, 165), max(1, round(1.5*sc)), 5)
        for k in range(4):
            yy = cy-r*1.35 + k*round(22*sc)
            d.ellipse((xx-4*sc, yy-4*sc, xx+4*sc, yy+4*sc), fill=(75, 215, 239, 230), outline=(200, 243, 242, 170), width=1)
    d.text((cx-r*1.1, cy+r*1.65), "IceCube", font=fnt(FONT_EN, round(19*sc)), fill=MUTED)
    # 3. Cherenkov cone / timed blue light.
    cx, cy = centers[2], base_y
    apex = (cx-r*1.65, cy)
    top = (cx+r*1.65, cy-r*1.25)
    bot = (cx+r*1.65, cy+r*1.25)
    line_glow(canvas, [apex, top], (75, 219, 239, 225), max(1, round(2*sc)), 8)
    line_glow(canvas, [apex, bot], (75, 219, 239, 225), max(1, round(2*sc)), 8)
    for frac in (.30, .52, .74):
        xx = apex[0] + (top[0]-apex[0])*frac
        spread = (top[1]-apex[1])*frac
        line_glow(canvas, [(xx, cy-spread), (xx+round(30*sc), cy-spread-round(8*sc))], (220, 176, 83, 210), max(1, round(1.5*sc)), 5)
    d.text((cx-r*1.18, cy+r*1.65), "Cherenkov", font=fnt(FONT_EN, round(18*sc)), fill=MUTED)
    return [x, y, x + width, y + height]


def draw_cover(ratio: str) -> tuple[Image.Image, dict]:
    cfg = CONFIG[ratio]
    canvas = dark_background(cfg["size"])
    boxes = draw_brand(canvas, cfg)
    boxes["series"] = draw_pill(canvas, cfg)
    boxes.update(draw_title(canvas, cfg))
    d = ImageDraw.Draw(canvas)
    nx, ny, npx = cfg["name"]
    d.text((nx, ny), NAME, font=fnt(FONT_EN, npx), fill=GOLD)
    nb = d.textbbox((0, 0), NAME, font=fnt(FONT_EN, npx))
    boxes["name"] = [nx, ny, nx + nb[2], ny + nb[3] - nb[1]]
    tx, ty, tpx = cfg["topic"]
    # Microsoft YaHei keeps the Chinese topic legible beside the Latin name;
    # using Arial here would turn the Chinese glyphs into empty squares.
    topic_face = fnt(FONT_REG, tpx)
    d.text((tx, ty), TOPIC, font=topic_face, fill=CYAN)
    tb = d.textbbox((0, 0), TOPIC, font=topic_face)
    boxes["topic"] = [tx, ty, tx + tb[2], ty + tb[3] - tb[1]]
    gx, gy, gpx = cfg["tagline"]
    tagline_face = fnt(FONT_REG, gpx)
    d.text((gx, gy), TAGLINE, font=tagline_face, fill=MUTED)
    gb = d.textbbox((0, 0), TAGLINE, font=tagline_face)
    boxes["tagline"] = [gx, gy, gx + gb[2], gy + gb[3] - gb[1]]
    boxes["motifs"] = draw_research_motifs(canvas, cfg)
    # Portrait halo and cut-out, with no visible rectangular scan-paper edge.
    px, py, pw, ph = cfg["portrait"]
    portrait = extract_portrait()
    scale = min(pw / portrait.width, ph / portrait.height)
    resized = portrait.resize((round(portrait.width*scale), round(portrait.height*scale)), Image.Resampling.LANCZOS)
    rx = px + (pw-resized.width)//2; ry = py + (ph-resized.height)//2
    halo = Image.new("RGBA", resized.size, (0, 0, 0, 0))
    ha = resized.getchannel("A").filter(ImageFilter.GaussianBlur(30))
    halo.putalpha(ha.point(lambda p: min(85, int(p*.28))))
    halo_col = Image.new("RGBA", resized.size, (42, 166, 215, 0)); halo_col.putalpha(halo.getchannel("A"))
    canvas.alpha_composite(halo_col, (rx, ry))
    canvas.alpha_composite(resized, (rx, ry))
    boxes["portrait"] = [rx, ry, rx+resized.width, ry+resized.height]
    # Tiny source cue in the empty lower corner, readable but not a paragraph.
    source = "Nobel Prize in Physics 2026 · IceCube"
    sf = fnt(FONT_REG, max(16, round(min(canvas.size)*.016)))
    d.text((cfg["size"][0]-d.textbbox((0,0),source,font=sf)[2]-40, cfg["size"][1]-50), source, font=sf, fill=(151,178,190,170))
    return canvas, boxes


def save_outputs() -> None:
    records = []
    for ratio in CONFIG:
        image, boxes = draw_cover(ratio)
        path = OUT / f"physics2026-cover-{ratio}.jpg"
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        image.convert("RGB").save(path, "JPEG", quality=95, subsampling=0, optimize=True, icc_profile=profile)
        with Image.open(path) as check:
            assert check.size == CONFIG[ratio]["size"] and check.mode == "RGB" and check.info.get("icc_profile")
        records.append({"ratio": ratio, "size": list(CONFIG[ratio]["size"]), "file": path.name,
                        "textBounds": boxes, "sha256": digest(path), "mode": "RGB", "colorSpace": "sRGB"})
    contact = Image.new("RGB", (1640, 1120), (7, 13, 22))
    cd = ImageDraw.Draw(contact)
    slots = [(30, 30), (850, 30), (30, 580), (850, 580)]
    for ratio, (x, y) in zip(CONFIG, slots):
        thumb = Image.open(OUT / f"physics2026-cover-{ratio}.jpg").convert("RGB")
        thumb.thumbnail((760, 470), Image.Resampling.LANCZOS)
        contact.paste(thumb, (x + (760-thumb.width)//2, y))
        cd.text((x, y+480), f"{ratio.replace('x', ':')}  {CONFIG[ratio]['size'][0]} × {CONFIG[ratio]['size'][1]}", font=fnt(FONT_REG, 26), fill=(220,232,235))
    contact.save(OUT / "cover-contact.jpg", "JPEG", quality=95, subsampling=0)
    review = Image.new("RGB", (1640, 860), (7, 13, 22))
    rd = ImageDraw.Draw(review)
    for col, ratio in enumerate(CONFIG):
        x = 25 + col*405; rd.text((x,18), f"{ratio.replace('x', ':')} · 320 / 160", font=fnt(FONT_REG,22), fill=(220,232,235))
        im = Image.open(OUT / f"physics2026-cover-{ratio}.jpg").convert("RGB")
        for edge, yy in ((320,64),(160,445)):
            thumb=im.copy(); thumb.thumbnail((edge,edge),Image.Resampling.LANCZOS); review.paste(thumb,(x,yy))
    review.save(OUT / "cover-thumbnails.jpg", "JPEG", quality=95, subsampling=0)
    source_record = {
        "subject": "2026 Nobel Prize in Physics",
        "laureate": NAME,
        "citation": "for decisive contributions to the IceCube Neutrino Observatory and the discovery of high-energy neutrinos of astrophysical origin",
        "series": SERIES, "topic": TOPIC, "tagline": TAGLINE,
        "layoutReference": "D:/python_project/manim_extend_rainbow/video_project/topology_optimization/delivery/nobel2026_v2/covers/cover-contact.jpg",
        "portraitSource": str(PORTRAIT_SRC), "portraitProcessing": "ink/gold alpha extraction, face-plane translucency, Gaussian feathering; no rectangular paper background",
        "researchMotifs": ["neutrino direction through Earth", "IceCube optical modules in deep ice", "Cherenkov light cone"],
        "motifStatus": "programmatic schematic redraw based on verified official research notes; not raw detector imagery",
        "officialSources": [
            "https://www.nobelprize.org/prizes/physics/2026/press-release/",
            "https://www.nobelprize.org/prizes/physics/2026/summary/",
            "https://www.nobelprize.org/uploads/2026/10/popular-physicsprize2026.pdf",
            "https://www.kva.se/app/uploads/2026/10/nobel-physics-2026-scientific-background_34f71vieby.pdf",
        ],
        "localResearch": str(ROOT.parents[1] / "research/nobelphysics2026/research-note.md"),
        "darkPalette": {"background": "deep navy/black", "accent": "Cherenkov cyan + restrained gold", "text": "ivory"},
        "outputs": records,
    }
    (OUT / "source-record.json").write_text(json.dumps(source_record, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "research-sources.md").write_text("# 2026 诺贝尔物理学奖封面资料\n\n得主：Francis Halzen。授奖理由：for decisive contributions to the IceCube Neutrino Observatory and the discovery of high-energy neutrinos of astrophysical origin.\n\n封面小插图重绘三步：中微子穿过地球 → 深冰中的 IceCube 光学模块 → Cherenkov 光锥。数字和研究事实来自本地核验记录 `research/nobelphysics2026/source-audit.md` 与 `research/nobelphysics2026/research-note.md`。\n\n官方来源：\n- https://www.nobelprize.org/prizes/physics/2026/press-release/\n- https://www.nobelprize.org/prizes/physics/2026/summary/\n- https://www.nobelprize.org/uploads/2026/10/popular-physicsprize2026.pdf\n- https://www.kva.se/app/uploads/2026/10/nobel-physics-2026-scientific-background_34f71vieby.pdf\n", encoding="utf-8")
    print("\n".join(str(OUT / f"physics2026-cover-{r}.jpg") for r in CONFIG))


if __name__ == "__main__":
    save_outputs()
