# Roadster：倒挂与空中翻滚

最新完整一期：[Roadster_倒挂与飞行翻滚_1080p.mp4](output/v06/Roadster_倒挂与飞行翻滚_1080p.mp4)，331.3秒，1920×1080，30fps。

- [资料与官方原视频](research/sources.md)
- [完整解说稿](output/v06/完整解说稿.md)
- [带章节定位的预览页](output/v06/preview.html)
- [中文字幕](subtitles/v06/Roadster_中文字幕.srt)
- [交付台账](output/v06/delivery.json)
- [四比例封面](output/covers/v01/index.html)

本片为原创三维机制解释：压差贴住表面；冷气喷射提供推力；偏心推力产生力矩；反向力矩刹住翻转。算例和喷嘴位置均为教学设定，不表示Tesla实测参数。真实专利首页用于来源展示。

正文源工程位于 source/v05，运行 `npm run check`、`npm run stills`、`npm run render`。V06 新增原片与 Qwen 转场，重建步骤见 [source/v06/README.md](source/v06/README.md)。引用已安装共享 node_modules（DNA项目），不复制共享依赖。私有参考音色仍在原TTS工程。

完整回退版本保留在 output/v05；V04 成片和恢复包也保留。清理记录见 [2026-10-17 清理说明](work/cleanup/2026-10-17/README.md)。旧 V01 的依赖可通过 `npm ci` 重装；V04 再渲染前须从其恢复包恢复 public/audio。当前 V05/V06 与封面不依赖这两项。
