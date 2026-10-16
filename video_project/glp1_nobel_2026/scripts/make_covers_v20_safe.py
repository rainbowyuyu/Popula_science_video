"""Create a platform-safe mechanism cover set without news or award framing.

The artwork stays tied to the film's three visual mechanisms. Text deliberately
describes the lesson (meal -> glucose, lipids, pressure) and contains no award,
release-date, trending-event, efficacy or treatment language.
"""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageCms

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "research/revision-v6/covers"
OUT = ROOT / "research/revision-v20-safe/covers"
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path("C:/Windows/Fonts/NotoSansSC-VF.ttf")
INK = "#1d3535"
ICC = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()

# Independent compositions keep labels clear in every feed aspect ratio.
LAYOUTS = {
    "16x9": dict(subtitle=[80, 737, 50], size=[1920, 1080], title=[78, 332, 122, 150], capsule=[78, 218, 38],
                  objects={"glucose": [978, 190, 530], "lipid": [1502, 392, 327], "pressure": [850, 737, 950]},
                  labels={"glucose": [1030, 125], "lipid": [1515, 320], "pressure": [1160, 730]}, labelSize=45),
    "4x3": dict(subtitle=[100, 810, 56], size=[1920, 1440], title=[98, 380, 130, 166], capsule=[98, 247, 42],
                 objects={"glucose": [1058, 270, 650], "lipid": [1415, 938, 345], "pressure": [235, 1055, 1090]},
                 labels={"glucose": [1130, 200], "lipid": [1460, 1310], "pressure": [315, 975]}, labelSize=51),
    "3x4": dict(subtitle=[94, 774, 57], size=[1440, 1920], title=[92, 329, 150, 178], capsule=[92, 228, 43],
                 objects={"glucose": [105, 943, 666], "lipid": [882, 976, 397], "pressure": [192, 1560, 1090]},
                 labels={"glucose": [134, 866], "lipid": [954, 899], "pressure": [790, 1495]}, labelSize=53),
    "9x16": dict(subtitle=[67, 711, 49], size=[1080, 1920], title=[65, 313, 128, 152], capsule=[65, 208, 38],
                  objects={"glucose": [66, 905, 580], "lipid": [661, 1000, 313], "pressure": [88, 1550, 902]},
                  labels={"glucose": [96, 823], "lipid": [708, 922], "pressure": [130, 1470]}, labelSize=50),
}


def font(size, weight=650):
    f = ImageFont.truetype(str(FONT), round(size))
    f.set_variation_by_axes([weight])
    return f


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bg(w, h):
    y, x = np.mgrid[0:h, 0:w]
    p = np.full((h, w, 3), [247, 245, 239], np.float32)
    a = np.exp(-(((x - w * .70) / (w * .5)) ** 2 + ((y - h * .69) / (h * .57)) ** 2))
    p += a[:, :, None] * np.array([-15, -8, -8])
    return Image.fromarray(np.uint8(np.clip(p, 0, 255))).convert("RGBA")


def trim(im):
    alpha = im.getchannel("A")
    box = alpha.point(lambda value: 255 if value > 10 else 0).getbbox()
    return im.crop(box)


def place(canvas, im, placement):
    x, y, width = placement
    height = round(im.height * width / im.width)
    im = im.resize((width, height), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", canvas.size)
    draw = ImageDraw.Draw(shadow)
    draw.ellipse((x + width * .15, y + height * .82, x + width * .89, y + height * 1.04), fill=(48, 71, 65, 25))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(34)))
    canvas.alpha_composite(im, (x, y))
    return [x, y, x + width, y + height]


def save(im, path):
    im.convert("RGB").save(path, quality=96, subsampling=0, icc_profile=ICC)


def main():
    art = {name: trim(Image.open(ART / f"{name}.png").convert("RGBA")) for name in ("glucose", "pressure", "lipid")}
    logo = Image.open(ROOT / "public/brand/logo.png").convert("RGBA")
    assert logo.size == (347, 410)
    report = {
        "title": "一顿饭后，身体在忙什么？",
        "subtitle": "看懂血糖、血压与血脂调节",
        "series": "5分钟科普 · 血压血糖血脂",
        "editorialConstraints": {"avoid": ["诺奖", "诺贝尔", "落选", "热门", "开奖", "AFP", "日期"],
                                  "reason": "以身体调节机制作为主线；不借助新闻、奖项或社会热点吸引点击。当前V18封面与发布文案本身没有这些热点词，不能据此认定平台的实际触发原因。"},
        "formats": {},
        "sourceHashes": {name: sha(ART / f"{name}.png") for name in art},
        "logoSHA256": sha(ROOT / "public/brand/logo.png"),
        "fontSHA256": sha(FONT),
        "imageGenerationUsed": False,
    }
    images = {}
    for key, layout in LAYOUTS.items():
        width, height = layout["size"]
        canvas = bg(width, height)
        bounds = {name: place(canvas, art[name], placement) for name, placement in layout["objects"].items()}
        save(canvas, OUT / f"artwork-{key}.jpg")
        draw = ImageDraw.Draw(canvas)
        scale = min(width, height) / 1080
        bx, by, bh = round(64 * scale), round(48 * scale), round(90 * scale)
        bw = round(bh * 347 / 410)
        canvas.alpha_composite(logo.resize((bw, bh), Image.Resampling.LANCZOS), (bx, by))
        brand_font = font(44 * scale, 600)
        draw.text((bx + bw + round(20 * scale), by + round((bh - brand_font.getbbox("rainbow鱼", anchor="lt")[3]) / 2)),
                  "rainbow鱼", font=brand_font, fill=INK, anchor="lt")

        x, y, fs = layout["capsule"]
        capsule_font = font(fs, 650)
        series = "5分钟科普 · 血压血糖血脂"
        text_box = draw.textbbox((0, 0), series, font=capsule_font, anchor="lt")
        capsule_box = [x, y, x + text_box[2] + round(36 * scale), y + text_box[3] + round(28 * scale)]
        draw.rounded_rectangle(capsule_box, radius=round(10 * scale), fill="#3c746f")
        draw.text((x + round(18 * scale), y + round(14 * scale)), series, font=capsule_font, fill="#ffffff", anchor="lt")

        # Main title is a question about the visual mechanism, with no health promise.
        x, y, fs, step = layout["title"]
        title_font = font(fs, 800)
        title_boxes = []
        title_lines = ["一顿饭后", "身体在忙什么？"]
        for index, line in enumerate(title_lines):
            position = (x, y + index * step)
            draw.text(position, line, font=title_font, fill=INK, anchor="lt")
            title_boxes.append(draw.textbbox(position, line, font=title_font, anchor="lt"))
        sx, sy, sfs = layout["subtitle"]
        subtitle_font = font(sfs, 600)
        subtitle = "看懂血糖、血压与血脂调节"
        draw.text((sx, sy), subtitle, font=subtitle_font, fill="#477570", anchor="lt")
        title_boxes.append(draw.textbbox((sx, sy), subtitle, font=subtitle_font, anchor="lt"))

        colors = {"glucose": "#397c77", "pressure": "#9b554d", "lipid": "#9d7d3f"}
        labels = {"glucose": "胰岛调血糖", "pressure": "血管调血压", "lipid": "脂蛋白运输"}
        for name, label in labels.items():
            draw.text(tuple(layout["labels"][name]), label, font=font(layout["labelSize"], 650), fill=colors[name], anchor="lt")

        final = OUT / f"body-regulation-cover-{key}.jpg"
        save(canvas, final)
        images[key] = canvas.convert("RGB")
        for edge in (320, 160):
            thumb = canvas.copy()
            thumb.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            save(thumb, OUT / f"body-regulation-cover-{key}-{edge}.jpg")
        for box in title_boxes + [capsule_box]:
            assert 0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height, (key, box)
            for name, bounds_box in bounds.items():
                overlap = max(0, min(box[2], bounds_box[2]) - max(box[0], bounds_box[0])) * max(0, min(box[3], bounds_box[3]) - max(box[1], bounds_box[1]))
                assert overlap == 0, (key, "text overlap", name)
        report["formats"][key] = {"size": [width, height], "sha256": sha(final), "modelBounds": bounds,
                                  "titleBounds": title_boxes, "capsuleBounds": capsule_box, "layout": layout,
                                  "visualReview": "pending"}

    for edge in (640, 320, 160):
        sheet = Image.new("RGB", ((edge + 40) * 4, edge + 90), "#dfdfd7")
        draw = ImageDraw.Draw(sheet)
        for index, (key, image) in enumerate(images.items()):
            thumb = image.copy()
            thumb.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (index * (edge + 40) + 20 + (edge - thumb.width) // 2, 55 + (edge - thumb.height) // 2))
            draw.text((index * (edge + 40) + 20, 12), key.replace("x", ":"), font=font(24), fill=INK)
        save(sheet, OUT / f"contact-sheet-{edge}.jpg")
    (OUT / "layouts.json").write_text(json.dumps(LAYOUTS, ensure_ascii=False, indent=2), "utf8")
    (OUT / "layout-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
