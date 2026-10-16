# 上海中心：当前音频与字幕交付校验

日期：2026-10-09。以当前 `public/timeline.json` 的 48 条已选旁白为准。

## 修复内容

- 已从候选目录提升 33 条与当前波形 SHA256 和 TTS 文本同时一致的 ASR；未重新合成或修改音频。
- 29 条字幕文案同步为已选旁白口语文本。画面专业标签保持原用途，字幕不再把旧文案套到新旁白的词时间上。
- 48 条整段字幕拆为 174 条短句；短连接词与相邻分句合并，避免“所以”“你看”等短字闪现。
- `validate_audio.py` 删除过期的 390 秒上限，改为验证当前时间线、片尾范围、音频样本数、ASR 哈希与 SRT 一致性。

## 当前校验结果

- 11,845 帧，30 fps，总长 394.833333 秒。48 条 clip 的起止时间和音频波形未修改。
- 174 条字幕，最短 20 帧（0.667 秒），最长 22 个字宽单位，无重叠。每条 clip 的字幕拼接文本与当前 TTS 文本完全一致。
- 48/48 ASR 源 SHA256 对应当前选定音频，`scripts/qc.py` 已刷新完整报告。
- 48/48 音频通过 finite、源哈希、处理时长和无削波检查。首部最小安全余量 0.10 秒，尾部最小安全余量 0.15 秒，边界告警为空。
- s048 保留原始波形端点能量提醒 `raw_endpoint`；处理后有安全余量，识别结果覆盖完整末句。自动检查无法替代人工听感审核。
- `scripts/validate_audio.py` 通过：旁白/配乐/母带样本数均对应当前完整时长，旁白比配乐高约 18.00 dB。

## 哈希

- src/public timeline：`92ce9bae1554f1e48e7bb32fa38a1eb691f8e2ba76af14f597d21a504c617763`
- audio/delivery SRT：`a044936302d98ef665ed50d16cd59480730bb0b6e7babbded88b27d938f5511c`
- narration.wav：`0494a0d2c493d287a8f57c0843b50d6842f2492e8c01c3e9b990e537e403a6fd`
- music.wav：`b362d1882cd484daf3c11905e9a57d0b84f0a7d6dbe169e0fb6ee6f93665dc74`
- master.wav：`d95a34bf95bd4f759249873d9787a092a23fd6df9040419b72c7e845dc2f3a7a`

证据：`v6-caption-source-repair.json`、`v6-final-audio-take-audit.json`、`audio-caption-report.json`、`audio-voice-qa.json`、`audio-validation.json`。
