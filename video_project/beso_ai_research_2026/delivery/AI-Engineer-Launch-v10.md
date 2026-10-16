# AI Engineer 发布片 v3 · 交付说明

- 成片：`output/ai_engineer_launch_v10_1080p60.mp4`
- 字幕：`delivery/AI-Engineer-Launch-v10.zh.srt`
- 时长：105 秒，1920×1080，60 fps
- 音频：48 kHz AAC，约 −16 LUFS，真峰值低于 −1.8 dBTP

## 本轮优化

- 统一 brief、topology、physics、interaction、toolchain、proof、close 的摄影机走廊，页面与模型沿同一方向进出画面。
- 真实网页改为半透明证据投影，降低白色卡片感；Qwen 桥接只承担材质与空间过渡，真实输入、结果和日志由原始界面叠加。
- 修复片头与各场景入口的标题竖排残影：标题固定宽度、画外进入并在约半秒内缓动到位。
- 统一字幕为底部渐变安全区，浙江大学海洋学院矢量 Logo 固定右上角。
- 保留真实三浮筒平台、BESO 文件接力、Zwind 响应、失败日志、人工复查和可追溯交付证据。

## 验证

- `npm run typecheck` 通过。
- 完整解码 6300 帧，无黑帧、长静音、字幕越界或重叠。
- 技术报告：`research/qa/verify-launch-v10.json`
- 关键帧：`research/qa/final-v10-stills/`
