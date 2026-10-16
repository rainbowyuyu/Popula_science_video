"""Create the DNA-storage episode cover set.

The artwork is procedural and deliberately contains no generated lettering.  The
background shows one clear mechanism: file blocks travel into a DNA helix, while
short strands are recovered on the other side.  Text and the supplied rainbow
fish logo are composited afterwards so Chinese characters stay exact.

Outputs (RGB, sRGB, high quality JPG and PNG): 16:9, 3:4, 4:3 and 9:16.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cover" / "output"
ART = ROOT / "cover" / "artwork"
LOGO = ROOT / "public" / "brand" / "logo.png"

# A Chinese font is resolved explicitly: no silent fallback to a Latin font.
SERIF = Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf")
SANS = Path(r"C:\Windows\Fonts\NotoSansSC-VF.ttf")
if not SERIF.is_file():
    SERIF = Path(r"C:\Windows\Fonts\msyhbd.ttc")
if not SANS.is_file():
    SANS = Path(r"C:\Windows\Fonts\msyh.ttc")

INK = (20, 42, 53)
CREAM = (243, 240, 231)
TEAL = (26, 154, 158)
MINT = (141, 227, 212)
GOLD = (212, 155, 74)
CORAL = (228, 113, 97)
SLATE = (57, 88, 103)


FORMATS = {
    "16x9": {
        "size": (1920, 1080),
        "layout": "landscape",
        "title_xy": (100, 340),
        "title_size": 142,
        "series_xy": (104, 258),
        "series_size": 34,
        "hero": (0.69, 0.51, 0.40),
    },
    "4x3": {
        "size": (1440, 1080),
        "layout": "landscape",
        "title_xy": (76, 342),
        "title_size": 112,
        "series_xy": (78, 248),
        "series_size": 29,
        "hero": (0.73, 0.53, 0.43),
    },
    "3x4": {
        "size": (1080, 1440),
        "layout": "portrait",
        "title_xy": (72, 252),
        "title_size": 112,
        "series_xy": (74, 190),
        "series_size": 28,
        "hero": (0.51, 0.72, 0.55),
    },
    "9x16": {
        "size": (1080, 1920),
        "layout": "portrait",
        "title_xy": (72, 260),
        "title_size": 120,
        "series_xy": (74, 190),
        "series_size": 29,
        "hero": (0.51, 0.66, 0.50),
    },
}


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise FileNotFoundError(path)
    return ImageFont.truetype(str(path), size)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def gradient(size: tuple[int, int]) -> Image.Image:
    w, h = size
    px = Image.new("RGB", size)
    p = px.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for x in range(w):
            # ivory paper at the left, a cooler blue-green edge at the right
            u = x / max(1, w - 1)
            vignette = max(0.0, (u - 0.48) / 0.52)
            c = tuple(round(lerp(CREAM[i], (218, 232, 226)[i], 0.20 * vignette + 0.06 * t)) for i in range(3))
            # soft radial pool under the helix gives depth without a card-like panel
            glow = math.exp(-(((u - .73) / .30) ** 2 + ((t - .52) / .60) ** 2))
            c = tuple(min(255, round(v + glow * (8 if i != 1 else 14))) for i, v in enumerate(c))
            p[x, y] = c
    return px.convert("RGBA")


def polyline(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], fill, width: int, joint="curve"):
    draw.line(points, fill=fill, width=max(1, width), joint=joint)


def curve_points(p0, p1, p2, p3, count=80):
    out = []
    for i in range(count + 1):
        t = i / count
        u = 1 - t
        x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
        out.append((x, y))
    return out


def draw_background(size: tuple[int, int], layout: str, hero: tuple[float, float, float] | None = None) -> Image.Image:
    w, h = size
    im = gradient(size)
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    hx = int(w * (.75 if layout == "landscape" else .52))
    hy = int(h * (.51 if layout == "landscape" else .66))
    radius = int(min(w, h) * (.47 if layout == "landscape" else .39))
    for r in range(radius, 8, -12):
        alpha = round(2 + 23 * (1 - r / radius) ** 1.8)
        gd.ellipse((hx-r, hy-r, hx+r, hy+r), fill=(*MINT, alpha))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))

    # Keep all mechanism primitives in one coordinate system.  Portraits put
    # the enlarged hero below the title; landscapes reserve a clean left text field.
    if layout == "landscape":
        # Keep the data blocks clear of the question mark in the title.
        file_x, file_y = w * .49, h * .58
    else:
        # Leave a little breathing room at the portrait edge so the source blocks
        # read as a complete object rather than an accidental crop.
        file_x, file_y = w * .30, h * .66
    if hero is not None:
        cx, cy, scale = w * hero[0], h * hero[1], min(w, h) * hero[2]
    elif layout == "landscape":
        cx, cy, scale = w * .77, h * .53, min(w, h) * .22
    else:
        cx, cy, scale = w * .52, h * .69, min(w, h) * .25

    # A shallow plane and a few translucent rails anchor the scene.
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    horizon = h * (.78 if layout == "landscape" else .91)
    polyline(d, [(w*.08, horizon), (w*.94, horizon)], (57, 88, 103, 28), max(1, round(min(w,h)*.003)))
    for n in range(3):
        y = horizon + (n+1) * min(w,h)*.028
        polyline(d, [(w*.14, y), (w*.88, y)], (57, 88, 103, 12), max(1, round(min(w,h)*.002)))

    # Data blocks: a small file becomes a stream of encoded strands.
    block_w = min(w, h) * (.065 if layout == "landscape" else .075)
    block_h = block_w * .72
    for i in range(5):
        x = file_x - i * block_w * .72
        y = file_y + math.sin(i*.6) * block_w * .12 - i * block_w*.10
        shadow = (x+block_w*.10, y+block_h*.14, x+block_w*1.10, y+block_h*1.14)
        d.rounded_rectangle(shadow, radius=round(block_w*.08), fill=(20, 42, 53, 32))
        d.rounded_rectangle((x, y, x+block_w, y+block_h), radius=round(block_w*.08), fill=(20,42,53,225), outline=(255,255,255,50), width=max(1,round(block_w*.012)))
        for j, col in enumerate((TEAL, MINT, GOLD, CORAL)):
            xx = x + block_w*.16 + j*block_w*.18
            yy = y + block_h*.27 + (j%2)*block_h*.25
            d.rounded_rectangle((xx, yy, xx+block_w*.10, yy+block_h*.16), radius=round(block_w*.018), fill=(*col, 220))
    stream = curve_points((file_x+block_w*.7, file_y+block_h*.4), (w*.57, h*.72 if layout != "landscape" else h*.66), (w*.62, h*.39 if layout == "landscape" else h*.56), (cx-scale*.65, cy), 70)
    polyline(d, stream, (*GOLD, 120), max(2, round(min(w,h)*.006)))
    stream2 = curve_points((file_x+block_w*.8, file_y-block_h*.2), (w*.56, h*.57 if layout != "landscape" else h*.68), (w*.64, h*.33 if layout == "landscape" else h*.50), (cx-scale*.60, cy+scale*.22), 70)
    polyline(d, stream2, (*TEAL, 135), max(2, round(min(w,h)*.004)))
    for i in range(11):
        t = (i+.5)/11
        x, y = stream[int(t*(len(stream)-1))]
        r = max(2, round(min(w,h)*(.008 + .006*(i%3)/2)))
        d.ellipse((x-r,y-r,x+r,y+r), fill=(*GOLD, 170))

    # Double helix with visible rungs; it is a mechanism, not a decorative icon.
    turns = 2.25 * math.pi
    left, right = [], []
    steps = 90
    for i in range(steps+1):
        t = i/steps
        xx = cx + (t-.5)*scale*1.2
        yy = cy + math.sin(t*turns)*scale*.52
        zz = math.cos(t*turns)
        off = zz * scale*.26
        left.append((xx, yy-off))
        right.append((xx, yy+off))
    polyline(d, left, (*TEAL, 245), max(3, round(scale*.032)))
    polyline(d, right, (*CORAL, 220), max(3, round(scale*.032)))
    for i in range(0, steps+1, 5):
        t=i/steps
        col=(GOLD, MINT, CORAL, TEAL)[(i//5)%4]
        width=max(2, round(scale*.015))
        polyline(d, [left[i], right[i]], (*col, 190), width)
    # a quiet outer orbit supplies scale/depth and echoes the paper's round light
    d.ellipse((cx-scale*.82, cy-scale*.82, cx+scale*.82, cy+scale*.82), outline=(*TEAL, 46), width=max(1, round(scale*.012)))
    d.ellipse((cx-scale*.71, cy-scale*.71, cx+scale*.71, cy+scale*.71), outline=(*GOLD, 32), width=max(1, round(scale*.008)))

    # A handful of base letters are intentionally sparse; they identify the four
    # bases without turning the cover into a code wall.
    base_font = font(SANS, max(18, round(min(w,h)*.035)))
    for i, label in enumerate("ATCG"):
        x = cx + scale*.85 + (i%2)*base_font.size*1.15
        y = cy-scale*.55 + (i//2)*base_font.size*1.35
        d.text((x,y), label, font=base_font, fill=(*INK, 155), stroke_width=0)
    im.alpha_composite(layer)
    # Subtle vignette, preserving the cream reading area for title and logo.
    vign = Image.new("L", size, 0)
    vd = ImageDraw.Draw(vign)
    vd.rectangle((0,0,w,h), fill=54)
    vd.ellipse((w*.45,h*.05,w*1.06,h*1.0), fill=0)
    shade = Image.new("RGBA", size, (*INK, 0)); shade.putalpha(vign.filter(ImageFilter.GaussianBlur(min(w,h)*.12)))
    im.alpha_composite(shade)
    return im


def paste_brand(im: Image.Image, cfg: dict) -> list[dict]:
    d = ImageDraw.Draw(im)
    w, h = im.size
    logo_h = round(min(w, h) * (.062 if cfg["layout"] == "landscape" else .052))
    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((round(logo.width / logo.height * logo_h), logo_h), Image.Resampling.LANCZOS)
    x, y = round(w*.046), round(h*.045)
    im.alpha_composite(logo, (x, y))
    f = font(SANS, round(logo_h*.43))
    tx = x + logo.width + round(logo_h*.28)
    ty = y + round(logo_h*.12)
    d.text((tx, ty), "rainbow鱼", font=f, fill=INK)
    # Dark capsule is deliberately only the series label; the title remains open.
    sx, sy = cfg["series_xy"]
    sf = font(SANS, cfg["series_size"])
    series = "每天5分钟科普 · DNA存储"
    bbox = d.textbbox((sx, sy), series, font=sf)
    pad_x, pad_y = round(sf.size*.55), round(sf.size*.30)
    d.rounded_rectangle((bbox[0]-pad_x, bbox[1]-pad_y, bbox[2]+pad_x, bbox[3]+pad_y), radius=round(sf.size*.45), fill=INK)
    d.text((sx, sy), series, font=sf, fill=CREAM)
    return [{"id":"logo", "box":[x,y,x+logo.width,y+logo_h]}, {"id":"author", "box":[tx,ty,tx+d.textlength("rainbow鱼",font=f),ty+f.size]}, {"id":"series", "box":[bbox[0]-pad_x,bbox[1]-pad_y,bbox[2]+pad_x,bbox[3]+pad_y]}]


def render_one(name: str, cfg: dict) -> dict:
    w, h = cfg["size"]
    im = draw_background((w, h), cfg["layout"], cfg["hero"])
    boxes = paste_brand(im, cfg)
    d = ImageDraw.Draw(im)
    tx, ty = cfg["title_xy"]
    title_font = font(SERIF, cfg["title_size"])
    title = "文件能写进\nDNA吗？"
    tb = d.multiline_textbbox((tx,ty), title, font=title_font, spacing=round(cfg["title_size"]*.12))
    # A very soft paper shadow improves small-screen readability, without an outline.
    sh = Image.new("RGBA", im.size, (0,0,0,0)); sd = ImageDraw.Draw(sh)
    sd.multiline_text((tx+4,ty+6), title, font=title_font, spacing=round(cfg["title_size"]*.12), fill=(20,42,53,35))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(im)
    d.multiline_text((tx,ty), title, font=title_font, spacing=round(cfg["title_size"]*.12), fill=INK)
    boxes.append({"id":"title", "box":[*tb]})
    # A single understated method line supports professional viewers and stays readable.
    method = "编码  ·  纠错  ·  读回"
    mf = font(SANS, round(cfg["title_size"]*.245))
    mx, my = tx, (ty + (tb[3]-tb[1]) + round(cfg["title_size"]*.38))
    mb = d.textbbox((mx,my), method, font=mf)
    d.text((mx,my), method, font=mf, fill=SLATE)
    boxes.append({"id":"method", "box":[*mb]})
    # Validate bounds and save transparent-free RGB deliverables.
    for item in boxes:
        b=item["box"]
        if b[0] < 0 or b[1] < 0 or b[2] > w or b[3] > h:
            raise ValueError(f"{name}: {item['id']} outside canvas: {b}")
    outbase = OUT / f"dna_storage_{name}"
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    bg = draw_background((w,h), cfg["layout"], cfg["hero"]).convert("RGB")
    bg.save(ART / f"{name}_background.png", optimize=True)
    final = im.convert("RGB")
    final.save(outbase.with_suffix(".png"), optimize=True)
    final.save(outbase.with_suffix(".jpg"), quality=95, subsampling=0, optimize=True)
    report = {
        "name": name,
        "size": [w,h], "mode": "RGB", "title": title,
        "series": "每天5分钟科普 · DNA存储", "boxes": boxes,
        "background_sha256": hashlib.sha256((ART / f"{name}_background.png").read_bytes()).hexdigest(),
        "logo_sha256": hashlib.sha256(LOGO.read_bytes()).hexdigest(),
        "visual_review": "Required at original, 320 px and 160 px; automated bounds passed.",
    }
    (OUT / f"dna_storage_{name}-layout-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"name":name, "size":[w,h], "png":str(outbase.with_suffix('.png').resolve()), "jpg":str(outbase.with_suffix('.jpg').resolve())}


def make_contact_sheet(results: list[dict]):
    thumbs=[]
    for r in results:
        im=Image.open(r["jpg"]).convert("RGB")
        im.thumbnail((420,420), Image.Resampling.LANCZOS)
        thumbs.append((r["name"], im.copy()))
    sheet=Image.new("RGB", (900, 900), "#eef0eb")
    d=ImageDraw.Draw(sheet)
    for i,(name,im) in enumerate(thumbs):
        x=30+(i%2)*440; y=30+(i//2)*420
        sheet.paste(im,(x,y+28)); d.text((x,y), name, font=font(SANS,24), fill=INK)
    sheet.save(OUT / "dna_storage_cover_contact.jpg", quality=93, optimize=True)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--only", choices=sorted(FORMATS), nargs="*")
    args=ap.parse_args()
    selected=args.only or list(FORMATS)
    results=[render_one(name, FORMATS[name]) for name in selected]
    make_contact_sheet(results)
    print(json.dumps({"outputs":results, "contact":str((OUT/"dna_storage_cover_contact.jpg").resolve())}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
