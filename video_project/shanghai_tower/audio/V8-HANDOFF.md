# V8 音频交接

- s001：帧 12–488（0.400–16.267 秒），实声 15.680 秒。
- s002：帧 488–904（16.267–30.133 秒），实声 13.680 秒。
- s003：帧 904–1435（30.133–47.833 秒），实声 17.520 秒。
- s004：帧 1435–1786（47.833–59.533 秒），实声 11.520 秒。
- s005：帧 1786–2017（59.533–67.233 秒），实声 7.520 秒。

总帧数：15712；总时长：523.733333 秒。后续 44 条声源和 ASR 元数据完全保留，统一后移 803 帧。

实测词时：`research/v8-narration-cues.json`；精确哈希：`research/v8-final-audio-lock.json`；音乐片段与节拍：`research/feisheng-motion-beat-cues.json`、`src/camera-beats.json`。

`v8-final4` 最终 MP4 的实际 AAC 已由 `scripts/qa_final_audio.py` 解码核验通过：−15.03 LUFS、−1.65 dBTP、零采样偏移，25,139,200 样本与锁定母带等长。报告 `research/qa/v8-final/audio/audio-wave-match.json` 绑定视频 SHA256 `b3a12389f44aaf96bbc39e7f11faba66e2f833d5d2e0310d4866e4ae82c84e2e`。完整结果见 `docs/audio-final4-verification.md`。源锁定快照保留原状态；主观听审和声调认证均未冒称已完成。
