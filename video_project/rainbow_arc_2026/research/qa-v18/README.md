# V18 背景音乐替换记录

- 曲目：Legal S — Painting Summer
- 输入：`D:\CloudMusic\Legal S - Painting Summer.mp3`
- 交付母带：`public/audio_v18/master-v18.wav`
- 规格：48 kHz / stereo / PCM 24 bit / 356.733333 秒
- 循环：170 秒原曲，4 秒 equal-power 接缝，固定裁切到成片长度；未变速、未移调
- 混音：音乐预增益 -18 dB；42 Hz 高通；沿用 V11 旁白活动 ducking（4.5 dB，0.15 秒起、1.15 秒释放）；片尾 5 秒音乐渐隐
- 自动检查：WAV -16.04 LUFS、-2.19 dBTP；AAC 检查 -16.05 LUFS、-1.98 dBTP；完整 ffmpeg 解码通过；末 160 ms RMS -83.79 dB
- 旁白与 V11 音效保留在 `public/audio_v11/`，原文件未覆盖。

完整哈希、循环参数、音量报告见 `audio-v18-painting-summer.json` 和 `mix-report-v18-painting-summer.json`。音乐文件的授权信息未在本次任务中独立核验。
