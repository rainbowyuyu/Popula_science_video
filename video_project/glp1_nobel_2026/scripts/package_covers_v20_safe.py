"""Package the visually reviewed V20 mechanism covers."""
from pathlib import Path
import json, shutil, hashlib, zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "research/revision-v20-safe/covers"
OUT = ROOT / "delivery/封面-V20"
OUT.mkdir(parents=True, exist_ok=True)
report = json.loads((SRC / "layout-report.json").read_text("utf8"))
review = {
    "status": "reviewed",
    "method": "Viewed every full-resolution cover and 320 px / 160 px contact sheets after final title replacement.",
    "checks": [
        "The original transparent PNG logo is complete at top left, with rainbow鱼 to its right.",
        "The same Noto Sans SC font and film-derived islet, lipoprotein and arteriole material language are retained.",
        "Headline and subtitle stay outside the model bounding boxes in all four independent layouts.",
        "Titles are the first readable element at 160 px. Secondary labels are legible at full size and remain visually subordinate.",
        "The current V18 cover text has no Nobel/news wording; old internal source files do not establish the actual platform trigger.",
    ],
    "headline": "一顿饭后，身体在忙什么？",
    "subtitle": "看懂血糖、血压与血脂调节",
    "series": "5分钟科普 · 血压血糖血脂",
    "outputs": {},
}
for ratio, dims in {"16x9": (1920, 1080), "4x3": (1920, 1440), "3x4": (1440, 1920), "9x16": (1080, 1920)}.items():
    source = SRC / f"body-regulation-cover-{ratio}.jpg"
    output = OUT / f"一顿饭后_身体在忙什么_{ratio}.jpg"
    with Image.open(source) as image:
        assert image.size == dims and image.mode == "RGB"
        assert image.info.get("icc_profile")
    shutil.copy2(source, output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    assert digest == report["formats"][ratio]["sha256"]
    review["outputs"][ratio] = {"path": str(output.relative_to(ROOT)), "size": dims, "sha256": digest}
    report["formats"][ratio]["visualReview"] = "reviewed at full size, 320 px and 160 px"
(SRC / "layout-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf8")
(SRC / "visual-review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), "utf8")
(OUT / "封面检查记录.json").write_text(json.dumps(review, ensure_ascii=False, indent=2), "utf8")
(OUT / "说明.md").write_text("""# 一顿饭后，身体在忙什么？ · V20 四比例封面

主标题：一顿饭后，身体在忙什么？
副标题：看懂血糖、血压与血脂调节。
栏目条：5分钟科普 · 血压血糖血脂，青绿色底白字。

采用正片同源的胰岛、脂蛋白、血管模型画面，保留浅色背景、柔和阴影、Logo 和 rainbow鱼 署名。四版独立布局，输出 RGB/sRGB JPEG 4:4:4。封面没有新闻、奖项、疗效或速瘦承诺；“5分钟科普”为系列名称，本集是约14分51秒的完整长篇。

已逐张查看原图与320/160像素缩略图，完成尺寸、ICC、标题边界和标题/模型遮挡检查。平台提示未提供具体触发时间点，不能把内部旧稿当作此次审核的确定原因。

可编辑来源：`scripts/make_covers_v20_safe.py`；无字底图、布局、来源哈希与视觉检查在 `research/revision-v20-safe/covers/`。
""", "utf8")
archive = ROOT / "delivery/四比例封面-V20.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for path in sorted(OUT.iterdir()):
        if path.is_file():
            z.write(path, arcname=f"封面-V20/{path.name}")
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(json.dumps({"directory": str(OUT), "zip": str(archive), "files": review["outputs"]}, ensure_ascii=False, indent=2))
