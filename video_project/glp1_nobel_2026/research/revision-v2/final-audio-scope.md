# V2 最终音频审计范围

2026-10-08，最终MP4已完成。本次整理既有测量、ASR、选片元数据和制作文档，并读取主流程对实际成片生成的 `research/qa/final/automatic-report.json`；未重跑 TTS、混音、响度测量或 Remotion，也未修改源场景、时间线、音频或自动检查报告。

**当前结论：V2实际成片的自动检查全部通过，最终AAC为−15.04 LUFS、−1.44 dBTP，满足本片响度与真峰值目标。现有证据未确认需要返工的口播内容缺陷；主观完整听审未完成。**

- 时间线：30 FPS、9776帧、325.8666667秒，48条旁白、161条字幕。SHA256为 `aecb1dd5b85f16088bb870c1082c7feabe325cf64af3f52fcff97ed3d8f0240c`。
- 母带：48 kHz、15,641,600样本，−15.03 LUFS、−1.50 dBTP；SHA256为 `038a4b2264159d25b193c18581d6f1661d7d50af997fae54fbc42774477d88e9`。旁白相对活跃音乐17.8846 dB。现有验证记录中，旁白、音乐与母带均无削波，参考文献尾声的旁白精确静音9秒。
- 最终AAC：48 kHz、−15.04 LUFS、−1.44 dBTP、响度范围2.4 LU，由 `scripts/qa_final.py` 测量实际交付MP4。视频流325.866667秒、容器325.909333秒，完整解码9776帧，与锁定视频时间线一致。先前独立试编码的−15.03 LUFS、−1.43 dBTP仅保留为过程记录。
- 最终文件：`delivery/GLP1_1080p.mp4`，115,532,869字节，SHA256为 `08ff8f39189290f59141ef459ffe35e73b4f0fea658505e11353d4a4302a64e1`。自动检查于2026-10-08 10:35:24 UTC完成，`automaticChecksPass=true`；该结果不等同于主观完整听审。
- 逐句记录：48条选片、首轮ASR与时间线音频哈希全部一致；全部保留原长度，无时间拉伸、硬噪声门或原始端点告警。首轮编辑记录无连续两字及以上的插入/删除。23句另有词表辅助ASR，第一轮结果与告警保留。
- 剩余不确定性：g010首轮字面匹配率0.7429、词表复查0.8571，差异以医学词近音写法为主；g031药名也有近音转写。这是自动识别的不确定性，没有单凭ASR认定为口播错误。g041使用完整候选改善“饮食运动指导”的识别覆盖。不能据此声称发音、音色自然度或全片听感已通过人工听审；`subjectiveListeningChecked=false`。
- 字幕：g033“肥胖”断词已修正，分句规则已回写生成器。内存重生成161条字幕的全部字段与锁定版相同；两份timeline序列化字节与两份SRT文本相同，未通过重写成片输入进行验证。

依据：`research/qa/final/automatic-report.json`、`research/revision-v2-audio-lock.json`、`research/audio-validation.json`、`research/audio-report.json`、`research/voice-qa.json`、`research/glossary-qa.json`、`research/revision-v2-pronunciation.json`、`research/caption-boundary-fix-v2.json`、`research/caption-reproducibility-v2.json`，以及48份 `audio/takes/` 和 `audio/asr/` 记录。

制作文档已同步：`research/VOICE-AND-MIX.md`更新为V2真实记录，旧版完整保存在 `research/revision-v2/VOICE-AND-MIX-before-v2.md`。渲染前扫描 `delivery/` 与 `public/` 内Markdown和文本说明，未发现9222帧、307.4秒或134字幕的旧数字残留；当时 `delivery/解说稿.md`已正确写明05:25.9及9秒旁白静音尾声。本次仅同步两份声音文档中的实际最终编码结果，未修改任何delivery文件。
