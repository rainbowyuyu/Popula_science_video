from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageCms
import hashlib
import json
import shutil


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "delivery/episode3/covers_v3"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE_DIR = ROOT / "output/episode3v8"
LOGO = Path(r"C:/Users/zju/Desktop/logo/logo.png")
FONT_BOLD = Path(r"C:/Windows/Fonts/msyhbd.ttc")
FONT_REG = Path(r"C:/Windows/Fonts/msyh.ttc")

PAPER = (247, 241, 227)
INK = (23, 56, 58)
CREAM = (247, 241, 227)
CORAL = (185, 103, 57)

SPECS = {
    "16x9": {
        "size": (1920, 1080),
        "source": ROOT / "tmp_frame_780.jpg",
        "source_frame": 780,
        "explosion_level": 0.82,
        "capture_time_s": 26.0,
        "mode": "full",
        "title_xy": (90, 330),
        "title_size": 112,
        "capsule_xy": (90, 224),
        "brand_xy": (64, 48),
    },
    "4x3": {
        "size": (1920, 1440),
        "source": ROOT / "tmp_frame_930.jpg",
        "source_frame": 930,
        "explosion_level": 0.68,
        "capture_time_s": 31.0,
        "mode": "full_bottom",
        "title_xy": (92, 325),
        "title_size": 104,
        "capsule_xy": (92, 250),
        "brand_xy": (64, 48),
    },
    "3x4": {
        "size": (1440, 1920),
        "source": ROOT / "tmp_frame_930.jpg",
        "source_frame": 930,
        "explosion_level": 0.56,
        "capture_time_s": 31.0,
        "mode": "center_crop_lower",
        "crop": (420, 150, 1640, 1080),
        "title_xy": (92, 270),
        "title_size": 95,
        "capsule_xy": (92, 214),
        "brand_xy": (52, 44),
    },
    "9x16": {
        "size": (1080, 1920),
        "source": ROOT / "tmp_frame_860.jpg",
        "source_frame": 860,
        "explosion_level": 0.44,
        "capture_time_s": 28.667,
        "mode": "portrait_crop_lower",
        "crop": (600, 150, 1380, 920),
        "title_xy": (72, 282),
        "title_size": 126,
        "capsule_xy": (72, 204),
        "brand_xy": (44, 42),
    },
}


def font(path: Path, size: int):
    return ImageFont.truetype(str(path), max(8, int(size)))


def rgba_background(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (*PAPER, 255))


def smooth_masked_source(path: Path, mask_bottom: bool = False, mask_top_left: bool = True) -> Image.Image:
    """Hide old in-video branding/captions before using the real model frame.

    The source frames are from the finished film, so their geometry and material
    are authoritative. Only the old title/logo/caption overlays are covered with
    the same paper tone before the cover's own precise typography is placed.
    """
    im = Image.open(path).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    # Scene title and embedded logo occupy the old film's upper-left safe band.
    if mask_top_left:
        d.rectangle((0, 0, 735, 320), fill=(*PAPER, 247))
    if mask_bottom:
        # Used only for the 4:3 source where a lower subtitle can appear.
        d.rectangle((0, 930, im.width, im.height), fill=(*PAPER, 247))
    return im


def place_source(spec: dict) -> Image.Image:
    W, H = spec["size"]
    canvas = rgba_background(W, H)
    src = smooth_masked_source(
        spec["source"],
        mask_bottom=spec["mode"] == "full_bottom",
        mask_top_left=spec["mode"] in {"full", "full_bottom"},
    )
    mode = spec["mode"]
    if mode == "full":
        fitted = src.resize((W, H), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, (0, 0))
    elif mode == "full_bottom":
        fitted = src.resize((W, int(round(src.height * W / src.width))), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, (0, H - fitted.height))
    elif mode == "center_crop_lower":
        crop = src.crop(spec["crop"])
        # Keep a generous title band above the real exploded assembly.
        target_w = W
        fitted = crop.resize((target_w, int(round(crop.height * target_w / crop.width))), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, (0, 700))
    elif mode == "portrait_crop_lower":
        crop = src.crop(spec["crop"])
        fitted = crop.resize((W, int(round(crop.height * W / crop.width))), Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, (0, 650))
    else:
        raise ValueError(mode)

    # Quiet edge vignette keeps the center model bright and gives the paper a
    # cinematic depth without making a separate UI panel.
    vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette, "RGBA")
    edge = max(32, int(min(W, H) * 0.08))
    for i in range(edge, 0, -1):
        alpha = int(8 * (1 - i / edge))
        vd.rectangle((i, i, W - i, H - i), outline=(70, 57, 43, alpha), width=1)
    return Image.alpha_composite(canvas, vignette)


def add_brand(im: Image.Image, xy: tuple[int, int], scale: float) -> dict:
    x, y = xy
    d = ImageDraw.Draw(im, "RGBA")
    mark = Image.open(LOGO).convert("RGBA")
    icon_h = int(round(88 * scale))
    icon_w = int(round(icon_h * mark.width / mark.height))
    im.alpha_composite(mark.resize((icon_w, icon_h), Image.Resampling.LANCZOS), (x, y))
    text_x = x + icon_w + int(round(20 * scale))
    text_y = y + icon_h // 2
    d.text((text_x + 1, text_y + 2), "rainbow鱼", font=font(FONT_BOLD, int(round(44 * scale))), fill=(247, 241, 227, 170), anchor="lm")
    d.text((text_x, text_y), "rainbow鱼", font=font(FONT_BOLD, int(round(44 * scale))), fill=INK, anchor="lm")
    return {"x": x, "y": y, "icon_width": icon_w, "icon_height": icon_h, "text_x": text_x}


def add_capsule(im: Image.Image, xy: tuple[int, int], scale: float) -> dict:
    x, y = xy
    d = ImageDraw.Draw(im, "RGBA")
    f = font(FONT_BOLD, int(round(30 * scale)))
    label = "每天5分钟科普 · 榫卯"
    bb = d.textbbox((0, 0), label, font=f)
    px, py = int(round(18 * scale)), int(round(11 * scale))
    box = (x, y, x + (bb[2] - bb[0]) + 2 * px, y + (bb[3] - bb[1]) + 2 * py)
    d.rounded_rectangle(box, radius=int(round(14 * scale)), fill=(*INK, 246))
    d.text((x + px, y + py - 1), label, font=f, fill=CREAM)
    return {"text": label, "box": box}


def add_title(im: Image.Image, xy: tuple[int, int], size: int, scale: float) -> dict:
    d = ImageDraw.Draw(im, "RGBA")
    x, y = xy
    f = font(FONT_BOLD, int(round(size * scale)))
    lines = ["木头怎样", "咬住木头？"]
    step = int(round((size + 20) * scale))
    for i, line in enumerate(lines):
        yy = y + i * step
        d.text((x + 2, yy + 3), line, font=f, fill=(247, 241, 227, 150))
        d.text((x, yy), line, font=f, fill=INK)
    widths = [d.textbbox((x, y + i * step), t, font=f)[2] - x for i, t in enumerate(lines)]
    return {"lines": lines, "x": x, "y": y, "size": size, "line_step": step, "width": max(widths), "height": step * 2}


def add_single_cue(im: Image.Image, ratio: str, scale: float) -> dict:
    """One restrained cue: labels the same real exploded part without clutter."""
    d = ImageDraw.Draw(im, "RGBA")
    W, H = im.size
    if ratio == "16x9":
        x, y, text = 1450, 785, "榫头 / 卯口"
    elif ratio == "4x3":
        x, y, text = 1390, 1110, "榫头 / 卯口"
    elif ratio == "3x4":
        x, y, text = 930, 1390, "榫头 / 卯口"
    else:
        x, y, text = 690, 1375, "榫头 / 卯口"
    f = font(FONT_BOLD, int(round(34 * scale)))
    bb = d.textbbox((0, 0), text, font=f)
    # Use a paper-backed label with a tiny coral leader rather than a floating HUD.
    d.line((x - int(round(72 * scale)), y + int(round(5 * scale)), x - int(round(18 * scale)), y + int(round(5 * scale))), fill=CORAL, width=max(2, int(round(3 * scale))))
    d.ellipse((x - int(round(82 * scale)), y, x - int(round(72 * scale)), y + int(round(10 * scale))), fill=CORAL)
    d.text((x, y), text, font=f, fill=INK)
    return {"text": text, "x": x, "y": y, "width": bb[2] - bb[0]}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_jpg(im: Image.Image, path: Path) -> None:
    rgb = im.convert("RGB")
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    rgb.save(path, "JPEG", quality=96, subsampling=0, optimize=True, icc_profile=icc)


def main() -> None:
    records = []
    # Preserve the exact source frames alongside the deliverables for review.
    source_records = []
    for spec in SPECS.values():
        target = OUT / f"source_frame_{spec['source_frame']}.jpg"
        if not target.exists():
            shutil.copy2(spec["source"], target)
        source_records.append({"path": target.name, "frame": spec["source_frame"], "sha256": sha(target)})

    for ratio, spec in SPECS.items():
        W, H = spec["size"]
        scale = min(W, H) / 1080
        im = place_source(spec)
        brand = add_brand(im, spec["brand_xy"], scale)
        capsule = add_capsule(im, spec["capsule_xy"], scale)
        title = add_title(im, spec["title_xy"], spec["title_size"], scale)
        cue = add_single_cue(im, ratio, scale) if ratio == "16x9" else None
        out = OUT / f"榫卯_爆炸亭封面_{ratio}.jpg"
        save_jpg(im, out)
        png = OUT / f"榫卯_爆炸亭封面_{ratio}_排版源.png"
        im.save(png, "PNG")
        t320 = im.convert("RGB").copy(); t320.thumbnail((320, 320), Image.Resampling.LANCZOS)
        t160 = im.convert("RGB").copy(); t160.thumbnail((160, 160), Image.Resampling.LANCZOS)
        t320.save(OUT / f"榫卯_爆炸亭封面_{ratio}_thumb320.jpg", "JPEG", quality=94, optimize=True)
        t160.save(OUT / f"榫卯_爆炸亭封面_{ratio}_thumb160.jpg", "JPEG", quality=94, optimize=True)
        records.append({
            "ratio": ratio,
            "size": [W, H],
            "jpg": out.name,
            "png": png.name,
            "source_frame": spec["source_frame"],
            "capture_time_s": spec["capture_time_s"],
            "explosion_level": spec["explosion_level"],
            "brand": brand,
            "capsule": capsule,
            "title": title,
            "single_cue": cue,
            "sha256": sha(out),
        })

    layout = {
        "series": "每天5分钟科普",
        "topic": "榫卯",
        "hook": "木头怎样咬住木头？",
        "subject": "真实亭子117件结构模型的爆炸视图，来自已验收成片镜头",
        "composition": "沿用上一版左上品牌、系列胶囊和左侧大标题；爆炸亭子占据中下/右侧主体",
        "logo": str(LOGO),
        "formats": {k: {kk: vv for kk, vv in v.items() if kk not in {"source"}} for k, v in SPECS.items()},
        "source_frames": source_records,
        "notes": [
            "四比例分别取不同爆炸阶段/取景，静态封面记录了对应帧和时间；不是把同一张图硬裁四次。",
            "标题只保留系列胶囊和一个生活化钩子，榫头/卯口只保留一处轻标注。",
            "源帧来自最终成片的真实117件模型，封面没有使用旧的玩具式彩色亭场景。",
        ],
    }
    (OUT / "layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf8")
    (OUT / "cover-manifest.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf8")
    (OUT / "source-record.json").write_text(json.dumps({"tool": "Pillow precise compositor", "source": "episode3v8 verified encoded frames", "source_records": source_records, "logo": str(LOGO)}, ensure_ascii=False, indent=2), encoding="utf8")

    # Contact sheet for visual review.
    sheet = Image.new("RGB", (2200, 2100), (239, 234, 222))
    sd = ImageDraw.Draw(sheet)
    sf = font(FONT_BOLD, 30)
    for i, row in enumerate(records):
        img = Image.open(OUT / row["jpg"]).convert("RGB")
        img.thumbnail((980, 820), Image.Resampling.LANCZOS)
        x = (i % 2) * 1100 + (1100 - img.width) // 2
        y = (i // 2) * 1020 + 38
        sheet.paste(img, (x, y))
        sd.text(((i % 2) * 1100 + 46, (i // 2) * 1020 + 880), f"{row['ratio']}  {row['size'][0]}×{row['size'][1]}  frame {row['source_frame']}", font=sf, fill=INK)
    sheet.save(OUT / "榫卯_爆炸亭封面_总览.jpg", "JPEG", quality=94, optimize=True)
    print(json.dumps(records, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
