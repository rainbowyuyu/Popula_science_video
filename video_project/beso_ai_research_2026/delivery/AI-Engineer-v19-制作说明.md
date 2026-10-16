# AI Engineer 发布片 v19 · 制作与交付说明

正式版本 `3b7888272d56`，76.317 秒，1920×1080，60 fps，共 4579 帧，48 kHz AAC。

本版把节奏压到实际完整旁白句长，开头直接提出“少用钢、扛住风浪”的工程目标。需求转成任务、工具接续、失败反馈、版本一致性与可复查交付组成产品主线。文字重新设计为少层级的重点标题、数值与紧凑状态动画，和连续三维镜头配合。

图强号对比恢复为注明范围的研究案例：同为20 MW，相对文稿中的图强号参考基线，单位功率用钢量由278降至255.5吨/兆瓦，约降低8.1%，对应基础少用450吨钢。极端工况系泊峰值张力降低，同时纵摇等指标有取舍；没有把它表述为所有指标均优、实物采购收益或新展示构型的重新求解结果。来源与边界见 `research/v19-comparison-evidence.json`。

软件原则性批准证书使用原始第1页，证书正文未删改。其范围为AI Engineer相关软件项目的功能、算法及参数等原则性审查，不是本片新构型的制造或入级认可。右上角浙江大学海洋学院Logo保留用户指定项目中的全部矢量路径，422×108显示，移除了模糊投影；没有重画或替换正式标识。

配音使用rainbow鱼个人音色与相同Qwen3-TTS权重，在用户授权的fusion H100 GPU1生成，任务完成后退出；本地保留原始、处理音轨与来源记录。所选12句原声总70.480秒，不变速、不拼词、不裁句尾，依实际句长重排字幕与镜头。音乐沿用用户指定的Kirara Magic《Dragonflame》，按段落衔接并在人声期间降低音乐音量。

本片沿用三外柱、三个水平浮体和12条全长锚链的展示模型；BESO、Zwind为独立保存案例。Blender、Three.js、WaterPro WebGPU和Remotion承担视觉表达，不冒充AI Engineer求解创新。没有新增未验证的全耦合求解或商业收益承诺。

最终MP4完整解码4579帧通过；AAC测量为-16.05 LUFS、-2.46 dBTP。最终音轨与批准AAC解码样本一致：True；无提示ASR匹配率0.993485。画面检查范围见 `research/qa/v19-final-visual-review.json`，不声称真人听审或正常速度连续全片观看。

成片SHA-256：`51c3fed576909783797a4ff948f6649d95a98244c9365e0c9ea487596a15aa52`。

- 成片：`output/ai_engineer_launch_v19_1080p60.mp4`
- 中文字幕：`delivery/AI-Engineer-Launch-v19.zh.srt`
- 技术QA：`research/qa/launch-v19-delivery.json`
- 音轨绑定：`research/qa/v19-audio-final-binding.json`
- 音频记录：`delivery/v19-audio-manifest.json`
- 缓存可逆迁移：`research/qa/v19-reversible-cache-relocation.json`

本轮旧缓存只做可逆迁移，没有删除。v18成片、恢复包、原模型、原始音轨与公共数据保留。恢复包状态以对应 `v19-recovery-package-{revision}.json` 为准；此说明先于恢复打包生成，不能替代ZIP校验。

恢复包已创建并验证：`delivery/AI-Engineer-v19-recovery-3b7888272d56.zip`，共193项；清单、CRC、成员SHA-256全部通过。恢复包SHA-256：`0c118a8a6b9ec24bccc296082ad6653ef715092c7e0d42c7f64a982296e17606`。恢复包内制作说明为打包时快照，打包后的状态以本文件和独立恢复报告为准。
