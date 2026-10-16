# AI Engineer 发布片 v15 交付说明

成片采用发布片定位，时长 105 秒，主线是：**工程需求 → AI Engineer 任务拆解 → 几何与网格 → BESO → Z-wind → 失败反馈 → 工程师复查 → 可验证交付**。

## 文件

- 成片：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\output\ai_engineer_launch_v15_1080p60.mp4`
- 中文字幕：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\delivery\AI-Engineer-Launch-v15.zh.srt`
- 技术 QA：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\research\qa\verify-launch-v15-final3.json`
- 抽帧清单：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\research\qa\v15-final-encode-frames-final3\manifest.json`
- 视觉复核：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\research\qa\v15-final-visual-review.json`
- 音频清单：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\research\qa\v15-voice-forward-audit.json`
- 音频修复记录：`D:\python_project\manim_extend_rainbow\video_project\beso_ai_research_2026\research\qa\v15-audio-refresh.json`

成片 SHA-256：`03bdef8f3076797305e89a0f0789eca8ac00ce3991f5d40dded7f4c4d8623410`

## 画面升级

v15 将叙事从工具展示改为产品发布片：AI Engineer 负责把自然语言工程目标拆成连续任务，调度几何、网格、BESO 与 Z-wind，并把日志和结果带回下一轮判断。标题、任务图、网页工作区和平台模型沿同一条三维摄影机走廊衔接；桥接素材用于海面、工程图、实体、BESO、响应和交付页之间的 match cut。网页证据层改为无边框海面光晕，取消不透明卡片边界；章节标题停在海面开放水带，以确定性波浪漂移和轻微旋转跟随镜头，减少幻灯片感。浙江大学 Ocean College 矢量 Logo 固定在右上安全区。

## 音频

使用本地文件 `D:\CloudMusic\Kirara Magic - Dragonflame.mp3`，原始 SHA-256：`1c0a5b45cc72eca7189a99362afec27489c7602fbca48a014adce80850543867`。音频取 MP3 主音频流，统一到 48 kHz；采用旁白优先的固定电平混音（旁白提升、音乐床额外压低、效果声收敛），避免旁白被音乐掩盖，最后以 AAC 写入成片。最终测得综合响度 `-16.64 LUFS`、真峰值 `-2.62 dBTP`、LRA `4.9 LU`。

该曲目是用户提供的本地商业录音，公开发布许可未独立核验；正式发布前请确认授权。

## QA 结论

技术 QA 已通过（最终重构版）：完整解码 `6300` 帧，无黑帧、无异常长静音，音画均为 105 秒，字幕数量和边界通过，输出为 1920×1080、60 fps、48 kHz AAC。视觉结论来自 `219` 个抽样帧、`19` 张接触表和桥接/网页细节抽帧；开场复核通过，未发现持续遮挡、Logo 裁切或“AI 生成转场”字样。

抽样视觉检查没有替代全片连续观看；当前记录也没有声称完成主观听审。生成桥接素材、WaterPro 波面和保存的 BESO/Z-wind 回放均按视觉表达与证据边界记录，不能表述为本片重新完成的全耦合求解。


## 宽画面修复记录

针对 topology→physics 镜头，退出层沿镜头切向移出阅读区后再柔和收尾，清除左缘半截文字残留；抽查关键帧 2322、2370、2400、2430，确认无断字、窄条卡片或数据裁切。旧版本保留为 `output/ai_engineer_launch_v15_1080p60_pre-stagefix.mp4`。

