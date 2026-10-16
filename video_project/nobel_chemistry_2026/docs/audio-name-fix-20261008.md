# V03 / V04 人名口播修订（2026-10-08）

本次只修订旁白的自然口播载体，正式画面中的论文英文姓名保持原样。

- Henri B. Kagan：口播统一为「亨利·卡根」
- Kenso Soai：口播统一为「硤合宪三」
- Kagan 的后续提及也使用完整「亨利·卡根」，避免同一姓名在段落中出现不同读法。

## 连续音色策略

含人名的句子全部使用同一份 `D:/python_project/tts/work/clone-reference.wav` 和 `Qwen3-TTS-0.6B` 整句生成。没有把姓名切成独立音频再拼接，因此姓名和前后正文共享同一音色、底噪、呼吸和节奏。

- V03 重录：001、006、008、010、011、012、013
- V04 Rap 重录：001、006、008、012
- 生成脚本：`scripts/build_audio_v03.py`、`scripts/build_audio_v04_rap.py`
- 参考音频 SHA-256：`dd8b89f70ab634af820966c01f3af535adcba7323427866d646c0dc1f6280bf7`

## 结果

- V03 母带：`audio/v03/master.wav`
- V04 Rap 母带：`audio/v04/master.wav`
- V03 成片：`delivery/chemistry2026_v03/2026诺贝尔化学奖_让化学选择同一只手_v03_1080p.mp4`
- V04 成片：`delivery/chemistry2026_v04/2026诺贝尔化学奖_让化学选择同一只手_v04_rap_1080p.mp4`
- V03 / V04 字幕和时间线均由重录后 Whisper 对齐重新生成。
- 两版 `qa` 均为 `technical-pass`，未发现字幕越界、音频尾部截断、帧数或封装错误。

旧版本和本次替换前的音频、时间线、成片保存在 `archive/name-fix-20261008/`，可回退对照。
