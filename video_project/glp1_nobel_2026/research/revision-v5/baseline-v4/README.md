# 科学减重，读懂三高

rainbow鱼 · 每天5分钟科普特别篇。V4：1920×1080 / 30 fps / 11分16.3秒 / 72句旁白。

已删除原版药物疗效和获益统计，围绕一顿饭连接血糖、血压、血脂及日常管理。宏观模型沿用同一米制人体坐标；微观教学结构固定在母层位置，摄影机逐层靠近，前景逐渐透明。比例尺随焦点平面持续更新。

- `delivery/GLP1_1080p.mp4`：完整新版视频，技术文件名沿用工程名。
- `delivery/解说稿.md`、`delivery/GLP1.srt`：实际口播与字幕。
- `delivery/发布文案.md`：抖音、小红书、B站、微信视频号文案。
- `delivery/制作与来源.md`：来源、教学示意边界、素材许可与复现说明。
- `delivery/covers/`：四种比例独立排版JPG。

最终自动检查：`research/qa/final-v4/automatic-report.json`。
画面抽样检查：`research/qa/final-v4/visual-review.json`。
医学来源与逐句映射：`research/revision-v4/evidence.json`。

完整解码及抽样检查已完成；未声称全长人工观看或主观听审。

复现：`npm run check`，`node scripts/render.mjs --concurrency=3`，`python scripts/qa_final.py --revision v4`。

所有正式镜头由帧号决定。已有最终配音和真实音长时间线，不要重跑草稿脚本 `story_v4.py` 覆盖它们。源码、原始声音、来源数据及许可证保留。
