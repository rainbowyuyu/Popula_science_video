# AI Engineer 发布片 v3 · v11 交付说明

- 成片：`output/ai_engineer_launch_v11_1080p60.mp4`
- 字幕：`delivery/AI-Engineer-Launch-v11.zh.srt`
- 时长：105 秒，1920×1080，60 fps

## 本轮结构修复

- Qwen/网页桥接只在场景入场与离场出现，稳定段回到单一主叙事层。
- brief 按“输入截图 → 设计指标”顺序交替呈现，减少同屏竞争。
- proof 按“案例指标 → 实时查看器”顺序交替呈现，缩小查看器并留出模型空间。
- travel 位移从 1800px 收紧到 1240px，进入和退出更完整，减少半截文字。
- 真实网页投影降低白底、边框和阴影，去掉桥接标签与圆角卡片感。
- 字幕缩为 34px 单行安全区，标题保持画外缓入，Zwind、BESO、系泊等术语沿用已校对音频。

## 验证

- `npm run typecheck` 通过。
- 关键帧：`research/qa/structure-v11-stills/`
- 技术报告：`research/qa/verify-launch-v11.json`
- 完整解码、音画对齐、响度、峰值、字幕边界均由验证脚本检查。
