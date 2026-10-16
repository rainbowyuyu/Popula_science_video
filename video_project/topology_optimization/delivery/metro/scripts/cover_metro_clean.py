"""Typeset the light Three.js metro artwork as four independently framed JPG covers.

Run node scripts/render_metro_covers.mjs first, then this script. All delivery
paths are metro-only; delivery/v3/covers remains the topology style reference.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "output/metro/cover-artwork"
OUT = ROOT / "output/metro/covers"
DELIVERY = ROOT / "delivery/metro/封面"
LOGO = ROOT / "public/metro/logo.png"
FONT = Path("C:/Windows/Fonts/msyhbd.ttc")
INK = (13, 43, 53)
SERIES = "每天5分钟科普·活塞效应"
TITLE = ("车还没到", "风先到了？")
CONFIG = {
    "16x9": {"size": (1920, 1080), "pill": (64, 182, 44), "title": (64, 300, 144), "gap": 24},
    "4x3": {"size": (1920, 1440), "pill": (85, 230, 54), "title": (85, 368, 170), "gap": 26},
    "3x4": {"size": (1440, 1920), "pill": (85, 242, 54), "title": (85, 389, 208), "gap": 26},
    "9x16": {"size": (1080, 1920), "pill": (64, 210, 43), "title": (64, 352, 174), "gap": 24},
}


def font(px):
    return ImageFont.truetype(str(FONT), int(px))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ink_text(draw, xy, value, face, color=INK):
    x, y = xy
    b = draw.textbbox((0, 0), value, font=face)
    draw.text((x - b[0], y - b[1]), value, font=face, fill=color)
    return (x, y, x + b[2] - b[0], y + b[3] - b[1])


def quiet_title_field(im, right, bottom, train_hull):
    # Continuous feathering into the existing ground, no image/card boundary.
    w, h = im.size
    yy, xx = np.mgrid[:h, :w]
    ease = lambda t: (lambda u: u * u * (3 - 2 * u))(np.clip(t, 0, 1))
    alpha = (1 - ease((xx - right - 20) / 210)) * (1 - ease((yy - bottom - 15) / 210)) * .92
    # Protect the entire 3-D subject from the title's quiet background gradient.
    # The softened exclusion extends outside the projected silhouette as well.
    subject = Image.new("L", im.size)
    hull = [tuple(p) for p in train_hull]
    sd = ImageDraw.Draw(subject)
    sd.polygon(hull, fill=255)
    sd.line(hull+[hull[0]], fill=255, width=140, joint="curve")
    protected = subject.filter(ImageFilter.GaussianBlur(30))
    ImageDraw.Draw(protected).polygon(hull, fill=255)
    alpha *= 1-np.asarray(protected, dtype=np.float32)/255
    mask = Image.fromarray((alpha * 255).astype(np.uint8))
    return Image.composite(Image.new("RGB", im.size, im.getpixel((0, 0))), im, mask)


def compose(ratio):
    cfg = CONFIG[ratio]
    w, h = cfg["size"]
    source = ART / f"metro-light-{ratio}.png"
    audit = json.loads((ART / f"audit-{ratio}.json").read_text(encoding="utf-8"))
    canvas = Image.open(source).convert("RGB")
    assert canvas.size == (w, h)
    tx, ty, px = cfg["title"]
    f = font(px)
    measured = ImageDraw.Draw(canvas).textbbox((0, 0), TITLE[0], font=f)
    second_y = ty + measured[3] - measured[1] + cfg["gap"]
    title_right = tx + ImageDraw.Draw(canvas).textbbox((0, 0), TITLE[1], font=f)[2]
    title_bottom = second_y + px
    canvas = quiet_title_field(canvas, title_right, title_bottom, audit["trainHull"])
    draw = ImageDraw.Draw(canvas)
    s = min(w, h) / 1080
    lx, ly, lh, gap = round(64*s), round(48*s), round(90*s), round(20*s)
    logo = Image.open(LOGO).convert("RGBA")
    lw = round(lh * logo.width / logo.height)
    logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
    canvas.paste(logo, (lx, ly), logo)
    brandfont = font(round(44*s))
    bb = draw.textbbox((0, 0), "rainbow鱼", font=brandfont)
    brand = ink_text(draw, (lx+lw+gap, ly+(lh-(bb[3]-bb[1]))//2), "rainbow鱼", brandfont)
    sx, sy, spx = cfg["pill"]
    sf = font(spx)
    sb = draw.textbbox((0, 0), SERIES, font=sf)
    pad_x, pad_y = round(spx*.45), round(spx*.30)
    pill = (sx, sy, sx+sb[2]-sb[0]+2*pad_x, sy+sb[3]-sb[1]+2*pad_y)
    draw.rounded_rectangle(pill, radius=round(spx*.31), fill=(8, 25, 32))
    ink_text(draw, (sx+pad_x, sy+pad_y), SERIES, sf, (255, 255, 252))
    boxes = {"logo": (lx, ly, lx+lw, ly+lh), "brandText": brand, "series": pill,
             "titleFirst": ink_text(draw, (tx, ty), TITLE[0], f),
             "titleSecond": ink_text(draw, (tx, second_y), TITLE[1], f)}
    # Conservative projected hull of every vertex in the actual train model.
    # Dilating it also enforces a visible gap, not just zero-pixel overlap.
    subject = Image.new("L", (w,h))
    ImageDraw.Draw(subject).polygon([tuple(p) for p in audit["trainHull"]], fill=255)
    clearance = round(16*s)
    for name, box in boxes.items():
        assert 0 <= box[0] < box[2] <= w and 0 <= box[1] < box[3] <= h, (ratio, name, box)
        expanded = (max(0,box[0]-clearance),max(0,box[1]-clearance),min(w,box[2]+clearance),min(h,box[3]+clearance))
        assert subject.crop(expanded).getbbox() is None, (ratio, name, "overlaps train")
    for a, ba in boxes.items():
        for b, bb in boxes.items():
            if a >= b:
                continue
            assert not (max(ba[0],bb[0])<min(ba[2],bb[2]) and max(ba[1],bb[1])<min(ba[3],bb[3])), (ratio,a,b)
    meta = {"ratio": ratio, "size": [w,h], "source": str(source.relative_to(ROOT)), "sourceSha256": digest(source),
            "textBounds": boxes, "trainBounds": audit["trainBounds"], "trainHull": audit["trainHull"],
            "clearancePx": clearance, "titleFontPx": px, "seriesFontPx": spx,
            "logo": {"bounds": boxes["logo"], "wordFontPx": round(44*s), "backing": "none"},
            "layoutChecks": "Text inside frame; text boxes distinct; no overlap with expanded projected train hull"}
    return canvas, meta


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DELIVERY.mkdir(parents=True, exist_ok=True)
    profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    report = {"title": "车还没到，风先到了？", "series": SERIES,
              "styleReference": "delivery/v3/covers/封面_16x9.jpg",
              "tools": "Existing MetroWorld model + Three.js / Remotion orthographic renders; Pillow typography",
              "artwork": "Original numerical streamline paths, light cover materials, independent cameras per ratio",
              "logoSource": str(LOGO.relative_to(ROOT)), "logoSha256": digest(LOGO),
              "fontSource": str(FONT), "fontSha256": digest(FONT), "formats": []}
    covers = {}
    for ratio in CONFIG:
        im, meta = compose(ratio)
        covers[ratio] = im
        path = OUT / f"metro-cover-{ratio}.jpg"
        im.save(path, "JPEG", quality=95, subsampling=0, icc_profile=profile)
        with Image.open(path) as saved:
            assert saved.size == CONFIG[ratio]["size"] and saved.mode == "RGB" and saved.info.get("icc_profile")
        meta.update(file=path.name, sha256=digest(path), mode="RGB", colorSpace="sRGB")
        report["formats"].append(meta)
        preview = im.copy(); preview.thumbnail((640,640), Image.Resampling.LANCZOS)
        preview.save(OUT / f"preview-{ratio}.jpg", "JPEG", quality=94, icc_profile=profile)

    overview = Image.new("RGB", (1640,1120), (223,227,226))
    od = ImageDraw.Draw(overview)
    for ratio, (x,y) in zip(CONFIG, [(30,30),(850,30),(30,580),(850,580)]):
        im = covers[ratio].copy(); im.thumbnail((760,460), Image.Resampling.LANCZOS)
        overview.paste(im,(x+(760-im.width)//2,y))
        ink_text(od,(x,y+474),ratio.replace('x',':')+f"  {covers[ratio].width} × {covers[ratio].height}",font(26))
    overview.save(OUT / "封面总览.jpg", "JPEG", quality=95, icc_profile=profile)

    contact = Image.new("RGB", (1520,640), (222,226,226))
    cd = ImageDraw.Draw(contact)
    for col,ratio in enumerate(CONFIG):
        x=30+col*375
        ink_text(cd,(x,18),ratio.replace('x',':')+" · 320 / 160",font(22))
        for edge,y in [(320,65),(160,425)]:
            thumb = covers[ratio].copy(); thumb.thumbnail((edge,edge),Image.Resampling.LANCZOS)
            contact.paste(thumb,(x,y))
    contact.save(OUT / "缩略图检查.jpg", "JPEG", quality=95, icc_profile=profile)
    for name in ("cover-manifest.json", "layout.json"):
        (OUT/name).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    names=[f"metro-cover-{r}.jpg" for r in CONFIG]+[f"preview-{r}.jpg" for r in CONFIG]+["封面总览.jpg","缩略图检查.jpg","cover-manifest.json","layout.json"]
    for name in names:
        shutil.copy2(OUT/name,DELIVERY/name)
    print(json.dumps({"delivery":str(DELIVERY),"formats":[{k:m[k] for k in ('ratio','size','titleFontPx','sha256')} for m in report['formats']]},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
