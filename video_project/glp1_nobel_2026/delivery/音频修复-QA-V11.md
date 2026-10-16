# h077 音频修复 QA

```json
{
  "candidate": {
    "path": "D:\\python_project\\manim_extend_rainbow\\video_project\\glp1_nobel_2026\\tmp\\audio-candidates-v10\\h077-a.wav",
    "sha256": "06388de1b62412cabc4973b78f61ce93ad419025f6e2123cbb0dd09f6991c910",
    "durationSeconds": 10.48,
    "prefixError": 0.0,
    "tailPeakAfterCandidate": 0.0,
    "peak": 0.5758184194564819,
    "rms": 0.07079457524926103,
    "finite": true
  },
  "stagedVoice": {
    "sha256": "7171b20713113c7707c7ece7b4fbe3961404fdd743b42b615736deabe8c23d33",
    "storageDurationSeconds": 10.96,
    "samples": 526080
  },
  "narration": {
    "sha256": "b6746f2aee8b848eaa5c77a9f5c23ccc301c606cf4f03749435242358d1dc8bb",
    "spliceError": 0.0,
    "tailPeakAfterCandidate": 0.0
  },
  "master": {
    "path": "D:\\python_project\\manim_extend_rainbow\\video_project\\glp1_nobel_2026\\research\\revision-v9\\audio\\music-final\\master.wav",
    "sha256": "f948ea748924d56548db88bca056d3cdab507bc5ef354d44c92bddd962db1adc",
    "frames": 42780800,
    "durationSeconds": 891.2666666666667,
    "channels": 2,
    "peak": 0.9799998998641968,
    "finite": true
  },
  "delivery": {
    "path": "D:\\python_project\\manim_extend_rainbow\\video_project\\glp1_nobel_2026\\delivery\\如何科学减肥_从身体调节说起_V11_audiofixed.mp4",
    "sizeBytes": 176412558,
    "videoFrames": "26738",
    "videoDuration": "891.266667",
    "videoSize": [
      1920,
      1080
    ],
    "videoFps": "30/1",
    "audioDuration": "891.266000",
    "audioCodec": "aac",
    "audioRate": "48000",
    "audioChannels": 2,
    "aacCorrelationAtH077": [
      0.9999888896274828,
      0.9999838297719067
    ],
    "aacPeak": 0.948983907699585
  }
}
```

结论：候选音频前缀与存储 WAV 完全一致，尾部为零填充；旁白拼接无误差；母带有限且未削波；备用 MP4 的视频时长、帧率、分辨率与 V10 保持一致，AAC 解码片段与母带高度相关。
