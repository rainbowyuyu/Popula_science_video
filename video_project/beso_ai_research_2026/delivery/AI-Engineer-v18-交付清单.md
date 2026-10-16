# AI Engineer 发布片 v18 · 交付清单

正式 revision：`e4457747837c`。成片 105 秒，16:9，1920×1080，60 fps，AAC 48 kHz。

| 交付内容 | 文件 |
| --- | --- |
| 完整成片 | [ai_engineer_launch_v18_1080p60.mp4](../output/ai_engineer_launch_v18_1080p60.mp4) |
| 中文字幕 | [AI-Engineer-Launch-v18.zh.srt](AI-Engineer-Launch-v18.zh.srt) |
| 制作说明 | [AI-Engineer-v18-制作说明.md](AI-Engineer-v18-制作说明.md) |
| 资产与能力依据 | [v18-assets-and-claims.json](v18-assets-and-claims.json) |
| 旁白与混音记录 | [v18-audio-manifest.json](v18-audio-manifest.json)、[v18-audio-notes.md](v18-audio-notes.md) |
| 源码恢复包 | [AI-Engineer-v18-recovery-e4457747837c.zip](AI-Engineer-v18-recovery-e4457747837c.zip) |

本版删除中心下立柱，严格保留三外柱与三个水平浮体；十二根系泊从耳板到锚点均为链环。网页演示全部重绘为向量动画，旁白重新用个人 rainbow鱼 音色合成。发布叙事突出 AI Engineer 的共享任务、跨工具执行、失败反馈、工程师控制和可追溯交付。

成片 SHA-256：`25a218c4d41599b7337dc90bf71aa6339aa9c164fcfd1308f8d591652939b622`。

完整解码 6300 帧通过；最终 AAC -16.13 LUFS、-2.06 dBTP，与已核对混音解码样本完全一致。技术检查、画面样本复核和音轨绑定的依据分别为 `research/qa/launch-v18-delivery.json`、`research/qa/v18-final-visual-review.json`、`research/qa/v18-audio-final-binding.json`。检查范围限报告明确记录的项目，不声称真人听审或连续正常速度全片观看。

展示用三柱构型和光学波面没有被冒充新求解模型。BESO 与 Zwind 使用独立保存案例；失败记录同时修改迭代上限 100→300 和保留质量目标 0.15→0.25，仍是 `awaiting_post_check`。没有宣称自动恢复成功、实测商业收益或新构型通过工程认证。

本地恢复包已创建：`delivery/AI-Engineer-v18-recovery-e4457747837c.zip`，190 项文件的清单、CRC 与成员 SHA-256 校验通过。验证记录：`research/qa/v18-recovery-package-e4457747837c.json`。恢复包 SHA-256：`ed0e15d7df1bdc35fcaa0c92a0c2b7bd59048bf7bd24ba59b6f1cbab1d16aff3`。

已清理本片旧版临时目录和重复分段，共 1,717,383,394 字节（约 1.60 GiB）。当前源码、原始数据、音频源、最终冻结输入及 v17/v16 回退材料保留；保护文件检查及清理后成片 SHA 均一致。清理记录：`research/qa/v18-cleanup-execute-20261014T140140059746Z.json`。恢复包内制作说明是打包时快照，后续清理状态以本文件和独立清理报告为准。
