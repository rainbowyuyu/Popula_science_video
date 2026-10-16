from __future__ import annotations
"""Create the light-paper four-ratio Nobel physics cover for rainbow鱼.

The only foreground text is the requested series label and the laureate's
English name. The research insert is Qwen-generated, then masked and feathered
so it behaves like a hand-drawn wash rather than a pasted card.
"""
from pathlib import Path
import hashlib, json, math
from collections import deque
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageCms

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "delivery/physics2026_cover_v02/covers"
ASSET = ROOT / "delivery/physics2026_cover_v02/assets"
OUT.mkdir(parents=True, exist_ok=True)
PORTRAIT_SRC = Path(r"C:/Users/zju/Documents/xwechat_files/wxid_jdc2tzsjmvqc12_b63e/temp/RWTemp/2026-10/9e20f478899dc29eb19741386f9343c8/1cfee0308d520b4aab44f1d98deb0f86.jpg")
LOGO_SRC = ROOT / "public/logo.png"
INSERT_SRC = ASSET / "research-insert-qwen-take2.png"
FONT_CN_BOLD = Path(r"C:/Windows/Fonts/msyhbd.ttc")
FONT_CN = Path(r"C:/Windows/Fonts/msyh.ttc")
FONT_EN = Path(r"C:/Windows/Fonts/arial.ttf")

SERIES = "每天5分钟科普·高能中微子"
TITLE = ("诺贝尔", "物理学奖")
NAME = "Francis Halzen"
INK = (10, 42, 55, 255)
INK_SOFT = (22, 63, 76, 220)
CYAN = (47, 172, 199, 175)
GOLD = (201, 151, 64, 205)
PAPER = (244, 245, 240, 255)
PAPER_DARK = (232, 239, 237, 255)

CONFIG = {
    "16x9": {
        "size": (1920, 1080), "brand": (68, 48, 64), "pill": (68, 150, 34),
        "title": (68, 246, 104, 8),
        "insert": (55, 500, 1000, 380), "portrait": (1080, 90, 790, 850),
        "name": (1290, 915, 54), "orbit": (1060, 155, 785, 795),
    },
    "4x3": {
        "size": (1920, 1440), "brand": (82, 60, 72), "pill": (82, 178, 38),
        "title": (82, 292, 130, 12),
        "insert": (84, 590, 880, 340), "portrait": (850, 475, 970, 880),
        "name": (1125, 1280, 58), "orbit": (790, 490, 1050, 885),
    },
    "3x4": {
        "size": (1440, 1920), "brand": (70, 55, 68), "pill": (70, 175, 40),
        "title": (70, 286, 132, 14),
        "insert": (55, 600, 1330, 470), "portrait": (100, 1010, 1240, 760),
        "name": (540, 1760, 54), "orbit": (70, 950, 1300, 820),
    },
    "9x16": {
        "size": (1080, 1920), "brand": (55, 45, 54), "pill": (55, 160, 31),
        "title": (55, 270, 88, 8),
        "insert": (38, 520, 1004, 390), "portrait": (50, 890, 980, 720),
        "name": (386, 1665, 46), "orbit": (35, 860, 1010, 760),
    },
}


def fnt(path: Path, px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), int(px))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _largest_component(mask: np.ndarray) -> np.ndarray:
    """Return the largest 8-connected region of a small binary alpha mask.

    The source portrait is a paper scan.  A few isolated ochre JPEG specks
    survive colour thresholding outside the shoulders; keeping the connected
    subject region removes those specks without blurring the original ink.
    This implementation deliberately avoids a new CV dependency.
    """
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best: list[int] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            start = y * w + x
            stack = [start]
            seen[y, x] = True
            component: list[int] = []
            while stack:
                idx = stack.pop()
                component.append(idx)
                cy, cx = divmod(idx, w)
                for dy in (-1, 0, 1):
                    ny = cy + dy
                    if ny < 0 or ny >= h:
                        continue
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx = cx + dx
                        if nx < 0 or nx >= w or not mask[ny, nx] or seen[ny, nx]:
                            continue
                        seen[ny, nx] = True
                        stack.append(ny * w + nx)
            if len(component) > len(best):
                best = component
    out = np.zeros_like(mask, dtype=bool)
    if best:
        flat = out.reshape(-1)
        flat[np.asarray(best, dtype=np.int64)] = True
    return out


def _fill_mask_holes(mask: np.ndarray) -> np.ndarray:
    """Fill enclosed white regions while leaving the outside transparent.

    The portrait is a line drawing: the face and shirt are intentionally
    white, so a simple colour threshold would punch holes through them.  A
    flood fill from the image border identifies only the exterior paper; the
    remaining enclosed regions are part of the original subject silhouette.
    """
    h, w = mask.shape
    empty = ~mask
    outside = np.zeros_like(mask, dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def add(y: int, x: int) -> None:
        if 0 <= y < h and 0 <= x < w and empty[y, x] and not outside[y, x]:
            outside[y, x] = True
            q.append((y, x))

    for x in range(w):
        add(0, x); add(h - 1, x)
    for y in range(h):
        add(y, 0); add(y, w - 1)
    while q:
        y, x = q.popleft()
        add(y - 1, x); add(y + 1, x); add(y, x - 1); add(y, x + 1)
    return ~outside


def paper_background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = (yy / max(1, h))[..., None]
    top = np.array([247, 247, 243], dtype=np.float32)
    bot = np.array([239, 244, 241], dtype=np.float32)
    rgb = (top * (1 - t) + bot * t).astype(np.uint8)
    # Very low-amplitude paper variation; visible only at large size.
    rng = np.random.default_rng(20261007 + w + h)
    grain = rng.normal(0, 0.7, (h, w, 1))
    rgb = np.clip(rgb.astype(np.float32) + grain, 0, 255).astype(np.uint8)
    out = Image.fromarray(rgb, "RGB").convert("RGBA")
    # The reference cover uses quiet, fine cyan contour lines rather than boxes.
    wash = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(wash)
    for k in range(5):
        y = int(h * (0.17 + k * 0.055))
        pts = []
        for x in range(-50, w + 51, max(60, w // 28)):
            pts.append((x, y + int(6 * math.sin(x / 145 + k * .75))))
        d.line(pts, fill=(98, 173, 181, 23), width=max(1, round(min(size) / 840)))
    wash = wash.filter(ImageFilter.GaussianBlur(max(0.4, min(size) / 1200)))
    return Image.alpha_composite(out, wash)


def tinted_logo(height: int) -> Image.Image:
    src = Image.open(LOGO_SRC).convert("RGBA")
    if src.getchannel("A").getextrema()[0] == 0:
        alpha = src.getchannel("A")
    else:
        rgb = src.convert("RGB")
        delta = ImageChops.difference(rgb, Image.new("RGB", src.size, (255, 255, 255))).convert("L")
        alpha = delta.point(lambda p: 0 if p < 12 else min(255, (p - 12) * 10))
    out = Image.new("RGBA", src.size, (21, 44, 48, 0)); out.putalpha(alpha)
    ratio = height / src.height
    return out.resize((round(src.width * ratio), height), Image.Resampling.LANCZOS)


def draw_brand(canvas: Image.Image, cfg: dict) -> dict:
    x, y, h = cfg["brand"]
    logo = tinted_logo(h)
    canvas.alpha_composite(logo, (x, y))
    d = ImageDraw.Draw(canvas)
    face = fnt(FONT_CN_BOLD, round(h * .50))
    tx = x + logo.width + round(h * .22)
    ty = y + round(h * .21)
    d.text((tx, ty), "rainbow鱼", font=face, fill=INK)
    bb = d.textbbox((0, 0), "rainbow鱼", font=face)
    return {"logo": [x, y, x + logo.width, y + h], "brandText": [tx, ty, tx + bb[2], ty + bb[3] - bb[1]]}


def draw_pill(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, px = cfg["pill"]
    face = fnt(FONT_CN_BOLD, px)
    d = ImageDraw.Draw(canvas)
    bb = d.textbbox((0, 0), SERIES, font=face)
    pad_x, pad_y = round(px * .40), round(px * .26)
    box = [x, y, x + bb[2] + 2 * pad_x, y + (bb[3] - bb[1]) + 2 * pad_y]
    d.rounded_rectangle(box, radius=round(px * .34), fill=(10, 43, 53, 250))
    d.text((x + pad_x, y + pad_y), SERIES, font=face, fill=(246, 247, 242, 255))
    return box


def draw_title(canvas: Image.Image, cfg: dict) -> dict:
    x, y, px, gap = cfg["title"]
    face = fnt(FONT_CN_BOLD, px)
    d = ImageDraw.Draw(canvas)
    boxes = {}
    for i, line in enumerate(TITLE):
        yy = y + i * (px + gap)
        d.text((x, yy), line, font=face, fill=INK)
        bb = d.textbbox((0, 0), line, font=face)
        boxes[f"title{i+1}"] = [x, yy, x + bb[2], yy + bb[3] - bb[1]]
    return boxes


def extract_portrait() -> Image.Image:
    """Cut the scan paper away while preserving every source pixel.

    The face and shirt are white regions enclosed by the original ink.  We
    therefore build only an alpha silhouette from the scan, fill its enclosed
    regions, and apply that alpha to the untouched RGBA source.  No recolour,
    redraw, thresholded line reconstruction, or alpha blur changes the
    original line thickness.
    """
    src = Image.open(PORTRAIT_SRC).convert("RGB")
    arr = np.asarray(src).astype(np.float32)
    h, w = arr.shape[:2]
    lum = arr.mean(axis=2)
    chroma = arr.max(axis=2) - arr.min(axis=2)
    # Mark only unmistakable ink/ochre pixels. The exterior paper is nearly
    # neutral RGB≈235; the face remains inside this mask after hole filling.
    warm = arr[..., 0] - arr[..., 2]
    foreground = (lum < 225) | (warm > 12) | (chroma > 12)
    foreground = _largest_component(foreground)
    silhouette = _fill_mask_holes(foreground)
    alpha = Image.fromarray(np.where(silhouette, 255, 0).astype(np.uint8), "L")
    out = src.convert("RGBA")
    out.putalpha(alpha)

    # Remove the source's empty margins; leave a small transparent breathing
    # room so the shoulders do not look clipped after compositing.
    bbox = out.getchannel("A").getbbox()
    if bbox:
        pad_x = round(w * .025); pad_y = round(h * .02)
        bbox = (max(0, bbox[0]-pad_x), max(0, bbox[1]-pad_y), min(w, bbox[2]+pad_x), min(h, bbox[3]+pad_y))
        out = out.crop(bbox)
    return out


def extract_insert() -> Image.Image:
    """Remove generated margins and recolour the motifs for paper readability.

    The raw Qwen insert is intentionally airy, but its light wash disappears
    against the cover. We keep the drawing's geometry while mapping blue ice /
    light to a saturated cyan, outlines to deep blue-grey, and warm details to
    restrained ochre. This preserves the hand-drawn feel and makes the three
    research cues legible at thumbnail size.
    """
    src = Image.open(INSERT_SRC).convert("RGB")
    # Qwen's useful drawing occupies the middle strip; this removes the torn black edges
    # and the accidental top caption before any compositing.
    src = src.crop((0, 145, src.width, 625))
    arr = np.asarray(src).astype(np.float32)
    mx, mn = arr.max(axis=2), arr.min(axis=2)
    sat = mx - mn; lum = arr.mean(axis=2)
    yy_idx, xx_idx = np.indices(lum.shape)
    # The generated cone has very pale rays; protect that region before the
    # more selective saturation mask removes the surrounding paper grain.
    cone_bright = (
        (xx_idx > lum.shape[1] * .64) & (xx_idx < lum.shape[1] * .98)
        & (yy_idx > lum.shape[0] * .12) & (yy_idx < lum.shape[0] * .82)
        & (lum > 170) & (sat > 4)
    )
    # Paper nearly disappears; colored motifs and medium-dark ink remain.
    # The generated paper has a measurable blue/ochre tint of its own, so a
    # low saturation cutoff would leave a visible rectangle. Keep only the
    # saturated ink/watercolor marks plus genuinely dark, slightly chromatic
    # outlines.
    keep = (sat > 36) | ((lum < 132) & (sat > 12)) | cone_bright
    alpha = np.where(
        keep,
        np.clip(np.maximum(sat * 2.55, 32) + np.clip(205 - lum, 0, 150) * .92, 0, 226),
        0,
    )
    # Suppress the dark backing behind the cone while retaining the bright cone itself.
    # The cone in the generated reference sits on a neutral dark/white panel;
    # discard that panel entirely while retaining the saturated cone itself.
    dark_back = (xx_idx > lum.shape[1] * .62) & (sat < 78) & (~cone_bright)
    alpha[dark_back] = 0
    # Keep a little outline around the colored shapes but fade the outer perimeter.
    edge = np.ones(alpha.shape, dtype=np.float32)
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    edge *= np.minimum.reduce([xx / 55, (alpha.shape[1]-1-xx) / 55, yy / 32, (alpha.shape[0]-1-yy) / 32])
    edge = np.clip(edge, 0, 1)
    alpha *= edge
    # Palette mapping: the source's blue range becomes cyan-blue, warm range
    # becomes ochre, and neutral linework becomes deep blue-grey.
    blue_score = np.clip((arr[..., 2] - arr[..., 0]) * 2.3 + (arr[..., 2] - arr[..., 1]) * .8, 0, 255)
    gold_score = np.clip((arr[..., 0] - arr[..., 2]) * 2.1 + (arr[..., 1] - arr[..., 2]) * .7, 0, 255)
    base = np.zeros_like(arr)
    base[:] = (31, 72, 82)
    blue = np.array((39, 143, 174), dtype=np.float32)
    gold = np.array((191, 143, 62), dtype=np.float32)
    neutral = np.array((50, 83, 91), dtype=np.float32)
    base = neutral + (blue - neutral) * (blue_score[..., None] / 255.0) + (gold - neutral) * (gold_score[..., None] / 255.0)
    # Very pale Cherenkov rays should read as a cool translucent stroke.
    pale_ray = cone_bright & (sat < 28)
    base[pale_ray] = (77, 161, 181)
    rgba = np.dstack([np.clip(base, 0, 255), alpha.astype(np.uint8)]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    return out.filter(ImageFilter.GaussianBlur(.24))


def paste_insert(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["insert"]
    insert = extract_insert()
    scale = min(w / insert.width, h / insert.height)
    im = insert.resize((round(insert.width*scale), round(insert.height*scale)), Image.Resampling.LANCZOS)
    # Keep it as a background cue, but with enough contrast for a phone-sized
    # thumbnail. The soft halo avoids a pasted-on silhouette.
    a = im.getchannel("A").point(lambda p: min(235, int(p * .96))); im.putalpha(a)
    xx = x + (w - im.width) // 2; yy = y + (h - im.height) // 2
    halo = Image.new("RGBA", im.size, (38, 147, 167, 0))
    halo.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(max(12, round(min(im.size) * .045)))).point(lambda p: int(p * .13)))
    canvas.alpha_composite(halo, (xx, yy))
    canvas.alpha_composite(im, (xx, yy))
    return [xx, yy, xx + im.width, yy + im.height]


def draw_orbit(canvas: Image.Image, cfg: dict) -> list[int]:
    x, y, w, h = cfg["orbit"]
    layer = Image.new("RGBA", canvas.size, (0,0,0,0)); d = ImageDraw.Draw(layer)
    d.arc((x, y, x+w, y+h), 202, 345, fill=(54, 161, 176, 58), width=max(2, round(min(canvas.size)/640)))
    d.arc((x+round(w*.04), y+round(h*.07), x+round(w*.96), y+round(h*.93)), 205, 344, fill=(205, 159, 69, 30), width=max(1, round(min(canvas.size)/900)))
    layer = layer.filter(ImageFilter.GaussianBlur(max(0.5, min(canvas.size)/1100)))
    canvas.alpha_composite(layer)
    return [x, y, x+w, y+h]


def draw_cover(ratio: str) -> tuple[Image.Image, dict]:
    cfg = CONFIG[ratio]; canvas = paper_background(cfg["size"]); boxes = draw_brand(canvas, cfg); boxes["series"] = draw_pill(canvas, cfg); boxes.update(draw_title(canvas, cfg))
    boxes["researchInsert"] = paste_insert(canvas, cfg); boxes["orbit"] = draw_orbit(canvas, cfg)
    portrait = extract_portrait(); px, py, pw, ph = cfg["portrait"]
    scale = min(pw / portrait.width, ph / portrait.height)
    resized = portrait.resize((round(portrait.width*scale), round(portrait.height*scale)), Image.Resampling.LANCZOS)
    rx = px + (pw-resized.width)//2; ry = py + (ph-resized.height)//2
    # Follow the approved physiology/medicine cover treatment: the supplied
    # portrait stays untouched, while a restrained offset shadow supplies
    # depth behind it.  The shadow is composited first and never alters the
    # source line weight or the white face fill.
    shadow = Image.new("RGBA", resized.size, (0, 0, 0, 0))
    shadow_alpha = resized.getchannel("A").filter(ImageFilter.GaussianBlur(16))
    shadow_alpha = shadow_alpha.point(lambda p: min(58, int(p * .23)))
    shadow.putalpha(shadow_alpha)
    shadow_color = Image.new("RGBA", resized.size, (54, 83, 88, 0)); shadow_color.putalpha(shadow.getchannel("A"))
    canvas.alpha_composite(shadow_color, (rx + 9, ry + 14))
    canvas.alpha_composite(resized, (rx, ry)); boxes["portrait"] = [rx, ry, rx+resized.width, ry+resized.height]
    d = ImageDraw.Draw(canvas); nx, ny, npx = cfg["name"]; face = fnt(FONT_EN, npx); d.text((nx, ny), NAME, font=face, fill=INK)
    nb = d.textbbox((0,0), NAME, font=face); boxes["name"] = [nx, ny, nx+nb[2], ny+nb[3]-nb[1]]
    return canvas, boxes


def save_outputs() -> None:
    records=[]
    for ratio,cfg in CONFIG.items():
        image, boxes = draw_cover(ratio); path = OUT / f"physics2026-cover-{ratio}.jpg"
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        image.convert("RGB").save(path, "JPEG", quality=96, subsampling=0, optimize=True, icc_profile=profile)
        with Image.open(path) as check:
            assert check.size == cfg["size"] and check.mode == "RGB" and check.info.get("icc_profile")
        records.append({"ratio":ratio,"size":list(cfg["size"]),"file":path.name,"textBounds":boxes,"sha256":sha256(path),"mode":"RGB","colorSpace":"sRGB"})
    contact = Image.new("RGB", (1640,1120), (222,228,227)); cd=ImageDraw.Draw(contact); slots=[(30,30),(850,30),(30,580),(850,580)]
    for ratio,(x,y) in zip(CONFIG,slots):
        im=Image.open(OUT/f"physics2026-cover-{ratio}.jpg").convert("RGB"); im.thumbnail((760,470),Image.Resampling.LANCZOS); contact.paste(im,(x+(760-im.width)//2,y)); cd.text((x,y+480),f"{ratio.replace('x',':')}  {CONFIG[ratio]['size'][0]} × {CONFIG[ratio]['size'][1]}",font=fnt(FONT_CN_BOLD,26),fill=INK)
    contact.save(OUT/"cover-contact.jpg","JPEG",quality=96,subsampling=0)
    review = Image.new("RGB", (1640, 860), (222,228,227)); rd=ImageDraw.Draw(review)
    for col,ratio in enumerate(CONFIG):
        x=25+col*405; rd.text((x,18),f"{ratio.replace('x',':')} · 320 / 160",font=fnt(FONT_CN,22),fill=INK); im=Image.open(OUT/f"physics2026-cover-{ratio}.jpg").convert("RGB")
        for edge,yy in ((320,64),(160,445)):
            thumb=im.copy(); thumb.thumbnail((edge,edge),Image.Resampling.LANCZOS); review.paste(thumb,(x,yy))
    review.save(OUT/"cover-thumbnails.jpg","JPEG",quality=96,subsampling=0)
    source = {
        "subject":"2026 Nobel Prize in Physics cover","laureate":NAME,"title":" / ".join(TITLE),"series":SERIES,
        "referenceCover":"D:/python_project/manim_extend_rainbow/video_project/topology_optimization/delivery/nobel2026_v2/covers/cover-contact.jpg",
        "portraitSource":str(PORTRAIT_SRC),"portraitProcessing":"new high-resolution JPG kept pixel-for-pixel; alpha-only exterior paper removal using connected ink silhouette and enclosed-hole fill, white face/shirt retained, no recolour, redraw, line-thickening or alpha blur; restrained offset shadow added behind the untouched portrait",
        "researchInsert":{"file":str(INSERT_SRC),"provider":"Alibaba Cloud DashScope Qwen image","statusFile":str(ASSET/'qwen-status-take2.json'),"processing":"crop away generated black strips and caption; selective saturation/luminance mask; dark-panel suppression; cyan/ochre palette remap; feathered alpha and soft halo"},
        "coverTextPolicy":"Visible copy is limited to TITLE, SERIES and NAME; no subtitle, formulas, labels, source lines or extra copy.",
        "palette":{"paper":"#F4F5F0 to #EFF4F1","ink":"#0A2A37","accent":"restrained cyan and champagne gold"},
        "outputs":records,
    }
    (OUT/"source-record.json").write_text(json.dumps(source,ensure_ascii=False,indent=2),encoding="utf-8")
    (OUT/"layout-report.md").write_text("# physics2026_cover_v02 layout report\n\n- Reference: `nobel2026_v2/covers/cover-contact.jpg`\n- Four independent compositions: 16:9, 4:3, 3:4, 9:16.\n- Visible text is limited to `每天5分钟科普·高能中微子`, `诺贝尔 / 物理学奖` and `Francis Halzen`.\n- Qwen research insert is cropped, selectively alpha-masked, palette-remapped and feathered; no black strip, caption or hard rectangle reaches the final cover.\n- The person is kept on the right in horizontal ratios and lower half in vertical ratios; face and shoulders stay inside the safe area.\n",encoding="utf-8")
    print("\n".join(str(OUT/f"physics2026-cover-{r}.jpg") for r in CONFIG))

if __name__ == "__main__": save_outputs()
