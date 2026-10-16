# V05 音频制作记录

- 旁白：本地 Qwen3-TTS-0.6B，参考 `D:/python_project/tts/work/clone-reference.wav`。
- 语速：按每段实际合成时长重建 `src/physics2026/timeline-v03.json`，没有使用 `atempo` 或旧版画面拟合。
- 清理：`broadcast_voice` 后只做极短淡入淡出，保留自然辅音和句尾。
- 旁白与字幕：每句拆成 `subtitleParts`，字幕边界由最终清理音频按字符权重分配，片段之间保留 0.70 秒自然停顿。
- 背景音乐：Sappheiros《Embrace》，原速原调，采用 8 秒循环交叉衔接；高通 65 Hz、2.7 kHz 语音频段轻微挖空、旁白 sidechain ducking，最后以 `loudnorm` 输出约 −14.5 LUFS。
- 来源与哈希：完整记录见 `../audio/v04/audio-manifest-v04.json`。

成品音频总时长为 262.43 秒。SoX 缺失只影响 `broadcast_voice` 的可选诊断，不影响 FFmpeg 淡入淡出、混音和最终 PCM 母带生成。
