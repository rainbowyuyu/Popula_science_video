# 地铁安全线 · 声音交付

本页记录 canonical 音频脚本的复现约束。实际时长和帧数以运行后的 `research/metro/timing-summary.json` 为准；旁白句数随当前 `story.json` 生成。没有变速、变调或静音补齐目标时长的设计。

旁白使用本机 `D:/python_project/tts/models/Qwen3-TTS-0.6B` 与用户已有的 rainbow鱼参考音色。参考音频留在 TTS 工程，未复制到本集。原始句源在 `public/metro/voice-raw`，保守清理后的句源在 `public/metro/voice`。清理只应用一次，包含低切、轻降噪、轻均衡、轻去齿音与软压缩；滤镜延迟经过测量并补偿，句子原时长保持不变。

`public/metro/narration.wav`、`music.wav`、`master.wav` 设计为 48 kHz、双声道 PCM 24 位。`scripts/score_metro_v2.py` 的疏朗编排只保留两层柔和钢琴和一个低根音：每 8 秒换和弦，去掉木质点音、额外脉冲和持续鼓组，旁白进入时自动压低。脚本把 **22.5 dB** 写作目标分离值，并在处理完鸭压后重新计算实际人声/音乐 RMS 差，写入 `voiceToMusicActiveRmsSeparationDb`；没有运行脚本前不要填写实际测量数字。

母带目标为 **−16 LUFS、−1.5 dBTP**。这是 WAV 母带的测量目标，发布 MP4 内的 AAC 仍须独立测量。运行脚本后，实际测量与文件 SHA256 写入 `audio-manifest.json`。

逐句旁白应经过机器转写辅助核对，并检查整句缺失与过长静音候选。常见转写差异包含同音字；机器检查不能证明主观音色质量，因此所有报告的 `subjectiveListeningChecked` 必须保持 `false`，直到有人完成实际听审。字幕由 ASR 字时间对齐，每条最多 19 字，标准文案独立保存。音频源、清理句源、最终时间线的哈希和长度检查见 `audio-qa.json`。

独立试听在 `public/metro/previews`（脚本运行后生成）：

- `voice-raw-same-level.wav` / `voice-clean-same-level.wav`：同电平原声与处理后声音。
- `previews/music-sparse.wav`：疏朗配乐试听，单独提高电平便于试听，不参与最终混音。
- `previews/mix-opening.wav`：开场 30 秒含音乐旁白。

可复现入口，均在本工程目录执行：

```powershell
D:/python_project/tts/.venv/Scripts/python.exe scripts/voice_metro.py
D:/python_project/tts/.venv/Scripts/python.exe scripts/asr_metro.py
D:/python_project/tts/.venv/Scripts/python.exe scripts/prepare_metro_audio.py
D:/python_project/tts/.venv/Scripts/python.exe scripts/score_metro_v2.py
D:/python_project/tts/.venv/Scripts/python.exe scripts/qa_metro_audio.py
```

机器内存紧张时按上述顺序运行。文本或声音改变后应重新对齐字幕、混音和验证。`prepare_metro_audio.py` 同步写入 `public/metro/timeline.json` 与 `src/metro/timeline.json`。

**人工试听状态：待测。** `subjectiveListeningChecked` 保持 `false`，`aacMeasurementPending` 保持 `true`，未以脚本输出替代主观听审或最终 MP4 测量。
