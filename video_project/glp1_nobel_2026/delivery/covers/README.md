# 如何科学减肥？｜四比例封面

正式文件为 cardiometabolic-cover-16x9.jpg、4x3.jpg、3x4.jpg、9x16.jpg。RGB/sRGB，JPEG 4:4:4。黑底白字栏目：5分钟科普 · 血压血糖血脂。V11 正式四比例文件位于 `delivery/封面-V11/`；实际正片约14分51秒，为系列特别篇。

胰岛、剖开的小动脉、脂蛋白颗粒均取自本片 Three.js 模型，以封面专用镜头重渲染。为清晰表达，三个主体采用各自的展示倍率，不表示它们实际一样大；脂蛋白外壳在封面作了局部剖开。不是患者影像或实测场景，未调用图片生成。

透明 PNG Logo 位于左上，右侧 rainbow鱼。字体统一 Noto Sans SC。四版独立排布，不由横版裁成竖版。原图、320/160缩图检查范围详见 visual-review.json 与 root-visual-review.json。

复现：node scripts/render_cover_mechanisms_v6.mjs；python scripts/make_covers_v6.py。模型入口 research/revision-v6/covers/CoverMechanisms.tsx；坐标 scripts/make_covers_v6.py 与 layouts.json。无字底图为 artwork-比例.jpg。模型内的细胞排列和脂蛋白外观为教学示意。
