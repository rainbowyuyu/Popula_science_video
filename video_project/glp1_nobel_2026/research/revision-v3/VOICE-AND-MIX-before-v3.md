# 本片声音制作记录 · V2

记录日期：2026-10-08。本文对应 V2 已锁定音频与字幕；最终 `delivery/GLP1_1080p.mp4` 已完成，`scripts/qa_final.py` 对实际成片的自动检查全部通过，记录见 `qa/final/automatic-report.json`。旧说明完整归档于 `revision-v2/VOICE-AND-MIX-before-v2.md`，其中的旧时长、字幕数和选片命令不适用于 V2。

| 项目 | V2 已记录结果 |
|---|---|
| 时间线 | 30 FPS，9776 帧，325.8666667 秒 |
| 旁白与字幕 | 48 条选定旁白、161 条字幕；无字幕重叠 |
| 分轨与母带 | 48 kHz，各 15,641,600 样本；旁白单声道，音乐与母带立体声 |
| 母带响度 / 真峰值 | −15.03 LUFS / −1.50 dBTP |
| 独立 AAC 试编码 | −15.03 LUFS / −1.43 dBTP；不是最终 MP4 的检测结果 |
| 最终 MP4 的 AAC | 48 kHz，−15.04 LUFS / −1.44 dBTP，响度范围2.4 LU |
| 最终编码时长 | 解码9776帧；视频流325.866667秒，容器325.909333秒 |
| 活跃旁白相对音乐 | 17.8846 dB |
| 波形检查 | 三个完整分轨/母带均为零削波样本；48 条原始音频无端点告警 |
| 参考文献尾声 | 9506–9776 帧，9 秒旁白精确静音 |
| 主观完整听审 | 未完成，`subjectiveListeningChecked=false` |

旁白采用现有本地 rainbow鱼参考音色与 Qwen3-TTS-0.6B，V2 的 48 句均按新版文本生成。参考声音没有复制到交付目录。选定声音在 `public/voice/g001.wav` 至 `g048.wav`；每条元数据在 `audio/takes/`，保存文本、发音提示、种子、批次、参数与 SHA256。口播将 AFP 读作“法新社”、GLP-1 读作“胰高血糖素样肽一”，字幕保留规范写法；g042 以“涨回”提示口播，显示文本为“长回”。

处理使用低切、固定轻降噪、轻微均衡、去齿音和压缩，并补偿测得的滤镜延迟。全部48条元数据确认输入与输出长度一致、没有时间拉伸或硬噪声门，语速因子为1。排期依据每条完整波形的实际长度向上取整到帧，再留5帧间隔；首句前12帧，片尾270帧。

g010、g020、g031、g041 曾生成发音候选，最终仅选用 g041 的完整候选；选择依据为自动转写对“饮食运动指导”的覆盖改善，不宣称经过人工听选。其他三句保留原选定声音。原始波形、所有候选以及 V1 选定声音均保留在 `audio/raw/`、`audio/candidates/revision-v2-pronunciation/`、`audio/selected-prior/v1-before-v2/`；g041 被替换前的 V2 记录另存于 `audio/selected-prior/v2-before-pronunciation/`。

48句均有首轮 CPU Whisper 记录，另有23句词表辅助复查。全部选片、首轮 ASR 与时间线的音频哈希一致；首轮编辑记录未出现连续两字及以上的插入或删除。g010 首轮字面匹配率0.7429，词表复查0.8571，差异包括血糖/雪堂、胰岛素/一道宿等近音识别；g031 药名也有近音写法。原始告警和两轮转写均保留，这些差异不足以单独证明读错，也不能证明发音完全正确。当前记录未确认需要返工的口播内容缺陷；自然度、语气和全片听感尚未经主观完整听审。

字幕以显示原文为准，按首轮词时间对齐，每条不超过22个中文等效显示单位。g033 已按语义拆成“约两千名”与完整人群条件，避免拆开“肥胖”。`scripts/qc.py` 已保存该分句规则；内存重生成全部161条与锁定版字段完全相同，序列化 timeline 字节及两份 SRT 文本一致，报告在 `caption-reproducibility-v2.json`。正式 SRT 为 `delivery/GLP1.srt`，历史别名 `delivery/GLP1-subtitles.srt` 内容相同。

配乐《微光信使》按 V2 实测长度重新编写，76 BPM、3/4拍、D大调/B小调，使用立式钢琴、竖琴、中提琴、大提琴、拨弦和轻触手鼓。只复用 VSCO 2 CE CC0 单音采样，没有导入往期成品音乐或旋律；40个来源文件的哈希检查通过。许可、固定版本来源和音符事件保存在 `research/music/`。混音按句平滑降低音乐，测量结果见 `audio-report.json`、`audio-validation.json`。

V2 时间线 SHA256：`aecb1dd5b85f16088bb870c1082c7feabe325cf64af3f52fcff97ed3d8f0240c`。母带 SHA256：`038a4b2264159d25b193c18581d6f1661d7d50af997fae54fbc42774477d88e9`。

最终 MP4 SHA256：`08ff8f39189290f59141ef459ffe35e73b4f0fea658505e11353d4a4302a64e1`（115,532,869字节）。实际编码文件的AAC响度与真峰值满足本片−16至−14 LUFS、低于−1 dBTP的目标；视频流时长和完整解码帧数与锁定时间线一致。上述自动检查不替代主观完整听审。

当前依据为 `qa/final/automatic-report.json`、`revision-v2-audio-lock.json`、`audio-validation.json`、`audio-report.json`、`voice-qa.json`、`glossary-qa.json`、`revision-v2-pronunciation.json` 与 `caption-reproducibility-v2.json`。审计范围摘要见 `revision-v2/final-audio-scope.md`。最终AAC数值来自本轮实际交付MP4；母带及独立试编码数值作为制作过程记录保留。
