# AI Engineer 发布片 v19 · 交付清单

正式revision：`3b7888272d56`。成片76.317秒，1920×1080，60 fps，4579帧，48 kHz AAC。

| 交付内容 | 文件 |
| --- | --- |
| 完整成片 | [ai_engineer_launch_v19_1080p60.mp4](../output/ai_engineer_launch_v19_1080p60.mp4) |
| 中文字幕 | [AI-Engineer-Launch-v19.zh.srt](AI-Engineer-Launch-v19.zh.srt) |
| 制作与证据说明 | [AI-Engineer-v19-制作说明.md](AI-Engineer-v19-制作说明.md) |
| 音频记录 | [v19-audio-manifest.json](v19-audio-manifest.json)、[v19-audio-notes.md](v19-audio-notes.md) |
| 源码恢复包 | [AI-Engineer-v19-recovery-3b7888272d56.zip](AI-Engineer-v19-recovery-3b7888272d56.zip) |

本版紧凑重录12句旁白，恢复注明范围的图强号研究案例对比：单位功率用钢量降低约8.1%，对应基础少用450吨钢；重新设计文字重点与数字动效，使用完整高清矢量Logo与未删改的软件原则性批准证书。

成片SHA-256：`51c3fed576909783797a4ff948f6649d95a98244c9365e0c9ea487596a15aa52`。

完整解码4579帧通过，最终AAC -16.05 LUFS、-2.46 dBTP；音轨与批准AAC解码样本一致，延迟0个采样。最终画面样本复核与技术记录见 `research/qa/v19-final-visual-review.json`、`launch-v19-delivery.json`、`v19-audio-final-binding.json`。不声称真人听审或正常速度连续观看。

段0、1按修正后的文字布局重新渲染，段2–5经准确代码差异和冻结输入SHA证明不受该修正影响，保留明确原revision与来源记录；没有冒充全部重新渲染。证据位于 `research/qa/v19-invariant-import-8f46df0b48ba-to-3b7888272d56-proof.json`。

恢复包193项清单、CRC和成员SHA-256检查通过；SHA-256：`0c118a8a6b9ec24bccc296082ad6653ef715092c7e0d42c7f64a982296e17606`。本轮旧缓存只做可逆迁移，没有删除。迁移记录位于 `research/qa/v19-reversible-cache-relocation.json`；v18成片、恢复包、原始模型和音频均保留。
